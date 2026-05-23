import { getDownloadURL, ref, uploadString } from 'firebase/storage';
import { initFirebaseRuntime } from './firebase';
import { diag } from './diagnostics';

function safePathPart(value: string): string {
  return String(value || 'file').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
}

export async function uploadDataUrlToCloudStorage(
  dataUrl: string,
  folder: 'notes' | 'clipboard' | 'backups' | 'airdrop',
  fileName: string,
): Promise<string | null> {
  const rt = await initFirebaseRuntime();
  const uid = rt.auth?.currentUser?.uid;
  if (!rt.enabled || !rt.storage || !uid || !dataUrl.startsWith('data:')) return null;

  try {
    const path = `users/${uid}/${folder}/${Date.now()}_${safePathPart(fileName)}`;
    const fileRef = ref(rt.storage, path);
    await uploadString(fileRef, dataUrl, 'data_url');
    const url = await getDownloadURL(fileRef);
    await diag.info('cloudStorage.upload.ok', { folder, path });
    return url;
  } catch (error) {
    await diag.warn('cloudStorage.upload.error', { folder, message: String(error) });
    return null;
  }
}

export async function uploadJsonBackupToCloudStorage(
  json: string,
  fileName = 'mykit-backup.json',
): Promise<string | null> {
  if (typeof btoa !== 'function') return null;
  const encoded = btoa(unescape(encodeURIComponent(json)));
  return uploadDataUrlToCloudStorage(
    `data:application/json;base64,${encoded}`,
    'backups',
    fileName,
  );
}
