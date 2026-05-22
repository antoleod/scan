/**
 * Nearby discovery service (architecture placeholder).
 *
 * v1 ships with QR pairing only (see ../qr). LAN/mDNS/Zeroconf and OS "nearby"
 * APIs are intentionally NOT implemented — Expo has no built-in mDNS and adding
 * a native module is out of scope for the foundation layer. This module defines
 * the discovery contract and a manual-add path so the Nearby screen has a real,
 * honest data source today and a clean seam for future transports.
 */
import { upsertNearby } from '../store/airdropStore';
import { avatarForPlatform } from '../utils/format';
import type { NearbyDevice, PeerInfo } from '../types';

export type DiscoveryMethod = 'qr' | 'lan' | 'nearby' | 'manual';

export interface DiscoveryProvider {
  readonly method: DiscoveryMethod;
  /** Whether this provider can run on the current platform/build. */
  isSupported(): boolean;
  /** Begin discovery; returns a stop function. */
  start(onFound: (device: NearbyDevice) => void): () => void;
}

/**
 * Registry of discovery providers. Future LAN/nearby providers register here;
 * the Nearby screen iterates supported providers without knowing their guts.
 */
const providers: DiscoveryProvider[] = [];

export function registerDiscoveryProvider(provider: DiscoveryProvider): void {
  providers.push(provider);
}

export function getSupportedProviders(): DiscoveryProvider[] {
  return providers.filter((p) => p.isSupported());
}

/** Record a peer discovered via QR (or any manual flow) into the nearby list. */
export function recordDiscoveredPeer(peer: PeerInfo, via: DiscoveryMethod = 'qr'): NearbyDevice {
  const device: NearbyDevice = {
    ...peer,
    avatar: peer.avatar || avatarForPlatform(peer.platform),
    discoveredVia: via,
    lastSeenAt: Date.now(),
  };
  upsertNearby(device);
  return device;
}

// NOTE: No fake devices are ever injected. The Nearby screen shows an empty
// state until a real peer is discovered (currently via QR pairing).
