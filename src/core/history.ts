import AsyncStorage from '@react-native-async-storage/async-storage';

import { ScanRecord } from '../types';

const KEY = 'barra_history';
let historyIdCounter = 0;

export function createHistoryId(prefix = 'scan'): string {
  historyIdCounter = (historyIdCounter + 1) % 1_000_000;
  const stamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${historyIdCounter.toString(36)}_${random}`;
}

function ensureUniqueHistoryIds(items: ScanRecord[]): ScanRecord[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    const currentId = String(item?.id || '').trim();
    const nextId = currentId && !seen.has(currentId) ? currentId : createHistoryId(index === 0 ? 'scan' : 'history');
    seen.add(nextId);
    return {
      ...item,
      id: nextId,
    };
  });
}

export async function loadHistory(): Promise<ScanRecord[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const sanitized = ensureUniqueHistoryIds(parsed as ScanRecord[]);
    if (sanitized.length !== parsed.length || sanitized.some((item, index) => item.id !== (parsed[index] as ScanRecord)?.id)) {
      await AsyncStorage.setItem(KEY, JSON.stringify(sanitized));
    }
    return sanitized;
  } catch {
    return [];
  }
}

export async function saveHistory(items: ScanRecord[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(ensureUniqueHistoryIds(items)));
}

export function normalizeHistoryType(type: string): string {
  const value = String(type || '').trim();
  if (value === 'pi_full' || value === 'pi_short') {
    return 'PI';
  }
  return value.toUpperCase();
}

export function historyKey(item: Pick<ScanRecord, 'codeNormalized' | 'type'> & Partial<Pick<ScanRecord, 'codeValue'>>): string {
  return `${String(item.codeValue || item.codeNormalized || '').trim()}::${normalizeHistoryType(item.type)}`;
}

export interface HistoryWriteResult {
  history: ScanRecord[];
  inserted: boolean;
  duplicate: ScanRecord | null;
}

export async function addHistoryUnique(item: ScanRecord): Promise<HistoryWriteResult> {
  const current = await loadHistory();
  const duplicate = current.find((entry) => historyKey(entry) === historyKey(item)) || null;

  if (duplicate) {
    return { history: current, inserted: false, duplicate };
  }

  const next = [item, ...current].slice(0, 5000);
  await saveHistory(next);
  return { history: next, inserted: true, duplicate: null };
}

export async function addHistory(item: ScanRecord): Promise<ScanRecord[]> {
  const result = await addHistoryUnique(item);
  return result.history;
}

export async function clearHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
