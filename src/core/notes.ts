import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearNotesInFirebase,
  clearTemplatesInFirebase,
  deleteNoteFromFirebase,
  deleteSharedGroupNote,
  deleteTemplateFromFirebase,
  upsertNoteInFirebase,
  upsertTemplateInFirebase,
  upsertSharedGroupNote,
} from './firebase';
import { diag } from './diagnostics';
import { clearDeletedNoteKeys, loadDeletedNoteKeys, markDeletedNoteKey, noteStorageKey } from './noteDeletions';
import { enqueueOperation } from './offlineQueue';
import type { SmartWorkflowType } from './smartNoteWorkflows';

const NOTES_KEY = '@barra_notes_v1';
const TEMPLATES_KEY = '@barra_note_templates_v1';
const TEMPLATES_PURGED_KEY = '@barra_templates_purged_v1';

export type NoteKind = 'text' | 'image';
export type NoteCategory = 'general' | 'work' | 'health' | 'shopping';
export type { SmartWorkflowType } from './smartNoteWorkflows';

// Simple version format for backward compatibility with existing notes
export type SimpleNoteVersion = {
  id: string;
  title?: string;
  text: string;
  createdAt: number;
};

export type WorkflowStatus = 'draft' | 'active' | 'snoozed' | 'completed' | 'dismissed';

export type MedicationCycleStatus = 'active' | 'snoozed' | 'dismissed';

export interface MedicationCycleEntry {
  name: string;
  dose?: string;                       // user-entered dose label (e.g. "500 mg") — never auto-mutated
  doseCount?: number;
  takenAt?: number;                    // ms epoch — most recent dose
  lastTakenAt?: number;                // ms epoch — alias of takenAt for explicitness
  nextSuggestedAt?: number;            // ms epoch — when to remind again
  snoozedUntil?: number;               // ms epoch — when a snooze ends (== nextSuggestedAt while snoozed)
  lastActionAt?: number;               // ms epoch — last user interaction (taken/snooze/dismiss)
  recommendedIntervalHours?: number;
  minimumIntervalHours?: number;
  followPrescription?: boolean;
  status?: MedicationCycleStatus;      // per-med lifecycle (default: 'active')
  safetyNote?: string;
}

export interface WorkflowMetadata {
  medicationName?: string;
  doseText?: string;
  takenAt?: number;
  takenAtText?: string;
  reason?: string;
  symptomLevel?: number;
  followUpAt?: number;
  followUpLabel?: string;
  medications?: MedicationCycleEntry[];
  checklistItems?: {
    id: string;
    text: string;
    completed: boolean;
    quantity?: string;
    unit?: string;
    rawText?: string;
  }[];
  extractedFromText?: boolean;
}

export interface NoteItem {
  id: string;
  kind: NoteKind;
  category: NoteCategory;
  title?: string;
  text: string;
  groupId?: string;
  color?: 'default' | 'amber' | 'mint' | 'sky' | 'rose';
  archived?: boolean;
  draft?: boolean;
  imageBase64?: string;
  imageMimeType?: string;
  attachments?: string[];
  versions?: SimpleNoteVersion[];
  currentVersionNumber?: number;
  lastVersionAt?: string;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  smartType?: SmartWorkflowType;
  workflowStatus?: WorkflowStatus;
  workflowMetadata?: WorkflowMetadata;
  syncStatus?: 'pending' | 'retrying' | 'failed' | 'offline' | 'synced';
  isSecret?: boolean;
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

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function normalizeText(value: unknown) {
  return safeText(value).trim().replace(/\s+/g, ' ');
}

function normalizeNotes(items: NoteItem[]): NoteItem[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.deletedAt) !== Boolean(b.deletedAt)) return a.deletedAt ? 1 : -1;
    if (Boolean(a.archived) !== Boolean(b.archived)) return a.archived ? 1 : -1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
}

