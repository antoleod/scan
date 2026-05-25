const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const scanRoots = [
  path.join(root, 'src', 'components'),
  path.join(root, 'src', 'screens'),
];

const failures = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function rel(file) {
  return path.relative(root, file).replace(/\\/g, '/');
}

function lineOf(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function addFailure(file, index, message) {
  failures.push(`${rel(file)}:${lineOf(fs.readFileSync(file, 'utf8'), index)} ${message}`);
}

function isAllowedShieldBlock(block) {
  return [
    'modalForm',
    'modalView',
    'moreSheet',
    'backupModal',
    'previewModal',
    'officeScanModal',
    'barcodeModalView',
    'barcodeSheet',
    'pickerModal',
    'sheet',
    'Profile menu',
    'width: \'100%\'',
  ].some((token) => block.includes(token));
}

for (const file of scanRoots.flatMap(walk)) {
  const source = fs.readFileSync(file, 'utf8');

  const staleMatch = source.match(/\b(TODO|FIXME|not implemented|coming soon)\b/i);
  if (staleMatch) {
    addFailure(file, source.indexOf(staleMatch[0]), `stale UI marker found: "${staleMatch[0]}"`);
  }

  const actionButtonNoop = /<ThemedActionIconButton\b[^\n]*onPress=\{(?:[^}\n]*\?\?\s*)?\(\)\s*=>\s*(?:\{\s*\}|undefined|null)[^}\n]*\}/g;
  for (const match of source.matchAll(actionButtonNoop)) {
    addFailure(file, match.index || 0, 'ThemedActionIconButton has an empty onPress handler');
  }

  const pressableNoop = /<Pressable\b[\s\S]{0,700}?onPress=\{\(\)\s*=>\s*(?:undefined|null|\{\s*\})\}[\s\S]{0,700}?<\/Pressable>/g;
  for (const match of source.matchAll(pressableNoop)) {
    const block = match[0];
    const looksActionable = /<Text\b|accessibilityRole="button"|accessibilityLabel=/.test(block);
    if (looksActionable && !isAllowedShieldBlock(block)) {
      addFailure(file, match.index || 0, 'actionable Pressable has an empty onPress handler');
    }
  }

  if (rel(file) === 'src/components/ShoppingListBlockV2.tsx') {
    const deadShoppingAction = source.match(/\bonPrices\b|label="Prices"|>\s*Prices\s*</);
    if (deadShoppingAction) {
      addFailure(file, source.indexOf(deadShoppingAction[0]), 'dead shopping list price action is still present');
    }
  }

  if (rel(file) === 'src/components/NoteOcrModal.tsx') {
    for (const required of ['extractTextFromImage', 'handlePickImage', 'handlePasteFromClipboard', 'notes.ocr.success']) {
      if (!source.includes(required)) {
        failures.push(`${rel(file)} missing required OCR path: ${required}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('\nUI action audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('UI action audit passed.');
