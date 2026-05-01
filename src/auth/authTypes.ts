import { User } from 'firebase/auth';

import { FirebaseOptionalEnvKey, FirebaseRequiredEnvKey } from '../core/firebase';
import type { BiometricStatus } from '../core/biometrics';

export type AuthView = 'login' | 'register' | 'forgot';

export type AuthEmailSource = 'recoveryEmail' | 'internalUsername' | 'googleOAuth';

export interface RegisterProfile {
  username?: string;
  recoveryEmail?: string;
  phone?: string;
  authEmailSource?: AuthEmailSource;
}

/** Web: maps to Firebase `setPersistence` (local vs session). No password is stored locally. */
export type LoginOptions = { persistSession?: boolean };

export interface FirebaseGuardState {
  enabled: boolean;
  message: string;
  missingRequiredEnv: FirebaseRequiredEnvKey[];
  missingOptionalEnv: FirebaseOptionalEnvKey[];
}

export interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isGuest: boolean;
  isBiometricLocked: boolean;
  biometricStatus: BiometricStatus;
  firebase: FirebaseGuardState;
  enterAsGuest: () => void;
  login: (email: string, password: string, options?: LoginOptions) => Promise<User>;
  register: (email: string, password: string, profile?: RegisterProfile) => Promise<User>;
  sendPasswordReset: (email: string) => Promise<void>;
  loginWithGoogle: () => Promise<User>;
  sendMagicLink: (email: string) => Promise<void>;
  verifyMagicLink: (email: string, url: string) => Promise<User>;
  unlockWithBiometric: () => Promise<boolean>;
  logout: () => Promise<void>;
}
