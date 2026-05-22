/**
 * Pure helpers for same-account share presence — NO React, NO Firebase imports,
 * so they can be unit-tested in the Node test runner and reused by the store.
 */
import type { UserShare } from '../types';

/** Defensive shape guard — RTDB can hand back partial/legacy/forged nodes. */
export function isValidShare(s: unknown): s is UserShare {
  if (!s || typeof s !== 'object') return false;
  const v = s as Partial<UserShare>;
  return (
    typeof v.sessionId === 'string' &&
    typeof v.token === 'string' &&
    typeof v.hostPeerId === 'string' &&
    typeof v.fileName === 'string' &&
    Number.isFinite(v.expiresAt)
  );
}

/**
 * Filter the shares to surface in "My Devices": drop our OWN device's
 * announcements (so we never see our own share echoed back) and anything
 * already expired. Returns a new array; input is not mutated.
 */
export function filterIncomingShares(
  shares: UserShare[],
  selfId: string | null,
  nowMs: number,
): UserShare[] {
  return shares.filter((share) => {
    if (!isValidShare(share)) return false;
    if (selfId && share.hostPeerId === selfId) return false; // hide our own
    if (share.expiresAt <= nowMs) return false; // hide expired
    return true;
  });
}
