/**
 * AirDrop global store.
 *
 * Holds the device's own identity, the list of nearby devices, all active
 * ShareSessions and lightweight transfer progress. UI reads slices via the
 * `useAirdropStore` hook; services mutate via the exported action functions.
 *
 * This store is intentionally framework-light (see ./createStore) and has no
 * dependency on Notes or any other feature.
 */
import { createStore } from './createStore';
import { filterIncomingShares } from '../presence/shareFilter';
import { generatePeerId } from '../utils/ids';
import { avatarForPlatform, currentPlatform, generateDeviceAlias } from '../utils/format';
import { TTL_PRESET_MS } from '../constants';
import type {
  NearbyDevice,
  PeerInfo,
  SharePayloadDescriptor,
  ShareSession,
  SessionStatus,
  SessionTtlPreset,
  TransferProgress,
  UserShare,
} from '../types';

export interface AirdropState {
  /** This device's advertised identity. Created lazily on first init. */
  self: PeerInfo | null;
  /** Devices discovered nearby (QR/LAN/etc.), keyed by id for dedup. */
  nearby: Record<string, NearbyDevice>;
  /** Active and recently-finished sessions, keyed by id. */
  sessions: Record<string, ShareSession>;
  /** Transfer progress keyed by sessionId (placeholder until transfer lands). */
  transfers: Record<string, TransferProgress>;
  /**
   * Shares announced by THIS account's other devices, keyed by sessionId.
   * Powers the "My Devices" direct-download list (no QR). Empty in guest mode.
   */
  userShares: Record<string, UserShare>;
  /** Monotonic clock tick used to drive countdown re-renders. */
  now: number;
}

const initialState: AirdropState = {
  self: null,
  nearby: {},
  sessions: {},
  transfers: {},
  userShares: {},
  now: Date.now(),
};

export const airdropStore = createStore<AirdropState>(initialState);

// ── Identity ────────────────────────────────────────────────────────────────

/** Ensure `self` exists; idempotent. Returns the identity. */
export function ensureSelf(name?: string): PeerInfo {
  const existing = airdropStore.getState().self;
  if (existing) return existing;
  const platform = currentPlatform();
  const id = generatePeerId();
  const self: PeerInfo = {
    id,
    name: name?.trim() || generateDeviceAlias(id),
    platform,
    avatar: avatarForPlatform(platform),
    lastSeenAt: Date.now(),
  };
  airdropStore.setState({ self });
  return self;
}

export function renameSelf(name: string): void {
  const self = airdropStore.getState().self;
  if (!self) return;
  airdropStore.setState({ self: { ...self, name: name.trim() || self.name } });
}

// ── Nearby devices ────────────────────────────────────────────────────────

export function upsertNearby(device: NearbyDevice): void {
  const nearby = { ...airdropStore.getState().nearby, [device.id]: device };
  airdropStore.setState({ nearby });
}

export function removeNearby(id: string): void {
  const nearby = { ...airdropStore.getState().nearby };
  delete nearby[id];
  airdropStore.setState({ nearby });
}

/** Drop devices we haven't heard from since `cutoff` (epoch ms). */
export function reapStaleNearby(cutoff: number): void {
  const current = airdropStore.getState().nearby;
  let mutated = false;
  const nearby: Record<string, NearbyDevice> = {};
  for (const [id, dev] of Object.entries(current)) {
    if (dev.lastSeenAt >= cutoff) nearby[id] = dev;
    else mutated = true;
  }
  if (mutated) airdropStore.setState({ nearby });
}

// ── User shares (same-account direct download) ──────────────────────────────

/**
 * Replace the set of shares offered by this account's other devices. `selfId`
 * is the local device's peer id so we can filter out our OWN announcements, and
 * `nowMs` drops anything already expired. Called by the presence subscription.
 */
export function setUserShares(shares: UserShare[], selfId: string | null, nowMs: number): void {
  const next: Record<string, UserShare> = {};
  for (const share of filterIncomingShares(shares, selfId, nowMs)) {
    next[share.sessionId] = share;
  }
  airdropStore.setState({ userShares: next });
}

export function clearUserShares(): void {
  airdropStore.setState({ userShares: {} });
}

// ── Sessions ──────────────────────────────────────────────────────────────

export function putSession(session: ShareSession): void {
  const sessions = { ...airdropStore.getState().sessions, [session.id]: session };
  airdropStore.setState({ sessions });
}

export function patchSession(id: string, patch: Partial<ShareSession>): void {
  const current = airdropStore.getState().sessions[id];
  if (!current) return;
  const sessions = { ...airdropStore.getState().sessions, [id]: { ...current, ...patch } };
  airdropStore.setState({ sessions });
}

export function setSessionStatus(id: string, status: SessionStatus, error?: string): void {
  patchSession(id, { status, ...(error !== undefined ? { error } : {}) });
}

export function setSessionPayload(id: string, payload: SharePayloadDescriptor | null): void {
  patchSession(id, { payload });
}

export function setSessionTtl(id: string, ttl: SessionTtlPreset): void {
  const current = airdropStore.getState().sessions[id];
  if (!current) return;
  patchSession(id, { ttl, expiresAt: current.createdAt + TTL_PRESET_MS[ttl] });
}

export function removeSession(id: string): void {
  const sessions = { ...airdropStore.getState().sessions };
  delete sessions[id];
  const transfers = { ...airdropStore.getState().transfers };
  delete transfers[id];
  airdropStore.setState({ sessions, transfers });
}

// ── Transfers (progress only; bytes flow peer-to-peer, not through here) ──────

export function putTransfer(progress: TransferProgress): void {
  const transfers = { ...airdropStore.getState().transfers, [progress.sessionId]: progress };
  airdropStore.setState({ transfers });
}

export function patchTransfer(sessionId: string, patch: Partial<TransferProgress>): void {
  const current = airdropStore.getState().transfers[sessionId];
  if (!current) return;
  const transfers = { ...airdropStore.getState().transfers, [sessionId]: { ...current, ...patch } };
  airdropStore.setState({ transfers });
}

// ── Clock / expiration ──────────────────────────────────────────────────────

/**
 * Advance the store clock and auto-expire sessions whose TTL elapsed. Called by
 * the session-tick effect (see hooks/useSessionClock). Returns the ids expired
 * on this tick so the caller can clean up signaling/transport for them.
 */
export function tick(nowMs: number = Date.now()): string[] {
  const { sessions } = airdropStore.getState();
  const expired: string[] = [];
  let nextSessions: Record<string, ShareSession> | null = null;

  for (const [id, s] of Object.entries(sessions)) {
    const isLive = s.status !== 'expired' && s.status !== 'completed' && s.status !== 'cancelled';
    if (isLive && nowMs >= s.expiresAt) {
      if (!nextSessions) nextSessions = { ...sessions };
      nextSessions[id] = { ...s, status: 'expired' };
      expired.push(id);
    }
  }

  airdropStore.setState({ now: nowMs, ...(nextSessions ? { sessions: nextSessions } : {}) });
  return expired;
}

/** Test/util: reset the store to initial state. */
export function resetAirdropStore(): void {
  airdropStore.setState({ ...initialState, now: Date.now() });
}
