import AsyncStorage from '@react-native-async-storage/async-storage';

const DELETED_NOTE_KEYS = '@barra_deleted_note_keys_v1';

// L-2: cap the deletion-key set. Set iteration/JSON preserves insertion order, so
// when we exceed the cap we keep the most-recent keys (appended last). Old keys for
// notes that no longer exist on any device only matter for local dedup, which is
// irrelevant once the note is absent everywhere; Firestore tombstones cover sync.
const MAX_DELETED_KEYS = 1000;

// H-4: cache the deleted-key set in memory so loadDeletedNoteKeys() (called on every
// loadNotes() — i.e. inside every locked mutation) doesn't hit AsyncStorage each time.
// Invalidated whenever the set is mutated (mark/save/clear).
let cachedKeys: Set<string> | null = null;

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
  // H-4: serve from the in-memory cache when warm. Return a copy so callers that
  // mutate the result (e.g. add a key before saving) don't corrupt the cache.
  if (cachedKeys) return new Set(cachedKeys);
  const raw = await AsyncStorage.getItem(DELETED_NOTE_KEYS);
  if (!raw) {
    cachedKeys = new Set();
    return new Set();
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedKeys = new Set();
      return new Set();
    }
    const set = new Set(parsed.map((value: unknown) => normalizeKey(String(value || ''))).filter(Boolean));
    cachedKeys = new Set(set);
    return set;
  } catch {
    cachedKeys = new Set();
    return new Set();
  }
}

export async function saveDeletedNoteKeys(keys: Set<string>): Promise<void> {
  let normalized = Array.from(new Set(Array.from(keys).map((value) => normalizeKey(value)).filter(Boolean)));
  // L-2: keep only the most-recent keys (last in insertion order).
  if (normalized.length > MAX_DELETED_KEYS) {
    normalized = normalized.slice(-MAX_DELETED_KEYS);
  }
  cachedKeys = new Set(normalized);
  await AsyncStorage.setItem(DELETED_NOTE_KEYS, JSON.stringify(normalized));
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

// C-3 / M-5: mark many keys with a SINGLE load + save instead of N serial
// load-modify-write round trips (which on a 3000-note clear meant ~6000 bridged
// AsyncStorage ops that blocked the JS thread).
export async function markDeletedNoteKeys(keys: Iterable<string>): Promise<Set<string>> {
  const next = await loadDeletedNoteKeys();
  let changed = false;
  for (const key of keys) {
    const normalized = normalizeKey(key);
    if (normalized) {
      next.add(normalized);
      changed = true;
    }
  }
  if (changed) await saveDeletedNoteKeys(next);
  return next;
}

export async function clearDeletedNoteKeys(): Promise<void> {
  cachedKeys = new Set();
  await AsyncStorage.removeItem(DELETED_NOTE_KEYS);
}

