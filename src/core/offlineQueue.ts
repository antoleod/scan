/**
 * Offline queue for failed Firebase operations
 * Persists to AsyncStorage and flushes when connectivity restored
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { upsertNoteInFirebase, deleteNoteFromFirebase } from './firebase';
import { diag } from './diagnostics';
import type { NoteItem } from './notes';

const QUEUE_KEY = '@mykit_offline_queue_v1';

export type QueueOp = 'upsertNote' | 'deleteNote';

export interface QueueEntry {
  id: string;
  op: QueueOp;
  payload: NoteItem | string; // NoteItem for upsert, noteId string for delete
  createdAt: number;
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
): Promise<void> {
  try {
    const current = await loadQueue();
    const entry: QueueEntry = {
      id: makeId('q'),
      op,
      payload,
      createdAt: Date.now(),
    };
    const next = [...current, entry];
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

  let flushed = 0;
  const nextQueue: QueueEntry[] = [];

  for (const entry of queue) {
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
      // Keep failed entries for retry
      nextQueue.push(entry);
      await diag.warn('offlineQueue.flush.error', {
        op: entry.op,
        id: entry.id,
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
