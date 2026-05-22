/**
 * Session service — the orchestration brain of AirDrop.
 *
 * Creates and joins {@link ShareSession}s, wires the {@link SignalingChannel} to
 * the {@link PeerConnection}, and keeps the store in sync. It deliberately does
 * NOT implement byte transfer yet (see ../transfer/transferService) — once a
 * datachannel opens the session moves to `connected` and stops there for v1.
 *
 * Architectural notes:
 *  - All Firebase access is hidden behind the signaling channel.
 *  - All WebRTC access is hidden behind the PeerConnection factory.
 *  - This module never imports Notes (or any feature) — it is pure platform.
 */
import { getSignalingChannel } from '../signaling';
import { createPeerConnection, isWebRtcSupported } from '../webrtc';
import {
  ensureSelf,
  patchSession,
  putSession,
  removeSession,
  setSessionStatus,
} from '../store/airdropStore';
import { airdropStore } from '../store/airdropStore';
import { generateSessionId, generateToken } from '../utils/ids';
import { TTL_PRESET_MS, DEFAULT_TTL } from '../constants';
import { diag } from '../../../core/diagnostics';
import { attachSender, attachReceiver, respondToOffer, type ReceiverHandlers } from '../transfer/transferService';
import type {
  PeerConnection,
  SelectedFile,
  SessionTtlPreset,
  SharePayloadDescriptor,
  ShareSession,
  SignalMessage,
} from '../types';

/**
 * Per-session live runtime kept out of the serializable store (peer connection,
 * signaling unsubscribe, selected file, transfer disposer). Maps sessionId →
 * handle. The selected file's bytes never leave this process except over the
 * peer DataChannel.
 */
interface SessionRuntime {
  pc: PeerConnection | null;
  unsubscribe: (() => void) | null;
  file: SelectedFile | null;
  disposeTransfer: (() => void) | null;
}
const runtimes = new Map<string, SessionRuntime>();

function getRuntime(id: string): SessionRuntime {
  let rt = runtimes.get(id);
  if (!rt) {
    rt = { pc: null, unsubscribe: null, file: null, disposeTransfer: null };
    runtimes.set(id, rt);
  }
  return rt;
}

/** Expose the live peer connection for a session (used by the Receive UI). */
export function getSessionPeer(sessionId: string): PeerConnection | null {
  return runtimes.get(sessionId)?.pc ?? null;
}

// ── Create (host) ─────────────────────────────────────────────────────────

export interface CreateSessionOptions {
  payload?: SharePayloadDescriptor | null;
  ttl?: SessionTtlPreset;
  /** The file to send. Its bytes stay local until the peer accepts the offer. */
  file?: SelectedFile | null;
}

/**
 * Create a host session, announce it on signaling, and begin listening for a
 * guest to pair. Returns the created session (also written to the store).
 *
 * If a `file` is supplied, the sender transfer engine is wired so that once the
 * DataChannel opens, the receiver gets an offer for that file. A session should
 * normally only be created AFTER a file is selected (enforced by the UI).
 */
export async function createSession(opts: CreateSessionOptions = {}): Promise<ShareSession> {
  const self = ensureSelf();
  const id = generateSessionId();
  const token = generateToken();
  const ttl = opts.ttl ?? DEFAULT_TTL;
  const now = Date.now();

  const session: ShareSession = {
    id,
    token,
    role: 'host',
    status: 'creating',
    payload: opts.payload ?? null,
    ttl,
    createdAt: now,
    expiresAt: now + TTL_PRESET_MS[ttl],
    peer: null,
  };
  putSession(session);

  const channel = getSignalingChannel();
  const rt = getRuntime(id);
  rt.file = opts.file ?? null;

  // Listen for the guest's signaling frames.
  rt.unsubscribe = channel.subscribe(id, (msg) => {
    void handleHostSignal(id, self.id, msg).catch((e) =>
      diag.warn('airdrop.session.host_signal_error', { id, error: String(e) }),
    );
  });

  // Pre-build the peer connection (web). On native this is the unsupported
  // placeholder; the session still announces so a web peer could pair later.
  rt.pc = createPeerConnection('host');
  rt.pc.onIceCandidate((candidate) => {
    void channel.publish({ type: 'ice-candidate', sessionId: id, from: self.id, ts: Date.now(), candidate });
  });
  rt.pc.onStateChange((state) => onPeerState(id, state));

  setSessionStatus(id, 'waiting');
  diag.info('airdrop.session.created', { id, ttl, webrtc: isWebRtcSupported() });
  return airdropStore.getState().sessions[id];
}

