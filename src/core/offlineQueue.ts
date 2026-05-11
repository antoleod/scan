/**
 * Offline queue for failed Firebase operations
 * Persists to AsyncStorage and flushes when connectivity restored
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { upsertNoteInFirebase, deleteNoteFromFirebase, initFirebaseRuntime } from './firebase';
import { diag } from './diagnostics';
import { onNetworkReconnect } from './network';
import type { NoteItem } from './notes';

const QUEUE_KEY = '@mykit_offline_queue_v1';

export type QueueOp = 'upsertNote' | 'deleteNote';

export interface QueueEntry {
  id: string;
  op: QueueOp;
  payload: NoteItem | string; // NoteItem for upsert, noteId string for delete
  createdAt: number;
  uid: string;               // Owner user id
  retries: number;           // Attempt counter for diagnostics
}

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function isNoteItem(p: unknown): p is NoteItem {
  return typeof p === 'object' && p !== null && 'id' in p && 'kind' in p;
}

export async function loadQueue(): Promise<QueueEntry[]> {
  try {
    const stored = await AsyncStorage.getItem(QUEUE_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as QueueEntry[];
  } catch {
    return [];
  }
}

export async function saveQueue(entries: QueueEntry[]): Promise<void> {
  try {
    const capped = entries.slice(0, 500);
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(capped));
  } catch {
    // silent fail
  }
}

export async function enqueueOperation(
  op: QueueOp,
  payload: NoteItem | string,
  uid?: string,
): Promise<void> {
  try {
    if (!uid) return; // Don't queue if no user is authenticated

    const current = await loadQueue();
    const entry: QueueEntry = {
      id: makeId('q'),
      op,
      payload,
      createdAt: Date.now(),
      uid,
      retries: 0,
    };
    // Upsert: replace existing entry for same operation + note id rather than appending.
    // This prevents a note edited N times offline from queuing N redundant writes.
    const entryNoteId = isNoteItem(payload) ? payload.id : (typeof payload === 'string' ? payload : null);
    const existingIndex = entryNoteId !== null
      ? current.findIndex((e) => e.op === op && (
          isNoteItem(e.payload) ? e.payload.id === entryNoteId : e.payload === entryNoteId
        ))
      : -1;
    const next = existingIndex !== -1
      ? current.map((e, i) => i === existingIndex ? entry : e)
      : [...current, entry];
    await saveQueue(next);
    await diag.info('offlineQueue.enqueued', { op, id: entry.id });
  } catch (error) {
    await diag.warn('offlineQueue.enqueue.error', { message: String(error) });
  }
}

export async function getQueueSize(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}

export async function flushQueue(): Promise<{ flushed: number; remaining: number }> {
  let queue = await loadQueue();
  if (queue.length === 0) return { flushed: 0, remaining: 0 };

  // Ensure Firebase runtime is initialized and auth is ready before processing any entries.
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth?.currentUser) return { flushed: 0, remaining: queue.length };
  const currentUid = rt.auth.currentUser.uid;

  const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  const MAX_RETRIES = 10; // Drop permanently-failing entries after this many attempts
  const now = Date.now();

  let flushed = 0;
  const nextQueue: QueueEntry[] = [];

  for (const entry of queue) {
    // Skip entries from different users (cross-user safety)
    if (currentUid && entry.uid !== currentUid) {
      nextQueue.push(entry);
      continue;
    }

    // Skip entries older than 7 days (TTL)
    if (now - entry.createdAt > TTL_MS) {
      await diag.warn('offlineQueue.ttl_expired', {
        id: entry.id,
        op: entry.op,
        ageMs: now - entry.createdAt,
      });
      continue;
    }

    // Drop entries that have permanently failed (e.g. Firestore rule violation).
    // Without this cap the entry retries on every reconnect for the full 7-day TTL.
    if (entry.retries >= MAX_RETRIES) {
      await diag.warn('offlineQueue.entry.max_retries', { id: entry.id, op: entry.op, retries: entry.retries });
      continue;
    }

    try {
      if (entry.op === 'upsertNote' && isNoteItem(entry.payload)) {
        await upsertNoteInFirebase(entry.payload);
        flushed += 1;
      } else if (entry.op === 'deleteNote' && typeof entry.payload === 'string') {
        await deleteNoteFromFirebase(entry.payload);
        flushed += 1;
      } else {
        // Keep invalid entries for debugging
        nextQueue.push(entry);
      }
    } catch (error) {
      // Keep failed entries for retry and increment counter
      entry.retries += 1;
      nextQueue.push(entry);
      await diag.warn('offlineQueue.flush.error', {
        op: entry.op,
        id: entry.id,
        retries: entry.retries,
        message: String(error),
      });
    }
  }

  await saveQueue(nextQueue);
  if (flushed > 0) {
    await diag.info('offlineQueue.flushed', { count: flushed, remaining: nextQueue.length });
  }

  return { flushed, remaining: nextQueue.length };
}

export async function clearQueue(): Promise<void> {
  try {
    await AsyncStorage.removeItem(QUEUE_KEY);
    await diag.info('offlineQueue.cleared', {});
  } catch (error) {
    await diag.warn('offlineQueue.clear.error', { message: String(error) });
  }
}

// Subscribe to network reconnect and flush on reconnection
onNetworkReconnect(() => {
  void flushQueue().catch((error) => {
    diag.warn('offlineQueue.reconnect_flush.error', { message: String(error) });
  });
});
