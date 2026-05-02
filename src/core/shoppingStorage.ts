/**
 * Shopping list persistence helpers
 * Handles favorites and quantity memory across sessions
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { GroceryCategory } from '../data/groceryCatalog';

const FAVORITES_KEY = '@mykit_shopping_favorites_v1';
const QTY_MEMORY_KEY = '@mykit_shopping_qty_v1';

export interface FavoriteItem {
  catalogId: string;
  name: string;
  category: GroceryCategory;
  defaultQty?: number;
}

export async function loadFavorites(): Promise<FavoriteItem[]> {
  try {
    const stored = await AsyncStorage.getItem(FAVORITES_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as FavoriteItem[];
  } catch {
    return [];
  }
}

export async function saveFavorites(favs: FavoriteItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
  } catch {
    // silent fail
  }
}

export async function loadQtyMemory(): Promise<Record<string, { qty: number; unit: string }>> {
  try {
    const stored = await AsyncStorage.getItem(QTY_MEMORY_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as Record<string, { qty: number; unit: string }>;
  } catch {
    return {};
  }
}

export async function saveQtyMemory(mem: Record<string, { qty: number; unit: string }>): Promise<void> {
  try {
    await AsyncStorage.setItem(QTY_MEMORY_KEY, JSON.stringify(mem));
  } catch {
    // silent fail
  }
}