async function handleHostSignal(sessionId: string, selfId: string, msg: SignalMessage): Promise<void> {
  if (msg.from === selfId) return; // ignore our own echoes
  const rt = getRuntime(sessionId);
  const channel = getSignalingChannel();

  if (msg.type === 'bye') {
    await handleRemoteBye(sessionId);
    return;
  }

  if (msg.type === 'presence' && msg.peer) {
    patchSession(sessionId, { peer: msg.peer, status: 'pairing' });
    // Host initiates the offer once a guest is present.
    if (rt.pc && isWebRtcSupported()) {
      const { sdp } = await rt.pc.createOffer();
      await channel.publish({ type: 'offer', sessionId, from: selfId, ts: Date.now(), sdp });
    }
    return;
  }

  if (msg.type === 'answer' && msg.sdp && rt.pc) {
    await rt.pc.acceptAnswer(msg.sdp);
    return;
  }

  if (msg.type === 'ice-candidate' && msg.candidate && rt.pc) {
    await rt.pc.addIceCandidate(msg.candidate);
    return;
  }
}

// ── Join (guest) ────────────────────────────────────────────────────────────

/**
 * Join an existing session as a guest using a sessionId + token (typically
 * decoded from a scanned QR). Announces presence and answers the host's offer.
 *
 * `receiverHandlers.onOffer` fires when the sender announces a file — the UI
 * uses it to show the "Download?" confirmation, then calls
 * {@link acceptIncomingFile} / {@link declineIncomingFile}.
 */
export async function joinSession(
  sessionId: string,
  token: string,
  receiverHandlers?: ReceiverHandlers,
): Promise<ShareSession> {
  const self = ensureSelf();
  const now = Date.now();

  const session: ShareSession = {
    id: sessionId,
    token,
    role: 'guest',
    status: 'pairing',
    payload: null,
    ttl: DEFAULT_TTL,
    createdAt: now,
    expiresAt: now + TTL_PRESET_MS[DEFAULT_TTL],
    peer: null,
  };
  putSession(session);

  const channel = getSignalingChannel();
  const rt = getRuntime(sessionId);
  rt.pc = createPeerConnection('guest');
  rt.pc.onIceCandidate((candidate) => {
    void channel.publish({ type: 'ice-candidate', sessionId, from: self.id, ts: Date.now(), candidate });
  });
  rt.pc.onStateChange((state) => onPeerState(sessionId, state));

  // Wire the receiver transfer engine immediately so the offer frame is caught
  // as soon as the channel opens.
  if (receiverHandlers && rt.pc) {
    rt.disposeTransfer = attachReceiver(sessionId, rt.pc, receiverHandlers);
  }

  rt.unsubscribe = channel.subscribe(sessionId, (msg) => {
    void handleGuestSignal(sessionId, self.id, msg).catch((e) =>
      diag.warn('airdrop.session.guest_signal_error', { sessionId, error: String(e) }),
    );
  });

  // Announce presence so the host knows to send an offer.
  await channel.publish({ type: 'presence', sessionId, from: self.id, ts: Date.now(), peer: self });
  diag.info('airdrop.session.joined', { sessionId, webrtc: isWebRtcSupported() });
  return airdropStore.getState().sessions[sessionId];
}

/** Receiver UI → accept the pending file offer (starts the byte stream). */
export function acceptIncomingFile(sessionId: string): void {
  const pc = getSessionPeer(sessionId);
  if (pc) respondToOffer(pc, true);
}

