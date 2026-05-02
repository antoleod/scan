/**
 * shoppingListHelper.ts
 * Integration helpers for rendering shopping lists in NoteCard
 */

import { parseShoppingListV2, isShoppingListV2, type ShoppingListV2, type AppLanguage } from './shoppingListV2';

export interface NoteShoppingContext {
  isShoppingList: boolean;
  model?: ShoppingListV2;
  error?: string;
}

/**
 * Health/medication keywords that indicate the note is NOT a shopping list
 */
const HEALTH_KEYWORDS = /\b(medication|medicine|medicament|drug|ibuprofen|paracetamol|aspirin|amoxicillin|dose|dosage|tablet|pill|capsule|mg|ml|grams|mmol|units|iu|taken|next\s+suggested|leaflet|prescription|doctor|pharmacist|physician|nurse|hospital|clinic|symptom|treatment|therapy|disease|condition|diagnosis|medical)\b/i;

/**
 * Time patterns that should not be parsed as quantities
 * Examples: 06:47 PM, 04:47 PM, 10:47, HH:MM, etc.
 */
const TIME_PATTERN = /(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?|\d{4}-\d{2}-\d{2}\s+\d{1,2}:\d{2}/;

/**
 * Check if text appears to be health/medication related
 */
function isHealthNote(text: string): boolean {
  return HEALTH_KEYWORDS.test(text);
}

/**
 * Check if text appears to contain times (which should not be quantities)
 */
function hasTimePatterns(text: string): boolean {
  return TIME_PATTERN.test(text);
}

/**
 * Analyze a note text and determine if it's a shopping list
 * Returns the parsed model if it is, otherwise null
 */
export function analyzeNoteForShoppingList(
  text: string,
  language: AppLanguage = 'en',
  smartType?: string
): NoteShoppingContext {
  if (!text?.trim()) {
    return { isShoppingList: false };
  }

  // Never treat medication notes as shopping lists
  if (smartType === 'medication') {
    return { isShoppingList: false };
  }

  // Reject if text contains strong health/medication indicators
  if (isHealthNote(text)) {
    return { isShoppingList: false };
  }

  try {
    if (!isShoppingListV2(text, language)) {
      return { isShoppingList: false };
    }

    const model = parseShoppingListV2(text, language);

    // Only consider it a valid shopping list if we got reasonable items
    if (!model.items || model.items.length < 2) {
      return { isShoppingList: false };
    }

    return {
      isShoppingList: true,
      model,
    };
  } catch (error) {
    return {
      isShoppingList: false,
      error: error instanceof Error ? error.message : 'Failed to parse',
    };
  }
}

/**
 * Get recommended language from user's app language
 * Falls back to 'en' if not supported
 */
export function getShoppingLanguage(appLanguage?: string): AppLanguage {
  if (appLanguage === 'fr' || appLanguage === 'es' || appLanguage === 'nl') {
    return appLanguage as AppLanguage;
  }
  return 'en';
}

/**
 * Count total items per category
 */
export function countItemsByCategory(model: ShoppingListV2): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [category, items] of Object.entries(model.groupedByCategory)) {
    if (items.length > 0) {
      counts[category] = items.length;
    }
  }
  return counts;
}

/**
 * Get total number of items in the list
 */
export function getTotalItemCount(model: ShoppingListV2): number {
  return model.items.length;
}

/**
 * Get average confidence score across all items
 */
export function getAverageConfidence(model: ShoppingListV2): number {
  if (model.items.length === 0) return 0;
  const sum = model.items.reduce((acc, item) => acc + item.confidence, 0);
  return sum / model.items.length;
}

/**
 * Check if all items have high confidence (>= 0.85)
 */
export function isHighConfidenceList(model: ShoppingListV2): boolean {
  return getAverageConfidence(model) >= 0.85;
}

/**
 * Get items that need manual review (confidence < 0.70)
 */
export function getItemsNeedingReview(model: ShoppingListV2) {
  return model.items.filter((item) => item.confidence < 0.70);
}

/**
 * Get items with tags
 */
export function getTaggedItems(model: ShoppingListV2) {
  return model.items.filter((item) => item.tags.length > 0);
}

/**
 * Get summary text for display (e.g., in preview)
 */
export function getShoppingListSummary(model: ShoppingListV2): string {
  const total = getTotalItemCount(model);
  const categories = Object.keys(model.groupedByCategory).filter(
    (cat) => model.groupedByCategory[cat as keyof typeof model.groupedByCategory].length > 0
  );

  return `Shopping list: ${total} items in ${categories.length} categories`;
}