export async function loadNotes(): Promise<NoteItem[]> {
  const raw = await AsyncStorage.getItem(NOTES_KEY);
  if (!raw) return [];
  try {
    const deletedKeys = await loadDeletedNoteKeys();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeNotes(
      parsed
        .map((item): NoteItem => ({
          id: String(item?.id || makeId('note')),
          kind: item?.kind === 'image' ? 'image' : 'text',
          category: (['general', 'work', 'health', 'shopping'].includes(safeText(item?.category)) ? item.category : 'general') as NoteCategory,
          title: normalizeText(item?.title) ? normalizeText(item?.title) : undefined,
          text: safeText(item?.text),
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
            })).filter((version: { text: string }) => safeText(version.text).trim().length > 0)
            : undefined,
          pinned: Boolean(item?.pinned),
          createdAt: Number(item?.createdAt || Date.now()),
          updatedAt: Number(item?.updatedAt || Date.now()),
          deletedAt: typeof item?.deletedAt === 'number' ? Number(item.deletedAt) : undefined,
          smartType: (['none', 'medication', 'shopping', 'reminder', 'task'].includes(String(item?.smartType || 'none')) ? item.smartType : 'none') as SmartWorkflowType,
          workflowStatus: (['draft', 'active', 'snoozed', 'completed', 'dismissed'].includes(String(item?.workflowStatus || '')) ? item.workflowStatus : undefined) as WorkflowStatus | undefined,
          workflowMetadata: typeof item?.workflowMetadata === 'object' ? item.workflowMetadata : undefined,
          syncStatus: (
            item?.syncStatus === 'pending' ||
            item?.syncStatus === 'retrying' ||
            item?.syncStatus === 'failed' ||
            item?.syncStatus === 'offline' ||
            item?.syncStatus === 'synced'
          ) ? item.syncStatus : undefined,
        }))
        .filter((item) => {
          const key = noteStorageKey(item.id, item.groupId ? 'group' : 'personal', item.groupId);
          return (safeText(item.text).trim().length > 0 || (item.kind === 'image' && item.imageBase64)) && !item.deletedAt && !deletedKeys.has(key);
        }),
    );
  } catch {
    return [];
  }
}

export async function saveNotes(items: NoteItem[]): Promise<void> {
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify(normalizeNotes(items).slice(0, 3000)));
}

async function pushNoteIfAuthenticated(note: NoteItem): Promise<boolean> {
  try {
    await upsertNoteInFirebase(note);
    return true;
  } catch (error) {
    await diag.warn('notes.push.note.error', { message: String(error), noteId: note.id });
    await enqueueOperation('upsertNote', note).catch(() => undefined);
    return false;
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
  const trimmed = safeText(text).trim();
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
      syncStatus: 'pending',
    },
    ...current,
  ];
  await saveNotes(next);
  const synced = await pushNoteIfAuthenticated(next[0]);
  next[0] = { ...next[0], syncStatus: synced ? 'synced' : 'pending' };
  await saveNotes(next);
  return { notes: normalizeNotes(next), inserted: true };
}

export async function addRichNoteUnique(
  text: string,
  category: NoteCategory = 'general',
  attachments: string[] = [],
  groupId?: string,
  draft?: boolean,
  autoDetectSmartType: boolean = true,
): Promise<{ notes: NoteItem[]; inserted: boolean }> {
  const textStr = text && typeof text === 'string' ? text : '';
  const trimmed = textStr.trim();
  const normalizedAttachments = attachments.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8);
  if (!trimmed && normalizedAttachments.length === 0) return { notes: await loadNotes(), inserted: false };

  const current = await loadNotes();

  // Auto-detect smart type from content
  let smartType: SmartWorkflowType | undefined;
  if (autoDetectSmartType && trimmed) {
    try {
      const { detectSmartTypeFromContent } = require('../core/smartNoteWorkflows');
      smartType = detectSmartTypeFromContent(trimmed);
      if (smartType === 'none') smartType = undefined;
    } catch {
      // Silently fail detection, continue without smartType
    }
  }

  const candidate: NoteItem = {
    id: 'candidate',
    kind: 'text',
    category,
    text: trimmed || 'Attachment note',
    groupId: safeText(groupId).trim() || undefined,
    color: 'default',
    archived: false,
    attachments: normalizedAttachments.length ? normalizedAttachments : undefined,
    pinned: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    smartType,
  };
  if (hasDuplicateNote(current, candidate)) {
    return { notes: current, inserted: false };
  }

  const now = Date.now();
  const next: NoteItem[] = [
    { ...candidate, id: makeId('note'), createdAt: now, updatedAt: now, draft: draft ?? false },
    ...current,
  ];

  await saveNotes(next);
  const synced = await pushNoteIfAuthenticated(next[0]);
  next[0] = { ...next[0], syncStatus: synced ? 'synced' : 'pending' };
  await saveNotes(next);
  if (safeText(groupId).trim()) {
    await upsertSharedGroupNote(safeText(groupId).trim(), next[0]).catch((error) => diag.warn('notes.push.shared.error', { message: String(error), noteId: next[0].id }));
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
  const synced = await pushNoteIfAuthenticated(next[0]);
  next[0] = { ...next[0], syncStatus: synced ? 'synced' : 'pending' };
  await saveNotes(next);
  return { notes: normalizeNotes(next), inserted: true };
}

