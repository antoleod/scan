/**
 * useCloudRelayGuard — periodically checks the cloud relay global state.
 *
 * Runs once on mount and every 5 minutes while the app is open.
 * If the global quota is exceeded, triggers the automatic shutdown.
 * Also exposes the current relay status for UI gating.
 *
 * This hook must be mounted high in the tree (e.g. MainAppScreen) so the
 * check runs while the user is active. It is a no-op when Firebase is
 * unavailable or the user is not authenticated.
 */
import { useEffect, useState } from 'react';
import { checkAndApplyGlobalShutdown, getGlobalRelayState } from '../core/transferQuotaService';
import { runCleanupPass } from '../core/transferCleanupService';
import { useAuth } from '../auth/useAuth';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export interface CloudRelayGuardState {
  enabled: boolean;
  emergencyStop: boolean;
  checkedAt: number | null;
}

export function useCloudRelayGuard(): CloudRelayGuardState {
  const { user } = useAuth();
  const [state, setState] = useState<CloudRelayGuardState>({
    enabled: false,
    emergencyStop: false,
    checkedAt: null,
  });

  useEffect(() => {
    if (!user) return;

    const check = async () => {
      await checkAndApplyGlobalShutdown();
      void runCleanupPass(); // fire-and-forget cleanup on each periodic tick
      const global = await getGlobalRelayState();
      setState({
        enabled: global?.enabled ?? false,
        emergencyStop: global?.emergencyStop ?? false,
        checkedAt: Date.now(),
      });
    };

    void check();
    const id = setInterval(() => void check(), CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user?.uid]);

  return state;
}
