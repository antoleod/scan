/**
 * shoppingList.ts
 * Deterministic shopping-list detection and parsing.
 * Reused by note rendering and note creation.
 */
import { createTrieFromSet } from '../utils/trie';
import {
  cleanLeadingArticles,
  findProductAlias,
  findProductAliasesInText,
  getAllUnits,
  hasConnector,
  isKnownUnit,
  isNarrativeBlocker,
  normalizeShoppingText,
} from './shoppingDictionary';

export type ShoppingItem = {
  id: string;
  label: string;
  quantity: string;
  unit: string;
  price?: string;
  checked: boolean;
  rawLine: string;
};

export type ShoppingListModel = {
  isShoppingList: boolean;
  items: ShoppingItem[];
  rawText: string;
};

export type ShoppingListCandidateAnalysis = {
  isCandidate: boolean;
  confidence: number;
  reason: string;
  parsedItems: ShoppingItem[];
};

type ParsedLine = { label: string; quantity: string; unit: string; rawLine: string; checked: boolean };

const QTY_RE = /\b\d+(?:[.,]\d+)?\b/;
const UNIT_WORDS = [...new Set([...getAllUnits(), 'lt', 'pc', 'pcs', 'ud', 'uds', 'docena', 'douzaine', 'dozen'])];
const UNIT_RE = new RegExp(`\\b(${UNIT_WORDS.map(escapeRegExp).join('|')})\\b`, 'i');
const QTY_UNIT_LINE_RE = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${UNIT_WORDS.map(escapeRegExp).join('|')})\\b`, 'i');
const COLON_QTY_RE = /^.+:\s*\d+(?:[.,]\d+)?\s*[\p{L}]*/u;

const VERB_WORDS = [
  'aller', 'vais', 'veux', 'dois', 'faire', 'prendre', 'acheterai', 'achèterai', 'pensar', 'quiero', 'necesito', 'hacer', 'compraré',
  'will', 'want', 'need', 'should', 'remember', 'call', 'send', 'meet', 'finish', 'fix', 'update',
];

const NARRATIVE_WORDS = [
  'hoy', 'ayer', 'manana', 'mañana', 'comi', 'comí', 'comimos', 'gusta', 'porque', 'cuando',
  'today', 'yesterday', 'tomorrow', 'ate', 'like', 'because', 'when',
  'hier', 'demain', 'mange', 'mangé', 'aime', 'parce', 'quand',
];

const NARRATIVE_PHRASES = [
  'hoy comi', 'hoy comí', 'me gusta', 'si tengo tiempo', 'con mi familia', 'no quiero',
  'arroz con leche es un postre', 'necesito comprar', 'quiero leche',
  'i ate', 'i like', 'if i have time', 'with my family', 'do not want',
  'j ai mange', 'j ai mangé', 'j aime', 'si j ai le temps', 'avec ma famille', 'sur la table',
];

const HEALTH_KEYWORD_BLOCKERS = new Set([
  'medication', 'medicine', 'medicament', 'drug', 'pill', 'tablet',
  'ibuprofen', 'paracetamol', 'acetaminophen', 'aspirin', 'vitamin',
  'dose', 'dosage', 'prescription', 'pharmacist', 'pharmacy',
  'doctor', 'medical', 'health', 'treatment', 'therapy',
  'leaflet', 'instruction', 'side effect', 'allergy', 'allergic',
  'hospital', 'clinic', 'emergency', 'followup', 'follow-up',
  'medicamento', 'medicación', 'medicina', 'fármaco', 'pastilla', 'tableta',
  'ibuprofeno', 'aspirina', 'dosis', 'receta', 'farmacéutico', 'farmacia',
  'médico', 'sanitario', 'salud', 'tratamiento', 'prospecto', 'seguimiento',
  'médicament', 'médication', 'médecine', 'pilule', 'comprimé',
  'ibuprofène', 'paracétamol', 'ordonnance', 'pharmacien',
  'docteur', 'médecin', 'santé', 'traitement', 'notice', 'suivi',
]);

const HEALTH_KEYWORD_TRIE = createTrieFromSet(HEALTH_KEYWORD_BLOCKERS);

let idCounter = 0;
function nextId(): string {
  return `sl_${Date.now()}_${idCounter++}`;
}

function normalizeText(value: unknown): string {
  return String(value || '').replace(/\u00a0/g, ' ').trim();
}

function normalizeItemKey(value: string): string {
  return normalizeShoppingText(value).replace(/[^a-z0-9]+/g, ' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function capitalizeItemName(value: string): string {
  const cleaned = normalizeText(value).replace(/\s+/g, ' ');
  if (!cleaned) return cleaned;
  return cleaned.charAt(0).toLocaleUpperCase() + cleaned.slice(1);
}

function canonicalOrCleanName(value: string): string {
  const cleaned = cleanLeadingArticles(value)
    .replace(/^[\s\-–—*•·]+/, '')
    .replace(/^\[[ xX]?\]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/[.;,]+$/g, '')
    .trim();
  const match = findProductAlias(cleaned);
  return match?.canonical || capitalizeItemName(cleaned);
}

function isIgnoredChunk(value: string): boolean {
  const key = normalizeItemKey(value);
  return [
    'shopping list',
    'shopping',
    'liste de courses',
    'liste courses',
    'lista de compra',
    'lista compras',
  ].includes(key);
}

function extractChecked(rawLine: string): { checked: boolean; text: string } {
  const match = rawLine.match(/^\s*(?:-\s*)?\[(x|X| )\]\s*(.+)$/);
  if (!match) return { checked: false, text: rawLine };
  return { checked: match[1].toLowerCase() === 'x', text: match[2] };
}

function singularUnit(unit: string): string {
  const value = normalizeShoppingText(unit);
  if (!value) return '';
  if (['piece', 'pieces', 'pcs', 'pc', 'pieza', 'piezas', 'unidad', 'unidades', 'ud', 'uds', 'pièce', 'pièces'].map(normalizeShoppingText).includes(value)) return 'pièces';
  if (['bouteille', 'bouteilles', 'botella', 'botellas', 'bottle', 'bottles'].includes(value)) return value.endsWith('s') ? value.slice(0, -1) : value;
  if (['paquet', 'paquets', 'paquete', 'paquetes', 'pack', 'packs'].includes(value)) return value.endsWith('s') ? value.slice(0, -1) : value;
  if (['boite', 'boites', 'boîte', 'boîtes', 'box', 'boxes', 'caja', 'cajas'].map(normalizeShoppingText).includes(value)) return 'boîte';
  if (['gramme', 'grammes', 'gram', 'grams', 'gr'].includes(value)) return 'g';
  if (['litre', 'litres', 'liter', 'liters', 'lt'].includes(value)) return 'L';
  return unit;
}

function hasExplicitSeparators(text: string): boolean {
  return /[\n,;:•·]/.test(text);
}

function splitExplicitCandidates(rawText: string): string[] {
  const text = normalizeText(rawText)
    .replace(/\r\n?/g, '\n')
    .replace(/[•·]/g, '\n')
    .replace(/\s+-\s+/g, '\n');

  return text
    .split(/[\n;,]+/g)
    .flatMap((part) => {
      const value = normalizeText(part);
      const colonIdx = value.indexOf(':');
      if (colonIdx === -1) return [value];
      const afterColon = value.slice(colonIdx + 1).trim();
      return /^\d+(?:[.,]\d+)?\s*(?:\p{L}+)?/u.test(afterColon) ? [value] : value.split(/\s*:\s*/g);
    })
    .map((part) => normalizeText(part))
    .map((part) => part.replace(/^[\-–—*]+\s*/, '').trim())
    .filter((part) => !isIgnoredChunk(part))
    .filter(Boolean);
}

function productTokensFromText(value: string): string[] {
  return findProductAliasesInText(value).map((match) => match.canonical);
}

function splitShoppingCandidates(rawText: string): string[] {
  const explicit = splitExplicitCandidates(rawText);
  const result: string[] = [];

  for (const chunk of explicit) {
    const products = productTokensFromText(chunk);
    if (products.length >= 2 && !QTY_RE.test(chunk)) {
      result.push(...products);
    } else {
      result.push(chunk);
    }
  }

  return result.filter((part) => !isIgnoredChunk(part)).filter(Boolean);
}

function countProductHits(value: string): number {
  return findProductAliasesInText(value).length;
}

function countVerbHits(value: string): number {
  const lower = normalizeShoppingText(value);
  return [...VERB_WORDS, ...NARRATIVE_WORDS].filter((keyword) => new RegExp(`\\b${escapeRegExp(normalizeShoppingText(keyword))}\\b`, 'i').test(lower)).length;
}

function countNarrativeHits(value: string): number {
  const lower = normalizeShoppingText(value);
  return NARRATIVE_PHRASES.filter((phrase) => lower.includes(normalizeShoppingText(phrase))).length + (isNarrativeBlocker(value) ? 1 : 0);
}

function parseLine(line: string): ParsedLine {
  const rawLine = normalizeText(line);
  const checkedInfo = extractChecked(rawLine);
  const lineText = checkedInfo.text;

  if (/\d{1,2}:\d{2}\s*(?:AM|PM|am|pm|am\s*pm)?/i.test(lineText)) {
    return { label: canonicalOrCleanName(lineText), quantity: '', unit: '', rawLine, checked: checkedInfo.checked };
  }

  const colonIdx = lineText.lastIndexOf(':');
  if (colonIdx !== -1) {
    const labelPart = canonicalOrCleanName(lineText.slice(0, colonIdx));
    const afterColon = lineText.slice(colonIdx + 1).trim();
    const qtyMatch = QTY_RE.exec(afterColon);
    const unitMatch = UNIT_RE.exec(afterColon);
    if (labelPart && qtyMatch) {
      return { label: labelPart, quantity: qtyMatch[0], unit: unitMatch ? singularUnit(unitMatch[1]) : '', rawLine, checked: checkedInfo.checked };
    }
  }

  const startQtyUnit = lineText.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_WORDS.map(escapeRegExp).join('|')})\\s+(?:de\\s+|d['’]\\s*)?(.+)$`, 'i'));
  if (startQtyUnit) {
    return {
      label: canonicalOrCleanName(startQtyUnit[3]),
      quantity: startQtyUnit[1],
      unit: singularUnit(startQtyUnit[2]),
      rawLine,
      checked: checkedInfo.checked,
    };
  }

  const startQty = lineText.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/i);
  if (startQty) {
    return {
      label: canonicalOrCleanName(startQty[2]),
      quantity: startQty[1],
      unit: 'pièces',
      rawLine,
      checked: checkedInfo.checked,
    };
  }

  const inlineUnit = UNIT_RE.exec(lineText);
  if (inlineUnit && isKnownUnit(inlineUnit[1])) {
    const before = lineText.slice(0, inlineUnit.index);
    const qtyMatch = /\d+(?:[.,]\d+)?\s*$/.exec(before);
    if (qtyMatch) {
      const labelEnd = before.lastIndexOf(qtyMatch[0]);
      const label = canonicalOrCleanName(lineText.slice(0, labelEnd).replace(/[:-]+$/g, ''));
      if (label) {
        return { label, quantity: qtyMatch[0].trim(), unit: singularUnit(inlineUnit[1]), rawLine, checked: checkedInfo.checked };
      }
    }
  }

  return { label: canonicalOrCleanName(lineText), quantity: '', unit: '', rawLine, checked: checkedInfo.checked };
}

