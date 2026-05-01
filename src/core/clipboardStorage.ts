// IndexedDB storage for clipboard images and metadata
// Handles persistence of large image blobs that don't fit in AsyncStorage

export interface ClipImageRecord {
  id: string;
  dataUri: string;
  capturedAt: number;
  size: number;
}

const DB_NAME = 'MyKit-Clipboard';
const DB_VERSION = 1;
const STORE_NAME = 'images';

let db: IDBDatabase | null = null;

async function initDb(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(new Error('Failed to open IndexedDB'));
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('capturedAt', 'capturedAt', { unique: false });
      }
    };
  });
}

/**
 * Save an image to IndexedDB
 */
export async function saveClipboardImage(id: string, dataUri: string, capturedAt: number): Promise<void> {
  try {
    const database = await initDb();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const record: ClipImageRecord = {
      id,
      dataUri,
      capturedAt,
      size: dataUri.length,
    };

    return new Promise((resolve, reject) => {
      const request = store.put(record);
      request.onerror = () => reject(new Error('Failed to save image'));
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    // Silently fail — IndexedDB not available or quota exceeded
    console.warn('[clipboard-storage] Could not save image:', String(error));
  }
}

/**
 * Load an image from IndexedDB
 */
export async function loadClipboardImage(id: string): Promise<string | null> {
  try {
    const database = await initDb();
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.get(id);
      request.onerror = () => reject(new Error('Failed to load image'));
      request.onsuccess = () => {
        const record = request.result as ClipImageRecord | undefined;
        resolve(record?.dataUri || null);
      };
    });
  } catch {
    return null;
  }
}

/**
 * Get all saved image IDs
 */
export async function listClipboardImages(): Promise<string[]> {
  try {
    const database = await initDb();
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAllKeys();
      request.onerror = () => reject(new Error('Failed to list images'));
      request.onsuccess = () => {
        resolve((request.result as string[]) || []);
      };
    });
  } catch {
    return [];
  }
}

/**
 * Delete an image from IndexedDB
 */
export async function deleteClipboardImage(id: string): Promise<void> {
  try {
    const database = await initDb();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.delete(id);
      request.onerror = () => reject(new Error('Failed to delete image'));
      request.onsuccess = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

/**
 * Clear all images older than the given timestamp
 */
export async function clearClipboardImagesOlderThan(timestampMs: number): Promise<number> {
  try {
    const database = await initDb();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const index = store.index('capturedAt');

    return new Promise((resolve, reject) => {
      const range = IDBKeyRange.upperBound(timestampMs);
      const request = index.openCursor(range);
      let deleted = 0;

      request.onerror = () => reject(new Error('Failed to clear old images'));
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          deleted += 1;
          cursor.continue();
        } else {
          resolve(deleted);
        }
      };
    });
  } catch {
    return 0;
  }
}

/**
 * Get total size of all stored images in bytes
 */
export async function getClipboardStorageSize(): Promise<number> {
  try {
    const database = await initDb();
    const transaction = database.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onerror = () => reject(new Error('Failed to get size'));
      request.onsuccess = () => {
        const records = (request.result as ClipImageRecord[]) || [];
        const totalSize = records.reduce((sum, r) => sum + r.size, 0);
        resolve(totalSize);
      };
    });
  } catch {
    return 0;
  }
}

/**
 * Clear all images and reset IndexedDB
 */
export async function clearAllClipboardImages(): Promise<void> {
  try {
    const database = await initDb();
    const transaction = database.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const request = store.clear();
      request.onerror = () => reject(new Error('Failed to clear all images'));
      request.onsuccess = () => resolve();
    });
  } catch {
    // Silently fail
  }
}
