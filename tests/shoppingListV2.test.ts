/**
 * Shopping List V2 - Test cases
 * Validates the new intelligent shopping list parser
 */

import { parseShoppingListV2, isShoppingListV2 } from '../src/core/shoppingListV2';

// Test data from user example
const userInput = `Pommes de terre, oignons, ail, du haché porc et veau, du blanc de poulet, cabillaud, pommes rouges pour l'école, raisin vert, avocat, 3 poires, des lardons, la crème liquide verte, mozzarella, pain pour l'école, jambon pour l'école, jus d'organe, jus de pommes, salade, concombre, eau`;

const simpleInput = `Pommes de terre, oignons, ail, 3 poires, jus d'organe, jus de pommes, pain pour l'école, jambon pour l'école, eau`;

console.log('🧪 Shopping List V2 - Test Suite\n');

// Test 1: Detection
console.log('✓ Test 1: Shopping list detection');
console.log(`  Input is shopping list: ${isShoppingListV2(userInput)}`);
console.log(`  Simple input is shopping list: ${isShoppingListV2(simpleInput)}\n`);

// Test 2: Parse complex example
console.log('✓ Test 2: Parse complex example (from user)');
const result1 = parseShoppingListV2(userInput, 'fr');

console.log(`\n  Total items: ${result1.items.length}`);
console.log(`  Items by category:`);

for (const [category, items] of Object.entries(result1.groupedByCategory)) {
  if (items.length > 0) {
    console.log(`    ${category} (${items.length}):`);
    for (const item of items) {
      let line = `      • ${item.name}`;
      if (item.quantity && item.unit) {
        line += ` — ${item.quantity} ${item.unit}`;
      } else if (item.quantity) {
        line += ` — ${item.quantity}`;
      }
      if (item.tags.length > 0) {
        line += ` [${item.tags.join(', ')}]`;
      }
      line += ` (confidence: ${(item.confidence * 100).toFixed(0)}%)`;
      console.log(line);
    }
  }
}

// Test 3: Parse simple example
console.log('\n✓ Test 3: Parse simple example (from user requirement)');
const result2 = parseShoppingListV2(simpleInput, 'fr');

console.log(`\n  Total items: ${result2.items.length}`);
console.log(`  Items:`);

for (const item of result2.items) {
  let line = `    • ${item.name}`;
  if (item.quantity && item.unit) {
    line += ` — ${item.quantity} ${item.unit}`;
  } else if (item.quantity) {
    line += ` — ${item.quantity}`;
  }
  if (item.tags.length > 0) {
    line += ` [${item.tags.join(', ')}]`;
  }
  console.log(line);
}

// Test 4: Verify typo corrections
console.log('\n✓ Test 4: Typo corrections');
const typoInput = `jus d'organe`;
const typoResult = parseShoppingListV2(typoInput, 'fr');
if (typoResult.items.length > 0) {
  const item = typoResult.items[0];
  console.log(`  Input: "${typoInput}"`);
  console.log(`  Corrected to: "${item.name}"`);
  console.log(`  Original preserved: "${item.originalText}"`);
} else {
  console.log(`  ⚠ Could not parse typo input`);
}

// Test 5: Tag detection
console.log('\n✓ Test 5: Tag detection ("pour l\'école")');
const tagInput = `pain pour l'école, jambon pour l'école`;
const tagResult = parseShoppingListV2(tagInput, 'fr');
console.log(`  Items with "pour l'école" tag:`);
for (const item of tagResult.items) {
  console.log(`    • ${item.name} — tags: [${item.tags.join(', ') || 'none'}]`);
}

// Test 6: Quantity extraction
console.log('\n✓ Test 6: Quantity extraction');
const qtyInput = `3 poires, 500 g pommes, 1 kg pommes de terre`;
const qtyResult = parseShoppingListV2(qtyInput, 'fr');
console.log(`  Items with quantities:`);
for (const item of qtyResult.items) {
  let line = `    • ${item.name}`;
  if (item.quantity && item.unit) {
    line += ` — ${item.quantity} ${item.unit}`;
  } else if (item.quantity) {
    line += ` — ${item.quantity}`;
  }
  console.log(line);
}

console.log('\n✅ All tests completed!\n');
