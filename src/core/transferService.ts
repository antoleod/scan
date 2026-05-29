/**
 * TransferService — cloud relay upload/download orchestration.
 *
 * This is the Phase 7 architecture. Phase 8 wires the real Firebase Storage
 * upload/download. Currently this service validates the quota, orchestrates
 * the provider calls, updates session state, and handles cleanup.
 *
 * Hard rules:
 *  - All uploads go through requestCloudTransferPermission() first.
 *  - Files are deleted after download if deleteAfterDownload is set.
 *  - No file bytes go through Firestore or RTDB.
 *  - Progress is reported via onProgress callbacks — never stored.
 *  - ENCRYPTION: currently passes through unencrypted (Phase 11 pending).
 */
import { doc, updateDoc } from 'firebase/firestore';
import { getFirebaseRuntimeSnapshot } from './firebase';
import {
  requestCloudTransferPermission,
  finalizeTransfer,
  releaseTransferReservation,
  completeTransfer,
  type PreflightResult,
} from './transferQuotaService';
import { getStorageProvider, type UploadProgress } from './storageProvider';
import { encryptFileToTemp, decryptFileFromTemp, prepareEncryption } from './cryptoService';
import { createAdminAlert } from './adminAlertsService';
import { diag } from './diagnostics';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TransferPhase =
  | 'idle'
  | 'preflight'
  | 'encrypting'
  | 'uploading'
  | 'waiting_receiver'
  | 'downloading'
  | 'decrypting'
  | 'done'
  | 'error'
  | 'denied';

export interface TransferState {
  phase: TransferPhase;
  sessionId?: string;
  progress?: UploadProgress;
  errorCode?: string;
  userMessage?: string;
  encryptionEnabled: boolean; // false until Phase 11
}

export interface SendOptions {
  uid: string;
  filename: string;
  data: Uint8Array;
  mimeType: string;
  onState?: (state: TransferState) => void;
  signal?: AbortSignal;
}

export interface ReceiveOptions {
  uid: string;
  sessionId: string;
  storagePath: string;
  onState?: (state: TransferState) => void;
  signal?: AbortSignal;
}

// ── Storage path helper ───────────────────────────────────────────────────────

export function buildStoragePath(uid: string, sessionId: string, filename: string): string {
  // Sanitize filename: keep extension, replace unsafe chars
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `transfers/${uid}/${sessionId}/${safe}`;
}

// ── Send (upload) ─────────────────────────────────────────────────────────────

/**
 * Full sender flow:
 *   1. Preflight quota check
 *   2. Encrypt (placeholder — no-op until Phase 11)
 *   3. Upload to Firebase Storage
 *   4. Finalize quota reservation
 *   5. Update session status to 'ready'
 */
export async function sendFile(opts: SendOptions): Promise<TransferState> {
  const emit = (state: TransferState) => opts.onState?.(state);

  try {
    // Step 1: Preflight
    emit({ phase: 'preflight', encryptionEnabled: false });
    const sessionId = `ts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const storagePath = buildStoragePath(opts.uid, sessionId, opts.filename);

    const preflight: PreflightResult = await requestCloudTransferPermission(
      opts.uid,
      opts.data.byteLength,
      opts.filename,
      storagePath,
    );
    if (!preflight.allowed || !preflight.sessionId) {
      const denied: TransferState = {
        phase: 'denied',
        errorCode: preflight.errorCode,
        userMessage: preflight.userMessage,
        encryptionEnabled: false,
      };
      emit(denied);
      return denied;
    }
    const confirmedSessionId = preflight.sessionId;

    // Step 2: Encrypt (placeholder)
    emit({ phase: 'encrypting', sessionId: confirmedSessionId, encryptionEnabled: false });
    const { key } = await prepareEncryption();
    const encrypted = await encryptFileToTemp(opts.data, key);

    // Step 3: Upload
    emit({ phase: 'uploading', sessionId: confirmedSessionId, encryptionEnabled: false });
    const provider = getStorageProvider();
    try {
      await provider.upload(storagePath, encrypted.data, opts.mimeType, (progress) => {
        emit({ phase: 'uploading', sessionId: confirmedSessionId, progress, encryptionEnabled: false });
      }, opts.signal);
    } catch (e) {
      await releaseTransferReservation(confirmedSessionId, opts.uid);
      throw e;
    }

    // Step 4: Finalize
    await finalizeTransfer(confirmedSessionId, opts.uid);

    // Step 5: Update session status
    try {
      const rt = await getFirebaseRuntimeSnapshot();
      if (rt.enabled && rt.db) {
        await updateDoc(doc(rt.db, `transferSessions/${confirmedSessionId}`), {
          status: 'ready',
          uploadedAt: Date.now(),
          storagePath,
        });
      }
    } catch { /* non-fatal */ }

    const done: TransferState = {
      phase: 'done',
      sessionId: confirmedSessionId,
      encryptionEnabled: false,
    };
    emit(done);
    void diag.info('transfer.send.complete', { sessionId: confirmedSessionId, bytes: opts.data.byteLength });
    return done;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void diag.error('transfer.send.error', { error: msg });
    const errState: TransferState = { phase: 'error', errorCode: 'TRANSFER_FAILED', userMessage: msg, encryptionEnabled: false };
    emit(errState);
    return errState;
  }
}

// ── Receive (download) ────────────────────────────────────────────────────────

/**
 * Full receiver flow:
 *   1. Download bytes from Firebase Storage
 *   2. Decrypt (placeholder — no-op until Phase 11)
 *   3. Mark transfer completed + delete cloud file
 */
export async function receiveFile(opts: ReceiveOptions): Promise<{ data: Uint8Array; state: TransferState }> {
  const emit = (state: TransferState) => opts.onState?.(state);

  try {
    emit({ phase: 'downloading', sessionId: opts.sessionId, encryptionEnabled: false });
    const provider = getStorageProvider();
    const encryptedData = await provider.download(opts.storagePath);

    emit({ phase: 'decrypting', sessionId: opts.sessionId, encryptionEnabled: false });
    // Placeholder decryption — pass through as-is
    const decrypted = await decryptFileFromTemp(
      { data: encryptedData, iv: new Uint8Array(12), keyId: '' },
      { keyId: '', key: null },
    );

    // Mark transfer complete + cleanup
    await completeTransfer(opts.sessionId, opts.uid);
    try {
      await provider.delete(opts.storagePath);
    } catch (e) {
      void createAdminAlert({
        type: 'delete_failed', severity: 'warn',
        message: `Cloud file delete failed after download: ${opts.storagePath}`,
        code: 'TRANSFER_EXPIRED',
        sessionId: opts.sessionId,
        uid: opts.uid,
      });
    }

    const done: TransferState = { phase: 'done', sessionId: opts.sessionId, encryptionEnabled: false };
    emit(done);
    void diag.info('transfer.receive.complete', { sessionId: opts.sessionId, bytes: decrypted.byteLength });
    return { data: decrypted, state: done };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void diag.error('transfer.receive.error', { sessionId: opts.sessionId, error: msg });
    const errState: TransferState = { phase: 'error', errorCode: 'TRANSFER_FAILED', userMessage: msg, encryptionEnabled: false };
    emit(errState);
    return { data: new Uint8Array(0), state: errState };
  }
}
