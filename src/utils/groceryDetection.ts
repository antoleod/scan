import { GROCERY_CATALOG, getGroceryDisplayName, type AppLanguage, type GroceryCatalogItem } from '../data/groceryCatalog';

export function safeText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function normalizeText(value: unknown): string {
  return safeText(value)
    .toLowerCase()
    .trim()
    .replace(/[’`]/g, "'")
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const UNIT_RE = /\b(kg|kilo|kilos|g|gr|grammes?|grams?|l|lt|litres?|liters?|ml|pcs|pi[eè]ces?|stuk|stuks|paquete|paquet|pack|packs|bottle|bouteilles?|botellas?|box|bo[iî]tes?|caja)\b/i;
const QTY_RE = /^\s*(\d+(?:[,.]\d+)?)\s*(kg|kilo|kilos|g|gr|grammes?|grams?|l|lt|litres?|liters?|ml|pcs|pi[eè]ces?|stuk|stuks|paquete|paquet|pack|bottle|bouteilles?|botellas?|box|bo[iî]tes?|caja)?\b/i;

function allNames(item: GroceryCatalogItem): string[] {
  return [...Object.values(item.names).flat(), ...(item.aliases || [])];
}

function stripLeadingArticle(value: string): string {
  return safeText(value).replace(/^\s*(du|des|de la|de l'|de l’|le|la|les|un|une|el|los|las|una|unos|unas|the|a|an)\s+/i, '').trim();
}

function extractQuantity(line: string): { detectedQuantity?: string; comparableText: string } {
  const value = stripLeadingArticle(safeText(line).trim().replace(/^[-*•]\s*/, '').replace(/^\[[ xX]?\]\s*/, ''));
  const match = value.match(QTY_RE);
  if (!match) return { comparableText: value };
  const detectedQuantity = `${match[1]}${match[2] ? ` ${match[2]}` : ''}`.trim();
  return { detectedQuantity, comparableText: value.slice(match[0].length).trim() || value };
}

export function getAllGroceryItems(): GroceryCatalogItem[] {
  return GROCERY_CATALOG;
}

export function findGroceryById(id: string): GroceryCatalogItem | undefined {
  return GROCERY_CATALOG.find((item) => item.id === id);
}

export function detectGroceryItem(line: string, language: AppLanguage = 'en') {
  const originalLine = safeText(line);
  const { detectedQuantity, comparableText } = extractQuantity(originalLine);
  const normalizedLine = normalizeText(comparableText || originalLine);
  let best: { item: GroceryCatalogItem; confidence: number; matchedLength: number } | null = null;

  for (const item of GROCERY_CATALOG) {
    for (const name of allNames(item)) {
      const normalizedName = normalizeText(name);
      if (!normalizedName) continue;
      const exact = normalizedLine === normalizedName;
      const contains = normalizedLine.includes(normalizedName) || normalizedName.includes(normalizedLine);
      if (!exact && !contains) continue;
      const confidence = exact ? 0.98 : Math.min(0.92, 0.58 + normalizedName.length / Math.max(normalizedLine.length, 1));
      if (!best || confidence > best.confidence || (confidence === best.confidence && normalizedName.length > best.matchedLength)) {
        best = { item, confidence, matchedLength: normalizedName.length };
      }
    }
  }

  if (!best) {
    return { originalLine, detectedQuantity, confidence: 0 };
  }

  return {
    originalLine,
    itemId: best.item.id,
    category: best.item.category,
    displayName: getGroceryDisplayName(best.item, language),
    detectedQuantity,
    defaultQuantity: best.item.defaultQuantity,
    confidence: best.confidence,
  };
}

function splitLines(text: unknown): string[] {
  return safeText(text)
    .replace(/\r\n?/g, '\n')
    .split(/[\n;,]+|\s*:\s*/g)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function isLikelyShoppingList(text: unknown): boolean {
  const value = safeText(text);
  const lines = splitLines(value);
  if (lines.length === 0) return false;

  const matches = lines.map((line) => detectGroceryItem(line)).filter((match) => match.confidence >= 0.65);
  const unitLines = lines.filter((line) => UNIT_RE.test(line) || QTY_RE.test(line));
  const shortItemLines = lines.filter((line) => line.length <= 72 && line.split(/\s+/).length <= 8);
  const paragraphPenalty = /[.!?]/.test(value) || lines.some((line) => line.length > 120 || line.split(/\s+/).length > 14);

  if (lines.length >= 3 && matches.length >= 2 && !paragraphPenalty) return true;
  if (lines.length >= 4 && shortItemLines.length / lines.length >= 0.75 && (matches.length >= 1 || unitLines.length >= 1) && !paragraphPenalty) return true;
  if (matches.length >= 3) return true;
  return false;
}

function hasUserQuantity(line: string): boolean {
  return QTY_RE.test(stripLeadingArticle(line));
}

export function formatShoppingList(text: unknown, options?: { language?: AppLanguage }): string {
  const language = options?.language || 'en';
  return splitLines(text)
    .map((line) => {
      const original = safeText(line).trim().replace(/^[-*•]\s*/, '');
      if (!original) return '';
      const detected = detectGroceryItem(original, language);
      if (hasUserQuantity(original) || !detected.defaultQuantity || detected.confidence < 0.65) {
        return original.startsWith('- ') ? original : `- ${original}`;
      }
      return `- ${original} — ${detected.defaultQuantity}`;
    })
    .filter(Boolean)
    .join('\n');
}

export function formatGroceryItemForInsert(item: GroceryCatalogItem, language: AppLanguage = 'en', quantity?: string): string {
  const name = getGroceryDisplayName(item, language);
  const qty = safeText(quantity || item.defaultQuantity).trim();
  return qty ? `- ${name} — ${qty}` : `- ${name}`;
}

export function findDuplicateGrocery(text: unknown, item: GroceryCatalogItem): boolean {
  const haystack = splitLines(text).map((line) => detectGroceryItem(line).itemId).filter(Boolean);
  return haystack.includes(item.id);
}

export function searchGroceryCatalog(query: unknown, language: AppLanguage = 'en'): GroceryCatalogItem[] {
  const q = normalizeText(query);
  if (!q) return GROCERY_CATALOG;
  return GROCERY_CATALOG.filter((item) => {
    const names = allNames(item).map(normalizeText);
    const category = normalizeText(item.category);
    const qty = normalizeText(item.defaultQuantity || '');
    const display = normalizeText(getGroceryDisplayName(item, language));
    return display.includes(q) || category.includes(q) || qty.includes(q) || names.some((name) => name.includes(q));
  });
}
