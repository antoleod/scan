/**
 * AirDrop type system.
 *
 * This module is the single source of truth for every shape used across the
 * AirDrop feature (sessions, peers, signaling, transfer). It has **no runtime
 * dependencies** and intentionally does not import from `notes` or any other
 * feature — AirDrop is a standalone platform layer that other features (e.g.
 * Notes) may consume, never the reverse.
 */

// ── Sessions ────────────────────────────────────────────────────────────────

/** How long a ShareSession stays alive before it self-destructs. */
export type SessionTtlPreset = '5m' | '30m' | '1h' | '24h';

/** Lifecycle of a ShareSession, mirroring the doc's create→pair→…→expire flow. */
export type SessionStatus =
  | 'creating'   // local: building the session, not yet announced
  | 'waiting'    // announced via signaling, waiting for a peer to pair
  | 'pairing'    // a peer joined; exchanging SDP/ICE
  | 'connected'  // WebRTC datachannel open, ready to transfer
  | 'transferring'
  | 'completed'
  | 'expired'
  | 'cancelled'
  | 'error';

/** The role a device plays within a session. */
export type SessionRole = 'host' | 'guest';

/** Kinds of payload a session can carry (transfer is not implemented yet). */
export type SharePayloadKind =
  | 'note'
  | 'text'
  | 'clipboard'
  | 'image'
  | 'audio'
  | 'pdf'
  | 'file'
  | 'folder'
  | 'mixed';

/**
 * Lightweight descriptor of what a session intends to share. The actual bytes
 * are NEVER stored here or in signaling — only metadata. Real payload bytes
 * flow peer-to-peer over WebRTC once the transfer layer lands.
 */
export interface SharePayloadDescriptor {
  kind: SharePayloadKind;
  /** Human-readable label shown in the UI (e.g. "Grocery List", "IMG_2034"). */
  title: string;
  /** Optional byte size hint for progress UI; unknown until transfer starts. */
  byteSize?: number;
  /** Optional MIME type when known. */
  mimeType?: string;
  /** Number of items for folder/mixed payloads. */
  itemCount?: number;
  /** File name when the payload is a concrete file. */
  fileName?: string;
}

/**
 * A file the user picked to send. Platform-specific bytes are read lazily via
 * `getBytes()` so we never hold large buffers in memory longer than needed.
 * Produced by the file-picker adapter (see ../transfer/filePicker).
 */
export interface SelectedFile {
  name: string;
  size: number;
  mimeType: string;
  /** Opaque platform handle (web File, or native uri) — used by getBytes(). */
  uri?: string;
  /** Reads the full file as bytes. Web: File→ArrayBuffer; native: FileSystem. */
  getBytes: () => Promise<Uint8Array>;
}

/** Immutable metadata describing a file, sent over the data channel before bytes. */
export interface FileMeta {
  name: string;
  size: number;
  mimeType: string;
}

export interface ShareSession {
  id: string;
  /** Short token embedded in the QR / link; used to authorize pairing. */
  token: string;
  role: SessionRole;
  status: SessionStatus;
  payload: SharePayloadDescriptor | null;
  ttl: SessionTtlPreset;
  createdAt: number;
  /** Absolute epoch ms when the session auto-expires. */
  expiresAt: number;
  /** The remote peer once paired, else null. */
  peer: PeerInfo | null;
  /** Last error message when status === 'error'. */
  error?: string;
}

// ── Peers ─────────────────────────────────────────────────────────────────

export type PeerPlatform = 'web' | 'ios' | 'android' | 'unknown';

/** Public, non-sensitive identity a device advertises to others. */
export interface PeerInfo {
  id: string;
  /** Friendly display name, e.g. "Gean's Pixel" or an auto-generated alias. */
  name: string;
  platform: PeerPlatform;
  /** Emoji/icon avatar key used by the device card UI. */
  avatar: string;
  /** Last time we saw a presence heartbeat from this peer. */
  lastSeenAt: number;
}

/** A peer discovered nearby (QR, LAN, or future nearby APIs). */
export interface NearbyDevice extends PeerInfo {
  /** How this device was discovered. */
  discoveredVia: 'qr' | 'lan' | 'nearby' | 'manual';
  /** Relative signal/proximity hint for UI ordering (0..1), if available. */
  proximity?: number;
}

/**
 * A share announced by another device signed into the SAME account. Lets a
 * second device of yours download directly — no QR scan needed. Published to
 * `users/{uid}/airdropPresence/{sessionId}` in RTDB; carries only the join
 * coordinates (sessionId + token) and file metadata — NEVER any file bytes.
 */
export interface UserShare {
  /** Session to join (same value the QR would carry). */
  sessionId: string;
  /** Pairing token (authorizes the join over signaling). */
  token: string;
  /** Friendly name of the device that is sharing (host's `self.name`). */
  deviceName: string;
  /** Avatar key of the sharing device, for the card UI. */
  deviceAvatar: string;
  /** Platform of the sharing device. */
  devicePlatform: PeerPlatform;
  /** Peer id of the host device — used to hide our OWN shares from the list. */
  hostPeerId: string;
  /** Offered file's display name. */
  fileName: string;
  /** Offered file size in bytes. */
  fileSize: number;
  /** Offered file MIME type. */
  mimeType: string;
  /** When the share was announced (epoch ms). */
  createdAt: number;
  /** When the underlying session expires (epoch ms) — stale entries are hidden. */
  expiresAt: number;
}