/** Receiver UI → decline the pending file offer. */
export function declineIncomingFile(sessionId: string): void {
  const pc = getSessionPeer(sessionId);
  if (pc) respondToOffer(pc, false);
}

async function handleGuestSignal(sessionId: string, selfId: string, msg: SignalMessage): Promise<void> {
  if (msg.from === selfId) return;
  const rt = getRuntime(sessionId);
  const channel = getSignalingChannel();

  if (msg.type === 'bye') {
    await handleRemoteBye(sessionId);
    return;
  }

  if (msg.type === 'offer' && msg.sdp && rt.pc) {
    const { sdp } = await rt.pc.createAnswer(msg.sdp);
    await channel.publish({ type: 'answer', sessionId, from: selfId, ts: Date.now(), sdp });
    return;
  }

  if (msg.type === 'ice-candidate' && msg.candidate && rt.pc) {
    await rt.pc.addIceCandidate(msg.candidate);
    return;
  }
}

// ── Shared lifecycle ────────────────────────────────────────────────────────

function onPeerState(sessionId: string, state: string): void {
  if (state === 'connected') {
    setSessionStatus(sessionId, 'connected');
    // Host with a selected file: start the transfer (sends the offer once the
    // DataChannel opens). The receiver side was wired in joinSession().
    const rt = runtimes.get(sessionId);
    const s = airdropStore.getState().sessions[sessionId];
    if (rt?.pc && rt.file && s?.role === 'host' && !rt.disposeTransfer) {
      rt.disposeTransfer = attachSender(sessionId, rt.pc, rt.file);
      diag.info('airdrop.session.sender_attached', { sessionId, file: rt.file.name });
    }
  } else if (state === 'failed') {
    setSessionStatus(sessionId, 'error', 'Connection failed (network may block P2P).');
  } else if (state === 'disconnected' || state === 'closed') {
    const s = airdropStore.getState().sessions[sessionId];
    if (s && s.status !== 'completed' && s.status !== 'expired') {
      setSessionStatus(sessionId, 'error', 'Peer disconnected.');
    }
  }
}

/**
 * React to a remote `bye`: the other peer left/cancelled. Tear down our local
 * connection and mark the session cancelled, but do NOT clear the shared
 * signaling room (the peer that sent `bye` owns that cleanup) and do NOT echo
 * another `bye` (which would loop).
 */
async function handleRemoteBye(sessionId: string): Promise<void> {
  const s = airdropStore.getState().sessions[sessionId];
  if (!s || s.status === 'cancelled' || s.status === 'expired' || s.status === 'completed') return;
  teardownLocal(sessionId);
  setSessionStatus(sessionId, 'cancelled', 'The other device left the session.');
  diag.info('airdrop.session.remote_bye', { sessionId });
}

/** Cancel a session: tell the peer, tear down WebRTC + signaling, clean store. */
export async function cancelSession(sessionId: string): Promise<void> {
  const self = airdropStore.getState().self;
  const channel = getSignalingChannel();
  try {
    if (self) {
      await channel.publish({ type: 'bye', sessionId, from: self.id, ts: Date.now() });
    }
  } catch {
    // best effort
  }
  await teardown(sessionId);
  setSessionStatus(sessionId, 'cancelled');
}

/** Internal: close the local peer connection and stop listening (no room clear). */
function teardownLocal(sessionId: string): void {
  const rt = runtimes.get(sessionId);
  if (rt) {
    rt.disposeTransfer?.();
    rt.pc?.close();
    rt.unsubscribe?.();
    // Drop the file handle so its bytes are eligible for GC.
    rt.file = null;
    runtimes.delete(sessionId);
  }
}

/** Internal: tear down locally AND clear the shared signaling room. */
export async function teardown(sessionId: string): Promise<void> {
  teardownLocal(sessionId);
  try {
    await getSignalingChannel().clear(sessionId);
  } catch {
    // ignore
  }
}

/** Remove a finished/expired session from the store (after teardown). */
export async function dismissSession(sessionId: string): Promise<void> {
  await teardown(sessionId);
  removeSession(sessionId);
}
