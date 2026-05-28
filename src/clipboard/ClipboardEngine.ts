import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import type { ClipCategory, ClipEntry, ClipKind, ClipSource, PermState } from '../core/clipboard.types';
import {
  saveClipboardImage,
  loadClipboardImage,
  deleteClipboardImage,
  clearClipboardImagesOlderThan,
  getClipboardStorageSize,
} from '../core/clipboardStorage';

const CLIPBOARD_KEY = '@MyKit_clipboard_v2';
const LEGACY_CLIPBOARD_KEY = '@MyKit_clipboard_v1';
const POLL_BASE = 2500;
const POLL_SLOW = 3500;
const POLL_BACKGROUND = 5000; // Slower polling when in background
const MAX_ENTRIES = 3000;
const DEDUP_WINDOW_MS = 8000;
const RECENT_TTL_MS = 30000;
const FIREBASE_RETRY_MAX_ATTEMPTS = 5;
const FIREBASE_RETRY_BASE_DELAY_MS = 1000;
const FIREBASE_HEALTH_CHECK_INTERVAL_MS = 30000; // Check connection every 30s
const IMAGE_STORAGE_MAX_BYTES = 50 * 1024 * 1024; // 50 MB limit for images
const IMAGE_RETENTION_DAYS = 30; // Auto-delete images older than 30 days

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
        // Fill white background before drawing so transparent PNGs don't turn black in JPEG output
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
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
  private firesyncTimer: ReturnType<typeof setTimeout> | null = null;
  private firebaseUnsub: (() => void) | null = null;
  private firebaseRetryCount = 0;
  private firebaseRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private firebaseHealthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private lastFirebaseSyncMs = 0;
  private isFirebaseHealthy = true;
  private nativePollTimer: ReturnType<typeof setInterval> | null = null;
  private appStateSub: { remove: () => void } | null = null;
  private lastNativeText = '';
  private backgroundCaptureEnabled = false;

  /** Toggle background capture: when on, polling keeps running while the app/tab
   *  is hidden (web) or in the background (native), with best-effort delivery. */
  setBackgroundCaptureEnabled(value: boolean) {
    const next = Boolean(value);
    if (next === this.backgroundCaptureEnabled) return;
    this.backgroundCaptureEnabled = next;
    this.syncPolling();
    if (Platform.OS !== 'web') {
      if (next) {
        // Keep the native poll running even when AppState is not active
        this.startNativePolling();
      } else if (AppState.currentState !== 'active') {
        this.stopNativePolling();
      }
    }
  }

  isBackgroundCaptureEnabled() {
    return this.backgroundCaptureEnabled;
  }

  async ensureReady() {
    if (!this.loadPromise) {
      this.loadPromise = this.loadEntries().then(async () => {
        this.permState = await getClipboardPermission();
        this.syncListeners();
        this.syncPolling();
        this.syncNativeCapture();
        // Merge remote entries on startup and start real-time listener
        void this.startFirebaseSync();
      });
    }
    await this.loadPromise;
  }

  private syncNativeCapture() {
    // Native (iOS/Android) clipboard capture: polls expo-clipboard while
    // the app is in the foreground and re-checks on AppState 'active'.
    if (Platform.OS === 'web') return;

    if (this.appStateSub) {
      this.appStateSub.remove();
      this.appStateSub = null;
    }
    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        void this.captureFromNative('focus');
        this.startNativePolling();
      } else if (!this.backgroundCaptureEnabled) {
        this.stopNativePolling();
      }
    };
    this.appStateSub = AppState.addEventListener('change', handleAppState);
    if (AppState.currentState === 'active') {
      this.startNativePolling();
      void this.captureFromNative('focus');
    }
  }

  private startNativePolling() {
    if (Platform.OS === 'web') return;
    if (this.nativePollTimer) return;
    this.nativePollTimer = setInterval(() => {
      void this.captureFromNative('poll');
    }, 2000);
  }

  private stopNativePolling() {
    if (this.nativePollTimer) {
      clearInterval(this.nativePollTimer);
      this.nativePollTimer = null;
    }
  }

  private async captureFromNative(source: ClipSource) {
    try {
      const raw = await readClipboardText();
      const text = normalizeText(raw);
      if (!text) return;
      if (text === this.lastNativeText) return;
      this.lastNativeText = text;
      await this.ingestText(text, source);
    } catch {
      // Silently fail — clipboard read can throw on some Android devices when
      // the app is restricted or the OS denies access. We retry on next tick.
    }
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

  /** Re-initialise Firebase real-time sync after the user has signed in. */
  async reinitFirebaseSync() {
    await this.startFirebaseSync();
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
    // 800px / 0.6 keeps clipboard images under ~80 KB — within localStorage limits
    const compressed = await compressImage(String(dataUrl || ''), { maxWidth: 800, quality: 0.60 });
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

    // Persist image to IndexedDB on web
    if (typeof indexedDB !== 'undefined') {
      void saveClipboardImage(entry.id, value, entry.capturedAt);
    }

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
    const toDelete = this.entries.filter((entry) => remove.has(entry.id));

    // Delete images from IndexedDB
    for (const entry of toDelete) {
      if (entry.kind === 'image' && typeof indexedDB !== 'undefined') {
        void deleteClipboardImage(entry.id).catch(() => {});
      }
    }

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
    if (typeof indexedDB !== 'undefined') {
      const { clearAllClipboardImages } = await import('../core/clipboardStorage');
      void clearAllClipboardImages().catch(() => {});
    }
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
    this.stopNativePolling();
    if (this.appStateSub) { this.appStateSub.remove(); this.appStateSub = null; }
    if (this.firesyncTimer) { clearTimeout(this.firesyncTimer); this.firesyncTimer = null; }
    if (this.firebaseRetryTimer) { clearTimeout(this.firebaseRetryTimer); this.firebaseRetryTimer = null; }
    if (this.firebaseHealthCheckTimer) { clearInterval(this.firebaseHealthCheckTimer); this.firebaseHealthCheckTimer = null; }
    if (this.firebaseUnsub) { this.firebaseUnsub(); this.firebaseUnsub = null; }
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

      // Load entries and try to restore images from IndexedDB
      const entries = parsed
        .map(async (item: any) => {
          const content = String(item?.content || item?.imageDataUri || '');
          const kind: ClipKind = item?.kind === 'image' || String(item?.sourceKey || '').startsWith('image:') ? 'image' : 'text';
          const normalized = kind === 'image' ? content.trim() : normalizeText(content);
          if (!normalized) return null;
          const sig = String(item?.sig || signature(normalized));

          let imageDataUri: string | undefined;
          if (kind === 'image' && typeof indexedDB !== 'undefined') {
            // Try to load image from IndexedDB
            const storedImage = await loadClipboardImage(item.id);
            imageDataUri = storedImage || item.imageDataUri;
          } else {
            imageDataUri = typeof item?.imageDataUri === 'string' ? item.imageDataUri : kind === 'image' ? normalized : undefined;
          }

          return toEntry({
            id: String(item?.id || makeId()),
            kind,
            content: normalized,
            category: item?.category,
            source: normalizeSource(item?.source),
            capturedAt: Number(item?.capturedAt || now()),
            sig,
            imageDataUri,
          });
        });

      // Resolve all async loads
      const resolved = await Promise.all(entries);
      this.entries = normalizeEntries(resolved.filter(Boolean) as ClipEntry[]);

      for (const entry of this.entries) {
        recentSigs.set(entry.sig, entry.capturedAt);
      }
      cleanupRecentSigs();
    } catch {
      this.entries = [];
    }
  }

  private async persist() {
    // Persist text entries to AsyncStorage
    const forStorage = normalizeEntries(this.entries).map((e) =>
      e.kind === 'image' ? { ...e, imageDataUri: e.imageDataUri } : e,
    );
    try {
      await AsyncStorage.setItem(CLIPBOARD_KEY, JSON.stringify(forStorage));
    } catch {
      // Storage full — retry with text-only (drop image data)
      const textOnly = normalizeEntries(this.entries.filter((e) => e.kind === 'text'));
      try {
        await AsyncStorage.setItem(CLIPBOARD_KEY, JSON.stringify(textOnly));
      } catch { /* ignore */ }
    }

    // Clean up old images from IndexedDB to manage storage
    if (typeof indexedDB !== 'undefined') {
      const retentionMs = IMAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - retentionMs;
      void clearClipboardImagesOlderThan(cutoffTime).catch(() => {});

      // Check storage size and delete oldest images if over limit
      const size = await getClipboardStorageSize();
      if (size > IMAGE_STORAGE_MAX_BYTES) {
        const imagesToDelete = this.entries
          .filter((e) => e.kind === 'image')
          .sort((a, b) => a.capturedAt - b.capturedAt)
          .slice(0, Math.ceil(this.entries.filter((e) => e.kind === 'image').length * 0.2)); // Delete oldest 20%

        for (const entry of imagesToDelete) {
          void deleteClipboardImage(entry.id).catch(() => {});
        }
      }
    }

    // Push text entries to Firebase with a 3-second debounce
    this.scheduleFirebaseSync();
  }

  private scheduleFirebaseSync() {
    if (this.firesyncTimer) clearTimeout(this.firesyncTimer);
    this.firesyncTimer = setTimeout(() => { void this.runFirebaseSync(); }, 3000);
  }

  private scheduleFirebaseRetry(delayMs?: number) {
    if (this.firebaseRetryTimer) clearTimeout(this.firebaseRetryTimer);

    const delay = delayMs || this.calculateBackoffDelay();
    this.firebaseRetryTimer = setTimeout(
      () => { void this.runFirebaseSync(); },
      delay,
    );
  }

  private calculateBackoffDelay(): number {
    const exponential = FIREBASE_RETRY_BASE_DELAY_MS * Math.pow(2, Math.min(this.firebaseRetryCount, 4));
    const jitter = Math.random() * 1000;
    return exponential + jitter;
  }

  private resetFirebaseRetry() {
    this.firebaseRetryCount = 0;
    if (this.firebaseRetryTimer) clearTimeout(this.firebaseRetryTimer);
    this.firebaseRetryTimer = null;
  }

  private startFirebaseHealthCheck() {
    if (this.firebaseHealthCheckTimer) clearInterval(this.firebaseHealthCheckTimer);

    this.firebaseHealthCheckTimer = setInterval(() => {
      void this.checkFirebaseHealth();
    }, FIREBASE_HEALTH_CHECK_INTERVAL_MS);
  }

  private async checkFirebaseHealth() {
    try {
      // Try a lightweight Firebase operation to verify connectivity
      const { getFirebaseRuntimeSnapshot } = await import('../core/firebase');
      const rt = await getFirebaseRuntimeSnapshot();

      if (!rt.enabled || !rt.auth) {
        this.isFirebaseHealthy = false;
        return;
      }

      // If we have a current user and haven't synced in a while, trigger a sync
      if (rt.auth.currentUser && Date.now() - this.lastFirebaseSyncMs > 60000) {
        void this.runFirebaseSync();
      }

      this.isFirebaseHealthy = true;
    } catch {
      this.isFirebaseHealthy = false;
      // Schedule retry if Firebase is unhealthy
      if (this.firebaseRetryCount < FIREBASE_RETRY_MAX_ATTEMPTS) {
        this.firebaseRetryCount += 1;
        void this.scheduleFirebaseRetry();
      }
    }
  }

  private async runFirebaseSync() {
    try {
      const { syncClipboardWithFirebase } = await import('../core/firebase');
      const textEntries = this.entries.filter((e) => e.kind === 'text');
      const remoteOnly = await syncClipboardWithFirebase(textEntries);

      // Successful sync — reset retry counter and health status
      this.resetFirebaseRetry();
      this.isFirebaseHealthy = true;
      this.lastFirebaseSyncMs = Date.now();

      if (remoteOnly.length > 0) {
        let changed = false;
        for (const remote of remoteOnly) {
          if (!this.entries.some((e) => e.id === remote.id)) {
            const entry = toEntry({ ...remote });
            if (entry) { this.entries.push(entry); changed = true; }
          }
        }
        if (changed) {
          this.entries = normalizeEntries(this.entries);
          // persist without re-triggering another firebase sync
          try {
            await AsyncStorage.setItem(CLIPBOARD_KEY, JSON.stringify(normalizeEntries(this.entries)));
          } catch { /* ignore */ }
          this.emit();
        }
      }
    } catch (error) {
      // Firebase sync failed — schedule retry with exponential backoff
      if (this.firebaseRetryCount < FIREBASE_RETRY_MAX_ATTEMPTS) {
        this.firebaseRetryCount += 1;
        this.scheduleFirebaseRetry();
      }
      // Do not mark as unhealthy immediately — only if health check fails
    }
  }

  private async startFirebaseSync() {
    try {
      const { subscribeToClipboard } = await import('../core/firebase');
      if (this.firebaseUnsub) { this.firebaseUnsub(); this.firebaseUnsub = null; }

      // Start real-time listener
      this.firebaseUnsub = await subscribeToClipboard((remoteEntries) => {
        let changed = false;
        for (const remote of remoteEntries) {
          if (!this.entries.some((e) => e.id === remote.id)) {
            const entry = toEntry({ ...remote });
            if (entry) { this.entries.push(entry); changed = true; }
          }
        }
        if (changed) {
          this.entries = normalizeEntries(this.entries);
          void AsyncStorage.setItem(CLIPBOARD_KEY, JSON.stringify(normalizeEntries(this.entries))).catch(() => undefined);
          this.emit();
        }
        // Reset retry count on successful subscription updates
        this.resetFirebaseRetry();
        this.isFirebaseHealthy = true;
      });

      // Start periodic health check
      this.startFirebaseHealthCheck();
    } catch { /* Firebase not configured */ }
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
        const compressed = await compressImage(dataUrl, { maxWidth: 800, quality: 0.60 });
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
    }
    // Continue polling even in background (with adjusted interval)
    this.syncPolling();
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

    // Don't start polling until the user has explicitly granted clipboard-read permission.
    // If we poll while in 'prompt' state the browser will show a permission dialog on every
    // page load — we only want that dialog to appear when the user clicks "Capture".
    if (this.permState !== 'granted') {
      this.revokePolling();
      return;
    }

    // Adjust polling interval based on visibility (background = slower, foreground = faster)
    const isVisible = document.visibilityState === 'visible';
    const interval = isVisible ? this.pollInterval : POLL_BACKGROUND;

    this.revokePolling();
    this.pollTimer = setInterval(() => {
      void this.pollClipboard();
    }, interval);
  }

  private async pollClipboard() {
    if (typeof document === 'undefined') return;
    if (document.visibilityState !== 'visible' && !this.backgroundCaptureEnabled) return;
    if (this.permState !== 'granted') return;
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

/** Call this once the user has authenticated so Firebase sync can be re-established. */
export async function reinitClipboardFirebaseSync(): Promise<void> {
  return engine.reinitFirebaseSync();
}

/** Toggle whether clipboard polling keeps running while the app/tab is hidden
 *  or backgrounded. Best-effort: the OS/browser may still throttle background work. */
export function setClipboardBackgroundCapture(value: boolean): void {
  engine.setBackgroundCaptureEnabled(value);
}

export function getClipboardBackgroundCapture(): boolean {
  return engine.isBackgroundCaptureEnabled();
}