export async function removeNote(id: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const existing = current.find((item) => item.id === id);
  const next = current.filter((item) => item.id !== id);
  const normalized = normalizeNotes(next);
  await markDeletedNoteKey(noteStorageKey(id, existing?.groupId ? 'group' : 'personal', existing?.groupId));
  await saveNotes(normalized);
  try {
    await deleteNoteFromFirebase(id);
    if (existing?.groupId) {
      await deleteSharedGroupNote(existing.groupId, id);
    }
  } catch (error) {
    await diag.warn('notes.delete.remote.error', { message: String(error), noteId: id });
  }
  return normalized;
}

export async function updateNoteText(id: string, text: string): Promise<NoteItem[]> {
  const nextText = safeText(text).trim();
  if (!nextText) return loadNotes();
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, text: nextText, updatedAt: Date.now(), syncStatus: 'pending' as const } : item,
  );
  const updatedItem = next.find((item) => item.id === id);
  if (updatedItem && hasDuplicateNote(current, updatedItem, id)) {
    return normalizeNotes(current);
  }
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) {
    const synced = await pushNoteIfAuthenticated(updated);
    if (synced) {
      const syncedNext = next.map((item) => item.id === id ? { ...item, syncStatus: 'synced' as const } : item);
      await saveNotes(syncedNext);
      return normalizeNotes(syncedNext);
    }
  }
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated).catch((error) => diag.warn('notes.push.shared.error', { message: String(error), noteId: id }));
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
    item.id === id ? { ...item, pinned: !item.pinned, updatedAt: Date.now(), syncStatus: 'pending' as const } : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) {
    const synced = await pushNoteIfAuthenticated(updated);
    if (synced) {
      const syncedNext = next.map((item) => item.id === id ? { ...item, syncStatus: 'synced' as const } : item);
      await saveNotes(syncedNext);
      return normalizeNotes(syncedNext);
    }
  }
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

export async function setNoteColor(id: string, color: NoteItem['color'] = 'default'): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, color, updatedAt: Date.now(), syncStatus: 'pending' as const } : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) {
    const synced = await pushNoteIfAuthenticated(updated);
    if (synced) {
      const syncedNext = next.map((item) => item.id === id ? { ...item, syncStatus: 'synced' as const } : item);
      await saveNotes(syncedNext);
      return normalizeNotes(syncedNext);
    }
  }
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

export async function updateNoteTitle(id: string, title: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, title: normalizeText(title) || undefined, updatedAt: Date.now(), syncStatus: 'pending' as const } : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) {
    const synced = await pushNoteIfAuthenticated(updated);
    if (synced) {
      const syncedNext = next.map((item) => item.id === id ? { ...item, syncStatus: 'synced' as const } : item);
      await saveNotes(syncedNext);
      if (updated.groupId) await upsertSharedGroupNote(updated.groupId, { ...updated, syncStatus: 'synced' });
      return normalizeNotes(syncedNext);
    }
  }
  if (updated?.groupId) await upsertSharedGroupNote(updated.groupId, updated);
  return normalizeNotes(next);
}

export async function toggleArchived(id: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, archived: !item.archived, updatedAt: Date.now(), syncStatus: 'pending' as const } : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) {
    const synced = await pushNoteIfAuthenticated(updated);
    if (synced) {
      const syncedNext = next.map((item) => item.id === id ? { ...item, syncStatus: 'synced' as const } : item);
      await saveNotes(syncedNext);
      return normalizeNotes(syncedNext);
    }
  }
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

