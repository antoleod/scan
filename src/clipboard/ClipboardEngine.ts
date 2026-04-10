import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import type { ClipCategory, ClipEntry, ClipKind, ClipSource, PermState } from '../core/clipboard.types';

const CLIPBOARD_KEY = '@oryxen_clipboard_v2';
const LEGACY_CLIPBOARD_KEY = '@oryxen_clipboard_v1';
const POLL_BASE = 1200;
const POLL_SLOW = 3500;
const MAX_ENTRIES = 3000;
const DEDUP_WINDOW_MS = 8000;
const RECENT_TTL_MS = 30000;

type Listener = (entries: ClipEntry[]) => void;

type ManualImageInput = {
  dataUrl: string;
  source?: ClipSource;
};

const recentSigs = new Map<string, number>();

function makeId() {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return Date.now();
}

export function signature(content: string): string {
  let h = 0;
  const limit = Math.min(content.length, 200);
  for (let i = 0; i < limit; i += 1) {
    h = (h * 31 + content.charCodeAt(i)) & 0x7fffffff;
  }
  return `${content.length}:${h}`;
}

function cleanupRecentSigs() {
  const cutoff = now() - RECENT_TTL_MS;
  for (const [sig, ts] of recentSigs.entries()) {
    if (ts < cutoff) recentSigs.delete(sig);
  }
}

export function isDuplicate(sig: string): boolean {
  const last = recentSigs.get(sig);
  if (!last) return false;
  return now() - last < DEDUP_WINDOW_MS;
}

export function normalizeText(raw: string): string | null {
  const trimmed = String(raw || '').trim().replace(/\s{3,}/g, '  ');
  if (trimmed.length < 3) return null;
  if (trimmed.length > 12000) return `${trimmed.slice(0, 12000)}...`;
  return trimmed;
}

export function classify(text: string): ClipCategory {
  if (/^https?:\/\//i.test(text)) return 'url';
  if (/\b(INC|RITM|SCTASK|REQ)\d{7}/i.test(text)) return 'servicenow';
  if (/\S+@\S+\.\S+/.test(text)) return 'email';
  if (/\n.*[{};=><]/.test(text) || text.split('\n').length > 4) return 'code';
  return 'general';
}

function normalizeCategory(value: unknown, kind: ClipKind, content: string): ClipCategory {
  if (kind === 'image') return 'general';
  const text = String(value || content || '');
  return classify(text);
}

function normalizeSource(value: unknown): ClipSource {
  return value === 'copy' || value === 'focus' || value === 'poll' || value === 'manual' ? value : 'paste';
}

function toEntry(input: Partial<ClipEntry> & { content: string; kind?: ClipKind; source?: ClipSource }): ClipEntry | null {
  const content = String(input.content || '');
  const kind = input.kind === 'image' ? 'image' : 'text';
  const normalizedContent = kind === 'text' ? normalizeText(content) : String(content || '').trim();
  if (!normalizedContent) return null;
  const sig = String(input.sig || signature(normalizedContent));
  return {
    id: String(input.id || makeId()),
    kind,
    content: normalizedContent,
    category: normalizeCategory(input.category, kind, normalizedContent),
    source: normalizeSource(input.source),
    capturedAt: Number(input.capturedAt || now()),
    sig,
    imageDataUri: typeof input.imageDataUri === 'string' ? input.imageDataUri : undefined,
  };
}

function normalizeEntries(entries: ClipEntry[]): ClipEntry[] {
  const sorted = [...entries]
    .filter((entry) => {
      if (entry.kind === 'image') return Boolean(entry.imageDataUri);
      return Boolean(normalizeText(entry.content));
    })
    .sort((a, b) => b.capturedAt - a.capturedAt);

  const seenText = new Set<string>();
  const deduped: ClipEntry[] = [];
  for (const entry of sorted) {
    if (entry.kind === 'text') {
      const key = entry.content;
      if (seenText.has(key)) continue;
      seenText.add(key);
    }
    deduped.push(entry);
  }

  return deduped.slice(0, MAX_ENTRIES);
}

function browserIsChromium(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData?.brands || [];
  if (uaData.some((brand: { brand: string }) => /Chrom/i.test(brand.brand))) return true;
  const ua = String(navigator.userAgent || '').toLowerCase();
  return ua.includes('chrome') || ua.includes('chromium') || ua.includes('edg/');
}

export async function getClipboardPermission(): Promise<PermState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unsupported';
  try {
    const permission = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
    return permission.state as PermState;
  } catch {
    return 'unsupported';
  }
}

