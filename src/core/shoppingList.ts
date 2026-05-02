/**
 * shoppingList.ts
 * Deterministic shopping-list detection and parsing.
 * Reused by note rendering and automatic note creation.
 */
import { createTrieFromSet } from '../utils/trie';

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

type ParsedLine = { label: string; quantity: string; unit: string; rawLine: string; checked: boolean };

const QTY_RE = /\b\d+(?:[.,]\d+)?\b/;

const UNIT_WORDS = [
  'kg', 'kilo', 'kilos',
  'g', 'gr', 'gramme', 'grammes', 'gram', 'grams',
  'ml', 'l', 'lt', 'litre', 'litres', 'liter', 'liters',
  'piece', 'pieces', 'piece', 'pieces', 'pcs', 'pc',
  'pieza', 'piezas', 'unidad', 'unidades', 'ud', 'uds',
  'pack', 'packs', 'paquet', 'paquets', 'paquete', 'paquetes',
  'boite', 'boites', 'boîte', 'boîtes', 'box', 'boxes',
  'bouteille', 'bouteilles', 'botella', 'botellas', 'bottle', 'bottles',
  'lata', 'latas', 'can', 'cans',
  'tranche', 'tranches', 'slice', 'slices',
  'docena', 'douzaine', 'dozen',
];

const UNIT_RE = new RegExp(`\\b(${UNIT_WORDS.join('|')})\\b`, 'i');
const QTY_UNIT_LINE_RE = new RegExp(`\\b\\d+(?:[.,]\\d+)?\\s*(?:${UNIT_WORDS.join('|')})\\b`, 'i');
const COLON_QTY_RE = /^.+:\s*\d+(?:[.,]\d+)?\s*[\p{L}]*/u;

const PRODUCT_KEYWORDS = [
  'pommes', 'pomme', 'terre', 'oignon', 'oignons', 'ail', 'haché', 'hache', 'porc', 'veau', 'poulet', 'cabillaud',
  'raisin', 'avocat', 'poire', 'poires', 'lardons', 'crème', 'creme', 'mozzarella', 'pain', 'jambon', 'jus', 'orange',
  'salade', 'concombre', 'eau', 'lait', 'oeufs', 'œufs', 'fromage', 'beurre', 'yaourt', 'tomate', 'tomates', 'riz', 'pates', 'pâtes',
  'patata', 'patatas', 'cebolla', 'cebollas', 'ajo', 'pollo', 'pescado', 'carne', 'pera', 'peras', 'manzana', 'manzanas',
  'uva', 'aguacate', 'lechuga', 'pepino', 'agua', 'leche', 'huevos', 'queso', 'mantequilla', 'yogur', 'arroz', 'pasta', 'jamon', 'jamón',
  'potato', 'potatoes', 'onion', 'onions', 'garlic', 'chicken', 'fish', 'meat', 'pear', 'pears', 'apple', 'apples', 'grape', 'grapes',
  'avocado', 'bacon', 'cream', 'bread', 'ham', 'juice', 'lettuce', 'cucumber', 'water', 'milk', 'eggs', 'cheese', 'butter', 'yogurt', 'rice', 'pasta',
];

const VERB_WORDS = [
  'aller', 'vais', 'veux', 'dois', 'faire', 'prendre', 'acheterai', 'achèterai', 'pensar', 'quiero', 'necesito', 'hacer', 'compraré',
  'will', 'want', 'need', 'should', 'remember', 'call', 'send', 'meet', 'finish', 'fix', 'update',
];

