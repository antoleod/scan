/**
 * WebRTC factory. Returns the right {@link PeerConnection} adapter for the
 * current platform:
 *  - web    → real browser RTCPeerConnection (works today)
 *  - native → explicit UnsupportedPeerConnection (honest placeholder until
 *             react-native-webrtc is added behind a dev client)
 */
import { Platform } from 'react-native';

import { UnsupportedPeerConnection } from './unsupportedPeerConnection';
import type { PeerConnection, SessionRole } from '../types';

/** True when real P2P connections are possible on this runtime. */
export function isWebRtcSupported(): boolean {
  return Platform.OS === 'web' && typeof RTCPeerConnection !== 'undefined';
}

export function createPeerConnection(role: SessionRole): PeerConnection {
  if (isWebRtcSupported()) {
    // Lazy require keeps the web-only DOM RTCPeerConnection out of the native
    // bundle's evaluation path.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { WebPeerConnection } = require('./webPeerConnection') as typeof import('./webPeerConnection');
    return new WebPeerConnection(role);
  }
  return new UnsupportedPeerConnection();
}

export { UnsupportedPeerConnection } from './unsupportedPeerConnection';
