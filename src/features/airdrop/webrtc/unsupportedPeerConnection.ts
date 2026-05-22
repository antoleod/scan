/**
 * Explicit "WebRTC not available here" implementation.
 *
 * Used on native (Expo) until `react-native-webrtc` is added behind a custom
 * dev client. It is NOT a fake — every method rejects/returns a clear
 * unsupported signal so the UI can show an honest "P2P not available on this
 * build" state instead of silently pretending to connect.
 */
import type { PeerConnection, PeerConnectionState, RTCIceCandidateInitLike } from '../types';

const UNSUPPORTED = new Error(
  'WebRTC peer connections are not available on this platform/build yet. ' +
    'Add react-native-webrtc behind a dev client to enable native P2P.',
);

export class UnsupportedPeerConnection implements PeerConnection {
  readonly state: PeerConnectionState = 'unsupported';

  async createOffer(): Promise<{ sdp: string }> {
    throw UNSUPPORTED;
  }

  async createAnswer(): Promise<{ sdp: string }> {
    throw UNSUPPORTED;
  }

  async acceptAnswer(): Promise<void> {
    throw UNSUPPORTED;
  }

  async addIceCandidate(_candidate: RTCIceCandidateInitLike): Promise<void> {
    // Swallow silently — no connection to feed candidates to.
  }

  onIceCandidate(_cb: (candidate: RTCIceCandidateInitLike) => void): void {
    // never fires
  }

  onStateChange(cb: (state: PeerConnectionState) => void): void {
    // Immediately report the unsupported state so consumers can react.
    cb('unsupported');
  }

  // ── Data channel (no transport on this build) ──
  onChannelOpen(_cb: () => void): void {
    // never opens
  }

  onData(_cb: (data: string | ArrayBuffer) => void): void {
    // never fires
  }

  sendData(_data: string | ArrayBuffer): void {
    // no channel to send on
  }

  isChannelReady(): boolean {
    return false;
  }

  bufferedAmount(): number {
    return 0;
  }

  close(): void {
    // nothing to tear down
  }
}