function buildParsedItems(rawText: string, previousItems?: ShoppingItem[]): ShoppingItem[] {
  const prevChecked = new Map<string, boolean>();
  if (previousItems) {
    for (const prev of previousItems) {
      prevChecked.set(normalizeItemKey(prev.label), prev.checked);
      prevChecked.set(normalizeItemKey(prev.rawLine), prev.checked);
    }
  }

  const items: ShoppingItem[] = [];
  const seen = new Set<string>();

  for (const chunk of splitShoppingCandidates(rawText)) {
    const parsed = parseLine(chunk);
    if (!parsed.label) continue;
    const key = normalizeItemKey(parsed.label);
    if (!key) continue;
    const existing = items.find((item) => normalizeItemKey(item.label) === key);
    if (existing) {
      if (!existing.quantity && parsed.quantity) existing.quantity = parsed.quantity;
      if (!existing.unit && parsed.unit) existing.unit = parsed.unit;
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      id: nextId(),
      label: parsed.label,
      quantity: parsed.quantity,
      unit: parsed.unit,
      checked: parsed.checked || prevChecked.get(key) || prevChecked.get(normalizeItemKey(parsed.rawLine)) || false,
      rawLine: parsed.rawLine,
    });
  }

  return items;
}

function scoreShoppingCandidate(rawText: string): ShoppingListCandidateAnalysis {
  const text = normalizeText(rawText);
  if (!text || HEALTH_KEYWORD_TRIE.hasKeyword(text)) {
    return { isCandidate: false, confidence: 0, reason: 'empty_or_blocked', parsedItems: [] };
  }

  const narrativeHits = countNarrativeHits(text);
  const parsedItems = buildParsedItems(text);
  const chunks = splitShoppingCandidates(text);
  const productHits = countProductHits(text);
  const qtyHits = chunks.filter((item) => QTY_RE.test(item) || QTY_UNIT_LINE_RE.test(item) || COLON_QTY_RE.test(item)).length;
  const verbHits = countVerbHits(text);
  const sentencePunctuation = (text.match(/[.!?]/g) || []).length;
  const longChunks = chunks.filter((chunk) => chunk.split(/\s+/).length > 10 || chunk.length > 90).length;
  const explicitSeparatorCount = (text.match(/[\n,;:]/g) || []).length;
  const normalizedWords = normalizeShoppingText(text).split(/\s+/).filter(Boolean);
  const connectorPresent = hasConnector(text);
  const productRatio = productHits / Math.max(normalizedWords.filter((word) => !isKnownUnit(word)).length, 1);
  const textIsShort = normalizedWords.length <= 10 && text.length <= 90;

  if (narrativeHits > 0) {
    return { isCandidate: false, confidence: 0, reason: 'narrative_blocker', parsedItems };
  }

  let score = 0;
  score += Math.min(parsedItems.length / 5, 0.32);
  score += Math.min(productHits / 5, 0.28);
  score += Math.min(qtyHits / 3, 0.14);
  score += explicitSeparatorCount >= 1 ? 0.12 : 0;
  score += connectorPresent ? 0.1 : 0;
  score += productRatio >= 0.55 ? 0.14 : 0;
  score += textIsShort ? 0.08 : 0;
  score -= Math.min(verbHits * 0.11, 0.38);
  score -= Math.min(sentencePunctuation * 0.08, 0.24);
  score -= Math.min(longChunks * 0.16, 0.32);

  const confidence = Math.max(0, Math.min(score, 1));
  const enoughProducts = parsedItems.length >= 3 || (parsedItems.length >= 2 && connectorPresent && textIsShort);
  const isCandidate = confidence >= 0.62 && enoughProducts && productHits >= parsedItems.length && productRatio >= 0.45;

  return {
    isCandidate,
    confidence,
    reason: isCandidate ? 'dictionary_product_sequence' : 'low_confidence',
    parsedItems,
  };
}

