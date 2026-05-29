/**
 * Admin Alerts Service — create, read, and manage admin alerts.
 *
 * Alerts are written to Firestore `adminAlerts/{alertId}`.
 * Only admins and testers can read them.
 * Alert creation is fire-and-forget — it must never crash the calling code.
 */
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  limit,
} from 'firebase/firestore';
import { getFirebaseRuntimeSnapshot } from './firebase';
import { diag } from './diagnostics';
import type { AdminAlert, AlertType, AlertSeverity, CloudRelayErrorCode } from './cloudRelayConfig';

// ── Create ────────────────────────────────────────────────────────────────────

export interface CreateAlertInput {
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  code: CloudRelayErrorCode | string;
  uid?: string;
  sessionId?: string;
  usedBytes?: number;
  limitBytes?: number;
  threshold?: number;
}

/**
 * Fire-and-forget alert creation. Never throws.
 */
export async function createAdminAlert(input: CreateAlertInput): Promise<void> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return;

    const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const alert: AdminAlert = {
      alertId,
      type: input.type,
      severity: input.severity,
      message: input.message,
      code: input.code,
      uid: input.uid,
      sessionId: input.sessionId,
      usedBytes: input.usedBytes,
      limitBytes: input.limitBytes,
      threshold: input.threshold,
      createdAt: Date.now(),
      read: false,
      resolved: false,
    };

    await setDoc(doc(rt.db, `adminAlerts/${alertId}`), alert);
    void diag.info('adminAlerts.created', { alertId, type: input.type, severity: input.severity });
  } catch (e) {
    void diag.warn('adminAlerts.create_failed', { error: String(e), type: input.type });
  }
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function loadAdminAlerts(opts: {
  unreadOnly?: boolean;
  maxResults?: number;
}): Promise<AdminAlert[]> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return [];

    const constraints = [orderBy('createdAt', 'desc'), limit(opts.maxResults ?? 100)];
    if (opts.unreadOnly) constraints.push(where('read', '==', false) as never);

    const snap = await getDocs(query(collection(rt.db, 'adminAlerts'), ...constraints));
    return snap.docs.map((d) => d.data() as AdminAlert);
  } catch (e) {
    void diag.warn('adminAlerts.load_failed', { error: String(e) });
    return [];
  }
}

export async function countUnreadAlerts(): Promise<number> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return 0;
    const snap = await getDocs(
      query(collection(rt.db, 'adminAlerts'), where('read', '==', false), limit(99))
    );
    return snap.size;
  } catch { return 0; }
}

// ── Manage ────────────────────────────────────────────────────────────────────

export async function markAlertRead(alertId: string): Promise<void> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return;
    await updateDoc(doc(rt.db, `adminAlerts/${alertId}`), { read: true });
  } catch (e) {
    void diag.warn('adminAlerts.mark_read_failed', { alertId, error: String(e) });
  }
}

export async function resolveAlert(alertId: string): Promise<void> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return;
    await updateDoc(doc(rt.db, `adminAlerts/${alertId}`), { resolved: true, read: true });
  } catch (e) {
    void diag.warn('adminAlerts.resolve_failed', { alertId, error: String(e) });
  }
}
