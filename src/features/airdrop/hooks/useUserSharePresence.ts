/**
 * Keeps the store's `userShares` in sync with the shares this account's other
 * devices are currently offering, so the "My Devices" list can show a direct
 * (no-QR) download for each one.
 *
 * Re-subscribes whenever Firebase auth state changes (login / logout / device
 * switch) so a freshly signed-in user immediately sees their other device's
 * shares, and a guest sees none.
 */
import { useEffect } from 'react';

import { onFirebaseAuthState } from '../../../core/firebase';
import { subscribeUserShares } from '../presence/userPresence';
import { setUserShares, clearUserShares, airdropStore } from '../store/airdropStore';

export function useUserSharePresence(): void {
  useEffect(() => {
    let unsubShares: (() => void) | null = null;
    let unsubAuth: (() => void) | null = null;
    let mounted = true;

    const resubscribe = () => {
      unsubShares?.();
      clearUserShares();
      unsubShares = subscribeUserShares((shares) => {
        if (!mounted) return;
        const { self, now } = airdropStore.getState();
        setUserShares(shares, self?.id ?? null, now);
      });
    };

    void (async () => {
      // Initial subscription (covers the already-signed-in case).
      resubscribe();
      // React to login/logout/device-switch by re-subscribing under the new uid.
      unsubAuth = (await onFirebaseAuthState(() => {
        if (mounted) resubscribe();
      })) as () => void;
    })();

    return () => {
      mounted = false;
      unsubShares?.();
      unsubAuth?.();
      clearUserShares();
    };
  }, []);
}
