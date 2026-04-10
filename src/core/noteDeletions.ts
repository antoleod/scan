import AsyncStorage from '@react-native-async-storage/async-storage';

const DELETED_NOTE_KEYS = '@barra_deleted_note_keys_v1';

export type NoteScope = 'personal' | 'group';

export function noteStorageKey(noteId: string, scope: NoteScope = 'personal', groupId?: string): string {
  if (scope === 'group') {
    return `group:${String(groupId || '').trim()}:${String(noteId || '').trim()}`;
  }
  return `personal:${String(noteId || '').trim()}`;
}

function normalizeKey(value: string): string {
  return String(value || '').trim();
}

export async function loadDeletedNoteKeys(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(DELETED_NOTE_KEYS);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((value: unknown) => normalizeKey(String(value || ''))).filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function saveDeletedNoteKeys(keys: Set<string>): Promise<void> {
  const normalized = Array.from(keys).map((value) => normalizeKey(value)).filter(Boolean);
  await AsyncStorage.setItem(DELETED_NOTE_KEYS, JSON.stringify(Array.from(new Set(normalized))));
}

export async function markDeletedNoteKey(key: string): Promise<Set<string>> {
  const next = await loadDeletedNoteKeys();
  const normalized = normalizeKey(key);
  if (normalized) {
    next.add(normalized);
    await saveDeletedNoteKeys(next);
  }
  return next;
}

export async function clearDeletedNoteKeys(): Promise<void> {
  await AsyncStorage.removeItem(DELETED_NOTE_KEYS);
}