// Health keywords that block shopping list detection (English + Spanish + French)
const HEALTH_KEYWORD_BLOCKERS = new Set([
  // English
  'medication', 'medicine', 'medicament', 'drug', 'pill', 'tablet',
  'ibuprofen', 'paracetamol', 'acetaminophen', 'aspirin', 'vitamin',
  'dose', 'dosage', 'prescription', 'pharmacist', 'pharmacy',
  'doctor', 'medical', 'health', 'treatment', 'therapy',
  'leaflet', 'instruction', 'side effect', 'allergy', 'allergic',
  'hospital', 'clinic', 'emergency', 'followup', 'follow-up',
  'physician', 'surgeon', 'nurse', 'dentist', 'therapist',
  // Spanish
  'medicamento', 'medicación', 'medicina', 'fármaco', 'pastilla', 'tableta',
  'ibuprofeno', 'paracetamol', 'aspirina', 'vitamina',
  'dosis', 'receta', 'farmacéutico', 'farmacia',
  'doctor', 'médico', 'sanitario', 'salud', 'tratamiento', 'terapia',
  'prospecto', 'efecto secundario', 'alergia', 'alérgico',
  'hospital', 'clínica', 'emergencia', 'seguimiento', 'médica',
  'cirujano', 'enfermera', 'dentista', 'terapeuta',
  // French
  'médicament', 'médication', 'médecine', 'drogue', 'pilule', 'comprimé',
  'ibuprofène', 'paracétamol', 'aspirine', 'vitamine',
  'dose', 'ordonnance', 'pharmacien', 'pharmacie',
  'docteur', 'médecin', 'santé', 'traitement', 'thérapie',
  'notice', 'instruction', 'effet secondaire', 'allergie', 'allergique',
  'hôpital', 'clinique', 'urgence', 'suivi', 'médical',
  'chirurgien', 'infirmière', 'dentiste', 'thérapeute',
]);

// Create Trie for efficient health keyword matching
const HEALTH_KEYWORD_TRIE = createTrieFromSet(HEALTH_KEYWORD_BLOCKERS);

let idCounter = 0;
function nextId(): string {
  return `sl_${Date.now()}_${idCounter++}`;
}

function normalizeText(value: unknown): string {
  return String(value || '').replace(/\u00a0/g, ' ').trim();
}

function normalizeItemKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function capitalizeItemName(value: string): string {
  const cleaned = normalizeText(value).replace(/\s+/g, ' ');
  if (!cleaned) return cleaned;
  return cleaned.charAt(0).toLocaleUpperCase() + cleaned.slice(1);
}

