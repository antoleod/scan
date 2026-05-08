export const LOGIN_ROUTE = '/login';
export const MAIN_APP_ROUTE = '/app';

export function isFirebaseAuthActionRoute(pathname: string): boolean {
  return pathname.includes('__/auth/action');
}

export function getAuthRedirectPath(pathname: string, isAuthenticated: boolean): string | null {
  if (isFirebaseAuthActionRoute(pathname)) return null;

  if (isAuthenticated) {
    return pathname === '/' || pathname === LOGIN_ROUTE ? MAIN_APP_ROUTE : null;
  }

  return pathname === LOGIN_ROUTE ? null : LOGIN_ROUTE;
}
