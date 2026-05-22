/**
 * Drives the AirDrop background lifecycle while the feature is mounted:
 *  - ensures `self` identity exists
 *  - ticks the clock every second to update countdowns
 *  - auto-expires sessions and tears down their transport/signaling
 *  - reaps stale nearby devices
 *
 * Mount this once at the AirDrop screen root.
 */
import { useEffect } from 'react';

import { ensureSelf, reapStaleNearby, tick } from '../store/airdropStore';
import { teardown } from '../sessions/sessionService';
import { PEER_STALE_AFTER_MS, SESSION_TICK_INTERVAL_MS } from '../constants';

export function useAirdropLifecycle(): void {
  useEffect(() => {
    ensureSelf();

    const interval = setInterval(() => {
      const now = Date.now();
      const expiredIds = tick(now);
      // Tear down transport/signaling for anything that just expired.
      expiredIds.forEach((id) => {
        void teardown(id);
      });
      reapStaleNearby(now - PEER_STALE_AFTER_MS);
    }, SESSION_TICK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);
}
