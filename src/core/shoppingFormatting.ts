import { detectGroceryItem, findDuplicateGrocery, findGroceryById, formatGroceryItemForInsert, isLikelyShoppingList, safeText } from '../utils/groceryDetection';

export interface ShoppingItemTemplate {
  defaultQuantity: string;
  category: string;
}

export const SHOPPING_ITEM_TEMPLATES: Record<string, ShoppingItemTemplate> = {};

export function isShoppingListNote(text: string): boolean {
  return isLikelyShoppingList(text) || /^[\s]*[-•*]\s+/m.test(safeText(text));
}

export function getShoppingItemQuantity(itemName: string): string {
  const detected = detectGroceryItem(itemName);
  return detected.defaultQuantity || '1';
}

export function getShoppingItemCategory(itemName: string): string {
  const detected = detectGroceryItem(itemName);
  return detected.category || 'other';
}

export function formatShoppingItem(itemName: string, quantity?: string): string {
  const name = safeText(itemName).trim();
  if (!name) return '';
  const detected = detectGroceryItem(name);
  const item = detected.itemId ? findGroceryById(detected.itemId) : undefined;
  if (item) return formatGroceryItemForInsert(item, 'en', quantity || detected.defaultQuantity);
  const qty = safeText(quantity).trim();
  return qty ? `- ${name} — ${qty}` : `- ${name}`;
}

export function shoppingItemExists(text: string, itemName: string): boolean {
  const detected = detectGroceryItem(itemName);
  const item = detected.itemId ? findGroceryById(detected.itemId) : undefined;
  if (item) return findDuplicateGrocery(text, item);
  const lower = safeText(text).toLowerCase();
  const itemLower = safeText(itemName).toLowerCase();
  return Boolean(itemLower && lower.includes(itemLower));
}

export function insertShoppingItem(
  currentText: string,
  itemName: string,
  quantity?: string,
): { text: string; shouldAutoSave: boolean } {
  const current = safeText(currentText);
  const formatted = formatShoppingItem(itemName, quantity);
  if (!formatted) return { text: current, shouldAutoSave: false };
  return { text: current.trim() ? `${current}\n${formatted}` : formatted, shouldAutoSave: true };
}
