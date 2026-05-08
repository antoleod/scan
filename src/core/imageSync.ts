import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import { getDatabase, ref, set, get, remove } from 'firebase/database';
import { getFirebaseRuntime } from './firebase';
import { diag } from './diagnostics';

// Max size we target after compression (bytes of base64 string)
const TARGET_SIZE = 600_000; // ~450KB decoded → fine for RTDB relay
const IMAGE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const CACHE_PREFIX = '@MyKit_imgcache_';

// ─── Compression ────────────────────────────────────────────────────────────

async function compressWeb(dataUri: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new (globalThis as any).Image();
    img.onload = () => {
      const MAX_DIM = 1200;
      const ratio = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = (globalThis as any).document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      // Try progressively lower quality until under target
      let quality = 0.75;
      let result = canvas.toDataURL('image/jpeg', quality);
      while (result.length > TARGET_SIZE && quality > 0.25) {
        quality -= 0.15;
        result = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(result);
    };
    img.onerror = () => resolve(dataUri);
    img.src = dataUri;
  });
}

async function compressNative(dataUri: string): Promise<string> {
  try {
    // expo-image-manipulator needs a file URI or http URL, not a data URI.
    // Write data URI to a temp file first via FileSystem, then manipulate.
    // Simpler: if already small enough, skip compression.
    if (dataUri.length <= TARGET_SIZE) return dataUri;

    // Extract base64 part and write to a temp file
    const match = dataUri.match(/^data:(image\/\w+);base64,(.+)$/s);
    if (!match) return dataUri;
    const [, , b64] = match;

    const { FileSystem } = await import('expo-file-system/legacy') as any;
    const tmpPath = `${FileSystem.cacheDirectory}img_compress_${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(tmpPath, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const manipulated = await ImageManipulator.manipulateAsync(
      tmpPath,
      [{ resize: { width: 1200 } }],
      { compress: 0.65, format: ImageManipulator.SaveFormat.JPEG, base64: true },
    );

    await FileSystem.deleteAsync(tmpPath, { idempotent: true });

    if (manipulated.base64) {
      return `data:image/jpeg;base64,${manipulated.base64}`;
    }
    return dataUri;
  } catch (e) {
    await diag.warn('imageSync.compress.native.error', { message: String(e) });
    return dataUri;
  }
}

export async function compressImage(dataUri: string): Promise<string> {
  if (!dataUri.startsWith('data:')) return dataUri;
  if (dataUri.length <= TARGET_SIZE) return dataUri;
  try {
    if (Platform.OS === 'web') return await compressWeb(dataUri);
    return await compressNative(dataUri);
  } catch {
    return dataUri;
  }
}

// ─── RTDB helpers ────────────────────────────────────────────────────────────

function getRtdb() {
  const rt = getFirebaseRuntime();
  if (!rt?.enabled || !rt.app) return null;
  try {
    return getDatabase(rt.app);
  } catch {
    return null;
  }
}

function imageRtdbPath(uid: string, imageId: string) {
  return `users/${uid}/pendingImages/${imageId}`;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export async function uploadImageToRTDB(
  dataUri: string,
  imageId: string,
): Promise<string | null> {
  const rt = getFirebaseRuntime();
  if (!rt?.enabled || !rt.auth?.currentUser) return null;
  const db = getRtdb();
  if (!db) return null;

  try {
    const compressed = await compressImage(dataUri);
    const uid = rt.auth.currentUser.uid;
    const path = imageRtdbPath(uid, imageId);
    await set(ref(db, path), {
      data: compressed,
      uploadedAt: Date.now(),
      expiresAt: Date.now() + IMAGE_TTL_MS,
    });
    await diag.info('imageSync.upload.ok', { imageId, size: compressed.length });
    return path;
  } catch (e) {
    await diag.warn('imageSync.upload.error', { imageId, message: String(e) });
    return null;
  }
}

// ─── Download ────────────────────────────────────────────────────────────────

export async function downloadImageFromRTDB(rtdbPath: string): Promise<string | null> {
  const rt = getFirebaseRuntime();
  if (!rt?.enabled || !rt.app) return null;
  const db = getRtdb();
  if (!db) return null;

  try {
    const snap = await get(ref(db, rtdbPath));
    if (!snap.exists()) return null;
    const val = snap.val() as { data?: string };
    return val?.data ?? null;
  } catch (e) {
    await diag.warn('imageSync.download.error', { rtdbPath, message: String(e) });
    return null;
  }
}

export async function deleteImageFromRTDB(rtdbPath: string): Promise<void> {
  const db = getRtdb();
  if (!db) return;
  try {
    await remove(ref(db, rtdbPath));
  } catch {
    // non-critical
  }
}

// ─── Local cache ─────────────────────────────────────────────────────────────

function cacheKey(rtdbPath: string) {
  // Turn path into a safe storage key
  return CACHE_PREFIX + rtdbPath.replace(/\//g, '_');
}

export async function getCachedImage(rtdbPath: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(cacheKey(rtdbPath));
  } catch {
    return null;
  }
}

export async function cacheImage(rtdbPath: string, dataUri: string): Promise<void> {
  try {
    await AsyncStorage.setItem(cacheKey(rtdbPath), dataUri);
  } catch {
    // storage full or other error — ignore
  }
}

// ─── Full sync: download → cache → optionally delete from RTDB ───────────────

export async function resolveRtdbImage(
  rtdbPath: string,
  deleteAfterDownload = true,
): Promise<string | null> {
  // Return from local cache first (avoid network on repeat renders)
  const cached = await getCachedImage(rtdbPath);
  if (cached) return cached;

  const dataUri = await downloadImageFromRTDB(rtdbPath);
  if (!dataUri) return null;

  await cacheImage(rtdbPath, dataUri);

  // Clean up RTDB relay once we have it locally — same-user sync,
  // no need to keep it seeding after this device has downloaded it.
  if (deleteAfterDownload) {
    deleteImageFromRTDB(rtdbPath).catch(() => undefined);
  }

  return dataUri;
}
