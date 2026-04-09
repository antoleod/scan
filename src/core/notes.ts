import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearNotesInFirebase,
  clearTemplatesInFirebase,
  deleteNoteFromFirebase,
  deleteSharedGroupNote,
  deleteTemplateFromFirebase,
  fetchNotesFromFirebase,
  fetchSharedGroupNotesForCurrentUser,
  upsertNoteInFirebase,
  upsertTemplateInFirebase,
  upsertSharedGroupNote,
} from './firebase';
import { diag } from './diagnostics';

const NOTES_KEY = '@barra_notes_v1';
const TEMPLATES_KEY = '@barra_note_templates_v1';
const NOTES_SEEDED_KEY = '@barra_notes_seeded_v1';
const TEMPLATES_PURGED_KEY = '@barra_templates_purged_v1';

export type NoteKind = 'text' | 'image';
export type NoteCategory = 'general' | 'work';
export type NoteVersion = {
  id: string;
  title?: string;
  text: string;
  createdAt: number;
};

export interface NoteItem {
  id: string;
  kind: NoteKind;
  category: NoteCategory;
  title?: string;
  text: string;
  groupId?: string;
  color?: 'default' | 'amber' | 'mint' | 'sky' | 'rose';
  archived?: boolean;
  imageBase64?: string;
  imageMimeType?: string;
  attachments?: string[];
  versions?: NoteVersion[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export type TemplateKind = 'email' | 'appointment';

export interface NoteTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  to?: string;
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
    if (Boolean(a.archived) !== Boolean(b.archived)) return a.archived ? 1 : -1;
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
          title: typeof item?.title === 'string' && item.title.trim() ? item.title.trim() : undefined,
          text: String(item?.text || ''),
          groupId: typeof item?.groupId === 'string' ? item.groupId : undefined,
          color: (['default', 'amber', 'mint', 'sky', 'rose'].includes(String(item?.color || '')) ? item.color : 'default') as NoteItem['color'],
          archived: Boolean(item?.archived),
          imageBase64: typeof item?.imageBase64 === 'string' ? item.imageBase64 : undefined,
          imageMimeType: typeof item?.imageMimeType === 'string' ? item.imageMimeType : undefined,
          attachments: Array.isArray(item?.attachments) ? item.attachments.map((v: unknown) => String(v || '')).filter(Boolean).slice(0, 8) : undefined,
          versions: Array.isArray(item?.versions)
            ? item.versions.map((version: unknown) => ({
              id: String((version as { id?: unknown })?.id || makeId('ver')),
              title: typeof (version as { title?: unknown })?.title === 'string' ? String((version as { title?: unknown }).title) : undefined,
              text: String((version as { text?: unknown })?.text || ''),
              createdAt: Number((version as { createdAt?: unknown })?.createdAt || Date.now()),
            })).filter((version: { text: string }) => version.text.trim().length > 0)
            : undefined,
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

async function pushNoteIfAuthenticated(note: NoteItem): Promise<void> {
  try {
    await upsertNoteInFirebase(note);
  } catch (error) {
    await diag.warn('notes.push.note.error', { message: String(error), noteId: note.id });
  }
}

async function pushTemplateIfAuthenticated(template: NoteTemplate): Promise<void> {
  try {
    await upsertTemplateInFirebase(template);
  } catch (error) {
    await diag.warn('notes.push.template.error', { message: String(error), templateId: template.id });
  }
}

function isDuplicateText(notes: NoteItem[], value: string) {
  const normalized = normalizeText(value).toLowerCase();
  return notes.some((item) => item.kind === 'text' && normalizeText(item.text).toLowerCase() === normalized);
}

function normalizeAttachmentList(attachments: string[]) {
  return attachments.map((v) => String(v || '').trim()).filter(Boolean).sort();
}

function sameAttachments(a: string[] = [], b: string[] = []) {
  const aa = normalizeAttachmentList(a);
  const bb = normalizeAttachmentList(b);
  if (aa.length !== bb.length) return false;
  for (let i = 0; i < aa.length; i += 1) {
    if (aa[i] !== bb[i]) return false;
  }
  return true;
}

function isDuplicateImage(notes: NoteItem[], base64: string) {
  return notes.some((item) => item.kind === 'image' && item.imageBase64 === base64);
}

function sameNoteContent(a: NoteItem, b: NoteItem) {
  if (a.kind !== b.kind) return false;
  if (normalizeText(a.text).toLowerCase() !== normalizeText(b.text).toLowerCase()) return false;
  if ((a.imageBase64 || '') !== (b.imageBase64 || '')) return false;
  if ((a.imageMimeType || '') !== (b.imageMimeType || '')) return false;
  if (!sameAttachments(a.attachments || [], b.attachments || [])) return false;
  return true;
}

function hasDuplicateNote(notes: NoteItem[], candidate: NoteItem, excludeId?: string) {
  return notes.some((item) => item.id !== excludeId && sameNoteContent(item, candidate));
}

function pushVersion(item: NoteItem): NoteItem {
  const version = {
    id: makeId('ver'),
    title: item.title,
    text: item.text,
    createdAt: item.updatedAt,
  };
  return {
    ...item,
    versions: [version, ...(item.versions || [])].slice(0, 12),
  };
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
  await pushNoteIfAuthenticated(next[0]);
  return { notes: normalizeNotes(next), inserted: true };
}

export async function addRichNoteUnique(
  text: string,
  category: NoteCategory = 'general',
  attachments: string[] = [],
  groupId?: string,
): Promise<{ notes: NoteItem[]; inserted: boolean }> {
  const trimmed = text.trim();
  const normalizedAttachments = attachments.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8);
  if (!trimmed && normalizedAttachments.length === 0) return { notes: await loadNotes(), inserted: false };

  const current = await loadNotes();
  const candidate: NoteItem = {
    id: 'candidate',
    kind: 'text',
    category,
    text: trimmed || 'Attachment note',
    groupId: groupId?.trim() || undefined,
    color: 'default',
    archived: false,
    attachments: normalizedAttachments.length ? normalizedAttachments : undefined,
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (hasDuplicateNote(current, candidate)) {
    return { notes: current, inserted: false };
  }

  const now = Date.now();
  const next: NoteItem[] = [
    { ...candidate, id: makeId('note'), createdAt: now, updatedAt: now },
    ...current,
  ];

  await saveNotes(next);
  await pushNoteIfAuthenticated(next[0]);
  if (groupId?.trim()) {
    await upsertSharedGroupNote(groupId.trim(), next[0]);
  }
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
      color: 'default',
      archived: false,
      imageBase64: base64,
      imageMimeType: mimeType,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    },
    ...current,
  ];
  await saveNotes(next);
  await pushNoteIfAuthenticated(next[0]);
  return { notes: normalizeNotes(next), inserted: true };
}

