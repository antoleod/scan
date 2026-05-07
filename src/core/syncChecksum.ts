/**
 * Sync integrity verification via checksum.
 * Detects silent corruption or data loss during cloud sync.
 * Uses lightweight djb2 hash (same as secretPin.ts for consistency).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { diag } from './diagnostics';
import type { NoteItem } from './notes';

const CHECKSUM_KEY = '@mykit_notes_checksum_v1';

/**
 * Lightweight djb2 hash function (non-cryptographic, fast).
 * Used for sync integrity checking, not security.
 */
function djb2Hash(str: string): string {
  let h1 = 5381;
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    h1 = ((h1 * 33) ^ c) & 0xffffffff;
  }
  return (h1 >>> 0).toString(16);
}

/**
 * Compute checksum of notes collection.
 * Checksums are stable (same input → same output) and order-independent.
 * Only hashes id, updatedAt, deletedAt — immutable identity fields.
 */
export function computeNotesChecksum(notes: NoteItem[]): string {
  if (notes.length === 0) {
    return djb2Hash('');
  }

  // Sort by id to ensure order-independent hash
  const sorted = notes
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(note => {
      // Only hash immutable identity fields
      return JSON.stringify({
        id: note.id,
        updatedAt: note.updatedAt,
        deletedAt: note.deletedAt,
      });
    });

  const combined = sorted.join('|');
  return djb2Hash(combined);
}

/**
 * Save checksum after a successful sync.
 * Called after notes are loaded from Firestore or after local save.
 */
export async function saveNotesChecksum(notes: NoteItem[]): Promise<void> {
  const checksum = computeNotesChecksum(notes);
  try {
    await AsyncStorage.setItem(CHECKSUM_KEY, checksum);
  } catch (e) {
    diag.warn('sync.checksum.save_error', {
      error: e instanceof Error ? e.message : String(e),
    });
    // Silently continue; checksum failure is not critical
  }
}

/**
 * Verify checksum on app load or after sync.
 * Returns true if checksum matches, false if mismatch detected.
 * Returns true (optimistic) if no prior checksum exists.
 */
export async function verifyNotesChecksum(notes: NoteItem[]): Promise<boolean> {
  try {
    const stored = await AsyncStorage.getItem(CHECKSUM_KEY);
    if (!stored) {
      // First load; no checksum yet
      return true;
    }

    const current = computeNotesChecksum(notes);
    const match = stored === current;

    if (!match) {
      diag.warn('sync.checksum.mismatch', {
        stored,
        current,
        noteCount: notes.length,
      });
    }

    return match;
  } catch (e) {
    diag.error('sync.checksum.verify_error', {
      error: e instanceof Error ? e.message : String(e),
      context: 'verifyNotesChecksum',
    });
    // Assume valid on error; don't block app
    return true;
  }
}

/**
 * Clear checksum (e.g., on logout or factory reset).
 */
export async function clearNotesChecksum(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CHECKSUM_KEY);
  } catch (e) {
    diag.warn('sync.checksum.clear_error', {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