async function blobToDataUrlInternal(blob: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') {
    return '';
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('blob-read-failed'));
    reader.readAsDataURL(blob);
  });
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return blobToDataUrlInternal(blob);
}

export async function compressImage(
  dataUrl: string,
  options: { maxWidth?: number; quality?: number } = {},
): Promise<string> {
  if (typeof document === 'undefined') return dataUrl;
  if (!dataUrl.startsWith('data:image/')) return dataUrl;

  const maxWidth = options.maxWidth || 1200;
  const quality = typeof options.quality === 'number' ? options.quality : 0.82;

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.min(1, maxWidth / Math.max(image.width || 1, 1));
        const width = Math.max(1, Math.round((image.width || 1) * scale));
        const height = Math.max(1, Math.round((image.height || 1) * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

async function readClipboardText(): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
    try {
      return String(await navigator.clipboard.readText() || '');
    } catch {
      return '';
    }
  }
  if (Platform.OS !== 'web') {
    try {
      const mod = await import('expo-clipboard');
      return String(await mod.getStringAsync() || '');
    } catch {
      return '';
    }
  }
  return '';
}

async function readClipboardTextFromClick(): Promise<string> {
  try {
    return await readClipboardText();
  } catch {
    return '';
  }
}

class ClipboardEngine {
  private entries: ClipEntry[] = [];
  private listeners = new Set<Listener>();
  private subscriberCount = 0;
  private permState: PermState = 'unsupported';
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollInterval = POLL_BASE;
  private noChangeCount = 0;
  private loadPromise: Promise<void> | null = null;

  async ensureReady() {
    if (!this.loadPromise) {
      this.loadPromise = this.loadEntries().then(async () => {
        this.permState = await getClipboardPermission();
        this.syncListeners();
        this.syncPolling();
      });
    }
    await this.loadPromise;
  }

  getSnapshot() {
    return {
      entries: this.entries,
      permState: this.permState,
    };
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    listener(this.entries);
    void this.ensureReady();
    return () => {
      this.listeners.delete(listener);
    };
  }

  retain() {
    this.subscriberCount += 1;
    void this.ensureReady();
  }

  release() {
    this.subscriberCount = Math.max(0, this.subscriberCount - 1);
    if (this.subscriberCount === 0) {
      this.stop();
    }
  }

  async captureNow(): Promise<boolean> {
    const text = normalizeText(await readClipboardTextFromClick());
    if (!text) return false;
    return this.ingestText(text, 'manual');
  }

  async capturePastedText(raw: string): Promise<boolean> {
    return this.ingestText(raw, 'manual');
  }

  async importScreenshot(dataUrl: string): Promise<boolean> {
    const compressed = await compressImage(String(dataUrl || ''), { maxWidth: 1200, quality: 0.82 });
    return this.ingestImage(compressed, 'manual');
  }

  async ingestText(raw: string, source: ClipSource): Promise<boolean> {
    cleanupRecentSigs();
    const normalized = normalizeText(raw);
    if (!normalized) return false;
    const sig = signature(normalized);
    if (this.entries.some((entry) => entry.kind === 'text' && entry.content === normalized)) return false;
    if (isDuplicate(sig)) return false;

    const entry = toEntry({
      id: makeId(),
      kind: 'text',
      content: normalized,
      category: classify(normalized),
      source,
      capturedAt: now(),
      sig,
    });
    if (!entry) return false;

    recentSigs.set(sig, entry.capturedAt);
    this.entries = normalizeEntries([entry, ...this.entries]);
    await this.persist();
    this.emit();
    return true;
  }

  async ingestImage(dataUrl: string, source: ClipSource): Promise<boolean> {
    cleanupRecentSigs();
    const value = String(dataUrl || '').trim();
    if (!value.startsWith('data:image/')) return false;
    const sig = signature(value);
    if (isDuplicate(sig)) return false;

    const entry = toEntry({
      id: makeId(),
      kind: 'image',
      content: value,
      category: 'general',
      source,
      capturedAt: now(),
      sig,
      imageDataUri: value,
    });
    if (!entry) return false;

    recentSigs.set(sig, entry.capturedAt);
    this.entries = normalizeEntries([entry, ...this.entries]);
    await this.persist();
    this.emit();
    return true;
  }

  async ingestManualImage(payload: ManualImageInput): Promise<boolean> {
    return this.ingestImage(payload.dataUrl, payload.source || 'manual');
  }

  async removeEntriesByIds(ids: string[]) {
    const remove = new Set(ids);
    this.entries = this.entries.filter((entry) => !remove.has(entry.id));
    await this.persist();
    this.emit();
    return this.entries;
  }

  async removeEntriesByDay(dayIso: string) {
    const value = String(dayIso || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return this.entries;
    this.entries = this.entries.filter((entry) => new Date(entry.capturedAt).toISOString().slice(0, 10) !== value);
    await this.persist();
    this.emit();
    return this.entries;
  }

  async updateEntryCategory(id: string, category: ClipCategory) {
    this.entries = this.entries.map((entry) => (entry.id === id ? { ...entry, category } : entry));
    await this.persist();
    this.emit();
    return this.entries;
  }

  async clear() {
    this.entries = [];
    await AsyncStorage.removeItem(CLIPBOARD_KEY);
    await AsyncStorage.removeItem(LEGACY_CLIPBOARD_KEY);
    this.emit();
  }

  stop() {
    if (typeof document !== 'undefined') {
      document.removeEventListener('paste', this.onPaste);
      document.removeEventListener('copy', this.onCopyOrCut);
      document.removeEventListener('cut', this.onCopyOrCut);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('focus', this.onFocusRefresh);
    }
    this.revokePolling();
  }

  private revokePolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.entries);
    }
  }

  private async loadEntries() {
    const raw = (await AsyncStorage.getItem(CLIPBOARD_KEY)) || (await AsyncStorage.getItem(LEGACY_CLIPBOARD_KEY));
    if (!raw) {
      this.entries = [];
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        this.entries = [];
        return;
      }
      this.entries = normalizeEntries(
        parsed
          .map((item: any) => {
            const content = String(item?.content || item?.imageDataUri || '');
            const kind: ClipKind = item?.kind === 'image' || String(item?.sourceKey || '').startsWith('image:') ? 'image' : 'text';
            const normalized = kind === 'image' ? content.trim() : normalizeText(content);
            if (!normalized) return null;
            const sig = String(item?.sig || signature(normalized));
            return toEntry({
              id: String(item?.id || makeId()),
              kind,
              content: normalized,
              category: item?.category,
              source: normalizeSource(item?.source),
              capturedAt: Number(item?.capturedAt || now()),
              sig,
              imageDataUri: typeof item?.imageDataUri === 'string' ? item.imageDataUri : kind === 'image' ? normalized : undefined,
            });
          })
          .filter(Boolean) as ClipEntry[],
      );
      for (const entry of this.entries) {
        recentSigs.set(entry.sig, entry.capturedAt);
      }
      cleanupRecentSigs();
    } catch {
      this.entries = [];
    }
  }

  private async persist() {
    await AsyncStorage.setItem(CLIPBOARD_KEY, JSON.stringify(normalizeEntries(this.entries)));
  }

  private onPaste = (event: ClipboardEvent) => {
    const data = event.clipboardData;
    if (!data) return;

    const text = data.getData('text/plain') || data.getData('text');
    if (text && text.trim()) {
      void this.ingestText(text, 'paste');
    }

    for (const item of Array.from(data.items || [])) {
      if (!item.type.startsWith('image/')) continue;
      const blob = item.getAsFile();
      if (!blob) continue;
      void (async () => {
        const dataUrl = await blobToDataUrl(blob);
        if (!dataUrl) return;
        const compressed = await compressImage(dataUrl, { maxWidth: 1200, quality: 0.82 });
        await this.ingestImage(compressed, 'paste');
      })();
    }
  };

  private onCopyOrCut = () => {
    setTimeout(() => {
      void this.onCopyRead();
    }, 50);
  };

  private onCopyRead = async () => {
    const text = normalizeText(await readClipboardText());
    if (!text) return;
    await this.ingestText(text, 'copy');
  };

  private onFocusRefresh = () => {
    void this.captureFromFocus();
  };

  private onVisibilityChange = () => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'visible') {
      void this.captureFromFocus();
      this.syncPolling();
    } else {
      this.revokePolling();
    }
  };

  private async captureFromFocus() {
    const text = normalizeText(await readClipboardText());
    if (!text) return;
    await this.ingestText(text, 'focus');
  }

  private syncListeners() {
    if (typeof document === 'undefined') return;
    document.removeEventListener('paste', this.onPaste);
    document.removeEventListener('copy', this.onCopyOrCut);
    document.removeEventListener('cut', this.onCopyOrCut);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('focus', this.onFocusRefresh);

    document.addEventListener('paste', this.onPaste);
    document.addEventListener('copy', this.onCopyOrCut);
    document.addEventListener('cut', this.onCopyOrCut);
    window.addEventListener('focus', this.onFocusRefresh);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private syncPolling() {
    if (typeof document === 'undefined' || typeof navigator === 'undefined') {
      this.revokePolling();
      return;
    }
    if (!navigator.clipboard?.readText || !browserIsChromium()) {
      this.revokePolling();
      return;
    }
    if (document.visibilityState !== 'visible') {
      this.revokePolling();
      return;
    }

    this.revokePolling();
    this.pollTimer = setInterval(() => {
      void this.pollClipboard();
    }, this.pollInterval);
  }

  private async pollClipboard() {
    if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    try {
      const text = normalizeText(await readClipboardText());
      if (!text) return;
      const inserted = await this.ingestText(text, 'poll');
      if (inserted) {
        this.noChangeCount = 0;
        if (this.pollInterval !== POLL_BASE) {
          this.pollInterval = POLL_BASE;
          this.syncPolling();
        }
      } else {
        this.noChangeCount += 1;
        if (this.noChangeCount > 5 && this.pollInterval !== POLL_SLOW) {
          this.pollInterval = POLL_SLOW;
          this.syncPolling();
        }
      }
    } catch {
      this.revokePolling();
    }
  }
}

