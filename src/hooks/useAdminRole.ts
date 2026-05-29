/**
 * Hook: current user's admin role.
 *
 * Fetches once on mount (and whenever uid changes) from `/admins/{uid}`.
 * Result is cached in adminRole.ts for 5 minutes so repeated renders are free.
 */
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { getAdminRole, type AdminRole } from '../core/adminRole';

export interface AdminRoleState {
  role: AdminRole;
  isAdmin: boolean;
  isTester: boolean;
  isLoading: boolean;
}

export function useAdminRole(): AdminRoleState {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [state, setState] = useState<AdminRoleState>({
    role: 'user',
    isAdmin: false,
    isTester: false,
    isLoading: Boolean(uid),
  });

  useEffect(() => {
    if (!uid) {
      setState({ role: 'user', isAdmin: false, isTester: false, isLoading: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, isLoading: true }));
    void getAdminRole(uid).then((role) => {
      if (cancelled) return;
      setState({
        role,
        isAdmin: role === 'admin',
        isTester: role === 'admin' || role === 'tester',
        isLoading: false,
      });
    });
    return () => { cancelled = true; };
  }, [uid]);

  return state;
}
