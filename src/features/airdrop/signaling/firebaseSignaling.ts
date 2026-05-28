/**
 * Firebase Realtime Database signaling channel.
 *
 * Implements {@link SignalingChannel} on top of the RTDB instance already wired
 * in `src/core/firebase.ts` (`runtime.rtdb`). Only small JSON signaling frames
 * (SDP/ICE/presence/control) ever travel here — never file bytes. Sessions are
 * namespaced under `airdrop/sessions/{id}` and cleared on expire/cancel.
 *
 * This is the ONLY place in the AirDrop feature that touches Firebase, keeping
 * the rest of the code transport-agnostic and testable.
 */
import {
  type Database,
  type DatabaseReference,
  onChildAdded,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
} from 'firebase/database';

import { getFirebaseRuntimeSnapshot } from '../../../core/firebase';
import { diag } from '../../../core/diagnostics';
import { RTDB_PATHS } from '../constants';
import type { SignalMessage, SignalingChannel } from '../types';

let cachedDb: Database | null = null;

async function getDb(): Promise<Database | null> {
  if (cachedDb) return cachedDb;
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    cachedDb = rt.enabled ? rt.rtdb : null;
    if (!cachedDb) {
      // Surface WHY signaling can't run — the #1 cause of "QR won't pair".
      void diag.warn('airdrop.signaling.no_rtdb', {
        firebaseEnabled: rt.enabled,
        hasRtdb: Boolean(rt.rtdb),
        hint: rt.enabled
          ? 'Realtime Database not initialized — check EXPO_PUBLIC_FIREBASE_DATABASE_URL.'
          : 'Firebase disabled — required env vars missing.',
      });
    } else {
      void diag.info('airdrop.signaling.rtdb_ready', {});
    }
    return cachedDb;
  } catch (e) {
    void diag.warn('airdrop.signaling.db_unavailable', { error: String(e) });
    return null;
  }
}

export function createFirebaseSignalingChannel(): SignalingChannel {
  return {
    isAvailable(): boolean {
      // Best-effort sync hint; the async ops below are the source of truth.
      return cachedDb !== null;
    },

    subscribe(sessionId, onMessage): () => void {
      let detach: (() => void) | null = null;
      let cancelled = false;
      // Resolved once the onChildAdded listener is wired. Callers that need to
      // publish only after they can receive the response (e.g. guest publishing
      // its presence) should await this before calling publish().
      let readyResolve: (() => void) | undefined;
      const ready = new Promise<void>((res) => { readyResolve = res; });

      void (async () => {
        const db = await getDb();
        if (!db || cancelled) {
          readyResolve?.();
          return;
        }
        const signalsRef: DatabaseReference = ref(db, RTDB_PATHS.sessionSignals(sessionId));
        // onChildAdded replays existing children once, then streams new ones —
        // ideal for an append-only signaling log.
        const off = onChildAdded(signalsRef, (snap) => {
          const value = snap.val() as SignalMessage | null;
          if (value && typeof value.type === 'string') {
            void diag.info('airdrop.signaling.recv', { sessionId, type: value.type, from: value.from });
            onMessage(value);
          }
        }, (err) => {
          void diag.warn('airdrop.signaling.subscribe_error', { sessionId, error: String(err) });
        });
        detach = off;
        // Signal that the listener is active — safe to publish now.
        readyResolve?.();
        void diag.info('airdrop.signaling.subscribed', { sessionId });
      })();

      const unsub = () => {
        cancelled = true;
        detach?.();
      };
      // Attach ready promise so callers can await subscription before publishing.
      (unsub as unknown as { ready: Promise<void> }).ready = ready;
      return unsub;
    },

    async publish(msg: SignalMessage): Promise<void> {
      const db = await getDb();
      if (!db) {
        void diag.warn('airdrop.signaling.publish_skipped_no_db', { type: msg.type });
        return;
      }
      const signalsRef = ref(db, RTDB_PATHS.sessionSignals(msg.sessionId));
      try {
        // push() appends with an auto key; serverTimestamp keeps ordering honest.
        await push(signalsRef, { ...msg, ts: msg.ts || Date.now(), _srv: serverTimestamp() });
        void diag.info('airdrop.signaling.published', { sessionId: msg.sessionId, type: msg.type });
      } catch (e) {
        // RTDB security rules are the most common failure here.
        void diag.error('airdrop.signaling.publish_failed', {
          sessionId: msg.sessionId,
          type: msg.type,
          error: String(e),
          hint: 'Likely a Realtime Database security rules denial on /airdrop/*.',
        });
        throw e;
      }
    },

    async clear(sessionId: string): Promise<void> {
      const db = await getDb();
      if (!db) return;
      try {
        await set(ref(db, RTDB_PATHS.sessionRoot(sessionId)), null);
      } catch (e) {
        // remove() is the explicit alternative; either is fine.
        try {
          await remove(ref(db, RTDB_PATHS.sessionRoot(sessionId)));
        } catch (e2) {
          diag.warn('airdrop.signaling.clear_failed', { sessionId, error: String(e2) });
        }
      }
    },
  };
}

/** Shared singleton channel instance. */
export const firebaseSignaling = createFirebaseSignalingChannel();