function cleanProductName(value: string): string {
  let name = normalizeText(value)
    .replace(/^[\s\-–—*•·]+/, '')
    .replace(/^\[[ xX]?\]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/[.;,]+$/g, '')
    .trim();

  name = name.replace(/^(?:du|des|de la|de l'|de l’|le|la|les|un|une|el|los|las|una|unos|unas|the|a|an)\s+/i, '');
  return capitalizeItemName(name);
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
  const value = normalizeText(unit).toLowerCase();
  if (!value) return '';
  if (['piece', 'pieces', 'pcs', 'pc', 'pieza', 'piezas', 'unidad', 'unidades', 'ud', 'uds'].includes(value)) return 'pièces';
  if (['bouteille', 'bouteilles', 'botella', 'botellas', 'bottle', 'bottles'].includes(value)) return 'bouteille';
  if (['paquet', 'paquets', 'paquete', 'paquetes', 'pack', 'packs'].includes(value)) return 'paquet';
  if (['boite', 'boites', 'boîte', 'boîtes', 'box', 'boxes'].includes(value)) return 'boîte';
  if (['gramme', 'grammes', 'gram', 'grams', 'gr'].includes(value)) return 'g';
  if (['litre', 'litres', 'liter', 'liters', 'lt'].includes(value)) return 'L';
  return value;
}

function splitShoppingCandidates(rawText: string): string[] {
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

function countProductHits(value: string): number {
  const lower = normalizeItemKey(value);
  return PRODUCT_KEYWORDS.filter((keyword) => lower.includes(normalizeItemKey(keyword))).length;
}

function countVerbHits(value: string): number {
  const lower = normalizeItemKey(value);
  return VERB_WORDS.filter((keyword) => new RegExp(`\\b${normalizeItemKey(keyword)}\\b`, 'i').test(lower)).length;
}

function parseLine(line: string): ParsedLine {
  const rawLine = normalizeText(line);
  const checkedInfo = extractChecked(rawLine);
  const lineText = checkedInfo.text;

  // BLOCKER: Skip lines that look like time values (HH:MM or HH:MM AM/PM)
  if (/\d{1,2}:\d{2}\s*(?:AM|PM|am|pm|am\s*pm)?/i.test(lineText)) {
    return { label: cleanProductName(lineText), quantity: '', unit: '', rawLine, checked: checkedInfo.checked };
  }

  const colonIdx = lineText.lastIndexOf(':');

  if (colonIdx !== -1) {
    const labelPart = cleanProductName(lineText.slice(0, colonIdx));
    const afterColon = lineText.slice(colonIdx + 1).trim();
    const qtyMatch = QTY_RE.exec(afterColon);
    const unitMatch = UNIT_RE.exec(afterColon);
    if (labelPart && qtyMatch) {
      return { label: labelPart, quantity: qtyMatch[0], unit: unitMatch ? singularUnit(unitMatch[1]) : '', rawLine, checked: checkedInfo.checked };
    }
  }

  const startQtyUnit = lineText.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${UNIT_WORDS.join('|')})\\s+(?:de\\s+|d['’]\\s*)?(.+)$`, 'i'));
  if (startQtyUnit) {
    return {
      label: cleanProductName(startQtyUnit[3]),
      quantity: startQtyUnit[1],
      unit: singularUnit(startQtyUnit[2]),
      rawLine,
      checked: checkedInfo.checked,
    };
  }

  const startQty = lineText.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/i);
  if (startQty) {
    return {
      label: cleanProductName(startQty[2]),
      quantity: startQty[1],
      unit: 'pièces',
      rawLine,
      checked: checkedInfo.checked,
    };
  }

  const inlineUnit = UNIT_RE.exec(lineText);
  if (inlineUnit) {
    const before = lineText.slice(0, inlineUnit.index);
    const qtyMatch = /\d+(?:[.,]\d+)?\s*$/.exec(before);
    if (qtyMatch) {
      const labelEnd = before.lastIndexOf(qtyMatch[0]);
      const label = cleanProductName(lineText.slice(0, labelEnd).replace(/[:-]+$/g, ''));
      if (label) {
        return { label, quantity: qtyMatch[0].trim(), unit: singularUnit(inlineUnit[1]), rawLine, checked: checkedInfo.checked };
      }
    }
  }

  return { label: cleanProductName(lineText), quantity: '', unit: '', rawLine, checked: checkedInfo.checked };
}

function getShoppingConfidence(rawText: string): number {
  const text = normalizeText(rawText);
  if (!text) return 0;

  // BLOCKER: If text contains health keywords, it's not a shopping list
  if (HEALTH_KEYWORD_TRIE.hasKeyword(text)) return 0;

  const chunks = splitShoppingCandidates(text);
  if (chunks.length < 4) return 0;

  const itemLike = chunks.filter((chunk) => {
    const words = chunk.split(/\s+/).filter(Boolean);
    return chunk.length <= 64 && words.length <= 8;
  });

  if (itemLike.length < 4) return 0;

  const productHits = itemLike.reduce((sum, item) => sum + Math.min(countProductHits(item), 2), 0);
  const qtyHits = itemLike.filter((item) => QTY_RE.test(item) || QTY_UNIT_LINE_RE.test(item) || COLON_QTY_RE.test(item)).length;
  const verbHits = countVerbHits(text);
  const sentencePunctuation = (text.match(/[.!?]/g) || []).length;
  const longChunks = chunks.filter((chunk) => chunk.split(/\s+/).length > 10 || chunk.length > 90).length;

  let score = 0;
  score += Math.min(itemLike.length / 8, 0.38);
  score += Math.min(productHits / 8, 0.35);
  score += Math.min(qtyHits / 5, 0.18);
  score += /[,;:\n]/.test(text) ? 0.12 : 0;
  score -= Math.min(verbHits * 0.09, 0.25);
  score -= Math.min(sentencePunctuation * 0.06, 0.18);
  score -= Math.min(longChunks * 0.12, 0.24);

  return Math.max(0, Math.min(score, 1));
}

export function isShoppingList(text: string): boolean {
  return getShoppingConfidence(text) >= 0.62;
}

export function parseShoppingList(
  text: string,
  previousItems?: ShoppingItem[],
): ShoppingListModel {
  const rawText = String(text || '');
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
