/**
 * User-scoped share presence (same-account direct download).
 *
 * When a device that is signed in shares a file, it announces the share under
 * `airdrop/users/{uid}/shares/{sessionId}` so that ANOTHER device signed into
 * the SAME account can see it and download with one tap — no QR scan.
 *
 * Only join coordinates (sessionId + token) and file metadata live here. File
 * bytes ALWAYS flow peer-to-peer over WebRTC and NEVER touch the database.
 *
 * Like {@link firebaseSignaling}, this is one of the few places that touches
 * Firebase directly. It is a no-op when Firebase is disabled or no user is
 * signed in (guest mode) — the QR path keeps working regardless.
 *
 * Required RTDB security rule (set in the Firebase console):
 *   "airdrop": {
 *     "users": {
 *       "$uid": {
 *         ".read":  "auth != null && auth.uid === $uid",
 *         ".write": "auth != null && auth.uid === $uid"
 *       }
 *     }
 *   }
 */
import {
  type Database,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
} from 'firebase/database';

import { getFirebaseRuntimeSnapshot, getFirebaseRuntime } from '../../../core/firebase';
import { diag } from '../../../core/diagnostics';
import { RTDB_PATHS } from '../constants';
import { isValidShare } from './shareFilter';
import type { UserShare } from '../types';

async function getDb(): Promise<Database | null> {
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    return rt.enabled ? rt.rtdb : null;
  } catch (e) {
    void diag.warn('airdrop.presence.db_unavailable', { error: String(e) });
    return null;
  }
}

/**
 * The signed-in user's uid, or null in guest mode. Synchronous best-effort read
 * of the already-initialized runtime — callers gate the whole feature on this.
 */
export function currentUid(): string | null {
  return getFirebaseRuntime()?.auth?.currentUser?.uid ?? null;
}

/**
 * Announce a share so the account's other devices can download it directly.
 * No-op for guests / disabled Firebase. Idempotent per sessionId.
 */
export async function publishMyShare(share: UserShare): Promise<void> {
  const uid = currentUid();
  if (!uid) return; // guest mode → QR path only
  const db = await getDb();
  if (!db) return;
  try {
    await set(ref(db, RTDB_PATHS.userShare(uid, share.sessionId)), {
      ...share,
      _srv: serverTimestamp(),
    });
    void diag.info('airdrop.presence.published', { sessionId: share.sessionId, file: share.fileName });
  } catch (e) {
    void diag.warn('airdrop.presence.publish_failed', {
      sessionId: share.sessionId,
      error: String(e),
      hint: 'Likely an RTDB rules denial on /airdrop/users/$uid — see userPresence.ts.',
    });
  }
}

/** Remove a previously announced share (on cancel / expire / complete). */
export async function clearMyShare(sessionId: string): Promise<void> {
  const uid = currentUid();
  if (!uid) return;
  const db = await getDb();
  if (!db) return;
  try {
    await remove(ref(db, RTDB_PATHS.userShare(uid, sessionId)));
  } catch (e) {
    void diag.warn('airdrop.presence.clear_failed', { sessionId, error: String(e) });
  }
}

/**
 * Subscribe to the shares announced by this account. The callback receives the
 * full list each time it changes; the caller is responsible for filtering out
 * its own device and expired entries (so the raw stream stays simple/testable).
 * Returns an unsubscribe fn. No-op (returns a noop unsub) for guests.
 */
export function subscribeUserShares(onShares: (shares: UserShare[]) => void): () => void {
  const uid = currentUid();
  if (!uid) {
    onShares([]);
    return () => undefined;
  }

  let detach: (() => void) | null = null;
  let cancelled = false;

  void (async () => {
    const db = await getDb();
    if (!db || cancelled) return;
    const sharesRef = ref(db, RTDB_PATHS.userShares(uid));
    const off = onValue(
      sharesRef,
      (snap) => {
        const value = (snap.val() as Record<string, UserShare> | null) ?? {};
        const list = Object.values(value).filter(isValidShare);
        onShares(list);
      },
      (err) => {
        void diag.warn('airdrop.presence.subscribe_error', { error: String(err) });
      },
    );
    detach = () => off();
  })();

  return () => {
    cancelled = true;
    detach?.();
  };
}

