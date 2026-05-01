// Shopping list history persistence
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ShoppingList {
  id: string;
  name: string;
  items: string[];
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
}

const STORAGE_KEY = '@MyKit_shopping_lists_v1';

/**
 * Save a shopping list to history
 */
export async function saveShoppingList(items: string[]): Promise<ShoppingList> {
  try {
    const lists = await loadShoppingLists();

    // Filter out invalid items
    const validItems = items.filter((i): i is string => Boolean(i && typeof i === 'string' && i.trim().length > 0));
    if (validItems.length === 0) throw new Error('No valid items to save');

    // Check if this exact list already exists (same items)
    const normalizedItems = validItems.map(i => i.toLowerCase().trim()).sort();
    const existing = lists.find(list => {
      const existingNormalized = list.items.map(i => i.toLowerCase().trim()).sort();
      return JSON.stringify(existingNormalized) === JSON.stringify(normalizedItems);
    });

    if (existing) {
      // Update existing list
      existing.lastUsedAt = Date.now();
      existing.useCount += 1;
      await saveAllLists(lists);
      return existing;
    }

    // Create new list
    const newList: ShoppingList = {
      id: `list_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: `Shopping ${new Date().toLocaleDateString()}`,
      items: validItems,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      useCount: 1,
    };

    lists.push(newList);
    await saveAllLists(lists);
    return newList;
  } catch (error) {
    console.error('Error saving shopping list:', error);
    throw error;
  }
}

/**
 * Load all shopping lists sorted by recent use
 */
export async function loadShoppingLists(): Promise<ShoppingList[]> {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    if (!data) return [];

    const lists: ShoppingList[] = JSON.parse(data);
    // Clean up invalid items in each list
    const cleanedLists = lists.map(list => ({
      ...list,
      items: (list.items || []).filter((i): i is string => Boolean(i && typeof i === 'string' && i.trim().length > 0)),
    })).filter(list => list.items.length > 0);

    // Sort by last used (most recent first)
    return cleanedLists.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  } catch (error) {
    console.error('Error loading shopping lists:', error);
    return [];
  }
}

/**
 * Get the most recently used list
 */
export async function getLastShoppingList(): Promise<ShoppingList | null> {
  try {
    const lists = await loadShoppingLists();
    return lists.length > 0 ? lists[0] : null;
  } catch {
    return null;
  }
}

/**
 * Delete a shopping list
 */
export async function deleteShoppingList(id: string): Promise<void> {
  try {
    const lists = await loadShoppingLists();
    const filtered = lists.filter(list => list.id !== id);
    await saveAllLists(filtered);
  } catch (error) {
    console.error('Error deleting shopping list:', error);
    throw error;
  }
}

/**
 * Rename a shopping list
 */
export async function renameShoppingList(id: string, newName: string): Promise<ShoppingList | null> {
  try {
    const lists = await loadShoppingLists();
    const list = lists.find(l => l.id === id);
    if (list) {
      list.name = newName;
      await saveAllLists(lists);
    }
    return list || null;
  } catch (error) {
    console.error('Error renaming shopping list:', error);
    throw error;
  }
}

/**
 * Clear old lists (keep only last 10)
 */
export async function cleanupShoppingLists(): Promise<void> {
  try {
    const lists = await loadShoppingLists();
    if (lists.length > 10) {
      const kept = lists.slice(0, 10);
      await saveAllLists(kept);
    }
  } catch (error) {
    console.error('Error cleaning up shopping lists:', error);
  }
}

/**
 * Internal: Save all lists
 */
async function saveAllLists(lists: ShoppingList[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}
