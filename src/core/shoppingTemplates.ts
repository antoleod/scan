/**
 * Predefined shopping list templates
 * Static data for common shopping scenarios
 */

import { GroceryCategory } from '../data/groceryCatalog';

export interface ShoppingTemplate {
  id: 'breakfast' | 'dinner' | 'picnic';
  label: string;
  emoji: string;
  items: Array<{
    name: string;
    catalogId?: string;
    category: GroceryCategory;
    quantity?: number;
    unit?: string;
  }>;
}

export const SHOPPING_TEMPLATES: ShoppingTemplate[] = [
  {
    id: 'breakfast',
    label: 'Breakfast',
    emoji: '🌅',
    items: [
      { name: 'Eggs', catalogId: 'egg', category: 'dairy', quantity: 6, unit: 'unit' },
      { name: 'Milk', catalogId: 'milk', category: 'dairy', quantity: 1, unit: 'L' },
      { name: 'Butter', catalogId: 'butter', category: 'dairy' },
      { name: 'Bread', catalogId: 'bread', category: 'bakery' },
      { name: 'Coffee', catalogId: 'coffee', category: 'drinks' },
      { name: 'Orange juice', catalogId: 'orange_juice', category: 'drinks', quantity: 1, unit: 'L' },
    ],
  },
  {
    id: 'dinner',
    label: 'Dinner',
    emoji: '🍽️',
    items: [
      { name: 'Pasta', catalogId: 'pasta', category: 'pantry', quantity: 500, unit: 'g' },
      { name: 'Tomatoes', catalogId: 'tomato', category: 'vegetables', quantity: 4, unit: 'unit' },
      { name: 'Cheese', catalogId: 'cheese', category: 'dairy', quantity: 200, unit: 'g' },
      { name: 'Garlic', catalogId: 'garlic', category: 'vegetables' },
      { name: 'Olive oil', catalogId: 'olive_oil', category: 'pantry' },
      { name: 'Salad', catalogId: 'lettuce', category: 'vegetables' },
    ],
  },
  {
    id: 'picnic',
    label: 'Picnic',
    emoji: '🧺',
    items: [
      { name: 'Water', catalogId: 'water', category: 'drinks', quantity: 2, unit: 'L' },
      { name: 'Fruits', category: 'fruits', quantity: 3, unit: 'unit' },
      { name: 'Bread', catalogId: 'bread', category: 'bakery' },
      { name: 'Cheese', catalogId: 'cheese', category: 'dairy', quantity: 200, unit: 'g' },
      { name: 'Ham', catalogId: 'ham', category: 'meat', quantity: 200, unit: 'g' },
      { name: 'Snacks', category: 'snacks', quantity: 2, unit: 'unit' },
    ],
  },
];
