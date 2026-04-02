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

function normalize(entries: ClipboardEntry[]) {
  return [...entries]
    .filter((entry) => entry.content.trim().length > 0 || entry.imageDataUri)
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, 3000);
}

export async function loadClipboardEntries(): Promise<ClipboardEntry[]> {
  const raw = await AsyncStorage.getItem(CLIPBOARD_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalize(
      parsed.map((item): ClipboardEntry => {
        const content = String(item?.content || '');
        const imageDataUri = typeof item?.imageDataUri === 'string' ? item.imageDataUri : undefined;
        return {
          id: String(item?.id || makeId()),
          kind: item?.kind === 'image' ? 'image' : 'text',
          content,
          imageDataUri,
          sourceKey: String(item?.sourceKey || content || imageDataUri || makeId()),
          capturedAt: Number(item?.capturedAt || Date.now()),
          category: categorizeClipboardContent(content),
        };
      }),
    );
  } catch {
    return [];
  }
}

export async function saveClipboardEntries(entries: ClipboardEntry[]): Promise<void> {
  await AsyncStorage.setItem(CLIPBOARD_KEY, JSON.stringify(normalize(entries)));
}

export async function addClipboardEntryUnique(content: string): Promise<{ entries: ClipboardEntry[]; inserted: boolean }> {
  const value = String(content || '').trim();
  if (!value) return { entries: await loadClipboardEntries(), inserted: false };

  const current = await loadClipboardEntries();
  const key = `text:${value}`;
  if (current.some((entry) => entry.sourceKey === key)) return { entries: current, inserted: false };

  const next: ClipboardEntry[] = [
    {
      id: makeId(),
      kind: 'text',
      content: value,
      sourceKey: key,
      capturedAt: Date.now(),
      category: categorizeClipboardContent(value),
    },
    ...current,
  ];

  await saveClipboardEntries(next);
  return { entries: next, inserted: true };
}

export async function addClipboardImageUnique(imageDataUri: string): Promise<{ entries: ClipboardEntry[]; inserted: boolean }> {
  const value = String(imageDataUri || '').trim();
  if (!value.startsWith('data:image/')) return { entries: await loadClipboardEntries(), inserted: false };

  const signature = value.slice(0, 64);
  const key = `image:${signature}`;
  const current = await loadClipboardEntries();
  if (current.some((entry) => entry.sourceKey === key)) return { entries: current, inserted: false };

  const next: ClipboardEntry[] = [
    {
      id: makeId(),
      kind: 'image',
      content: 'Image from clipboard',
      imageDataUri: value,
      sourceKey: key,
      capturedAt: Date.now(),
      category: 'general',
    },
    ...current,
  ];

  await saveClipboardEntries(next);
  return { entries: next, inserted: true };
}

export async function clearClipboardEntries(): Promise<void> {
  await AsyncStorage.removeItem(CLIPBOARD_KEY);
}
