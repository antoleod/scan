/**
 * Transfer Quota Service — preflight permission check and reservation logic.
 *
 * The preflight function `requestCloudTransferPermission()` is the single gate
 * all cloud relay uploads must pass through. It:
 *  1. Reads current global state from Firestore (cloudRelay/globalState)
 *  2. Reads user usage from cloudRelay/userUsage/{uid}/{periodKey}
 *  3. Validates all limits
 *  4. If allowed: atomically reserves bytes in both user and global records
 *     and creates a transferSessions/{sessionId} document
 *  5. If denied: returns an error code WITHOUT writing anything
 *
 * Quota is enforced server-side (Firestore) — never trust client-only counters.
 * The Firestore transaction ensures atomicity even under concurrent uploads.
 *
 * Cloud relay is DISABLED by default. The global state document must be
 * explicitly created by an admin with enabled: true to allow transfers.
 */
import {
  doc,
  getDoc,
  runTransaction,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseRuntimeSnapshot } from './firebase';
import { getAdminRole } from './adminRole';
import { createAdminAlert } from './adminAlertsService';
import { diag } from './diagnostics';
import {
  type GlobalRelayState,
  type UserRelayUsage,
  type TransferSession,
  type CloudRelayErrorCode,
  type QuotaPeriod,
  currentPeriodKey,
  defaultGlobalState,
  WARNING_THRESHOLDS,
  USER_FACING_MESSAGES,
} from './cloudRelayConfig';

// ── Constants ─────────────────────────────────────────────────────────────────

const GLOBAL_STATE_PATH = 'cloudRelay/globalState';
const USER_USAGE_BASE   = 'cloudRelay/userUsage';
const SESSIONS_BASE     = 'transferSessions';

// ── Read helpers ──────────────────────────────────────────────────────────────

export async function getGlobalRelayState(): Promise<GlobalRelayState | null> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return null;
    const snap = await getDoc(doc(rt.db, GLOBAL_STATE_PATH));
    if (!snap.exists()) return null;
    return snap.data() as GlobalRelayState;
  } catch (e) {
    void diag.warn('quota.global_state.read_failed', { error: String(e) });
    return null;
  }
}

export async function getUserRelayUsage(uid: string, periodKey: string): Promise<UserRelayUsage | null> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return null;
    const snap = await getDoc(doc(rt.db, `${USER_USAGE_BASE}/${uid}/${periodKey}`));
    if (!snap.exists()) return null;
    return snap.data() as UserRelayUsage;
  } catch (e) {
    void diag.warn('quota.user_usage.read_failed', { uid, error: String(e) });
    return null;
  }
}

// ── Preflight ─────────────────────────────────────────────────────────────────

export interface PreflightResult {
  allowed: boolean;
  sessionId?: string;
  errorCode?: CloudRelayErrorCode;
  userMessage?: string;
}

/**
 * Request permission to start a cloud relay transfer.
 *
 * Must be called BEFORE any upload begins. Returns either:
 * - `{ allowed: true, sessionId }` — caller may proceed with upload
 * - `{ allowed: false, errorCode, userMessage }` — upload must be blocked
 *
 * Atomically reserves `fileSizeBytes` in both user and global usage ledgers,
 * and creates a transferSessions document with status 'reserved'.
 */