export async function setNoteSecret(id: string, isSecret: boolean): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, isSecret, updatedAt: Date.now(), syncStatus: 'pending' as const } : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) {
    const synced = await pushNoteIfAuthenticated(updated);
    if (synced) {
      const syncedNext = next.map((item) => item.id === id ? { ...item, syncStatus: 'synced' as const } : item);
      await saveNotes(syncedNext);
      return normalizeNotes(syncedNext);
    }
  }
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

export async function clearDraftFlag(id: string): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id ? { ...item, draft: false, updatedAt: Date.now(), syncStatus: 'pending' as const } : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) {
    const synced = await pushNoteIfAuthenticated(updated);
    if (synced) {
      const syncedNext = next.map((item) => item.id === id ? { ...item, syncStatus: 'synced' as const } : item);
      await saveNotes(syncedNext);
      return normalizeNotes(syncedNext);
    }
  }
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

export async function updateWorkflowStatus(
  id: string,
  status: WorkflowStatus,
): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id
      ? { ...item, workflowStatus: status, updatedAt: Date.now(), syncStatus: 'pending' as const }
      : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) {
    const synced = await pushNoteIfAuthenticated(updated);
    if (synced) {
      const syncedNext = next.map((item) => item.id === id ? { ...item, syncStatus: 'synced' as const } : item);
      await saveNotes(syncedNext);
      return normalizeNotes(syncedNext);
    }
  }
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

function deriveNoteStatusFromMeds(meds: MedicationCycleEntry[]): WorkflowStatus {
  if (!meds.length) return 'active';
  const statuses = meds.map((m) => (m.status || 'active'));
  if (statuses.includes('active')) return 'active';
  if (statuses.every((s) => s === 'dismissed')) return 'dismissed';
  return 'snoozed';
}

function syncMetadataFromMeds(metadata: WorkflowMetadata, meds: MedicationCycleEntry[]): WorkflowMetadata {
  const now = Date.now();
  // Focus = nearest active or snoozed med; fallback to first med
  const candidates = meds.filter((m) => (m.status || 'active') !== 'dismissed');
  const sorted = candidates
    .filter((m) => typeof m.nextSuggestedAt === 'number')
    .sort((a, b) => (a.nextSuggestedAt as number) - (b.nextSuggestedAt as number));
  const future = sorted.find((m) => (m.nextSuggestedAt as number) >= now - 60_000);
  const focus = future || sorted[0] || candidates[0] || meds[0];
  if (!focus) return { ...metadata, medications: meds };
  return {
    ...metadata,
    medications: meds,
    medicationName: focus.name || metadata.medicationName,
    doseText: focus.dose || metadata.doseText,
    followUpAt: typeof focus.nextSuggestedAt === 'number' ? focus.nextSuggestedAt : metadata.followUpAt,
    takenAt: typeof focus.takenAt === 'number' ? focus.takenAt : metadata.takenAt,
  };
}

async function persistNoteMutation(
  id: string,
  mutate: (item: NoteItem) => NoteItem | null,
): Promise<NoteItem[]> {
  const current = await loadNotes();
  let mutated: NoteItem | null = null;
  const next = current.map((item) => {
    if (item.id !== id) return item;
    const updated = mutate(item);
    if (!updated) return item;
    mutated = updated;
    return updated;
  });
  const finalItem = mutated as NoteItem | null;
  if (!finalItem) return normalizeNotes(current);
  await saveNotes(next);
  const synced = await pushNoteIfAuthenticated(finalItem);
  if (synced) {
    const syncedNext = next.map((item) =>
      item.id === id ? { ...item, syncStatus: 'synced' as const } : item,
    );
    await saveNotes(syncedNext);
    return normalizeNotes(syncedNext);
  }
  if (finalItem.groupId) {
    await upsertSharedGroupNote(finalItem.groupId, finalItem).catch(() => undefined);
  }
  return normalizeNotes(next);
}

function clampMedIndex(meds: MedicationCycleEntry[], index: number): number {
  if (!Array.isArray(meds) || meds.length === 0) return 0;
  if (!Number.isFinite(index) || index < 0) return 0;
  if (index >= meds.length) return meds.length - 1;
  return index;
}

