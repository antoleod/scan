/**
 * Admin Relay Actions — admin-only mutations for cloud relay control.
 *
 * All functions verify the caller is an admin before writing.
 * Used by the Admin Cloud Relay Control UI (Phase 5).
 */
import {
  doc,
  setDoc,
  updateDoc,
  increment,
  runTransaction,
  getDocs,
  collection,
  query,
  where,
} from 'firebase/firestore';
import { getFirebaseRuntimeSnapshot } from './firebase';
import { isAdmin } from './adminRole';
import { createAdminAlert } from './adminAlertsService';
import { getGlobalRelayState, getUserRelayUsage } from './transferQuotaService';
import { currentPeriodKey, type QuotaPeriod, defaultGlobalState } from './cloudRelayConfig';
import { diag } from './diagnostics';

const GLOBAL_PATH = 'cloudRelay/globalState';
const USAGE_BASE  = 'cloudRelay/userUsage';

async function assertAdmin(callerUid: string): Promise<void> {
  if (!(await isAdmin(callerUid))) throw new Error('PERMISSION_DENIED: admin required');
}

// ── Relay on/off ──────────────────────────────────────────────────────────────

export async function enableCloudRelay(callerUid: string): Promise<void> {
  await assertAdmin(callerUid);
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) throw new Error('Firebase unavailable');
  const current = await getGlobalRelayState() ?? defaultGlobalState();
  await setDoc(doc(rt.db, GLOBAL_PATH), {
    ...current,
    enabled: true,
    emergencyStop: false,
    disabledReason: null,
    disabledAt: null,
    disabledBy: null,
    lastUpdatedAt: Date.now(),
  });
  void diag.info('adminRelay.enabled', { by: callerUid });
}

export async function disableCloudRelay(callerUid: string, reason = 'admin_manual'): Promise<void> {
  await assertAdmin(callerUid);
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) throw new Error('Firebase unavailable');
  const current = await getGlobalRelayState() ?? defaultGlobalState();
  await setDoc(doc(rt.db, GLOBAL_PATH), {
    ...current,
    enabled: false,
    disabledReason: reason,
    disabledAt: Date.now(),
    disabledBy: callerUid,
    lastUpdatedAt: Date.now(),
  });
  void diag.info('adminRelay.disabled', { by: callerUid, reason });
}

export async function setEmergencyStop(callerUid: string, active: boolean): Promise<void> {
  await assertAdmin(callerUid);
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) throw new Error('Firebase unavailable');
  await updateDoc(doc(rt.db, GLOBAL_PATH), {
    emergencyStop: active,
    enabled: active ? false : (await getGlobalRelayState())?.enabled ?? false,
    lastUpdatedAt: Date.now(),
    ...(active ? { disabledReason: 'emergency_stop', disabledBy: callerUid, disabledAt: Date.now() } : {}),
  });
  if (active) {
    void createAdminAlert({
      type: 'relay_auto_disabled', severity: 'critical',
      message: `Emergency stop activated by admin ${callerUid.slice(0, 8)}.`,
      code: 'CLOUD_RELAY_DISABLED',
    });
  }
  void diag.info('adminRelay.emergency_stop', { active, by: callerUid });
}

// ── Quota reset ───────────────────────────────────────────────────────────────

export async function resetGlobalQuotaPeriod(callerUid: string): Promise<void> {
  await assertAdmin(callerUid);
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) throw new Error('Firebase unavailable');
  const current = await getGlobalRelayState() ?? defaultGlobalState();
  const newPeriod = currentPeriodKey(current.quotaPeriod as QuotaPeriod);
  await setDoc(doc(rt.db, GLOBAL_PATH), {
    ...current,
    currentPeriodKey: newPeriod,
    globalUsedBytes: 0,
    globalReservedBytes: 0,
    activeTransfersCount: 0,
    lastUpdatedAt: Date.now(),
  });
  void diag.info('adminRelay.quota_reset', { by: callerUid, newPeriod });
}

