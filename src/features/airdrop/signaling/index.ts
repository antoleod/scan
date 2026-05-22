/**
 * Signaling entry point. Resolves the active {@link SignalingChannel}.
 *
 * Today this is always the Firebase RTDB channel, but the indirection means a
 * future LAN/WebSocket signaling transport can be swapped in here without the
 * session layer or UI changing.
 */
import { firebaseSignaling } from './firebaseSignaling';
import type { SignalingChannel } from '../types';

/** A safe no-op channel used when no transport is available. */
const nullSignaling: SignalingChannel = {
  isAvailable: () => false,
  subscribe: () => () => undefined,
  publish: async () => undefined,
  clear: async () => undefined,
};

let active: SignalingChannel = firebaseSignaling;

export function getSignalingChannel(): SignalingChannel {
  return active;
}

/** Override the channel (tests, or a future LAN transport). */
export function setSignalingChannel(channel: SignalingChannel): void {
  active = channel;
}

export { firebaseSignaling, nullSignaling };
export type { SignalingChannel } from '../types';
