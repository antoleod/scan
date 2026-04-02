import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchNotesFromFirebase, syncNotesWithFirebase } from './firebase';

const NOTES_KEY = '@barra_notes_v1';
const TEMPLATES_KEY = '@barra_note_templates_v1';
const NOTES_SEEDED_KEY = '@barra_notes_seeded_v1';

export type NoteKind = 'text' | 'image';
export type NoteCategory = 'general' | 'work';

export interface NoteItem {
  id: string;
  kind: NoteKind;
  category: NoteCategory;
  text: string;
  imageBase64?: string;
  imageMimeType?: string;
  attachments?: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export type TemplateKind = 'email' | 'appointment';

export interface NoteTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  subject: string;
  body: string;
  location?: string;
  durationMinutes?: number;
  createdAt: number;
  updatedAt: number;
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function normalizeNotes(items: NoteItem[]): NoteItem[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export async function loadNotes(): Promise<NoteItem[]> {
  const raw = await AsyncStorage.getItem(NOTES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeNotes(
      parsed
        .map((item): NoteItem => ({
          id: String(item?.id || makeId('note')),
          kind: item?.kind === 'image' ? 'image' : 'text',
          category: item?.category === 'work' ? 'work' : 'general',
          text: String(item?.text || ''),
          imageBase64: typeof item?.imageBase64 === 'string' ? item.imageBase64 : undefined,
          imageMimeType: typeof item?.imageMimeType === 'string' ? item.imageMimeType : undefined,
          attachments: Array.isArray(item?.attachments) ? item.attachments.map((v: unknown) => String(v || '')).filter(Boolean).slice(0, 8) : undefined,
          pinned: Boolean(item?.pinned),
          createdAt: Number(item?.createdAt || Date.now()),
          updatedAt: Number(item?.updatedAt || Date.now()),
        }))
        .filter((item) => item.text.trim().length > 0 || (item.kind === 'image' && item.imageBase64)),
    );
  } catch {
    return [];
  }
}

export async function saveNotes(items: NoteItem[]): Promise<void> {
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(normalizeNotes(items).slice(0, 3000)));
}

async function syncNotesStateIfAuthenticated(notesOverride?: NoteItem[], templatesOverride?: NoteTemplate[]): Promise<void> {
  try {
    const notes = notesOverride || (await loadNotes());
    const templates = templatesOverride || (await loadTemplates());
    const result = await syncNotesWithFirebase(notes, templates);
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(normalizeNotes(result.serverNotes).slice(0, 3000)));
    await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(result.serverTemplates.slice(0, 300)));
  } catch {
    // keep local flow responsive when offline or unauthenticated
  }
}

function isDuplicateText(notes: NoteItem[], value: string) {
  const normalized = normalizeText(value).toLowerCase();
  return notes.some((item) => item.kind === 'text' && normalizeText(item.text).toLowerCase() === normalized);
}

function isDuplicateImage(notes: NoteItem[], base64: string) {
  return notes.some((item) => item.kind === 'image' && item.imageBase64 === base64);
}

