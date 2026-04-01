import { User } from 'firebase/auth';

import { diag } from '../core/diagnostics';
import {
  getFirebaseRuntimeSnapshot,
  loginWithEmail,
  logoutFirebase,
  registerWithEmail,
  sendResetPasswordEmail,
} from '../core/firebase';

import { FirebaseGuardState } from './authTypes';

function readFirebaseErrorCode(error: unknown): string {
  if (typeof error === 'object' && error && 'code' in error) {
    return String((error as { code?: string }).code || '');
  }

  return '';
}

function readFirebaseErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Authentication could not be completed.';
}

export function toFriendlyAuthError(error: unknown): string {
  const code = readFirebaseErrorCode(error);
  const map: Record<string, string> = {
    'auth/invalid-email': 'Email format is invalid.',
    'auth/user-not-found': 'No account exists with this email.',
    'auth/wrong-password': 'Password is incorrect.',
    'auth/invalid-credential': 'Invalid credentials. Check email and password.',
    'auth/email-already-in-use': 'This email is already registered.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/too-many-requests': 'Too many attempts. Try again in a few minutes.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.',
    'auth/missing-password': 'Password is required.',
  };

  if (code && map[code]) {
    return map[code];
  }

  const message = readFirebaseErrorMessage(error);
  if (message.toLowerCase().includes('firebase not configured') || message.toLowerCase().includes('missing variables')) {
    return message;
  }

  return 'Authentication failed. Please try again.';
}

export async function getFirebaseGuardState(): Promise<FirebaseGuardState> {
  const runtime = await getFirebaseRuntimeSnapshot();

  if (runtime.enabled) {
    const optionalMessage = runtime.missingOptionalEnv.length
      ? `Optional variables not set: ${runtime.missingOptionalEnv.join(', ')}`
      : 'Firebase is configured correctly.';

    return {
      enabled: true,
      message: optionalMessage,
      missingRequiredEnv: runtime.missingRequiredEnv,
      missingOptionalEnv: runtime.missingOptionalEnv,
    };
  }

  const missing = runtime.missingRequiredEnv.join(', ');

  return {
    enabled: false,
    message: missing
      ? `Firebase not configured. Missing variables: ${missing}`
      : 'Firebase not configured in this build.',
    missingRequiredEnv: runtime.missingRequiredEnv,
    missingOptionalEnv: runtime.missingOptionalEnv,
  };
}

export async function login(email: string, password: string): Promise<User> {
  await diag.info('auth.login.attempt', { emailDomain: (email.split('@')[1] || '').toLowerCase() || 'n/a' });
  try {
    return await loginWithEmail(email, password);
  } catch (error) {
    const friendly = toFriendlyAuthError(error);
    await diag.warn('auth.login.error', { reason: friendly, raw: readFirebaseErrorCode(error) || readFirebaseErrorMessage(error) });
    throw new Error(friendly);
  }
}

export async function register(email: string, password: string): Promise<User> {
  await diag.info('auth.register.attempt', { emailDomain: (email.split('@')[1] || '').toLowerCase() || 'n/a' });
  try {
    return await registerWithEmail(email, password);
  } catch (error) {
    const friendly = toFriendlyAuthError(error);
    await diag.warn('auth.register.error', { reason: friendly, raw: readFirebaseErrorCode(error) || readFirebaseErrorMessage(error) });
    throw new Error(friendly);
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  await diag.info('auth.reset.attempt', { emailDomain: (email.split('@')[1] || '').toLowerCase() || 'n/a' });
  try {
    await sendResetPasswordEmail(email);
  } catch (error) {
    const friendly = toFriendlyAuthError(error);
    await diag.warn('auth.reset.error', { reason: friendly });
    throw new Error(friendly);
  }
}

export async function logout(): Promise<void> {
  try {
    await logoutFirebase();
  } catch (error) {
    const friendly = toFriendlyAuthError(error);
    await diag.warn('auth.logout.error', { reason: friendly });
    throw new Error(friendly);
  }
}
