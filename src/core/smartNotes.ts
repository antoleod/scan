import { AppSettings } from '../types';
import { compileUserRegex } from './validation';

export type SmartNoteType = 'network' | 'device' | 'office' | 'asset' | 'general';
export type SmartNoteItemKind = 'checkbox' | 'bullet' | 'numbered';

export type SmartNoteItem = {
  text: string;
  checked: boolean;
  index: number;
  kind: SmartNoteItemKind;
};

export type SmartNoteModel = {
  entityType: SmartNoteType;
  entities: SmartNoteEntities;
  hasEntities: boolean;
  isChecklist: boolean;
  isList: boolean;
  items: SmartNoteItem[];
  rawText: string;
};

export type SmartNoteEntities = {
  type: SmartNoteType;
  ip: string[];
  hostname: string[];
  office: string[];
  pi: string[];
};

// `compileUserRegex` rejects oversized inputs, ReDoS-shaped patterns, and
// invalid syntax, falling back to the developer-supplied default. Without
// this, an imported backup or shared-group note could plant a catastrophic
// pattern that freezes every note render.
function safeRegex(source: string, fallback: RegExp): RegExp {
  return compileUserRegex(source, 'gi', fallback);
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectNoteEntities(text: string, settings: AppSettings): SmartNoteEntities {
  const value = String(text || '');
  const smart = settings.smartNotes;
  if (!smart) {
    return { type: 'general', ip: [], hostname: [], office: [], pi: [] };
  }

  const ipEnabled = smart.ipDetectionEnabled && smart.detectionEnabled.ip;
  const ipRegex = safeRegex(smart.regex.ip, /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/gi);
  const hostRegex = safeRegex(smart.regex.hostname, /\b(?:IPOLBRUP[A-Z0-9-]*|P\d{2}[A-Z]{2}[A-Z0-9-]*)\b/gi);
  const piRegex = safeRegex(smart.regex.pi, /\b(?:02PI[A-Z0-9]*|MUSTBRUN[A-Z0-9]*)\b/gi);
  const officeRegex = smart.offices.length
    ? new RegExp(`\\b(?:${smart.offices.map((office) => escapeRegex(office)).join('|')})\\b`, 'gi')
    : null;

  const ip = ipEnabled ? uniq(value.match(ipRegex) || []) : [];
  const hostname = smart.detectionEnabled.hostname ? uniq((value.match(hostRegex) || []).map((item) => item.toUpperCase())) : [];
  const pi = smart.detectionEnabled.asset ? uniq((value.match(piRegex) || []).map((item) => item.toUpperCase())) : [];
  const office = smart.detectionEnabled.office && officeRegex ? uniq(value.match(officeRegex) || []) : [];

  const type: SmartNoteType =
    ip.length > 0 ? 'network' :
    hostname.length > 0 ? 'device' :
    office.length > 0 ? 'office' :
    pi.length > 0 ? 'asset' :
    'general';

  return { type, ip, hostname, office, pi };
}

// ─── List / checklist detection ───────────────────────────────────────────────

const CHECKBOX_RE = /^\s*\[([xX ]?)\]\s*/;
const BULLET_RE   = /^\s*[-*•]\s+/;
const NUMBER_RE   = /^\s*\d+[.)]\s+/;

export function buildSmartNoteModel(text: string, entities: SmartNoteEntities): SmartNoteModel {
  const rawText = String(text || '');
  const hasEntities = entities.type !== 'general';

  const lines = rawText.split('\n').map((l) => l.trimEnd());
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  let isChecklist = false;
  let isList = false;
  const items: SmartNoteItem[] = [];

  if (nonEmpty.length >= 2) {
    let listLineCount = 0;
    let checkboxCount = 0;

    for (const line of nonEmpty) {
      if (CHECKBOX_RE.test(line)) { checkboxCount++; listLineCount++; }
      else if (BULLET_RE.test(line) || NUMBER_RE.test(line)) { listLineCount++; }
    }

    const ratio = listLineCount / nonEmpty.length;
    if (ratio >= 0.6) {
      isList = true;
      isChecklist = checkboxCount >= 2 || (checkboxCount > 0 && checkboxCount / listLineCount >= 0.5);

      let numIndex = 0;
      for (const line of lines) {
        if (!line.trim()) continue;
        const checkboxMatch = CHECKBOX_RE.exec(line);
        if (checkboxMatch) {
          items.push({ text: line.replace(CHECKBOX_RE, '').trim(), checked: checkboxMatch[1].toLowerCase() === 'x', index: numIndex++, kind: 'checkbox' });
          continue;
        }
        if (BULLET_RE.test(line)) {
          items.push({ text: line.replace(BULLET_RE, '').trim(), checked: false, index: numIndex++, kind: 'bullet' });
          continue;
        }
        if (NUMBER_RE.test(line)) {
          items.push({ text: line.replace(NUMBER_RE, '').trim(), checked: false, index: numIndex++, kind: 'numbered' });
          continue;
        }
        // Non-list line inside a mostly-list note — treat as plain item
        items.push({ text: line.trim(), checked: false, index: numIndex++, kind: 'bullet' });
      }
    }
  }

  return { entityType: entities.type, entities, hasEntities, isChecklist, isList, items, rawText };
}

