import { TemplateRule } from '../types';
import { isProbablyCatastrophicRegex } from './validation';
import { parseServiceNowFields } from './smartNotes';

// Set to true (or define EXPO_PUBLIC_DEBUG_NOTE_EXTRACTION=true) to enable
// verbose extraction logging in development.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _devGlobal: boolean = (typeof (globalThis as any).__DEV__ !== 'undefined') ? (globalThis as any).__DEV__ : false;
const DEBUG_NOTE_EXTRACTION: boolean =
  _devGlobal ||
  (typeof process !== 'undefined' && process.env['EXPO_PUBLIC_DEBUG_NOTE_EXTRACTION'] === 'true');

function dbg(tag: string, value: unknown): void {
  if (!DEBUG_NOTE_EXTRACTION) return;
  // eslint-disable-next-line no-console
  console.log(`[noteExtractor] ${tag}:`, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
}

function matchFirst(text: string, regex: RegExp): string {
  const m = text.match(regex);
  return m?.[1]?.trim() || '';
}

export function extractFields(rawText: string, templates: TemplateRule[]): Record<string, string> {
  const text = String(rawText || '').trim();
  if (!text) return {};

  for (const t of templates) {
    const out: Record<string, string> = {};
    for (const [field, pattern] of Object.entries(t.regexRules || {})) {
      // Reject user-supplied patterns that look like catastrophic-backtracking
      // ReDoS shapes (e.g., (a+)+, (a|a)+). Without this, an attacker who can
      // ship a TemplateRule via import or shared-group sync could freeze the
      // JS engine on every scan.
      if (typeof pattern !== 'string' || isProbablyCatastrophicRegex(pattern)) continue;
      try {
        const value = matchFirst(text, new RegExp(pattern, 'im'));
        if (value) out[field] = value;
      } catch {
        // ignore invalid regex
      }
    }
    if (Object.keys(out).length) return { ...out, _templateId: t.id };
  }

  const defaults: Record<string, string> = {
    ticketNumber: matchFirst(text, /(RITM\d+|REQ\d+|INC\d+|SCTASK\d+)/i),
    customerId: matchFirst(text, /customer\s*id\s*[:#-]?\s*([A-Z0-9_-]+)/i),
    shortDescription: matchFirst(text, /short\s*description\s*[:#-]?\s*(.+)/i),
    officeCode: matchFirst(text, /office\s*(?:code|barcode|number|no)?\s*[:#-]?\s*([A-Z0-9-]+)/i),
    officeNumber: matchFirst(text, /office\s*(?:number|no)?\s*[:#-]?\s*([A-Z0-9-]+)/i),
    phoneNumber: matchFirst(text, /(\+?\d[\d\s().-]{6,}\d)/i),
    email: matchFirst(text, /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i),
  };

  return Object.fromEntries(Object.entries(defaults).filter(([, v]) => !!v));
}

// ─── Structured note data extraction ──────────────────────────────────────────

/**
 * Structured output of the note extraction pipeline.
 * Used as the canonical intermediate representation before rendering.
 */
export interface ExtractedNoteData {
  /** A concise title derived from the first non-empty, non-label line. */
  title?: string;
  /** Value of a `Short Description` field if detected. */
  shortDescription?: string;
  /** Multi-line free-text body (lines that do not follow Label | Value format). */
  description?: string;
  /** Ordered label/value pairs extracted from the note body. */
  fields: Array<{ label: string; value: string }>;
  /** Original unmodified input (always present; useful for debug/fallback). */
  rawText: string;
}

/**
 * Extracts a clean, structured representation from arbitrary note text.
 *
 * Handles:
 * - ServiceNow-style `Label | Value` lines (via `parseServiceNowFields`)
 * - Multiline OCR continuations ("Outlook Office\n365" → "Outlook Office 365")
 * - Alphanumeric codes, time formats, accented text — all preserved exactly
 * - Empty-value fields are omitted; duplicate labels keep the last occurrence
 * - OCR noise lines (single chars, box-drawing) are silently dropped
 * - Lines without a label pattern that accumulate to ≥3 are surfaced as `description`
 */
export function extractCleanNoteData(rawText: string): ExtractedNoteData {
  const text = String(rawText || '').trim();

  dbg('raw', text.slice(0, 200) + (text.length > 200 ? '…' : ''));

  if (!text) {
    return { fields: [], rawText: '' };
  }

  // Delegate to the battle-tested ServiceNow parser which already handles
  // continuation merging, deduplication, and noise removal.
  const snModel = parseServiceNowFields(text);

  dbg('detected fields', snModel.fields);

  const fields: Array<{ label: string; value: string }> = snModel.fields.map((f) => ({
    label: f.rawLabel,
    value: f.value,
  }));

  // Try to surface a shortDescription from a well-known field key
  const snField = snModel.fields.find((f) => f.key === 'short_description');
  const shortDescription = snField?.value || undefined;

  // Free-text lines: if there are 3+ non-empty lines they form a description
  const freeLines = snModel.freeText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const description = freeLines.length >= 3 ? freeLines.join('\n') : undefined;

  // Title: first free-text line when we have structured fields, or first line of text
  let title: string | undefined;
  if (snModel.isStructured && freeLines.length > 0) {
    title = freeLines[0];
  } else if (!snModel.isStructured) {
    const firstLine = text.split('\n')[0]?.trim();
    if (firstLine && firstLine.length <= 120) title = firstLine;
  }

  const result: ExtractedNoteData = {
    ...(title !== undefined ? { title } : {}),
    ...(shortDescription !== undefined ? { shortDescription } : {}),
    ...(description !== undefined ? { description } : {}),
    fields,
    rawText: text,
  };

  dbg('normalized', result.fields);
  dbg('final', result);

  return result;
}
