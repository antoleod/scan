/**
 * shoppingListV2.ts
 * Advanced shopping list detection, parsing, normalization & categorization.
 *
 * Features:
 * - Intelligent quantity/unit extraction
 * - Automatic tag detection ("pour l'école" → tag: "école")
 * - Typo correction (jus d'organe → jus d'orange)
 * - Multi-language support (en, fr, es, nl)
 * - Confidence scoring
 * - Catalog-based categorization
 * - Preserves original text for undo
 */

import { GROCERY_CATALOG } from '../data/groceryCatalog';
import type { GroceryCategory } from '../data/groceryCatalog';
import { normalizeText as normalizeGroceryText, detectGroceryItem } from '../utils/groceryDetection';

// ─── Types ───────────────────────────────────────────────────────────────

export type AppLanguage = 'en' | 'fr' | 'es' | 'nl';
export type { GroceryCategory };

export interface ShoppingItemV2 {
  id: string;
  name: string;
  quantity?: number;
  unit?: string;
  category: GroceryCategory;
  tags: string[];
  confidence: number;
  originalText: string;
  checked?: boolean;
  catalogId?: string;
  isFavorite?: boolean;
  note?: string;
}

export interface ShoppingListV2 {
  items: ShoppingItemV2[];
  groupedByCategory: Record<GroceryCategory, ShoppingItemV2[]>;
  rawText: string;
  language: AppLanguage;
}

// ─── Typo Corrections Dictionary ──────────────────────────────────────────

const TYPO_CORRECTIONS: Record<string, string> = {
  // French
  'jus d\'organe': 'jus d\'orange',
  'jus dorgane': 'jus d\'orange',
  'organe': 'orange',
  'creame': 'crème',
  'crema': 'crème',
  'mozarella': 'mozzarella',
  'mozarelle': 'mozzarella',
  'concombres': 'concombre',
  'poivrons': 'poivron',
  'oeufs': 'œufs',

  // Spanish
  'jugó': 'jugo',
  'manzana roja escuela': 'manzana roja para escuela',

  // Common
  'pommes de terre': 'pommes de terre',
  'haché porc veau': 'haché porc et veau',
};

// ─── Tag Detection ────────────────────────────────────────────────────────