// ── Signaling ───────────────────────────────────────────────────────────────

/**
 * Messages exchanged over the signaling channel. Deliberately small JSON only —
 * SDP and ICE candidates for WebRTC negotiation plus presence/control frames.
 * No file bytes ever traverse signaling.
 */
export type SignalMessageType =
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'presence'
  | 'bye';

export interface SignalMessage {
  type: SignalMessageType;
  /** Session this message belongs to. */
  sessionId: string;
  /** Sender peer id (so receivers can ignore their own echoes). */
  from: string;
  /** Monotonic-ish timestamp for ordering/cleanup. */
  ts: number;
  /** SDP string for offer/answer frames. */
  sdp?: string;
  /** Serialized ICE candidate for ice-candidate frames. */
  candidate?: RTCIceCandidateInitLike;
  /** Presence payload for presence frames. */
  peer?: PeerInfo;
  /**
   * Pairing token (carried on the guest's `presence` frame). The host verifies
   * it against the session's own token before sending an offer, so that knowing
   * a public sessionId alone is NOT enough to join — the signaling room is
   * public (anyone can read/write) but only the token holder gets paired.
   */
  token?: string;
}

/**
 * Mirror of the browser `RTCIceCandidateInit` so this types file stays free of
 * lib.dom assumptions on native. The web WebRTC adapter maps to/from this.
 */
export interface RTCIceCandidateInitLike {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

/** Abstraction over the transport used to relay {@link SignalMessage}s. */
export interface SignalingChannel {
  /** Begin listening for messages in a session room. Returns an unsubscribe fn. */
  subscribe(sessionId: string, onMessage: (msg: SignalMessage) => void): () => void;
  /** Publish a signaling message to a session room. */
  publish(msg: SignalMessage): Promise<void>;
  /** Remove all signaling state for a session (called on expire/cancel). */
  clear(sessionId: string): Promise<void>;
  /** Whether the channel is usable right now (e.g. Firebase configured). */
  isAvailable(): boolean;
}

// ── WebRTC ────────────────────────────────────────────────────────────────

export type PeerConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed'
  | 'unsupported';

/**
 * Minimal connection contract the session layer relies on. Concrete adapters:
 * - web: wraps the browser native `RTCPeerConnection` (works today).
 * - native: an explicit `UnsupportedPeerConnection` until `react-native-webrtc`
 *   is added behind a dev client. No fake transfers.
 */
export interface PeerConnection {
  readonly state: PeerConnectionState;
  createOffer(): Promise<{ sdp: string }>;
  createAnswer(remoteSdp: string): Promise<{ sdp: string }>;
  acceptAnswer(remoteSdp: string): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInitLike): Promise<void>;
  onIceCandidate(cb: (candidate: RTCIceCandidateInitLike) => void): void;
  onStateChange(cb: (state: PeerConnectionState) => void): void;
  close(): void;

  // ── Data channel (transfer transport) ──
  /** Fires when the transfer DataChannel opens on both sides. */
  onChannelOpen(cb: () => void): void;
  /** Fires for each inbound message (control JSON string or binary chunk). */
  onData(cb: (data: string | ArrayBuffer) => void): void;
  /** Send a control string or a binary chunk over the channel. */
  sendData(data: string | ArrayBuffer): void;
  /** Whether the channel is open and ready for sendData(). */
  isChannelReady(): boolean;
  /** Buffered bytes still queued in the channel (for backpressure). */
  bufferedAmount(): number;
}

// ── Transfer ──────────────────────────────────────────────────────────────

export type TransferDirection = 'send' | 'receive';
export type TransferStatus =
  | 'idle'
  | 'offered'      // sender announced file meta; receiver may accept/decline
  | 'preparing'
  | 'active'       // streaming chunks
  | 'done'
  | 'declined'
  | 'error';

export interface TransferProgress {
  sessionId: string;
  direction: TransferDirection;
  status: TransferStatus;
  /** 0..1 */
  progress: number;
  bytesTransferred: number;
  totalBytes: number;
  /** Bytes/sec, when measurable. */
  rate?: number;
  /** File metadata once known (receiver learns it from the offer frame). */
  file?: FileMeta;
  error?: string;
}

/**
 * Control frames exchanged over the DataChannel BEFORE/AFTER the binary chunk
 * stream. Sent as JSON strings; binary chunks are sent as raw ArrayBuffers in
 * between `start` and `complete`. File bytes never touch signaling/Firebase.
 */
export type TransferControlFrame =
  | { t: 'offer'; file: FileMeta; chunkSize: number; chunks: number }
  | { t: 'accept' }
  | { t: 'decline' }
  | { t: 'start' }
  | { t: 'complete' }
  | { t: 'error'; message: string };
