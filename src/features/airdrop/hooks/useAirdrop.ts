/**
 * React hooks for consuming the AirDrop store and driving its lifecycle.
 *
 * Selectors return memo-stable slices via the store's useSyncExternalStore
 * binding. Derived arrays are memoized in the hook so list components don't
 * re-render unless the underlying maps actually change.
 */
import { useMemo } from 'react';

import { airdropStore } from '../store/airdropStore';
import type { AirdropState } from '../store/airdropStore';
import type { NearbyDevice, PeerInfo, ShareSession, TransferProgress, UserShare } from '../types';

/** Generic selector hook. */
export function useAirdrop<S>(selector: (s: AirdropState) => S): S {
  return airdropStore.use(selector);
}

/** This device's identity (may be null before init). */
export function useSelf(): PeerInfo | null {
  return airdropStore.use((s) => s.self);
}

/** The store clock tick (drives countdown re-renders). */
export function useAirdropNow(): number {
  return airdropStore.use((s) => s.now);
}

/** Nearby devices as a stable, recency-sorted array. */
export function useNearbyDevices(): NearbyDevice[] {
  const map = airdropStore.use((s) => s.nearby);
  return useMemo(
    () => Object.values(map).sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    [map],
  );
}

/** All sessions, newest first. */
export function useSessions(): ShareSession[] {
  const map = airdropStore.use((s) => s.sessions);
  return useMemo(
    () => Object.values(map).sort((a, b) => b.createdAt - a.createdAt),
    [map],
  );
}

/** Only sessions that are still live (not expired/cancelled/completed). */
export function useActiveSessions(): ShareSession[] {
  const sessions = useSessions();
  return useMemo(
    () =>
      sessions.filter(
        (s) => s.status !== 'expired' && s.status !== 'cancelled' && s.status !== 'completed',
      ),
    [sessions],
  );
}

/** A single session by id. */
export function useSession(id: string | null): ShareSession | null {
  return airdropStore.use((s) => (id ? s.sessions[id] ?? null : null));
}

/** Transfer progress for a session (null until a transfer starts). */
export function useTransfer(id: string | null): TransferProgress | null {
  return airdropStore.use((s) => (id ? s.transfers[id] ?? null : null));
}

/**
 * Shares offered by THIS account's other devices, newest first. Drives the
 * "My Devices" direct-download list. Empty in guest mode. Self/expired entries
 * are already filtered out by the presence sync before they reach the store.
 */
export function useUserShares(): UserShare[] {
  const map = airdropStore.use((s) => s.userShares);
  return useMemo(
    () => Object.values(map).sort((a, b) => b.createdAt - a.createdAt),
    [map],
  );
}
