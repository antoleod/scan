/**
 * Web WebRTC adapter — wraps the browser-native `RTCPeerConnection`.
 *
 * This is a REAL connection (works in any modern browser today). It implements
 * the {@link PeerConnection} contract used by the session layer. A single
 * ordered/reliable DataChannel ({@link TRANSFER_CHANNEL_LABEL}) is created for
 * the future transfer stream; the negotiation (offer/answer/ICE) is fully wired
 * so the Send/Receive flows can light up once the transfer layer is added.
 */
import { DEFAULT_ICE_SERVERS, TRANSFER_CHANNEL_LABEL } from '../constants';
import type { PeerConnection, PeerConnectionState, RTCIceCandidateInitLike } from '../types';

function mapState(s: RTCPeerConnectionState): PeerConnectionState {
  switch (s) {
    case 'new':
      return 'new';
    case 'connecting':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'disconnected':
      return 'disconnected';
    case 'failed':
      return 'failed';
    case 'closed':
      return 'closed';
    default:
      return 'new';
  }
}

export class WebPeerConnection implements PeerConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private iceCb: ((c: RTCIceCandidateInitLike) => void) | null = null;
  private stateCb: ((s: PeerConnectionState) => void) | null = null;
  private channelOpenCb: (() => void) | null = null;
  private dataCb: ((data: string | ArrayBuffer) => void) | null = null;

  state: PeerConnectionState = 'new';

  constructor(role: 'host' | 'guest') {
    this.pc = new RTCPeerConnection({ iceServers: DEFAULT_ICE_SERVERS });

    // The host creates the channel; the guest receives it via ondatachannel.
    if (role === 'host') {
      this.attachChannel(this.pc.createDataChannel(TRANSFER_CHANNEL_LABEL, { ordered: true }));
    } else {
      this.pc.ondatachannel = (ev) => {
        this.attachChannel(ev.channel);
      };
    }

    this.pc.onicecandidate = (ev) => {
      if (ev.candidate && this.iceCb) {
        const c = ev.candidate;
        this.iceCb({
          candidate: c.candidate,
          sdpMid: c.sdpMid,
          sdpMLineIndex: c.sdpMLineIndex,
          usernameFragment: c.usernameFragment,
        });
      }
    };

    this.pc.onconnectionstatechange = () => {
      this.state = mapState(this.pc.connectionState);
      this.stateCb?.(this.state);
    };
  }

  /** Exposes the underlying datachannel for the transfer layer (read-only use). */
  getDataChannel(): RTCDataChannel | null {
    return this.channel;
  }

  async createOffer(): Promise<{ sdp: string }> {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return { sdp: offer.sdp ?? '' };
  }

  async createAnswer(remoteSdp: string): Promise<{ sdp: string }> {
    await this.pc.setRemoteDescription({ type: 'offer', sdp: remoteSdp });
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return { sdp: answer.sdp ?? '' };
  }

  async acceptAnswer(remoteSdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: 'answer', sdp: remoteSdp });
  }

  async addIceCandidate(candidate: RTCIceCandidateInitLike): Promise<void> {
    try {
      await this.pc.addIceCandidate(candidate as RTCIceCandidateInit);
    } catch {
      // Late/duplicate candidates can throw harmlessly; ignore.
    }
  }

  onIceCandidate(cb: (c: RTCIceCandidateInitLike) => void): void {
    this.iceCb = cb;
  }

  onStateChange(cb: (s: PeerConnectionState) => void): void {
    this.stateCb = cb;
  }

  // ── Data channel ──────────────────────────────────────────────────────────

  private attachChannel(channel: RTCDataChannel): void {
    this.channel = channel;
    channel.binaryType = 'arraybuffer';
    channel.onopen = () => this.channelOpenCb?.();
    channel.onmessage = (ev) => {
      // Strings are control frames (JSON); ArrayBuffers are binary chunks.
      this.dataCb?.(ev.data as string | ArrayBuffer);
    };
    // If the channel is already open (host fast path), fire on next tick.
    if (channel.readyState === 'open') {
      setTimeout(() => this.channelOpenCb?.(), 0);
    }
  }

  onChannelOpen(cb: () => void): void {
    this.channelOpenCb = cb;
    if (this.channel?.readyState === 'open') setTimeout(cb, 0);
  }

  onData(cb: (data: string | ArrayBuffer) => void): void {
    this.dataCb = cb;
  }

  sendData(data: string | ArrayBuffer): void {
    if (this.channel?.readyState !== 'open') return;
    // Branch so each call matches a concrete RTCDataChannel.send overload.
    if (typeof data === 'string') this.channel.send(data);
    else this.channel.send(data);
  }

  isChannelReady(): boolean {
    return this.channel?.readyState === 'open';
  }

  bufferedAmount(): number {
    return this.channel?.bufferedAmount ?? 0;
  }

  close(): void {
    try {
      this.channel?.close();
      this.pc.close();
    } finally {
      this.state = 'closed';
    }
  }
}
