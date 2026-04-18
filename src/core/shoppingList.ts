/**
 * shoppingList.ts
 * Deterministic shopping-list detection and parsing.
 * Completely independent of the existing smart-notes classification.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type ShoppingItem = {
  id: string;          // stable key for reconciliation
  label: string;       // "Lard / tocino"
  quantity: string;    // "1,5" | "400" | ""
  unit: string;        // "kg" | "g" | "piezas" | ""
  checked: boolean;
  rawLine: string;     // original line preserved verbatim
};

export type ShoppingListModel = {
  isShoppingList: boolean;
  items: ShoppingItem[];
  rawText: string;
};

// ─── Detection heuristics ─────────────────────────────────────────────────────

// Quantity: digits with optional comma/dot decimal, e.g. 1,5  2.1  400  10
const QTY_RE = /\b\d+(?:[.,]\d+)?\b/;

// Common units (extend freely)
const UNIT_WORDS = [
  'g', 'kg', 'gr', 'lb', 'oz',
  'ml', 'l', 'lt', 'litre', 'liter',
  'piezas', 'pieza', 'unidad', 'unidades', 'ud', 'uds',
  'manojos', 'manojo', 'atado', 'racimo',
  'botellas', 'botella', 'latas', 'lata', 'bote',
  'pcs', 'pieces', 'piece', 'pack', 'packs',
  'dozen', 'docena', 'douzaine',
  'tranches', 'tranche', 'slices', 'slice',
];
const UNIT_RE = new RegExp(`\\b(${UNIT_WORDS.join('|')})\\b`, 'i');

// A "colon-style" line: "Some product name: qty unit"
// Handles "Lard / tocino: 400 g"  and  "Ribs para sopa: 1,5 kg"
const COLON_LINE_RE = /^.+:\s*\d+(?:[.,]\d+)?\s*[a-zA-Z]*/;

// A line that has a quantity+unit pair anywhere (looser)
const QTY_UNIT_LINE_RE = /\b\d+(?:[.,]\d+)?\s*(?:g|kg|gr|lb|oz|ml|l\b|lt|litre|liter|piezas|pieza|unidades|ud|uds|manojos|manojo|atado|racimo|botellas|latas|lata|bote|pcs|pieces|pack|packs|dozen|docena|douzaine|tranches|tranche|slices|slice)\b/i;

/**
 * Returns true only when the text looks like a shopping / item list.
 * Requires at least 2 non-empty lines, with the majority matching
 * colon-style or qty+unit patterns.
 * Never fires on single-line texts.
 */
export function isShoppingList(text: string): boolean {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return false;

  let matches = 0;
  for (const line of lines) {
    if (COLON_LINE_RE.test(line) || QTY_UNIT_LINE_RE.test(line)) matches++;
  }

  // At least 60 % of lines must look like shopping items
  return matches / lines.length >= 0.6;
}

// ─── Per-line parser ──────────────────────────────────────────────────────────

let _idCounter = 0;
function nextId(): string {
  return `sl_${Date.now()}_${_idCounter++}`;
}

/**
 * Parses a single line into label / quantity / unit.
 * Handles patterns:
 *   "Lard / tocino: 400 g"
 *   "Ribs para sopa: 1,5 kg"
 *   "Bananes vertes: 10 piezas"
 *   "Eau (6): 6 bouteilles"
 */
function parseLine(line: string): { label: string; quantity: string; unit: string } {
  const colonIdx = line.lastIndexOf(':');

  let labelPart = line;
  let afterColon = '';

  if (colonIdx !== -1) {
    labelPart = line.slice(0, colonIdx).trim();
    afterColon = line.slice(colonIdx + 1).trim();
  }

  // If we have an after-colon chunk, try to pull qty + unit from it
  if (afterColon) {
    const qtyMatch = QTY_RE.exec(afterColon);
    const unitMatch = UNIT_RE.exec(afterColon);

    if (qtyMatch) {
      const quantity = qtyMatch[0];
      const unit = unitMatch ? unitMatch[1] : '';
      return { label: labelPart, quantity, unit };
    }

    // No qty found after colon — treat whole after-colon as label suffix
    return { label: line, quantity: '', unit: '' };
  }

  // No colon — try to find qty+unit inline
  const unitMatch = UNIT_RE.exec(line);
  if (unitMatch) {
    const unit = unitMatch[1];
    const unitIdx = unitMatch.index;
    // Walk backward from unit to find the leading digit
    const before = line.slice(0, unitIdx);
    const qtyMatch = /\d+(?:[.,]\d+)?\s*$/.exec(before);
    if (qtyMatch) {
      const quantity = qtyMatch[0].trim();
      const labelEnd = before.lastIndexOf(qtyMatch[0]);
      const label = line.slice(0, labelEnd).trim().replace(/[:\-–—,]+$/, '').trim();
      return { label: label || line, quantity, unit };
    }
  }

  return { label: line, quantity: '', unit: '' };
}

// ─── Full text parser ─────────────────────────────────────────────────────────

/**
 * Parses the raw note text into a ShoppingListModel.
 * If `previousItems` is provided, checked states are preserved
 * for lines whose rawLine is unchanged (safe re-parse on edit).
 */
export function parseShoppingList(
  text: string,
  previousItems?: ShoppingItem[],
): ShoppingListModel {
  const rawText = String(text || '');
  const lines = rawText.split('\n').map((l) => l.trimEnd());

  // Build a lookup of rawLine → checked state from previous parse
  const prevChecked = new Map<string, boolean>();
  if (previousItems) {
    for (const prev of previousItems) {
      prevChecked.set(prev.rawLine, prev.checked);
    }
  }

  const items: ShoppingItem[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const { label, quantity, unit } = parseLine(trimmed);
    items.push({
      id: nextId(),
      label,
      quantity,
      unit,
      checked: prevChecked.get(trimmed) ?? false,
      rawLine: trimmed,
    });
  }

  return {
    isShoppingList: isShoppingList(rawText),
    items,
    rawText,
  };
}

/**
 * Reconstructs raw text from shopping items so the note stays editable.
 * Preserves the "label: qty unit" format for each item.
 */
export function shoppingListToText(items: ShoppingItem[]): string {
  return items
    .map((item) => {
      const label = item.label.trim();
      const qtyPart = item.quantity ? `${item.quantity}${item.unit ? ' ' + item.unit : ''}` : item.unit;
      return qtyPart ? `${label}: ${qtyPart}` : label;
    })
    .join('\n');
}