export async function addNoteUnique(
  text: string,
  category: NoteCategory = 'general',
): Promise<{ notes: NoteItem[]; inserted: boolean }> {
  const trimmed = text.trim();
  if (!trimmed) return { notes: await loadNotes(), inserted: false };
  const current = await loadNotes();
  if (isDuplicateText(current, trimmed)) {
    return { notes: current, inserted: false };
  }
  const now = Date.now();
  const next: NoteItem[] = [
    {
      id: makeId('note'),
      kind: 'text',
      category,
      text: trimmed,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    ...current,
  ];
  await saveNotes(next);
  await syncNotesStateIfAuthenticated(normalizeNotes(next));
  return { notes: normalizeNotes(next), inserted: true };
}

export async function addRichNoteUnique(
  text: string,
  category: NoteCategory = 'general',
  attachments: string[] = [],
): Promise<{ notes: NoteItem[]; inserted: boolean }> {
  const trimmed = text.trim();
  const normalizedAttachments = attachments.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8);
  if (!trimmed && normalizedAttachments.length === 0) return { notes: await loadNotes(), inserted: false };

  const current = await loadNotes();
  if (trimmed && isDuplicateText(current, trimmed)) {
    return { notes: current, inserted: false };
  }

  const now = Date.now();
  const next: NoteItem[] = [
    {
      id: makeId('note'),
      kind: 'text',
      category,
      text: trimmed || 'Attachment note',
      attachments: normalizedAttachments.length ? normalizedAttachments : undefined,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    ...current,
  ];

  await saveNotes(next);
  await syncNotesStateIfAuthenticated(normalizeNotes(next));
  return { notes: normalizeNotes(next), inserted: true };
}

export async function addImageNoteUnique(dataUri: string, title = 'Screenshot capture'): Promise<{ notes: NoteItem[]; inserted: boolean }> {
  const value = String(dataUri || '').trim();
  if (!value.startsWith('data:image/')) {
    return { notes: await loadNotes(), inserted: false };
  }
  const split = value.split(',');
  if (split.length < 2) {
    return { notes: await loadNotes(), inserted: false };
  }
  const meta = split[0];
  const base64 = split.slice(1).join(',');
  const mimeType = meta.replace('data:', '').replace(';base64', '');
  const current = await loadNotes();
  if (isDuplicateImage(current, base64)) {
    return { notes: current, inserted: false };
  }
  const now = Date.now();
  const next: NoteItem[] = [
    {
      id: makeId('img'),
      kind: 'image',
      category: 'general',
      text: title,
      imageBase64: base64,
      imageMimeType: mimeType,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    ...current,
  ];
  await saveNotes(next);
  await syncNotesStateIfAuthenticated(normalizeNotes(next));
  return { notes: normalizeNotes(next), inserted: true };
}

export async function removeNote(id: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.filter((item) => item.id !== id);
  await saveNotes(next);
  await syncNotesStateIfAuthenticated(normalizeNotes(next));
  return normalizeNotes(next);
}

export async function updateNoteText(id: string, text: string): Promise<NoteItem[]> {
  const nextText = text.trim();
  if (!nextText) return loadNotes();
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, text: nextText, updatedAt: Date.now() } : item,
  );
  await saveNotes(next);
  await syncNotesStateIfAuthenticated(normalizeNotes(next));
  return normalizeNotes(next);
}

export async function togglePinned(id: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, pinned: !item.pinned, updatedAt: Date.now() } : item,
  );
  await saveNotes(next);
  await syncNotesStateIfAuthenticated(normalizeNotes(next));
  return normalizeNotes(next);
}

export async function clearNotes(): Promise<void> {
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify([]));
  // Mark as initialized to avoid demo reseeding after user clears everything.
  await AsyncStorage.setItem(NOTES_SEEDED_KEY, '1');
  await syncNotesStateIfAuthenticated([], undefined);
}

export async function loadTemplates(): Promise<NoteTemplate[]> {
  const raw = await AsyncStorage.getItem(TEMPLATES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): NoteTemplate => ({
        id: String(item?.id || makeId('tpl')),
        name: String(item?.name || '').trim(),
        kind: item?.kind === 'appointment' ? 'appointment' : 'email',
        subject: String(item?.subject || '').trim(),
        body: String(item?.body || ''),
        location: item?.location ? String(item.location) : '',
        durationMinutes: Number(item?.durationMinutes || 30),
        createdAt: Number(item?.createdAt || Date.now()),
        updatedAt: Number(item?.updatedAt || Date.now()),
      }))
      .filter((item) => item.name.length > 0);
  } catch {
    return [];
  }
}

export async function saveTemplates(items: NoteTemplate[]): Promise<void> {
  await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(items.slice(0, 300)));
  await syncNotesStateIfAuthenticated(undefined, items.slice(0, 300));
}

export async function addTemplate(template: Omit<NoteTemplate, 'id' | 'createdAt' | 'updatedAt'>): Promise<NoteTemplate[]> {
  const current = await loadTemplates();
  const now = Date.now();
  const next: NoteTemplate[] = [
    {
      ...template,
      id: makeId('tpl'),
      createdAt: now,
      updatedAt: now,
    },
    ...current,
  ];
  await saveTemplates(next);
  await syncNotesStateIfAuthenticated(undefined, next);
  return next;
}