function ensureMedicationsList(metadata?: WorkflowMetadata): MedicationCycleEntry[] {
  const raw = Array.isArray(metadata?.medications) ? metadata!.medications! : [];
  if (raw.length > 0) {
    // Normalize legacy field names (minIntervalHours → minimumIntervalHours).
    return raw.map((entry) => {
      const legacy = entry as MedicationCycleEntry & { minIntervalHours?: number };
      const minimumIntervalHours = typeof entry.minimumIntervalHours === 'number'
        ? entry.minimumIntervalHours
        : (typeof legacy.minIntervalHours === 'number' ? legacy.minIntervalHours : undefined);
      return {
        ...entry,
        minimumIntervalHours,
        lastTakenAt: typeof entry.lastTakenAt === 'number' ? entry.lastTakenAt : entry.takenAt,
      };
    });
  }
  // Backward compat: synthesize a single entry from top-level fields
  const name = safeText(metadata?.medicationName).trim();
  if (!name) return [];
  const takenAt = typeof metadata?.takenAt === 'number' ? metadata!.takenAt : undefined;
  return [{
    name,
    dose: safeText(metadata?.doseText).trim() || undefined,
    takenAt,
    lastTakenAt: takenAt,
    nextSuggestedAt: typeof metadata?.followUpAt === 'number' ? metadata!.followUpAt : undefined,
    status: 'active',
  }];
}

export async function markMedicationTaken(
  id: string,
  medIndex: number = 0,
  takenAt: number = Date.now(),
): Promise<NoteItem[]> {
  return persistNoteMutation(id, (item) => {
    const meds = ensureMedicationsList(item.workflowMetadata);
    if (!meds.length) return null;
    const idx = clampMedIndex(meds, medIndex);
    const entry = meds[idx];
    const interval = Number(entry.recommendedIntervalHours);
    const hasInterval = Number.isFinite(interval) && interval > 0;
    const nextSuggestedAt = hasInterval ? takenAt + interval * 3_600_000 : undefined;
    const now = Date.now();
    // Reset cycle for THIS medication only. Never touch dose.
    const updatedEntry: MedicationCycleEntry = {
      ...entry,
      takenAt,
      lastTakenAt: takenAt,
      nextSuggestedAt,
      snoozedUntil: undefined,
      lastActionAt: now,
      followPrescription: !hasInterval,
      status: 'active',
    };
    const nextMeds = meds.map((m, i) => i === idx ? updatedEntry : m);
    const newMeta = syncMetadataFromMeds(item.workflowMetadata || {}, nextMeds);
    newMeta.takenAtText = new Date(takenAt).toLocaleString();
    return {
      ...item,
      workflowMetadata: newMeta,
      workflowStatus: deriveNoteStatusFromMeds(nextMeds),
      updatedAt: now,
      syncStatus: 'pending' as const,
    };
  });
}

export async function snoozeMedication(
  id: string,
  medIndex: number = 0,
  snoozeMs: number = 10 * 60_000,
): Promise<NoteItem[]> {
  return persistNoteMutation(id, (item) => {
    const meds = ensureMedicationsList(item.workflowMetadata);
    if (!meds.length) return null;
    const idx = clampMedIndex(meds, medIndex);
    const entry = meds[idx];
    const safeSnooze = Math.max(60_000, Number(snoozeMs) || 0);
    const now = Date.now();
    const snoozedUntil = now + safeSnooze;
    // Snooze affects ONLY this medication; takenAt is preserved.
    const updatedEntry: MedicationCycleEntry = {
      ...entry,
      nextSuggestedAt: snoozedUntil,
      snoozedUntil,
      lastActionAt: now,
      status: 'snoozed',
    };
    const nextMeds = meds.map((m, i) => i === idx ? updatedEntry : m);
    const newMeta = syncMetadataFromMeds(item.workflowMetadata || {}, nextMeds);
    return {
      ...item,
      workflowMetadata: newMeta,
      workflowStatus: deriveNoteStatusFromMeds(nextMeds),
      updatedAt: now,
      syncStatus: 'pending' as const,
    };
  });
}

