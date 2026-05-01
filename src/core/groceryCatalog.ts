// Compatibility layer for older smart workflow imports.
import {
  detectGroceryItem,
  getAllGroceryItems,
  isLikelyShoppingList,
  normalizeText,
  safeText,
} from '../utils/groceryDetection';
import type { GroceryCatalogItem as DataGroceryCatalogItem, GroceryCategory } from '../data/groceryCatalog';

export type GroceryCatalogItem = DataGroceryCatalogItem & {
  canonical: { en: string; es: string; fr: string; nl: string };
  aliases: string[];
};

export type { GroceryCategory };

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

export function normalizeGroceryText(value: string): string {
  return normalizeText(value);
}

export function findGroceryMatches(text: string): GroceryMatch[] {
  const value = safeText(text);
  const pieces = value.split(/[\n,;]+|\s*:\s*/g).map((part) => part.trim()).filter(Boolean);
  const seen = new Set<string>();
  const matches: GroceryMatch[] = [];

  for (const piece of pieces.length ? pieces : [value]) {
    const detected = detectGroceryItem(piece);
    if (!detected.itemId || detected.confidence < 0.65 || seen.has(detected.itemId)) continue;
    seen.add(detected.itemId);
    matches.push({
      id: detected.itemId,
      category: detected.category as GroceryCategory,
      matchedText: piece,
      displayName: detected.displayName || piece,
      confidence: detected.confidence,
    });
  }

  return matches;
}

export function isLikelyShoppingNote(text: string): boolean {
  return isLikelyShoppingList(text);
}

export function extractShoppingItemsFromText(text: string): ShoppingChecklistItem[] {
  return safeText(text)
    .split(/[\n,;]+|\s*:\s*/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const detected = detectGroceryItem(line);
      return {
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        text: line,
        completed: false,
        source: 'extracted' as const,
        groceryId: detected.itemId,
        category: detected.category as GroceryCategory | undefined,
      };
    });
}

export function listGroceryCatalog(): DataGroceryCatalogItem[] {
  return getAllGroceryItems();
}
