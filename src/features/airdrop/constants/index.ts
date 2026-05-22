/**
 * AirDrop constants — all magic numbers, paths and tunables live here so the
 * rest of the feature stays declarative and easy to reason about.
 */
import type { SessionTtlPreset } from '../types';

/** Schema/version tag embedded in QR payloads so we can evolve the format safely. */
export const AIRDROP_QR_VERSION = 1 as const;

/** Legacy compact QR prefix (still decoded for backward compatibility). */
export const AIRDROP_QR_PREFIX = 'scan-airdrop:';

/** Query param the app reads on load to auto-open Receive and pair. */
export const AIRDROP_JOIN_PARAM = 'airdrop';

/** Map TTL presets to milliseconds. */
export const TTL_PRESET_MS: Record<SessionTtlPreset, number> = {
  '5m': 5 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

/** Human labels for TTL presets (UI). */
export const TTL_PRESET_LABEL: Record<SessionTtlPreset, string> = {
  '5m': '5 min',
  '30m': '30 min',
  '1h': '1 hour',
  '24h': '24 hours',
};

export const DEFAULT_TTL: SessionTtlPreset = '30m';

/** Order the presets render in the picker. */
export const TTL_PRESETS: SessionTtlPreset[] = ['5m', '30m', '1h', '24h'];

/** How often the store ticks to recompute countdowns / reap expired sessions. */
export const SESSION_TICK_INTERVAL_MS = 1000;

/** A nearby device is considered stale (and dropped) after this with no heartbeat. */
export const PEER_STALE_AFTER_MS = 15 * 1000;

/** Presence heartbeat cadence. */
export const PRESENCE_HEARTBEAT_MS = 5 * 1000;

/** Token length for the per-session pairing token (URL/QR safe). */
export const SESSION_TOKEN_LENGTH = 10;

/**
 * Realtime Database signaling paths. Files NEVER live here — only small JSON
 * signaling frames and presence. Keep everything namespaced under `airdrop`.
 */
export const RTDB_PATHS = {
  /** Per-session signaling room: airdrop/sessions/{sessionId}/signals */
  sessionSignals: (sessionId: string) => `airdrop/sessions/${sessionId}/signals`,
  /** Per-session presence map: airdrop/sessions/{sessionId}/presence/{peerId} */
  sessionPresence: (sessionId: string, peerId: string) =>
    `airdrop/sessions/${sessionId}/presence/${peerId}`,
  /** Root of a session for one-shot cleanup. */
  sessionRoot: (sessionId: string) => `airdrop/sessions/${sessionId}`,
  /**
   * Per-user share presence: shares this account is currently offering, keyed by
   * sessionId. Lets another device on the SAME account download without a QR.
   * Carries only join coordinates + file metadata (no bytes). Must be locked to
   * `auth.uid === $uid` in RTDB security rules.
   */
  userShares: (uid: string) => `airdrop/users/${uid}/shares`,
  userShare: (uid: string, sessionId: string) => `airdrop/users/${uid}/shares/${sessionId}`,
} as const;

/**
 * Default ICE servers. Public Google STUN only (matches ShareDrop's no-TURN
 * stance for v1). TURN can be layered in later via env for restrictive networks.
 */
export const DEFAULT_ICE_SERVERS: { urls: string }[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

/** WebRTC datachannel label used for the transfer stream. */
export const TRANSFER_CHANNEL_LABEL = 'scan-transfer';

/** Chunk size for future binary streaming (64 KiB is a safe DataChannel default). */
export const TRANSFER_CHUNK_SIZE = 64 * 1024;