export async function removeNote(id: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const existing = current.find((item) => item.id === id);
  const next = current.filter((item) => item.id !== id);
  const normalized = normalizeNotes(next);
  await saveNotes(normalized);
  try {
    if (existing?.groupId) {
      await deleteSharedGroupNote(existing.groupId, id);
    } else {
      await deleteNoteFromFirebase(id);
    }
  } catch (error) {
    await diag.warn('notes.delete.remote.error', { message: String(error), noteId: id });
  }
  return normalized;
}

export async function updateNoteText(id: string, text: string): Promise<NoteItem[]> {
  const nextText = text.trim();
  if (!nextText) return loadNotes();
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, text: nextText, updatedAt: Date.now() } : item,
  );
  const updatedItem = next.find((item) => item.id === id);
  if (updatedItem && hasDuplicateNote(current, updatedItem, id)) {
    return normalizeNotes(current);
  }
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) await pushNoteIfAuthenticated(updated);
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

export async function createBranchFromNoteVersion(noteId: string, versionId?: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const source = current.find((item) => item.id === noteId);
  if (!source) return current;
  const version = versionId ? source.versions?.find((item) => item.id === versionId) : source.versions?.[0];
  if (!version) return current;
  const now = Date.now();
  const branch: NoteItem = {
    ...source,
    id: makeId('note'),
    title: version.title,
    text: version.text,
    versions: [],
    createdAt: now,
    updatedAt: now,
  };
  const next = [branch, ...current];
  await saveNotes(next);
  await pushNoteIfAuthenticated(branch);
  return normalizeNotes(next);
}

export async function mergeNoteVersion(noteId: string, versionId: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) => {
    if (item.id !== noteId) return item;
    const version = item.versions?.find((entry) => entry.id === versionId);
    if (!version) return item;
    return { ...pushVersion(item), title: version.title, text: version.text, updatedAt: Date.now() };
  });
  await saveNotes(next);
  const updated = next.find((item) => item.id === noteId);
  if (updated) await pushNoteIfAuthenticated(updated);
  if (updated?.groupId) await upsertSharedGroupNote(updated.groupId, updated);
  return normalizeNotes(next);
}

