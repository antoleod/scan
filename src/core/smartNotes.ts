import { AppSettings } from '../types';

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

function safeRegex(source: string, fallback: RegExp): RegExp {
  try {
    return new RegExp(source, 'gi');
  } catch {
    return fallback;
  }
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
  const piRegex = safeRegex(smart.regex.pi, /\b02PI[A-Z0-9]*\b/gi);
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
