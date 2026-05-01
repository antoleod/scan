// Grocery catalog for smart shopping list detection
import catalogData from '../data/groceryCatalog.json';

export type GroceryCategory = 'fruit' | 'vegetable' | 'herb' | 'legume' | 'grocery';

export interface GroceryCatalogItem {
  id: string;
  category: GroceryCategory;
  canonical: {
    en: string;
    es: string;
    fr: string;
    nl: string;
  };
  aliases: string[];
}

export interface GroceryMatch {
  id: string;
  category: GroceryCategory;
  matchedText: string;
  displayName: string;
  confidence: number;
}

export interface ShoppingChecklistItem {
  id: string;
  text: string;
  completed: boolean;
  source: 'extracted' | 'manual';
  groceryId?: string;
  category?: GroceryCategory;
}

// Build a reverse lookup map: normalized alias → catalog item
function buildAliasMap(): Map<string, GroceryCatalogItem> {
  const map = new Map<string, GroceryCatalogItem>();
  const items = (catalogData as { items: GroceryCatalogItem[] }).items || [];

  for (const item of items) {
    for (const alias of item.aliases) {
      const normalized = normalizeGroceryText(alias);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, item);
      }
    }
  }

  return map;
}

const aliasMap = buildAliasMap();

/**
 * Normalize grocery text for matching: lowercase, trim, remove accents, normalize spaces
 */
export function normalizeGroceryText(value: string): string {
  if (!value) return '';

  let normalized = value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' '); // Normalize spaces

  // Remove accents
  normalized = normalized
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/ç/g, 'c');

  // Remove common punctuation
  normalized = normalized.replace(/[,.:;!?-]/g, '');

  return normalized;
}

/**
 * Find grocery items matching the given text
 */
export function findGroceryMatches(text: string): GroceryMatch[] {
  const matches: GroceryMatch[] = [];
  const seen = new Set<string>();

  if (!text || text.trim().length === 0) return matches;

  const lower = text.toLowerCase();

  // Split text into potential item candidates
  const candidates = text
    .split(/[,\n;]/)
    .map(s => s.trim())
    .filter(s => s.length > 1);

  // Also try words
  const words = text
    .toLowerCase()
    .split(/\s+/)
    .filter(w => w.length > 2);

  const toMatch = [...candidates, ...words];

  for (const candidate of toMatch) {
    const normalized = normalizeGroceryText(candidate);
    if (!normalized || seen.has(normalized)) continue;

    const item = aliasMap.get(normalized);
    if (item) {
      seen.add(normalized);
      const displayName = item.canonical.en;
      matches.push({
        id: item.id,
        category: item.category,
        matchedText: candidate,
        displayName,
        confidence: 0.95,
      });
    }
  }

  return matches;
}

/**
 * Shopping keywords by language (for quick detection without catalog)
 */
const SHOPPING_KEYWORDS = {
  es: ['comprar', 'compra', 'supermercado', 'mercado', 'necesito comprar', 'lista de compras', 'lista', 'mercar'],
  fr: ['acheter', 'courses', 'supermarché', 'liste de courses', 'liste', 'marche'],
  en: ['buy', 'shopping', 'groceries', 'grocery list', 'need to buy', 'shop', 'list'],
  nl: ['kopen', 'boodschappen', 'winkel', 'markt'],
};

function detectLanguage(text: string): 'es' | 'fr' | 'en' | 'nl' {
  const lower = text.toLowerCase();

  // Spanish indicators
  if (/\b(tomé|tome|tomar|para|por|de la|el|la|los|las|una|unos|comprar|mercado)\b/.test(lower)) {
    return 'es';
  }

  // French indicators
  if (/\b(pris|prendre|pour|à|le|la|les|un|une|des|acheter|supermarché)\b/.test(lower)) {
    return 'fr';
  }

  // Dutch indicators
  if (/\b(de|het|een|kopen|boodschappen|winkel)\b/.test(lower)) {
    return 'nl';
  }

  // English by default
  return 'en';
}

function countKeywordMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw)).length;
}

/**
 * Determine if text is likely a shopping note based on:
 * - Shopping keywords in the detected language
 * - At least 2 recognized grocery items
 * - At least 1 grocery item + separators (commas, newlines)
 */
export function isLikelyShoppingNote(text: string): boolean {
  if (!text || text.trim().length < 5) return false;

  const lang = detectLanguage(text);
  const keywords = SHOPPING_KEYWORDS[lang] || SHOPPING_KEYWORDS.en;

  // Check for shopping keywords
  const keywordMatches = countKeywordMatches(text, keywords);

  // Check for grocery catalog matches
  const matches = findGroceryMatches(text);

  // Check for list separators
  const hasListSeparators = /[,\n]|(\s(?:y|and|et|en|of)\s)/.test(text);

  // Trigger if:
  // - 2+ grocery items found, OR
  // - 1+ grocery item + list separators, OR
  // - 1+ shopping keywords + 1+ grocery item
  if (matches.length >= 2) return true;
  if (matches.length >= 1 && hasListSeparators) return true;
  if (keywordMatches >= 1 && matches.length >= 1) return true;

  return false;
}

/**
 * Extract shopping items from text (comma/newline/and-separated)
 * Returns an array of checklist items with grocery catalog matching
 */
export function extractShoppingItemsFromText(text: string): ShoppingChecklistItem[] {
  const items: ShoppingChecklistItem[] = [];
  if (!text || text.trim().length === 0) return items;

  // Split by common separators: newlines, commas, "and"/"y"/"et"/"en"
  const lines = text
    .split(/[\n,]|(\s(?:and|y|et|en|&)\s)/)
    .map(s => s.trim())
    .filter(s => s.length > 1 && !/^(and|y|et|en|&)$/i.test(s));

  const seenText = new Set<string>();

  for (const line of lines) {
    const normalized = normalizeGroceryText(line);
    if (seenText.has(normalized)) continue;
    seenText.add(normalized);

    // Try to find grocery match
    const matches = findGroceryMatches(line);
    let groceryId: string | undefined;
    let category: GroceryCategory | undefined;

    if (matches.length > 0) {
      groceryId = matches[0].id;
      category = matches[0].category;
    }

    items.push({
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      text: line,
      completed: false,
      source: 'extracted',
      groceryId,
      category,
    });
  }

  return items;
}
