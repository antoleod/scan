import en from '../data/shopping/en.json';
import es from '../data/shopping/es.json';
import fr from '../data/shopping/fr.json';
import nl from '../data/shopping/nl.json';

export type ShoppingProductCategory =
  | 'bakery'
  | 'dairy'
  | 'drinks'
  | 'fish'
  | 'fruit'
  | 'meat'
  | 'pantry'
  | 'vegetables'
  | string;

export type ShoppingDictionaryProduct = {
  canonical: string;
  aliases: string[];
  category?: ShoppingProductCategory;
};

export type ShoppingDictionary = {
  language: string;
  connectors: string[];
  narrativeBlockers: string[];
  units: string[];
  articlesToClean: string[];
  products: ShoppingDictionaryProduct[];
  multiWordProducts: ShoppingDictionaryProduct[];
};

export type ShoppingProductMatch = ShoppingDictionaryProduct & {
  alias: string;
  normalizedAlias: string;
  language: string;
  words: number;
};

const dictionaries = [es, fr, en, nl] as ShoppingDictionary[];

function asText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function normalizeShoppingText(value: unknown): string {
  return asText(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[’‘`´]/g, "'")
    .replace(/[œŒ]/g, (match) => (match === 'Œ' ? 'Oe' : 'oe'))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9'&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(value: string): number {
  return normalizeShoppingText(value).split(/\s+/).filter(Boolean).length;
}

const productMatches: ShoppingProductMatch[] = dictionaries.flatMap((dictionary) =>
  [...dictionary.products, ...dictionary.multiWordProducts].flatMap((product) =>
    [product.canonical, ...product.aliases].map((alias) => {
      const normalizedAlias = normalizeShoppingText(alias);
      return {
        ...product,
        alias,
        normalizedAlias,
        language: dictionary.language,
        words: wordCount(alias),
      };
    }),
  ),
);

const aliasMap = new Map<string, ShoppingProductMatch>();
for (const match of productMatches) {
  const existing = aliasMap.get(match.normalizedAlias);
  if (!existing || match.words > existing.words) aliasMap.set(match.normalizedAlias, match);
}

const sortedAliasMatches = Array.from(aliasMap.values()).sort((a, b) => {
  if (b.words !== a.words) return b.words - a.words;
  return b.normalizedAlias.length - a.normalizedAlias.length;
});

const connectorSet = new Set(dictionaries.flatMap((dictionary) => dictionary.connectors.map(normalizeShoppingText)));
const unitSet = new Set(dictionaries.flatMap((dictionary) => dictionary.units.map(normalizeShoppingText)));
const articleSet = new Set(dictionaries.flatMap((dictionary) => dictionary.articlesToClean.map(normalizeShoppingText)));
const blockerList = dictionaries
  .flatMap((dictionary) => dictionary.narrativeBlockers.map(normalizeShoppingText))
  .filter(Boolean)
  .sort((a, b) => b.length - a.length);

export function getAllShoppingDictionaries(): ShoppingDictionary[] {
  return dictionaries;
}

export function findProductAlias(value: unknown): ShoppingProductMatch | null {
  const normalized = normalizeShoppingText(value);
  return aliasMap.get(normalized) || null;
}

export function findProductAliasesInText(value: unknown): ShoppingProductMatch[] {
  const normalized = ` ${normalizeShoppingText(value)} `;
  if (!normalized.trim()) return [];
  const matches: ShoppingProductMatch[] = [];
  const occupied: Array<[number, number]> = [];

  for (const match of sortedAliasMatches) {
    const needle = ` ${match.normalizedAlias} `;
    let index = normalized.indexOf(needle);
    while (index !== -1) {
      const start = index + 1;
      const end = start + match.normalizedAlias.length;
      const overlaps = occupied.some(([a, b]) => start < b && end > a);
      if (!overlaps) {
        occupied.push([start, end]);
        matches.push(match);
        break;
      }
      index = normalized.indexOf(needle, index + 1);
    }
  }

  return matches.sort((a, b) => normalized.indexOf(a.normalizedAlias) - normalized.indexOf(b.normalizedAlias));
}

export function isConnector(value: unknown): boolean {
  return connectorSet.has(normalizeShoppingText(value));
}

export function hasConnector(value: unknown): boolean {
  return normalizeShoppingText(value).split(/\s+/).some((word) => connectorSet.has(word));
}

export function isNarrativeBlocker(value: unknown): boolean {
  const normalized = normalizeShoppingText(value);
  if (!normalized) return false;
  return blockerList.some((blocker) => new RegExp(`(^|\\s)${escapeRegExp(blocker)}(\\s|$)`).test(normalized));
}

export function isKnownUnit(value: unknown): boolean {
  return unitSet.has(normalizeShoppingText(value));
}

export function getAllUnits(): string[] {
  return Array.from(unitSet).sort((a, b) => b.length - a.length);
}

export function cleanLeadingArticles(value: unknown): string {
  const original = asText(value).trim();
  const words = original.split(/\s+/);
  while (words.length > 1 && articleSet.has(normalizeShoppingText(words[0]))) {
    words.shift();
  }
  return words.join(' ').trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
