import AsyncStorage from '@react-native-async-storage/async-storage';

const DELETED_HISTORY_KEYS = '@barra_deleted_history_keys_v1';

// H-4 (parity with noteDeletions): cache the deleted-key set in memory so
// loadDeletedHistoryKeys() — called inside every loadHistory(), i.e. on the hot
// scan-save path — doesn't hit AsyncStorage each time. Invalidated whenever the
// set is mutated (save/clear).
let cachedKeys: Set<string> | null = null;

function normalizeKey(value: string): string {
  return String(value || '').trim();
}

export async function loadDeletedHistoryKeys(): Promise<Set<string>> {
  // Serve from the in-memory cache when warm. Return a copy so callers that
  // mutate the result (e.g. add a key before saving) don't corrupt the cache.
  if (cachedKeys) return new Set(cachedKeys);
  const raw = await AsyncStorage.getItem(DELETED_HISTORY_KEYS);
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

export async function saveDeletedHistoryKeys(keys: Set<string>): Promise<void> {
  const normalized = Array.from(keys).map((value) => normalizeKey(value)).filter(Boolean);
  cachedKeys = new Set(normalized);
  await AsyncStorage.setItem(DELETED_HISTORY_KEYS, JSON.stringify(Array.from(new Set(normalized))));
}

export async function markDeletedHistoryKey(key: string): Promise<Set<string>> {
  const next = await loadDeletedHistoryKeys();
  const normalized = normalizeKey(key);
  if (normalized) {
    next.add(normalized);
    await saveDeletedHistoryKeys(next);
  }
  return next;
}

export async function clearDeletedHistoryKeys(): Promise<void> {
  cachedKeys = new Set();
  await AsyncStorage.removeItem(DELETED_HISTORY_KEYS);
}
