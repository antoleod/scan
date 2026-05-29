/**
 * AnalyticsService — privacy-safe event tracking.
 *
 * Design rules:
 *  - NEVER store note text, scan content, OCR output, passwords, or tokens.
 *  - Only metadata: event name, uid, platform, note type/category, error code,
 *    duration, success/failure.
 *  - All payloads pass through `sanitizePayload()` before being queued.
 *  - Writes are debounced (flush every 3 s or after 20 events).
 *  - Fully fire-and-forget: calling code never awaits analytics.
 *  - No-op when Firebase is unavailable or uid is missing.
 */
import { Platform } from 'react-native';
import { flushAnalyticsBatch } from './analyticsAggregator';

// ── Event names ───────────────────────────────────────────────────────────────

export type AnalyticsEventName =
  | 'app_open'
  | 'login_success'
  | 'logout'
  | 'note_created'
  | 'note_updated'
  | 'note_deleted'
  | 'note_type_detected'
  | 'note_conversion_started'
  | 'note_conversion_success'
  | 'note_conversion_failed'
  | 'shopping_list_created'
  | 'medication_note_created'
  | 'reminder_created'
  | 'task_created'
  | 'scan_started'
  | 'scan_success'
  | 'scan_failed'
  | 'transfer_started'
  | 'transfer_completed'
  | 'transfer_failed'
  | 'feature_opened'
  | 'error_logged';

// ── Payload ───────────────────────────────────────────────────────────────────

/**
 * Safe fields that MAY appear in an analytics event.
 * This is an explicit allowlist — anything not listed is stripped by sanitizePayload.
 */
const ALLOWED_PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  'noteType',       // e.g. 'medication', 'shopping', 'reminder'
  'noteCategory',   // e.g. 'health', 'work', 'general'
  'source',         // e.g. 'camera', 'manual', 'import'
  'feature',        // e.g. 'scan', 'notes', 'airdrop'
  'success',        // boolean
  'errorCode',      // e.g. 'SCAN_FAILED', 'NOTE_SAVE_ERROR'
  'durationMs',     // number
  'platform',       // overridden from Platform.OS
  'scanType',       // e.g. 'RITM', 'PI', 'QR'
  'transferType',   // e.g. 'webrtc', 'cloud_relay'
  'fileSizeBytes',  // number — safe metadata, no content
  'provider',       // e.g. 'firebase_storage', 'webrtc'
]);

export interface AnalyticsPayload {
  noteType?: string;
  noteCategory?: string;
  source?: string;
  feature?: string;
  success?: boolean;
  errorCode?: string;
  durationMs?: number;
  scanType?: string;
  transferType?: string;
  fileSizeBytes?: number;
  provider?: string;
  [key: string]: unknown; // allows extra keys; sanitizePayload strips them
}

export interface AnalyticsEvent {
  event: AnalyticsEventName;
  uid: string;
  ts: number;
  platform: string;
  appVersion: string;
  payload: Record<string, unknown>;
}

// ── Privacy sanitizer ─────────────────────────────────────────────────────────

/**
 * Strip any key not in ALLOWED_PAYLOAD_KEYS. This is the last line of defence
 * ensuring private note content, scan text, or tokens never reach Firestore.
 */
export function sanitizePayload(raw: AnalyticsPayload): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const key of Object.keys(raw)) {
    if (ALLOWED_PAYLOAD_KEYS.has(key)) {
      const v = raw[key];
      // Extra type safety: reject non-primitive values (objects/arrays).
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        safe[key] = v;
      }
    }
  }
  return safe;
}

// ── Internal queue + flush ────────────────────────────────────────────────────

const queue: AnalyticsEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_DELAY_MS = 3000;
const FLUSH_BATCH_SIZE = 20;

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    drainQueue();
  }, FLUSH_DELAY_MS);
}

function drainQueue(): void {
  if (queue.length === 0) return;
  const batch = queue.splice(0, FLUSH_BATCH_SIZE);
  void flushAnalyticsBatch(batch).catch(() => undefined);
  if (queue.length > 0) scheduleFlush();
}

// ── Public API ────────────────────────────────────────────────────────────────

const APP_VERSION = '1.0.0';

/**
 * Fire-and-forget analytics event. Never throws; never blocks the caller.
 */
export function track(
  uid: string | null | undefined,
  event: AnalyticsEventName,
  payload: AnalyticsPayload = {},
): void {
  if (!uid) return; // guests produce no analytics

  const safe = sanitizePayload(payload);
  const ev: AnalyticsEvent = {
    event,
    uid,
    ts: Date.now(),
    platform: Platform.OS,
    appVersion: APP_VERSION,
    payload: { ...safe, platform: Platform.OS },
  };

  queue.push(ev);
  if (queue.length >= FLUSH_BATCH_SIZE) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    drainQueue();
  } else {
    scheduleFlush();
  }
}

/** Force-flush any queued events (useful on app background/close). */
export function flushNow(): void {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  drainQueue();
}

/** Convenience wrappers — call these from feature code. */

export const analytics = {
  appOpen: (uid: string) => track(uid, 'app_open'),
  loginSuccess: (uid: string) => track(uid, 'login_success'),
  logout: (uid: string) => track(uid, 'logout'),

  noteCreated: (uid: string, opts: { noteType?: string; noteCategory?: string; source?: string }) =>
    track(uid, 'note_created', opts),
  noteUpdated: (uid: string, opts?: { noteType?: string }) =>
    track(uid, 'note_updated', opts ?? {}),
  noteDeleted: (uid: string) => track(uid, 'note_deleted'),
  noteTypeDetected: (uid: string, noteType: string) =>
    track(uid, 'note_type_detected', { noteType }),

  shoppingListCreated: (uid: string) =>
    track(uid, 'shopping_list_created', { noteType: 'shopping' }),
  medicationNoteCreated: (uid: string) =>
    track(uid, 'medication_note_created', { noteType: 'medication' }),
  reminderCreated: (uid: string) =>
    track(uid, 'reminder_created', { noteType: 'reminder' }),
  taskCreated: (uid: string) =>
    track(uid, 'task_created', { noteType: 'task' }),

  scanStarted: (uid: string, source?: string) =>
    track(uid, 'scan_started', { source }),
  scanSuccess: (uid: string, opts: { scanType?: string; source?: string; durationMs?: number }) =>
    track(uid, 'scan_success', opts),
  scanFailed: (uid: string, opts: { errorCode?: string; source?: string }) =>
    track(uid, 'scan_failed', opts),

  transferStarted: (uid: string, opts: { transferType?: string; fileSizeBytes?: number }) =>
    track(uid, 'transfer_started', opts),
  transferCompleted: (uid: string, opts: { transferType?: string; durationMs?: number }) =>
    track(uid, 'transfer_completed', opts),
  transferFailed: (uid: string, opts: { transferType?: string; errorCode?: string }) =>
    track(uid, 'transfer_failed', opts),

  featureOpened: (uid: string, feature: string) =>
    track(uid, 'feature_opened', { feature }),
  errorLogged: (uid: string, errorCode: string, feature?: string) =>
    track(uid, 'error_logged', { errorCode, ...(feature ? { feature } : {}) }),
};