export async function dismissMedication(
  id: string,
  medIndex: number = 0,
): Promise<NoteItem[]> {
  return persistNoteMutation(id, (item) => {
    const meds = ensureMedicationsList(item.workflowMetadata);
    const now = Date.now();
    if (!meds.length) {
      // Legacy note with no medications array — fall back to dismissing whole note.
      return {
        ...item,
        workflowStatus: 'dismissed',
        updatedAt: now,
        syncStatus: 'pending' as const,
      };
    }
    const idx = clampMedIndex(meds, medIndex);
    const entry = meds[idx];
    // Cancel the cycle for THIS medication only. Note is not deleted.
    const updatedEntry: MedicationCycleEntry = {
      ...entry,
      status: 'dismissed',
      nextSuggestedAt: undefined,
      snoozedUntil: undefined,
      lastActionAt: now,
    };
    const nextMeds = meds.map((m, i) => i === idx ? updatedEntry : m);
    const newMeta = syncMetadataFromMeds(item.workflowMetadata || {}, nextMeds);
    return {
      ...item,
      workflowMetadata: newMeta,
      workflowStatus: deriveNoteStatusFromMeds(nextMeds),
      updatedAt: now,
      syncStatus: 'pending' as const,
    };
  });
}

export async function reactivateMedication(
  id: string,
  medIndex: number = 0,
): Promise<NoteItem[]> {
  return persistNoteMutation(id, (item) => {
    const meds = ensureMedicationsList(item.workflowMetadata);
    const now = Date.now();
    if (!meds.length) {
      // Legacy note with no medications array — reactivate whole note.
      return {
        ...item,
        workflowStatus: 'active',
        updatedAt: now,
        syncStatus: 'pending' as const,
      };
    }
    const idx = clampMedIndex(meds, medIndex);
    const entry = meds[idx];
    if (entry.status !== 'dismissed') {
      return item; // Not dismissed, no change needed.
    }
    // Restore to active status and recalculate next suggested time.
    let nextSuggestedAt: number | undefined;
    if (typeof entry.lastTakenAt === 'number' && typeof entry.recommendedIntervalHours === 'number') {
      nextSuggestedAt = entry.lastTakenAt + entry.recommendedIntervalHours * 3_600_000;
    }
    const updatedEntry: MedicationCycleEntry = {
      ...entry,
      status: 'active',
      nextSuggestedAt,
      lastActionAt: now,
    };
    const nextMeds = meds.map((m, i) => i === idx ? updatedEntry : m);
    const newMeta = syncMetadataFromMeds(item.workflowMetadata || {}, nextMeds);
    return {
      ...item,
      workflowMetadata: newMeta,
      workflowStatus: deriveNoteStatusFromMeds(nextMeds),
      updatedAt: now,
      syncStatus: 'pending' as const,
    };
  });
}

export async function updateNoteSmartType(
  id: string,
  smartType: SmartWorkflowType,
  workflowStatus?: WorkflowStatus,
  workflowMetadata?: WorkflowMetadata,
): Promise<NoteItem[]> {
  const current = await loadNotes();
  const next = current.map((item) =>
    item.id === id
      ? {
          ...item,
          smartType,
          workflowStatus: workflowStatus || item.workflowStatus,
          workflowMetadata: workflowMetadata || item.workflowMetadata,
          updatedAt: Date.now(),
          syncStatus: 'pending' as const,
        }
      : item,
  );
  await saveNotes(next);
  const updated = next.find((item) => item.id === id);
  if (updated) {
    const synced = await pushNoteIfAuthenticated(updated);
    if (synced) {
      const syncedNext = next.map((item) =>
        item.id === id ? { ...item, syncStatus: 'synced' as const } : item,
      );
      await saveNotes(syncedNext);
      return normalizeNotes(syncedNext);
    }
  }
  if (updated?.groupId) {
    await upsertSharedGroupNote(updated.groupId, updated);
  }
  return normalizeNotes(next);
}

export async function markNotesSynced(noteIds: ReadonlySet<string>): Promise<NoteItem[]> {
  const current = await loadNotes();
  const updated = current.map((n) =>
    noteIds.has(n.id) && n.syncStatus === 'pending'
      ? { ...n, syncStatus: 'synced' as const }
      : n,
  );
  await saveNotes(updated);
  return normalizeNotes(updated);
}

export async function clearNotes(): Promise<void> {
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify([]));
  await clearDeletedNoteKeys();
  try {
    await clearNotesInFirebase();
  } catch (error) {
    await diag.warn('notes.clear.remote.error', { message: String(error) });
  }
}

export async function hardDeleteAllNotes(): Promise<void> {
  await AsyncStorage.setItem(NOTES_KEY, JSON.stringify([]));
  await clearDeletedNoteKeys();
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
    'PRODID:-//MyKit//Templates//EN',
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