// ─── ServiceNow structured field parsing ──────────────────────────────────────

export type ServiceNowField = {
  key: string;        // normalized key: 'affected_end_user'
  rawLabel: string;   // clean display label: 'Affected end user'
  value: string;      // cleaned value text
};

export type ServiceNowModel = {
  isStructured: boolean;
  fields: ServiceNowField[];
  freeText: string;   // lines that had no label|value structure
  footer: string;     // text after a '---' separator
};

/** Field keys auto-hidden by default (sensitive / personal data). */
export const SENSITIVE_FIELD_KEYS: ReadonlySet<string> = new Set([
  'affected_end_user',
  'business_phone',
  'phone',
]);

// OCR junk that appears before labels: "> ", "»", "5k ", etc.
const PREFIX_NOISE_RE = /^[\s>»*•!$]+(?:\d+[a-z]\s+)?/i;

// Cleans OCR garbage from label names: "(?)","®","(7)","€)"
const LABEL_CLEAN_RE = /\s*[\(®€©\)!]\s*|\s*\(\?\)\s*|\s*\(\d+\)\s*/g;

// Trailing OCR noise patterns in values: "QQ HI O", " v", "oO |& ©", " O)"
// Strips short uppercase artifacts and symbol clusters at the end of a value.
// Requires at least 2 uppercase chars (or explicit noise tokens) so that
// single-word values like "Exchange" are never truncated.
const VALUE_TRAIL_RE = /(\s+(?:[A-Z]{2}\)?|QQ|xo?|oO?|HI\s*[A-Z]?|[€©&|]{2,}\)?))+\s*$/g;

// A "label-like" line contains at least one alphabetic word before a ` | ` separator.
// Used to decide whether a bare line is a value continuation or a new label row.
const LABEL_PATTERN_RE = /^[^|]{2,}\s\|\s/;

/** Returns true when a trimmed line looks like a new `Label | Value` pair. */
function looksLikeLabelLine(line: string): boolean {
  const stripped = line.replace(PREFIX_NOISE_RE, '');
  return LABEL_PATTERN_RE.test(stripped) && /[a-zA-Z]/.test(stripped.slice(0, stripped.indexOf(' | ')));
}

/**
 * Returns true when `line` looks like a value continuation fragment produced
 * by OCR line-wrapping (e.g. "365" after "Outlook Office").
 *
 * A continuation fragment:
 * - Is short: ≤ 40 characters (a full prose sentence is usually longer)
 * - Contains no ` | ` separator (it's not a new label row)
 * - Does not look like a standalone sentence:
 *     - Does not end with `.` or `?` or `!`
 *     - Does not contain more than 4 space-separated words
 *       (prose starts with 5+ words, OCR fragments are typically 1-3)
 * - Is not a separator line (---, ===)
 */
function looksLikeValueContinuation(line: string): boolean {
  if (line.length > 40) return false;
  if (looksLikeLabelLine(line)) return false;
  if (/^[-=]{3,}$/.test(line)) return false;
  if (/[.?!]$/.test(line)) return false;
  const wordCount = line.trim().split(/\s+/).length;
  if (wordCount > 4) return false;
  return true;
}

function labelToKey(label: string): string {
  return label
    .replace(LABEL_CLEAN_RE, ' ')
    .toLowerCase()
    .trim()
    .replace(/[\s()/]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_|_$/g, '');
}

function parsePipeLine(raw: string): { label: string; value: string } | null {
  const line = raw.replace(PREFIX_NOISE_RE, '');
  const pipeIdx = line.indexOf(' | ');
  if (pipeIdx < 2) return null;

  const cleanLabel = line.slice(0, pipeIdx).replace(LABEL_CLEAN_RE, ' ').trim();
  if (cleanLabel.length < 2 || !/[a-zA-Z]/.test(cleanLabel)) return null;

  // Take only the first pipe-segment as value to avoid swallowing OCR continuations
  const rawValue = line.slice(pipeIdx + 3).split(' | ')[0];
  const cleanValue = rawValue.replace(VALUE_TRAIL_RE, '').replace(/\)\s*$/, '').trim();

  // Skip fields where the value is entirely empty after cleaning
  if (!cleanValue) return null;

  return { label: cleanLabel, value: cleanValue };
}

/** OCR noise lines: box-drawing chars, single stray characters, pure symbol runs. */
function isOcrNoiseLine(line: string): boolean {
  // Single printable character (not alphanumeric context)
  if (line.length === 1) return true;
  // Box-drawing or block-element Unicode characters
  if (/^[─-╿▀-▟■-◿]+$/.test(line)) return true;
  // Pure symbol run (no letters or digits at all)
  if (!/[a-zA-Z0-9À-ɏ]/.test(line)) return true;
  return false;
}