export async function requestCloudTransferPermission(
  uid: string,
  fileSizeBytes: number,
  filename: string,
  storagePath: string,
): Promise<PreflightResult> {
  const deny = (code: CloudRelayErrorCode): PreflightResult => ({
    allowed: false,
    errorCode: code,
    userMessage: USER_FACING_MESSAGES[code],
  });

  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return deny('CLOUD_RELAY_DISABLED');
    const db = rt.db;

    // Get user role for file-size limit
    const role = await getAdminRole(uid);

    const sessionId = `transfer_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    let createAlert = false;
    let alertCode: string = '';

    // Atomic transaction: read current state, validate, reserve
    const result = await runTransaction(db, async (tx) => {
      // Read global state
      const globalSnap = await tx.get(doc(db, GLOBAL_STATE_PATH));
      const global: GlobalRelayState = globalSnap.exists()
        ? (globalSnap.data() as GlobalRelayState)
        : defaultGlobalState();

      // Check 1: relay enabled
      if (!global.enabled || global.emergencyStop) {
        return deny('CLOUD_RELAY_DISABLED');
      }

      // Check 2: file size limit
      const maxFileSize = (role === 'admin' || role === 'tester')
        ? global.maxFileSizeBytesTester
        : global.maxFileSizeBytesUser;
      if (fileSizeBytes > maxFileSize) {
        return deny('FILE_TOO_LARGE');
      }

      // Check 3: global quota
      const globalTotalAfter = global.globalUsedBytes + global.globalReservedBytes + fileSizeBytes;
      if (globalTotalAfter > global.globalLimitBytes) {
        return deny('GLOBAL_QUOTA_EXCEEDED');
      }

      // Check 4: user usage
      const periodKey = currentPeriodKey(global.quotaPeriod as QuotaPeriod);
      const userRef = doc(db, `${USER_USAGE_BASE}/${uid}/${periodKey}`);
      const userSnap = await tx.get(userRef);
      const usage: UserRelayUsage = userSnap.exists()
        ? (userSnap.data() as UserRelayUsage)
        : {
            uid, periodKey,
            usedBytes: 0, reservedBytes: 0,
            limitBytes: global.maxUserBytesPerPeriod,
            activeTransfersCount: 0,
            blocked: false, role,
          };

      if (usage.blocked) return deny('TRANSFER_PERMISSION_DENIED');

      const userTotalAfter = usage.usedBytes + usage.reservedBytes + fileSizeBytes;
      if (userTotalAfter > usage.limitBytes) return deny('USER_QUOTA_EXCEEDED');

      // Check 5: concurrent transfers
      if (usage.activeTransfersCount >= global.maxActiveTransfersPerUser) {
        return deny('TOO_MANY_ACTIVE_TRANSFERS');
      }

      // ── All checks passed — reserve ──
      const expiresAt = Date.now() + global.transferExpiryMinutes * 60_000;
      const session: TransferSession = {
        sessionId, ownerUid: uid, filename,
        sizeBytes: fileSizeBytes, storagePath,
        provider: 'firebase_storage',
        status: 'reserved',
        reservedBytes: fileSizeBytes,
        createdAt: Date.now(), expiresAt,
      };

      // Write session
      tx.set(doc(db, `${SESSIONS_BASE}/${sessionId}`), session);

      // Update user usage
      tx.set(userRef, {
        ...usage,
        reservedBytes: usage.reservedBytes + fileSizeBytes,
        activeTransfersCount: usage.activeTransfersCount + 1,
        lastTransferAt: Date.now(),
      });

      // Update global state
      tx.set(doc(db, GLOBAL_STATE_PATH), {
        ...global,
        globalReservedBytes: global.globalReservedBytes + fileSizeBytes,
        activeTransfersCount: global.activeTransfersCount + 1,
        lastUpdatedAt: Date.now(),
      });

      // Check warning thresholds to create alerts after tx
      const globalPct = globalTotalAfter / global.globalLimitBytes;
      const userPct = userTotalAfter / usage.limitBytes;
      if (globalPct >= WARNING_THRESHOLDS[3]) { createAlert = true; alertCode = 'GLOBAL_QUOTA_EXCEEDED'; }
      else if (globalPct >= WARNING_THRESHOLDS[2]) { createAlert = true; alertCode = 'global_90'; }
      else if (globalPct >= WARNING_THRESHOLDS[1]) { createAlert = true; alertCode = 'global_80'; }
      if (userPct >= WARNING_THRESHOLDS[3]) { createAlert = true; alertCode = 'USER_QUOTA_EXCEEDED'; }
      else if (userPct >= WARNING_THRESHOLDS[1]) { createAlert = true; alertCode = `user_80_${uid.slice(0, 8)}`; }

      return { allowed: true, sessionId } as PreflightResult;
    });

    if (result.allowed && createAlert) {
      void createAdminAlert({
        type: alertCode.startsWith('user') ? 'user_quota_warning' : 'global_quota_warning',
        severity: alertCode.includes('100') || alertCode.includes('EXCEEDED') ? 'critical' : 'warn',
        message: `Quota threshold reached: ${alertCode}`,
        code: alertCode,
        uid,
        usedBytes: fileSizeBytes,
        limitBytes: 0,
        threshold: 0.8,
      });
    }

    void diag.info('quota.preflight', {
      allowed: result.allowed,
      errorCode: result.errorCode,
      fileSizeBytes,
      uid: uid.slice(0, 8),
    });

    // Check global shutdown after every preflight (best-effort, fire-and-forget)
    void checkAndApplyGlobalShutdown();

    return result;
  } catch (e) {
    void diag.error('quota.preflight.error', { error: String(e), uid: uid.slice(0, 8) });
    return deny('TRANSFER_PERMISSION_DENIED');
  }
}

// ── Release / finalize ────────────────────────────────────────────────────────

/**
 * Called after a successful upload: moves bytes from reserved → used.
 */
export async function finalizeTransfer(sessionId: string, uid: string): Promise<void> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return;
    const db = rt.db;

    const sessionRef = doc(db, `${SESSIONS_BASE}/${sessionId}`);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;
    const session = sessionSnap.data() as TransferSession;
    if (session.status !== 'reserved' && session.status !== 'uploading') return;

    const global = await getGlobalRelayState();
    const periodKey = currentPeriodKey(global?.quotaPeriod as QuotaPeriod ?? 'monthly');
    const userRef = doc(db, `${USER_USAGE_BASE}/${uid}/${periodKey}`);

    await runTransaction(db, async (tx) => {
      tx.update(sessionRef, { status: 'ready', uploadedAt: Date.now() });
      tx.update(doc(db, GLOBAL_STATE_PATH), {
        globalUsedBytes: increment(session.reservedBytes),
        globalReservedBytes: increment(-session.reservedBytes),
      });
      tx.update(userRef, {
        usedBytes: increment(session.reservedBytes),
        reservedBytes: increment(-session.reservedBytes),
      });
    });
    void diag.info('quota.finalize', { sessionId, bytes: session.reservedBytes });
  } catch (e) {
    void diag.warn('quota.finalize.error', { sessionId, error: String(e) });
  }
}

/**
 * Called when a transfer is cancelled, failed, or expired: releases reserved bytes.
 */
export async function releaseTransferReservation(sessionId: string, uid: string): Promise<void> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return;
    const db = rt.db;

    const sessionRef = doc(db, `${SESSIONS_BASE}/${sessionId}`);
    const sessionSnap = await getDoc(sessionRef);
    if (!sessionSnap.exists()) return;
    const session = sessionSnap.data() as TransferSession;
    if (!['reserved', 'uploading', 'failed'].includes(session.status)) return;

    const global = await getGlobalRelayState();
    const periodKey = currentPeriodKey(global?.quotaPeriod as QuotaPeriod ?? 'monthly');
    const userRef = doc(db, `${USER_USAGE_BASE}/${uid}/${periodKey}`);

    await runTransaction(db, async (tx) => {
      tx.update(sessionRef, { status: 'failed' });
      tx.update(doc(db, GLOBAL_STATE_PATH), {
        globalReservedBytes: increment(-session.reservedBytes),
        activeTransfersCount: increment(-1),
      });
      tx.update(userRef, {
        reservedBytes: increment(-session.reservedBytes),
        activeTransfersCount: increment(-1),
      });
    });
    void diag.info('quota.release', { sessionId, bytes: session.reservedBytes });
  } catch (e) {
    void diag.warn('quota.release.error', { sessionId, error: String(e) });
  }
}

/**
 * Called after a successful download + delete: marks the session as completed.
 * Also decrements activeTransfersCount.
 */
export async function completeTransfer(sessionId: string, uid: string): Promise<void> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return;
    const db = rt.db;

    const sessionRef = doc(db, `${SESSIONS_BASE}/${sessionId}`);
    await updateDoc(sessionRef, { status: 'completed', downloadedAt: Date.now() });

    const global = await getGlobalRelayState();
    const periodKey = currentPeriodKey(global?.quotaPeriod as QuotaPeriod ?? 'monthly');

    await runTransaction(db, async (tx) => {
      tx.update(doc(db, GLOBAL_STATE_PATH), { activeTransfersCount: increment(-1) });
      tx.update(doc(db, `${USER_USAGE_BASE}/${uid}/${periodKey}`), { activeTransfersCount: increment(-1) });
    });
    void diag.info('quota.complete', { sessionId });
  } catch (e) {
    void diag.warn('quota.complete.error', { sessionId, error: String(e) });
  }
}

// ── Auto-shutdown ─────────────────────────────────────────────────────────────

/**
 * Called by preflight and a periodic check. If global usage >= limit,
 * disables the relay and creates a critical alert.
 * This is the Phase 6 shutdown gate — present here so quota logic is co-located.
 */
export async function checkAndApplyGlobalShutdown(): Promise<void> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return;
    const global = await getGlobalRelayState();
    if (!global || !global.enabled) return;

    const total = global.globalUsedBytes + global.globalReservedBytes;
    if (total < global.globalLimitBytes) return;

    // Limit reached — shut down
    await setDoc(doc(rt.db, GLOBAL_STATE_PATH), {
      ...global,
      enabled: false,
      emergencyStop: true,
      disabledReason: 'GLOBAL_QUOTA_EXCEEDED',
      disabledAt: Date.now(),
      disabledBy: 'system_auto_shutdown',
      lastUpdatedAt: Date.now(),
    });

    void createAdminAlert({
      type: 'relay_auto_disabled',
      severity: 'critical',
      message: `Cloud relay automatically disabled: global quota reached (${total} / ${global.globalLimitBytes} bytes).`,
      code: 'GLOBAL_QUOTA_EXCEEDED',
      usedBytes: total,
      limitBytes: global.globalLimitBytes,
      threshold: 1.0,
    });

    void diag.error('quota.global_shutdown', {
      usedBytes: total,
      limitBytes: global.globalLimitBytes,
    });
  } catch (e) {
    void diag.error('quota.shutdown.error', { error: String(e) });
  }
}