export async function resetUserQuota(callerUid: string, targetUid: string): Promise<void> {
  await assertAdmin(callerUid);
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) throw new Error('Firebase unavailable');
  const global = await getGlobalRelayState() ?? defaultGlobalState();
  const periodKey = currentPeriodKey(global.quotaPeriod as QuotaPeriod);
  const usagePath = `${USAGE_BASE}/${targetUid}/${periodKey}`;
  const existing = await getUserRelayUsage(targetUid, periodKey);
  await setDoc(doc(rt.db, usagePath), {
    ...(existing ?? { uid: targetUid, periodKey, limitBytes: global.maxUserBytesPerPeriod, role: 'user' }),
    usedBytes: 0,
    reservedBytes: 0,
    activeTransfersCount: 0,
    blocked: false,
    blockedReason: null,
    lastTransferAt: null,
  });
  void diag.info('adminRelay.user_quota_reset', { by: callerUid, targetUid: targetUid.slice(0, 8) });
}

// ── User block / unblock ──────────────────────────────────────────────────────

export async function blockUserCloudTransfer(
  callerUid: string,
  targetUid: string,
  reason: string,
): Promise<void> {
  await assertAdmin(callerUid);
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) throw new Error('Firebase unavailable');
  const global = await getGlobalRelayState() ?? defaultGlobalState();
  const periodKey = currentPeriodKey(global.quotaPeriod as QuotaPeriod);
  const existing = await getUserRelayUsage(targetUid, periodKey) ?? {
    uid: targetUid, periodKey, usedBytes: 0, reservedBytes: 0,
    limitBytes: global.maxUserBytesPerPeriod, activeTransfersCount: 0, role: 'user', blocked: false,
  };
  await setDoc(doc(rt.db, `${USAGE_BASE}/${targetUid}/${periodKey}`), {
    ...existing, blocked: true, blockedReason: reason,
  });
  void diag.info('adminRelay.user_blocked', { by: callerUid, targetUid: targetUid.slice(0, 8), reason });
}

export async function unblockUserCloudTransfer(callerUid: string, targetUid: string): Promise<void> {
  await assertAdmin(callerUid);
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) throw new Error('Firebase unavailable');
  const global = await getGlobalRelayState() ?? defaultGlobalState();
  const periodKey = currentPeriodKey(global.quotaPeriod as QuotaPeriod);
  const existing = await getUserRelayUsage(targetUid, periodKey);
  if (!existing) return;
  await setDoc(doc(rt.db, `${USAGE_BASE}/${targetUid}/${periodKey}`), {
    ...existing, blocked: false, blockedReason: null,
  });
  void diag.info('adminRelay.user_unblocked', { by: callerUid, targetUid: targetUid.slice(0, 8) });
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

/**
 * Mark expired transferSessions as 'expired' and release their reserved bytes.
 * Called manually by admin or by Phase 9 cleanup service.
 */
export async function forceCleanupExpiredTransfers(callerUid: string): Promise<{ cleaned: number; errors: number }> {
  await assertAdmin(callerUid);
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) return { cleaned: 0, errors: 0 };
  const db = rt.db;

  const now = Date.now();
  let cleaned = 0;
  let errors = 0;

  try {
    const snap = await getDocs(
      query(
        collection(db, 'transferSessions'),
        where('status', 'in', ['reserved', 'uploading']),
        where('expiresAt', '<=', now),
      )
    );

    for (const d of snap.docs) {
      try {
        await runTransaction(db, async (tx) => {
          tx.update(d.ref, { status: 'expired' });
          const data = d.data() as { ownerUid: string; reservedBytes: number };
          if (data.reservedBytes > 0) {
            tx.update(doc(db, GLOBAL_PATH), {
              globalReservedBytes: increment(-data.reservedBytes),
              activeTransfersCount: increment(-1),
            });
          }
        });
        cleaned++;
      } catch { errors++; }
    }
  } catch (e) {
    void diag.warn('adminRelay.cleanup.error', { error: String(e) });
    errors++;
  }

  if (errors > 0) {
    void createAdminAlert({
      type: 'cleanup_failed', severity: 'warn',
      message: `Cleanup completed with ${errors} errors. ${cleaned} sessions cleaned.`,
      code: 'TRANSFER_EXPIRED',
    });
  }
  void diag.info('adminRelay.cleanup', { cleaned, errors, by: callerUid });
  return { cleaned, errors };
}