export function parseServiceNowFields(text: string): ServiceNowModel {
  const rawLines = String(text || '').split('\n');

  // ── Phase 1: Merge OCR-wrapped continuation lines ─────────────────────────
  // When OCR breaks a value across lines (e.g. "Outlook Office\n365"), the
  // second line is a bare token with no `Label | ` prefix. We join it to the
  // previous line before parsing so the full value is captured.
  const lines: string[] = [];
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) {
      lines.push('');
      continue;
    }
    // If the last accepted line looked like a label-value row and this line is
    // a short value-fragment continuation (not a new label, not a separator,
    // not a full prose sentence) → append it to close the OCR line-wrap.
    const prev = lines[lines.length - 1] ?? '';
    const prevTrimmed = prev.trim();
    if (
      prevTrimmed &&
      looksLikeLabelLine(prevTrimmed) &&
      looksLikeValueContinuation(trimmed) &&
      !isOcrNoiseLine(trimmed)
    ) {
      // Append the continuation token to the previous line
      lines[lines.length - 1] = `${prev} ${trimmed}`;
    } else {
      lines.push(trimmed);
    }
  }

  // ── Phase 2: Parse merged lines ───────────────────────────────────────────
  const fields: ServiceNowField[] = [];
  const freeLines: string[] = [];
  const footerLines: string[] = [];
  let separatorSeen = false;
  // Map key → index in `fields` for last-occurrence-wins deduplication
  const keyIndex = new Map<string, number>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // OCR noise lines (single chars, box-drawing) are silently dropped
    if (isOcrNoiseLine(trimmed)) continue;

    // Section separator (--- or ===)
    if (/^[-=]{3,}$/.test(trimmed)) { separatorSeen = true; continue; }

    if (separatorSeen) { footerLines.push(trimmed); continue; }

    const parsed = parsePipeLine(trimmed);
    if (parsed) {
      const key = labelToKey(parsed.label);
      if (!key) continue;

      if (keyIndex.has(key)) {
        // Last-occurrence-wins: update the existing entry in-place
        const idx = keyIndex.get(key)!;
        fields[idx] = { key, rawLabel: parsed.label, value: parsed.value };
      } else {
        keyIndex.set(key, fields.length);
        fields.push({ key, rawLabel: parsed.label, value: parsed.value });
      }
    } else {
      freeLines.push(trimmed);
    }
  }

  return {
    isStructured: fields.length >= 2,
    fields,
    freeText: freeLines.join('\n').trim(),
    footer: footerLines.join('\n').trim(),
  };
}

/**
 * Rebuild note text from a ServiceNowModel, omitting fields whose keys are in
 * `hiddenKeys`. Preserves free-text lines and the footer separator block.
 * Falls back to the original raw text when the model is not structured.
 */
export function buildRedactedText(model: ServiceNowModel, rawText: string, hiddenKeys: Set<string>): string {
  if (!model.isStructured) return rawText;

  const lines: string[] = [];

  for (const field of model.fields) {
    if (hiddenKeys.has(field.key)) continue;
    lines.push(`${field.rawLabel} | ${field.value}`);
  }

  if (model.freeText) lines.push(model.freeText);
  if (model.footer)   { lines.push('---'); lines.push(model.footer); }

  return lines.join('\n');
}

// ─── Inline text segmentation (for highlighted rendering) ─────────────────────

export type NoteSegmentKind = 'plain' | 'pi' | 'hostname' | 'ip' | 'office';

export type NoteSegment = {
  text: string;
  kind: NoteSegmentKind;
};

/**
 * Splits `text` into segments where detected entities are tagged with their kind.
 * Plain text between entities keeps its original content so the full note context
 * is always visible — you can see which PI maps to which hostname on the same line.
 */
export function segmentNoteText(text: string, entities: SmartNoteEntities): NoteSegment[] {
  const str = String(text || '');
  if (!str) return [];

  type Match = { start: number; end: number; kind: NoteSegmentKind };
  const matches: Match[] = [];

  function findAll(values: string[], kind: NoteSegmentKind) {
    for (const val of values) {
      if (!val) continue;
      const escaped = val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(str)) !== null) {
        matches.push({ start: m.index, end: m.index + m[0].length, kind });
      }
    }
  }

  findAll(entities.pi,       'pi');
  findAll(entities.hostname, 'hostname');
  findAll(entities.ip,       'ip');
  findAll(entities.office,   'office');

  if (matches.length === 0) return [{ text: str, kind: 'plain' }];

  // Sort by position and drop overlapping matches (keep first / longest)
  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const clean: Match[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start >= cursor) { clean.push(m); cursor = m.end; }
  }

  // Build interleaved plain + entity segments
  const segments: NoteSegment[] = [];
  let pos = 0;
  for (const m of clean) {
    if (m.start > pos) segments.push({ text: str.slice(pos, m.start), kind: 'plain' });
    segments.push({ text: str.slice(m.start, m.end), kind: m.kind });
    pos = m.end;
  }
  if (pos < str.length) segments.push({ text: str.slice(pos), kind: 'plain' });

  return segments;
}
