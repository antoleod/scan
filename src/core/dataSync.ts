/**
 * dataSync.ts — Web platform utilities for data export, import, and storage cleanup.
 * Covers: cookies, Cache Storage, localStorage (MyKit_ keys), IndexedDB, file picker.
 * All functions are safe no-ops on non-web platforms.
 */

import { Platform } from 'react-native';

// ─── Cookie Cleanup ─────────────────────────────────────────────────────────

/** Expire all cookies for this domain, optionally filtered by a keyword in the name. */
export function clearDomainCookies(filter?: string): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.cookie.split(';').forEach((c) => {
    const name = c.trim().split('=')[0];
    if (!name) return;
    if (filter && !name.toLowerCase().includes(filter.toLowerCase())) return;
    // Expire on root path and explicitly on MyKit.tech
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;domain=MyKit.tech`;
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
  });
}

// ─── Cache Storage Cleanup ──────────────────────────────────────────────────

/** Delete all (or filtered) Cache Storage caches. */
export async function clearCacheStorage(filter?: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => !filter || k.toLowerCase().includes(filter.toLowerCase()))
        .map((k) => caches.delete(k)),
    );
  } catch {
    // Cache API may be unavailable in some contexts — ignore.
  }
}

// ─── localStorage Cleanup ────────────────────────────────────────────────────

/** Remove all localStorage keys that start with `MyKit_`, optionally filtered further. */
export function clearAppLocalStorage(keyFilter?: string): void {
  if (typeof localStorage === 'undefined') return;
  const keys = Object.keys(localStorage).filter((k) => k.startsWith('MyKit_'));
  for (const key of keys) {
    if (!keyFilter || key.toLowerCase().includes(keyFilter.toLowerCase())) {
      localStorage.removeItem(key);
    }
  }
}

// ─── IndexedDB Cleanup ───────────────────────────────────────────────────────

/** Clear every record in a named object store inside a named database. */
export function purgeIndexedDBStore(dbName: string, storeName: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(); return; }
    try {
      const req = indexedDB.open(dbName);
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(storeName)) { db.close(); resolve(); return; }
        try {
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).clear();
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => { db.close(); resolve(); };
        } catch { db.close(); resolve(); }
      };
      req.onerror = () => resolve();
    } catch { resolve(); }
  });
}

/** Delete an entire IndexedDB database. */
export function deleteIndexedDB(dbName: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(); return; }
    try {
      const req = indexedDB.deleteDatabase(dbName);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch { resolve(); }
  });
}

/** Attempt to purge stores matching a keyword across common DB names. */
export async function purgeIndexedDBByKeyword(keyword: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const dbNames = ['RCTAsyncLocalStorage', 'MyKitDB', 'MyKit', 'barra', 'scan', 'expo'];
  const storeVariants = [keyword, `${keyword}s`, `${keyword}Store`];
  await Promise.all(
    dbNames.flatMap((db) => storeVariants.map((store) => purgeIndexedDBStore(db, store))),
  );
}

/** Delete all known app-related IndexedDB databases. */
export async function purgeAllRelatedIndexedDB(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const dbNames = ['RCTAsyncLocalStorage', 'MyKitDB', 'MyKit', 'barra', 'scan', 'expo'];
  await Promise.all(dbNames.map(deleteIndexedDB));
}

// ─── Nuclear cleanup (all layers) ───────────────────────────────────────────

/** Clear cookies, localStorage, Cache Storage, and IndexedDB in one call. */
export async function hardCleanupAll(): Promise<void> {
  clearDomainCookies();
  clearAppLocalStorage();
  await clearCacheStorage();
  await purgeAllRelatedIndexedDB();
}

// ─── File Picker ─────────────────────────────────────────────────────────────

/**
 * Open a browser file picker and return the text content of the selected file.
 * Resolves with `null` if the user cancels or reading fails.
 */
export function openFilePicker(accept: string): Promise<string | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') { resolve(null); return; }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;pointer-events:none';
    document.body.appendChild(input);

    let settled = false;
    function settle(value: string | null) {
      if (settled) return;
      settled = true;
      if (document.body.contains(input)) document.body.removeChild(input);
      resolve(value);
    }

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) { settle(null); return; }
      const reader = new FileReader();
      reader.onload = (e) => settle(typeof e.target?.result === 'string' ? e.target.result : null);
      reader.onerror = () => settle(null);
      reader.readAsText(file);
    };

    // Fallback: if the window regains focus without a file being chosen, resolve null.
    function onWindowFocus() {
      setTimeout(() => settle(null), 400);
    }
    window.addEventListener('focus', onWindowFocus, { once: true });

    // Clean up focus listener if a file is selected.
    input.addEventListener('change', () => window.removeEventListener('focus', onWindowFocus), { once: true });

    input.click();
  });
}