export async function ensureWorkNotesAndEmailTemplates(): Promise<{
  notes: NoteItem[];
  templates: NoteTemplate[];
}> {
  let notes = await loadNotes();
  let templates = await loadTemplates();
  const seeded = (await AsyncStorage.getItem(NOTES_SEEDED_KEY)) === '1';

  const hasWorkNotes = notes.some((item) => item.category === 'work');
  if (!seeded && !hasWorkNotes && notes.length === 0) {
    const now = Date.now();
    const examples: NoteItem[] = [
      {
        id: makeId('note'),
        kind: 'text',
        category: 'work',
        text: 'Work Notes: User badge replaced. Old badge disabled in access control.',
        pinned: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: makeId('note'),
        kind: 'text',
        category: 'work',
        text: 'Work Notes: Laptop PI checked, BitLocker active, ticket moved to done.',
        pinned: false,
        createdAt: now + 1,
        updatedAt: now + 1,
      },
      {
        id: makeId('note'),
        kind: 'text',
        category: 'work',
        text: 'Work Notes: Pending approval from manager for software install.',
        pinned: false,
        createdAt: now + 2,
        updatedAt: now + 2,
      },
    ];
    notes = normalizeNotes([...examples, ...notes]);
    await saveNotes(notes);
    await AsyncStorage.setItem(NOTES_SEEDED_KEY, '1');
    await syncNotesStateIfAuthenticated(notes, templates);
  }

  const hasEmailTemplates = templates.some((item) => item.kind === 'email');
  if (!hasEmailTemplates) {
    const now = Date.now();
    const emailTemplates: NoteTemplate[] = [
      {
        id: makeId('tpl'),
        name: 'Ticket Update',
        kind: 'email',
        subject: 'Update on your IT ticket',
        body: 'Hello,\n\nYour request was processed on {{date}} at {{time}}.\n\nStatus: In progress.\nReference: {{clipboard}}\n\nRegards,\nIT Support',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: makeId('tpl'),
        name: 'Badge Delivered',
        kind: 'email',
        subject: 'Your access badge is ready',
        body: 'Hello,\n\nYour new badge is ready for pickup.\nPlease bring your ID card.\n\nRegards,\nIT Support',
        createdAt: now + 1,
        updatedAt: now + 1,
      },
      {
        id: makeId('tpl'),
        name: 'Closure Confirmation',
        kind: 'email',
        subject: 'Ticket closure confirmation',
        body: 'Hello,\n\nWe are closing your ticket based on successful validation.\nIf you still need help, reply to this email.\n\nRegards,\nIT Support',
        createdAt: now + 2,
        updatedAt: now + 2,
      },
    ];
    templates = [...emailTemplates, ...templates];
    await saveTemplates(templates);
    await syncNotesStateIfAuthenticated(notes, templates);
  }

  return { notes, templates };
}

export async function removeTemplate(id: string): Promise<NoteTemplate[]> {
  const current = await loadTemplates();
  const next = current.filter((item) => item.id !== id);
  await saveTemplates(next);
  await syncNotesStateIfAuthenticated(undefined, next);
  return next;
}

export async function refreshNotesFromCloudSilently(): Promise<{ notes: NoteItem[]; templates: NoteTemplate[] } | null> {
  try {
    const result = await fetchNotesFromFirebase();
    const notes = normalizeNotes(result.serverNotes).slice(0, 3000);
    const templates = result.serverTemplates.slice(0, 300);
    await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    return { notes, templates };
  } catch {
    return null;
  }
}

function toIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function buildAppointmentIcs(
  title: string,
  description: string,
  location: string,
  startAt: Date,
  durationMinutes = 30,
): string {
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
  const uid = `${Date.now()}@barra.local`;
  const esc = (value: string) =>
    String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Oryxen//Templates//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    `DTSTART:${toIcsDate(startAt)}`,
    `DTEND:${toIcsDate(endAt)}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(description)}`,
    `LOCATION:${esc(location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