const engine = new ClipboardEngine();

export function startClipboardEngine() {
  engine.retain();
  return engine.ensureReady();
}

export function stopClipboardEngine() {
  engine.release();
}

export function subscribeClipboardEntries(listener: Listener) {
  return engine.subscribe(listener);
}

export function getClipboardEngineSnapshot() {
  return engine.getSnapshot();
}

export async function loadClipboardEntries(): Promise<ClipEntry[]> {
  await engine.ensureReady();
  return engine.getSnapshot().entries;
}

export async function saveClipboardEntries(entries: ClipEntry[]): Promise<void> {
  await AsyncStorage.setItem(CLIPBOARD_KEY, JSON.stringify(normalizeEntries(entries)));
}

export async function addClipboardEntryUnique(content: string): Promise<{ entries: ClipEntry[]; inserted: boolean }> {
  const inserted = await engine.ingestText(content, 'manual');
  return { entries: engine.getSnapshot().entries, inserted };
}

export async function addClipboardImageUnique(imageDataUri: string): Promise<{ entries: ClipEntry[]; inserted: boolean }> {
  const inserted = await engine.ingestImage(imageDataUri, 'manual');
  return { entries: engine.getSnapshot().entries, inserted };
}

export async function clearClipboardEntries(): Promise<void> {
  await engine.clear();
}

export async function removeClipboardEntriesByIds(ids: string[]): Promise<ClipEntry[]> {
  return engine.removeEntriesByIds(ids);
}

export async function removeClipboardEntriesByDay(dayIso: string): Promise<ClipEntry[]> {
  return engine.removeEntriesByDay(dayIso);
}

export async function updateClipboardEntryCategory(id: string, category: ClipCategory): Promise<ClipEntry[]> {
  return engine.updateEntryCategory(id, category);
}

export async function captureClipboardNow(): Promise<boolean> {
  return engine.captureNow();
}

export async function importClipboardScreenshot(dataUrl: string): Promise<boolean> {
  return engine.importScreenshot(dataUrl);
}

export async function captureClipboardPasteText(text: string): Promise<boolean> {
  return engine.capturePastedText(text);
}

export async function importClipboardScreenshotFromManual(payload: ManualImageInput): Promise<boolean> {
  return engine.ingestManualImage(payload);
}