export async function togglePinned(id: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, pinned: !item.pinned, updatedAt: Date.now() } : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) await pushNoteIfAuthenticated(updated);
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

export async function setNoteColor(id: string, color: NoteItem['color'] = 'default'): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, color, updatedAt: Date.now() } : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) await pushNoteIfAuthenticated(updated);
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

export async function updateNoteTitle(id: string, title: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, title: title.trim() || undefined, updatedAt: Date.now() } : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) await pushNoteIfAuthenticated(updated);
  if (updated?.groupId) await upsertSharedGroupNote(updated.groupId, updated);
  return normalizeNotes(next);
}

export async function toggleArchived(id: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, archived: !item.archived, updatedAt: Date.now() } : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) await pushNoteIfAuthenticated(updated);
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

export async function clearNotes(): Promise<void> {
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify([]));
  // Mark as initialized to avoid demo reseeding after user clears everything.
  await AsyncStorage.setItem(NOTES_SEEDED_KEY, '1');
  try {
    await clearNotesInFirebase();
  } catch (error) {
    await diag.warn('notes.clear.remote.error', { message: String(error) });
  }
}

export async function hardDeleteAllNotes(): Promise<void> {
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify([]));
  await AsyncStorage.setItem(NOTES_SEEDED_KEY, '1');
  try {
    await clearNotesInFirebase();
  } catch {
    // local cache already cleared
  }
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
        to: String(item?.to || '').trim(),
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
  await pushTemplateIfAuthenticated(next[0]);
  return next;
}

export async function updateTemplate(
  id: string,
  patch: Partial<Pick<NoteTemplate, 'name' | 'to' | 'subject' | 'body' | 'location' | 'durationMinutes' | 'kind'>>,
): Promise<NoteTemplate[]> {
  const current = await loadTemplates();
  const next = current.map((item) =>
    item.id === id
      ? {
        ...item,
        ...patch,
        name: typeof patch.name === 'string' ? patch.name : item.name,
        to: typeof patch.to === 'string' ? patch.to : item.to,
        subject: typeof patch.subject === 'string' ? patch.subject : item.subject,
        body: typeof patch.body === 'string' ? patch.body : item.body,
        updatedAt: Date.now(),
      }
      : item,
  );
  await saveTemplates(next);
  const updated = next.find((item) => item.id === id);
  if (updated) await pushTemplateIfAuthenticated(updated);
  return next;
}

export async function ensureWorkNotesAndEmailTemplates(): Promise<{
  notes: NoteItem[];
  templates: NoteTemplate[];
}> {
  let notes = await loadNotes();
  let templates = await loadTemplates();
  const seeded = (await AsyncStorage.getItem(NOTES_SEEDED_KEY)) === '1';
  const templatesPurged = (await AsyncStorage.getItem(TEMPLATES_PURGED_KEY)) === '1';

  // One-shot purge requested: remove all existing templates locally/cloud and do not auto-seed again.
  if (!templatesPurged) {
    templates = [];
    await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify([]));
    await AsyncStorage.setItem(TEMPLATES_PURGED_KEY, '1');
    try {
      await clearTemplatesInFirebase();
    } catch (error) {
      await diag.warn('templates.purge.remote.error', { message: String(error) });
    }
  }

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
    for (const note of examples) {
      await pushNoteIfAuthenticated(note);
    }
  }

  return { notes, templates };
}

export async function removeTemplate(id: string): Promise<NoteTemplate[]> {
  const current = await loadTemplates();
  const next = current.filter((item) => item.id !== id);
  await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify(next.slice(0, 300)));
  try {
    await deleteTemplateFromFirebase(id);
  } catch (error) {
    await diag.warn('templates.delete.remote.error', { message: String(error), templateId: id });
  }
  return next;
}

export async function hardDeleteAllTemplates(): Promise<void> {
  await AsyncStorage.setItem(TEMPLATES_KEY, JSON.stringify([]));
  try {
    await clearTemplatesInFirebase();
  } catch {
    // local cache already cleared
  }
}

export async function refreshNotesFromCloudSilently(): Promise<{ notes: NoteItem[]; templates: NoteTemplate[] } | null> {
  try {
    const result = await fetchNotesFromFirebase();
    const sharedNotes = await fetchSharedGroupNotesForCurrentUser();
    const notes = normalizeNotes([...result.serverNotes, ...sharedNotes]).slice(0, 3000);
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
