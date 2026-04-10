import AsyncStorage from '@react-native-async-storage/async-storage';

const DELETED_HISTORY_KEYS = '@barra_deleted_history_keys_v1';

function normalizeKey(value: string): string {
  return String(value || '').trim();
}

export async function loadDeletedHistoryKeys(): Promise<Set<string>> {
  const raw = await AsyncStorage.getItem(DELETED_HISTORY_KEYS);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((value: unknown) => normalizeKey(String(value || ''))).filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function saveDeletedHistoryKeys(keys: Set<string>): Promise<void> {
  const normalized = Array.from(keys).map((value) => normalizeKey(value)).filter(Boolean);
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
  await AsyncStorage.removeItem(DELETED_HISTORY_KEYS);
}