function getShoppingConfidence(rawText: string): number {
  return scoreShoppingCandidate(rawText).confidence;
}

export function isShoppingList(text: string): boolean {
  const analysis = scoreShoppingCandidate(text);
  return analysis.isCandidate && analysis.parsedItems.length >= 3;
}

export function analyzeShoppingListCandidate(rawText: unknown): ShoppingListCandidateAnalysis {
  return scoreShoppingCandidate(String(rawText || ''));
}

export function parseShoppingList(
  text: string,
  previousItems?: ShoppingItem[],
): ShoppingListModel {
  const rawText = String(text || '');
  const items = buildParsedItems(rawText, previousItems);
  return {
    isShoppingList: isShoppingList(rawText),
    items,
    rawText,
  };
}

export function shoppingListToText(items: ShoppingItem[]): string {
  return items
    .map((item) => {
      const label = String(item.label || '').trim();
      if (!label) return '';
      const quantity = String(item.quantity || '').trim();
      const unit = String(item.unit || '').trim();
      const qtyPart = quantity ? `${quantity}${unit ? ' ' + unit : ''}` : unit;
      const line = qtyPart ? `${label}: ${qtyPart}` : label;
      return item.checked ? `[x] ${line}` : line;
    })
    .filter(Boolean)
    .join('\n');
}
