/**
 * Transfer Cleanup Service — handles expired, abandoned, and stuck transfers.
 *
 * Runs periodically via useCloudRelayGuard. Also available as an admin
 * manual action via forceCleanupExpiredTransfers() in adminRelayActions.ts.
 *
 * Cleanup targets:
 *  1. Sessions with status 'reserved'/'uploading' past expiresAt
 *     → Set to 'expired', release reserved bytes, decrement activeTransfersCount
 *  2. Sessions with status 'ready' past expiresAt (receiver never downloaded)
 *     → Set to 'expired', delete cloud file if storagePath set
 *  3. Sessions with status 'completed' that still have a storagePath
 *     → Attempt to delete cloud file (delete-after-download guarantee)
 *
 * Cleanup failures create admin alerts so the operator knows files are orphaned.
 */
import {
  collection,
  doc,
  getDocs,
  increment,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getFirebaseRuntimeSnapshot } from './firebase';
import { getStorageProvider } from './storageProvider';
import { createAdminAlert } from './adminAlertsService';
import { diag } from './diagnostics';
import type { TransferSession } from './cloudRelayConfig';

const SESSIONS_PATH = 'transferSessions';
const GLOBAL_PATH   = 'cloudRelay/globalState';

export interface CleanupReport {
  expiredReleased: number;
  filesDeleted: number;
  deleteFailures: number;
  errors: number;
  ranAt: number;
}

/**
 * Run a full cleanup pass. Safe to call multiple times (idempotent by design).
 */
export async function runCleanupPass(): Promise<CleanupReport> {
  const report: CleanupReport = {
    expiredReleased: 0, filesDeleted: 0, deleteFailures: 0, errors: 0, ranAt: Date.now(),
  };

  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return report;
    const db = rt.db;
    const now = Date.now();

    // ── 1. Expire stuck sessions (reserved/uploading past TTL) ──
    try {
      const stuckSnap = await getDocs(
        query(
          collection(db, SESSIONS_PATH),
          where('status', 'in', ['reserved', 'uploading']),
          where('expiresAt', '<=', now),
        )
      );
      for (const d of stuckSnap.docs) {
        try {
          const session = d.data() as TransferSession;
          await runTransaction(db, async (tx) => {
            tx.update(d.ref, { status: 'expired' });
            if (session.reservedBytes > 0) {
              tx.update(doc(db, GLOBAL_PATH), {
                globalReservedBytes: increment(-session.reservedBytes),
                activeTransfersCount: increment(-1),
              });
            }
          });
          report.expiredReleased++;
        } catch { report.errors++; }
      }
    } catch (e) {
      void diag.warn('cleanup.stuck_sessions.error', { error: String(e) });
      report.errors++;
    }

    // ── 2. Delete cloud files for expired 'ready' sessions ──
    const provider = getStorageProvider();
    try {
      const expiredReadySnap = await getDocs(
        query(
          collection(db, SESSIONS_PATH),
          where('status', 'in', ['ready', 'completed']),
          where('expiresAt', '<=', now),
        )
      );
      for (const d of expiredReadySnap.docs) {
        const session = d.data() as TransferSession;
        if (!session.storagePath || session.deletedAt) continue;
        try {
          await provider.delete(session.storagePath);
          await updateDoc(d.ref, { status: 'deleted', deletedAt: now });
          report.filesDeleted++;
        } catch (e) {
          void diag.warn('cleanup.delete_failed', { sessionId: session.sessionId, error: String(e) });
          report.deleteFailures++;
        }
      }
    } catch (e) {
      void diag.warn('cleanup.expired_ready.error', { error: String(e) });
      report.errors++;
    }

    // ── 3. Delete files for completed sessions (delete-after-download) ──
    try {
      const completedSnap = await getDocs(
        query(
          collection(db, SESSIONS_PATH),
          where('status', '==', 'completed'),
          where('downloadedAt', '>', 0),
        )
      );
      for (const d of completedSnap.docs) {
        const session = d.data() as TransferSession & { downloadedAt?: number };
        if (!session.storagePath || session.deletedAt || !session.downloadedAt) continue;
        try {
          await provider.delete(session.storagePath);
          await updateDoc(d.ref, { deletedAt: now });
          report.filesDeleted++;
        } catch { report.deleteFailures++; }
      }
    } catch { report.errors++; }

  } catch (e) {
    void diag.error('cleanup.pass.error', { error: String(e) });
    report.errors++;
  }

  if (report.deleteFailures > 0) {
    void createAdminAlert({
      type: 'cleanup_failed', severity: 'warn',
      message: `Cleanup pass: ${report.filesDeleted} files deleted, ${report.deleteFailures} delete failures, ${report.expiredReleased} sessions expired.`,
      code: 'TRANSFER_EXPIRED',
    });
  }

  void diag.info('cleanup.pass.complete', report);
  return report;
}