const TAG_PATTERNS = {
  school: /(?:pour|para|for)\s+(?:l['])?(?:école|escuela|school)/i,
  fresh: /(?:frais|fresco|fresh)/i,
  organic: /(?:bio|orgánico|organic)/i,
  frozen: /(?:congelé|congelado|frozen)/i,
};

const ARTICLE_PREFIXES = [
  'du', 'des', 'de la', "de l'", 'de l', 'le', 'la', 'les', 'un', 'une',
  'el', 'los', 'las', 'una', 'unos', 'unas',
  'the', 'a', 'an',
  'de', 'het', 'een', 'de',
];

// ─── Time Patterns (Should Not Be Parsed as Quantities) ──────────────────

const TIME_PATTERN = /(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?|\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/;

// ─── Unit Mapping ────────────────────────────────────────────────────────

const UNIT_MAP: Record<string, string> = {
  'kg': 'kg',
  'kilo': 'kg',
  'kilos': 'kg',
  'g': 'g',
  'gr': 'g',
  'gramme': 'g',
  'grammes': 'g',
  'gram': 'g',
  'grams': 'g',
  'ml': 'ml',
  'l': 'L',
  'lt': 'L',
  'litre': 'L',
  'litres': 'L',
  'liter': 'L',
  'liters': 'L',
  'unit': 'unit',
  'piece': 'unit',
  'pieces': 'unit',
  'pcs': 'unit',
  'pc': 'unit',
  'pieza': 'unit',
  'piezas': 'unit',
  'unidad': 'unit',
  'unidades': 'unit',
  'ud': 'unit',
  'uds': 'unit',
  'pièce': 'unit',
  'pièces': 'unit',
  'pack': 'pack',
  'packs': 'pack',
  'paquet': 'pack',
  'paquets': 'pack',
  'paquete': 'pack',
  'paquetes': 'pack',
  'box': 'pack',
  'boxes': 'pack',
  'boîte': 'pack',
  'boîtes': 'pack',
  'boite': 'pack',
  'boites': 'pack',
  'caja': 'pack',
  'bouteille': 'bottle',
  'bouteilles': 'bottle',
  'botella': 'bottle',
  'botellas': 'bottle',
  'bottle': 'bottle',
  'bottles': 'bottle',
};

// ─── Helper Functions ────────────────────────────────────────────────────

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s\-']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyTypoCorrections(text: string): string {
  let corrected = text;
  for (const [typo, correction] of Object.entries(TYPO_CORRECTIONS)) {
    const regex = new RegExp(`\\b${typo}\\b`, 'gi');
    corrected = corrected.replace(regex, correction);
  }
  return corrected;
}

function extractTags(text: string): string[] {
  const tags: string[] = [];

  if (TAG_PATTERNS.school.test(text)) tags.push('école');
  if (TAG_PATTERNS.fresh.test(text)) tags.push('frais');
  if (TAG_PATTERNS.organic.test(text)) tags.push('bio');
  if (TAG_PATTERNS.frozen.test(text)) tags.push('congelé');

  return tags;
}

function removeTagsFromText(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/(?:pour|para|for)\s+(?:l['])?(?:école|escuela|school)/gi, '');
  cleaned = cleaned.replace(/(?:frais|fresco|fresh)/gi, '');
  cleaned = cleaned.replace(/(?:bio|orgánico|organic)/gi, '');
  cleaned = cleaned.replace(/(?:congelé|congelado|frozen)/gi, '');
  return cleaned.replace(/\s+/g, ' ').trim();
}

function removeArticles(text: string): string {
  let cleaned = text;
  for (const article of ARTICLE_PREFIXES) {
    const escaped = article.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^\\s*${escaped}\\s+`, 'i');
    cleaned = cleaned.replace(regex, '');
  }
  return cleaned.trim();
}

function capitalizeWords(text: string): string {
  return text
    .split(/\s+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Capitalize only the first character of the string; preserve existing casing
// for the rest (e.g. "VANDERSTRAETEN" → "VANDERSTRAETEN", "coca zero" → "Coca zero").
function smartCapitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function extractQuantityAndUnit(text: string): { quantity?: number; unit?: string; remaining: string } {
  const text2 = removeArticles(text);

  // Skip quantity extraction if text contains time patterns (HH:MM or YYYY-MM-DD HH:MM)
  if (TIME_PATTERN.test(text2)) {
    return { remaining: text2 };
  }

  // Pattern: "Name: quantity [unit]" — e.g. "Coca zero: 1 bouteille", "Citrons verts: 6"
  const colonMatch = text2.match(/^(.+?):\s*(\d+(?:[.,]\d+)?)\s*([\w]*)$/i);
  if (colonMatch) {
    const qty = parseFloat(colonMatch[2].replace(',', '.'));
    const unitRaw = colonMatch[3]?.toLowerCase();
    const unit = unitRaw ? (UNIT_MAP[unitRaw] || unitRaw) : undefined;
    const remaining = colonMatch[1].trim();
    return { quantity: qty, unit: unit || undefined, remaining };
  }

  // Pattern: "3 kg pommes"
  const match1 = text2.match(/^(\d+(?:[.,]\d+)?)\s*([\w]+)\s+(.+)$/i);
  if (match1) {
    const qty = parseFloat(match1[1].replace(',', '.'));
    const unitRaw = match1[2].toLowerCase();
    const unit = UNIT_MAP[unitRaw] || unitRaw;
    const remaining = match1[3];
    return { quantity: qty, unit, remaining };
  }

  // Pattern: "pommes 3 kg"
  const match2 = text2.match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*([\w]*)$/i);
  if (match2) {
    const qty = parseFloat(match2[2].replace(',', '.'));
    const unitRaw = match2[3]?.toLowerCase();
    const unit = unitRaw ? UNIT_MAP[unitRaw] : undefined;
    const remaining = match2[1];
    return { quantity: qty, unit, remaining };
  }

  // Pattern: "3 pommes"
  const match3 = text2.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (match3) {
    const qty = parseFloat(match3[1].replace(',', '.'));
    return { quantity: qty, unit: 'unit', remaining: match3[2] };
  }

  return { remaining: text2 };
}

function findCatalogMatch(text: string, language: AppLanguage = 'en') {
  const detected = detectGroceryItem(text, language);

  if (detected.itemId && detected.confidence >= 0.65) {
    return {
      catalogId: detected.itemId,
      category: detected.category as GroceryCategory,
      displayName: detected.displayName || text,
      confidence: detected.confidence,
    };
  }

  return null;
}

function nextId(): string {
  return `sl2_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Main API ────────────────────────────────────────────────────────────

export function isShoppingListV2(text: string, language: AppLanguage = 'en'): boolean {
  const lines = text
    .split(/[\n,;]+/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length < 3) return false;

  const matches = lines.filter(line => {
    const detected = detectGroceryItem(line, language);
    return detected.confidence >= 0.65;
  });

  return matches.length >= Math.ceil(lines.length * 0.4);
}

// Lines that are list title/header lines, not items.
const HEADER_LINE_RE = /^(?:shopping\s*list|liste\s*de\s*courses?|lista\s*de\s*compras?|boodschappenlijst|grocery\s*list|courses?|compras?)$/i;

// Bullet markers to strip from the start of a line.
const BULLET_RE = /^[\*\-•·◦▸→⁃]\s*/;

export function parseShoppingListV2(
  text: string,
  language: AppLanguage = 'en'
): ShoppingListV2 {
  const rawText = text;
  const items: ShoppingItemV2[] = [];

  // Split by common delimiters; strip bullet markers; drop empty/header lines
  const lines = text
    .split(/[\n,;]+/)
    .map(l => l.trim().replace(BULLET_RE, '').trim())
    .filter(l => l.length > 0 && !HEADER_LINE_RE.test(l));

  const seen = new Set<string>();

  for (const line of lines) {
    // Extract note first (format: [note: ...])
    let workingLine = line;
    let note: string | undefined;
    const noteMatch = workingLine.match(/\s*\[note:\s*([^\]]+)\]/i);
    if (noteMatch) {
      note = noteMatch[1].trim();
      workingLine = workingLine.replace(/\s*\[note:\s*[^\]]+\]/i, '').trim();
    }

    // Apply typo corrections early
    const corrected = applyTypoCorrections(workingLine);

    // Extract tags
    const tags = extractTags(corrected);
    const cleanedOfTags = removeTagsFromText(corrected);

    // Extract quantity/unit
    const { quantity, unit, remaining } = extractQuantityAndUnit(cleanedOfTags);

    // Find catalog match — may be null for unknown items
    const catalogMatch = findCatalogMatch(remaining, language);

    // Dedup key: catalog id when known, else normalized text
    const dedupKey = catalogMatch
      ? `${catalogMatch.catalogId}:${JSON.stringify(tags)}`
      : `other:${remaining.toLowerCase().replace(/\s+/g, ' ')}:${JSON.stringify(tags)}`;
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    // Preserve the word the user actually typed as the display name.
    // smartCapitalize only uppercases the first char to avoid destroying names
    // like "VANDERSTRAETEN". Falls back to catalog name when text is blank.
    const userName = smartCapitalize(removeArticles(remaining).trim());
    items.push({
      id: nextId(),
      name: userName || (catalogMatch?.displayName ?? remaining),
      quantity,
      unit,
      category: catalogMatch?.category ?? 'other',
      tags,
      confidence: catalogMatch?.confidence ?? 0.5,
      originalText: line,
      catalogId: catalogMatch?.catalogId,
      note,
    });
  }

  // Group by category
  const groupedByCategory: Record<GroceryCategory, ShoppingItemV2[]> = {
    fruits: [],
    vegetables: [],
    meat: [],
    fish: [],
    dairy: [],
    bakery: [],
    drinks: [],
    pantry: [],
    frozen: [],
    snacks: [],
    baby_school: [],
    household: [],
    hygiene: [],
    other: [],
  };

  for (const item of items) {
    groupedByCategory[item.category].push(item);
  }

  return {
    items,
    groupedByCategory,
    rawText,
    language,
  };
}

export function shoppingListV2ToText(items: ShoppingItemV2[]): string {
  return items
    .map(item => {
      let line = item.name;
      if (item.quantity && item.unit) {
        line += `: ${item.quantity} ${item.unit}`;
      } else if (item.quantity) {
        line += `: ${item.quantity}`;
      }
      if (item.tags.length > 0) {
        line += ` [${item.tags.join(', ')}]`;
      }
      if (item.note) {
        line += ` [note: ${item.note}]`;
      }
      return line;
    })
    .join('\n');
}

export function getCategoryLabel(category: GroceryCategory, language: AppLanguage = 'en'): string {
  const labels: Record<GroceryCategory, Record<AppLanguage, string>> = {
    fruits: { en: 'Fruits', fr: 'Fruits', es: 'Frutas', nl: 'Fruit' },
    vegetables: { en: 'Vegetables', fr: 'Légumes', es: 'Verduras', nl: 'Groenten' },
    meat: { en: 'Meat & Protein', fr: 'Viande & Protéines', es: 'Carne & Proteína', nl: 'Vlees & Proteïne' },
    fish: { en: 'Fish & Seafood', fr: 'Poisson & Fruits de Mer', es: 'Pescado & Mariscos', nl: 'Vis & Zeevruchten' },
    dairy: { en: 'Dairy & Fresh', fr: 'Produits Laitiers', es: 'Lácteos', nl: 'Zuivelproducten' },
    bakery: { en: 'Bakery', fr: 'Boulangerie', es: 'Panadería', nl: 'Bakkerij' },
    drinks: { en: 'Drinks', fr: 'Boissons', es: 'Bebidas', nl: 'Dranken' },
    pantry: { en: 'Pantry', fr: 'Placard', es: 'Despensa', nl: 'Voorraadkast' },
    frozen: { en: 'Frozen', fr: 'Surgelés', es: 'Congelados', nl: 'Diepvries' },
    snacks: { en: 'Snacks', fr: 'Collations', es: 'Tentempiés', nl: 'Snacks' },
    baby_school: { en: 'School Supplies', fr: 'Fournitures Scolaires', es: 'Útiles Escolares', nl: 'Schoolbenodigdheden' },
    household: { en: 'Household', fr: 'Ménage', es: 'Hogar', nl: 'Huishouden' },
    hygiene: { en: 'Hygiene', fr: 'Hygiène', es: 'Higiene', nl: 'Hygiëne' },
    other: { en: 'Other', fr: 'Autre', es: 'Otro', nl: 'Overig' },
  };

  return labels[category][language] || labels[category].en;
}

export function getCategoryEmoji(category: GroceryCategory): string {
  const emojis: Record<GroceryCategory, string> = {
    fruits: '🍎',
    vegetables: '🥬',
    meat: '🍖',
    fish: '🐟',
    dairy: '🥛',
    bakery: '🥐',
    drinks: '🥤',
    pantry: '🥫',
    frozen: '🧊',
    snacks: '🍿',
    baby_school: '🎒',
    household: '🧹',
    hygiene: '🧼',
    other: '📦',
  };

  return emojis[category];
}

export function createShoppingItemFromCatalog(
  catalogId: string,
  language: AppLanguage = 'en'
): ShoppingItemV2 | null {
  const catalogItem = GROCERY_CATALOG.find(item => item.id === catalogId);
  if (!catalogItem) return null;

  const displayName = catalogItem.names[language]?.[0] || catalogItem.names.en?.[0] || catalogItem.id;

  return {
    id: nextId(),
    name: displayName,
    quantity: catalogItem.defaultQuantity ? parseFloat(catalogItem.defaultQuantity) : undefined,
    unit: catalogItem.defaultQuantity ? extractUnitFromDefaultQty(catalogItem.defaultQuantity) : undefined,
    category: catalogItem.category,
    tags: [],
    confidence: 1,
    originalText: displayName,
    catalogId,
  };
}

function extractUnitFromDefaultQty(defaultQty: string): string | undefined {
  const match = defaultQty.match(/\b(kg|g|ml|L|pack|unit|pcs|pieces)\b/i);
  return match ? match[1].toLowerCase() : undefined;
}

export function inferCategoryFromText(name: string, language: AppLanguage = 'en'): GroceryCategory {
  const detected = detectGroceryItem(name, language);
  if (detected.confidence > 0.5 && detected.category) {
    return detected.category;
  }
  return 'other';
}
