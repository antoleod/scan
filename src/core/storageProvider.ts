/**
 * StorageProvider interface + FirebaseStorageProvider.
 *
 * The interface is intentionally thin so a future CloudflareR2Provider can be
 * swapped in without touching the TransferService layer (Phase 12).
 *
 * ENCRYPTION NOTE: All uploads are currently UNENCRYPTED (encryption pending
 * Phase 11). Files are stored as-is in Firebase Storage. Do not claim E2E
 * encryption in the UI until Phase 11 is complete.
 */
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  type UploadTask,
  type StorageReference,
} from 'firebase/storage';
import { getFirebaseRuntimeSnapshot } from './firebase';
import { diag } from './diagnostics';

// ── Interface ─────────────────────────────────────────────────────────────────

export interface UploadProgress {
  bytesTransferred: number;
  totalBytes: number;
  fraction: number; // 0-1
  state: 'running' | 'paused' | 'success' | 'error' | 'canceled';
}

export interface UploadResult {
  downloadUrl: string;
  storagePath: string;
  bytesUploaded: number;
}

export interface StorageProvider {
  readonly name: string;
  upload(
    path: string,
    data: Uint8Array,
    mimeType: string,
    onProgress?: (p: UploadProgress) => void,
    signal?: AbortSignal,
  ): Promise<UploadResult>;

  download(path: string): Promise<Uint8Array>;

  delete(path: string): Promise<void>;

  /** Optional: get a short-lived download URL without downloading the bytes. */
  getDownloadUrl?(path: string): Promise<string>;
}

// ── Firebase Storage provider ─────────────────────────────────────────────────

export class FirebaseStorageProvider implements StorageProvider {
  readonly name = 'firebase_storage';

  async upload(
    path: string,
    data: Uint8Array,
    mimeType: string,
    onProgress?: (p: UploadProgress) => void,
    signal?: AbortSignal,
  ): Promise<UploadResult> {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.storage) throw new Error('Firebase Storage not available');

    const storageRef: StorageReference = ref(rt.storage, path);
    // Copy into a plain ArrayBuffer so Blob constructor is happy with strict lib types.
    const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    const blob = new Blob([buf], { type: mimeType });
    const task: UploadTask = uploadBytesResumable(storageRef, blob, { contentType: mimeType });

    // Cancel on abort signal
    signal?.addEventListener('abort', () => task.cancel());

    return new Promise<UploadResult>((resolve, reject) => {
      task.on(
        'state_changed',
        (snap) => {
          onProgress?.({
            bytesTransferred: snap.bytesTransferred,
            totalBytes: snap.totalBytes,
            fraction: snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0,
            state: snap.state as UploadProgress['state'],
          });
        },
        (err) => {
          void diag.warn('storageProvider.upload_failed', { path, error: err.message });
          reject(err);
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(task.snapshot.ref);
            resolve({ downloadUrl, storagePath: path, bytesUploaded: data.byteLength });
          } catch (e) { reject(e); }
        },
      );
    });
  }

  async download(path: string): Promise<Uint8Array> {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.storage) throw new Error('Firebase Storage not available');
    const storageRef = ref(rt.storage, path);
    const url = await getDownloadURL(storageRef);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  async delete(path: string): Promise<void> {
    try {
      const rt = await getFirebaseRuntimeSnapshot();
      if (!rt.enabled || !rt.storage) return;
      await deleteObject(ref(rt.storage, path));
      void diag.info('storageProvider.deleted', { path });
    } catch (e) {
      void diag.warn('storageProvider.delete_failed', { path, error: String(e) });
    }
  }

  async getDownloadUrl(path: string): Promise<string> {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.storage) throw new Error('Firebase Storage not available');
    return getDownloadURL(ref(rt.storage, path));
  }
}

/** Shared singleton — created lazily so Firebase init can complete first. */
let _provider: StorageProvider | null = null;
export function getStorageProvider(): StorageProvider {
  if (!_provider) _provider = new FirebaseStorageProvider();
  return _provider;
}

/** Override for tests. */
export function setStorageProvider(p: StorageProvider): void {
  _provider = p;
}
