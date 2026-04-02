import AsyncStorage from '@react-native-async-storage/async-storage';

import { ClipboardEntry, ClipboardCategory } from './clipboard.types';

const CLIPBOARD_KEY = '@oryxen_clipboard_v1';

function makeId() {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function categorizeClipboardContent(content: string): ClipboardCategory {
  const value = String(content || '').trim();
  if (!value) return 'general';
  if (/\b(02PI\w*|PI\d+)\b/i.test(value)) return 'code';
  if (/\b(RITM\d+|INC\d+|REQ\d+|SCTASK\d+)\b/i.test(value)) return 'servicenow';
  if (/^https?:\/\//i.test(value)) return 'link';
  return 'general';
}

export async function loadClipboardEntries(): Promise<ClipboardEntry[]> {
  const raw = await AsyncStorage.getItem(CLIPBOARD_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): ClipboardEntry => ({
        id: String(item?.id || makeId()),
        content: String(item?.content || ''),
        capturedAt: Number(item?.capturedAt || Date.now()),
        category: categorizeClipboardContent(String(item?.content || '')),
      }))
      .filter((entry) => entry.content.trim().length > 0)
      .sort((a, b) => b.capturedAt - a.capturedAt);
  } catch {
    return [];
  }
}

export async function saveClipboardEntries(entries: ClipboardEntry[]): Promise<void> {
  const normalized = [...entries]
    .filter((entry) => entry.content.trim().length > 0)
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, 3000);
  await AsyncStorage.setItem(CLIPBOARD_KEY, JSON.stringify(normalized));
}

export async function addClipboardEntryUnique(content: string): Promise<{ entries: ClipboardEntry[]; inserted: boolean }> {
  const value = String(content || '').trim();
  if (!value) return { entries: await loadClipboardEntries(), inserted: false };

  const current = await loadClipboardEntries();
  const exists = current.some((entry) => entry.content === value);
  if (exists) return { entries: current, inserted: false };

  const next: ClipboardEntry[] = [
    {
      id: makeId(),
      content: value,
      capturedAt: Date.now(),
      category: categorizeClipboardContent(value),
    },
    ...current,
  ];

  await saveClipboardEntries(next);
  return { entries: next, inserted: true };
}
