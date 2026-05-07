import React, { createContext, useEffect, useMemo, useState } from 'react';
import { Linking, Platform } from 'react-native';
import { User } from 'firebase/auth';

import { loadLastAuthTimestamp, saveLastAuthTimestamp, clearLastAuthTimestamp, saveBiometricEmail, loadBiometricEmail, clearBiometricEmail, saveBiometricEnabled, loadBiometricEnabled } from '../core/auth-storage';
import { diag } from '../core/diagnostics';
import { onFirebaseAuthState } from '../core/firebase';
import { loadSettings } from '../core/settings';
import { getBiometricStatus, authenticateWithBiometrics, type BiometricStatus } from '../core/biometrics';
import { clearQueue } from '../core/offlineQueue';
import { clearNotesChecksum } from '../core/syncChecksum';

import { getFirebaseGuardState, login, logout, register, sendPasswordReset, loginWithGoogle as loginWithGoogleService, sendMagicLink as sendMagicLinkService, verifyMagicLink as verifyMagicLinkService } from './authService';
import type { LoginOptions, RegisterProfile } from './authTypes';
import { AuthContextValue, FirebaseGuardState } from './authTypes';

const defaultFirebaseGuard: FirebaseGuardState = {
  enabled: false,
  message: 'Initializing Firebase configuration...',
  missingRequiredEnv: [],
  missingOptionalEnv: [],
};

const SESSION_MAX_AGE_MS = 15 * 24 * 60 * 60 * 1000;

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(false);
  const [firebase, setFirebase] = useState<FirebaseGuardState>(defaultFirebaseGuard);
  const [isBiometricLocked, setIsBiometricLocked] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<BiometricStatus>({ available: false, type: 'none', label: 'Not available' });

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let mounted = true;
    let deepLinkSubscription: ReturnType<typeof Linking.addEventListener> | undefined;

    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      // Check if it's a magic link from Firebase
      if (url.includes('mykit://') || url.includes('__/auth/action') || url.includes('oobCode')) {
        try {
          // Extract the full URL from the deep link
          let fullUrl = url;
          if (url.includes('mykit://')) {
            fullUrl = url.replace('mykit://', window.location.origin + '/?');
          } else if (url.includes('__/auth/action')) {
            // Already a valid Firebase auth URL
            fullUrl = url;
          }

          // For mobile, we need the email from storage
          const storedEmail = Platform.OS !== 'web' ? await loadBiometricEmail() : null;

          if (fullUrl && storedEmail) {
            // Only attempt verification if we have both URL and email
            await diag.info('auth.deeplink.magic', { url: fullUrl.substring(0, 50) });
          }
        } catch (error) {
          await diag.warn('auth.deeplink.error', { message: String(error) });
        }
      }
    };

    const bootstrap = async () => {
      try {
        // Get biometric status
        const status = await getBiometricStatus();
        if (mounted) setBiometricStatus(status);

        const guard = await getFirebaseGuardState();
        if (mounted) {
          setFirebase(guard);
          await diag.info('auth.firebase.guard', {
            enabled: guard.enabled,
            missingRequired: guard.missingRequiredEnv,
            missingOptional: guard.missingOptionalEnv,
          });
        }

        unsubscribe = await onFirebaseAuthState((nextUser) => {
          if (!mounted) return;
          (async () => {
            if (!nextUser) {
              setUser(null);
              setIsGuest(false);
              setIsBiometricLocked(false);
              void diag.info('auth.state.changed', { authenticated: false });
              setIsLoading(false);
              return;
            }

            const appSettings = await loadSettings();
            const staySignedIn = appSettings.staySignedIn ?? true;
            const lastAuthTs = await loadLastAuthTimestamp();
            const sessionExpired = lastAuthTs > 0 && Date.now() - lastAuthTs > SESSION_MAX_AGE_MS;

            if (!staySignedIn || sessionExpired) {
              await logout().catch(() => undefined);
              await clearLastAuthTimestamp();
              if (mounted) {
                setUser(null);
                setIsGuest(false);
                setIsBiometricLocked(false);
                setIsLoading(false);
              }
              void diag.info('auth.session.relogin_required', {
                reason: !staySignedIn ? 'stay_signed_in_disabled' : 'expired_15_days',
              });
              return;
            }

            // Check if biometric email is saved and biometric is enabled
            const biometricEnabled = await loadBiometricEnabled();
            const biometricEmail = await loadBiometricEmail();
            const shouldLockWithBiometric = biometricEnabled && biometricEmail && status.available;

            if (shouldLockWithBiometric) {
              if (mounted) setIsBiometricLocked(true);
            } else {
              // Update timestamp to extend session
              await saveLastAuthTimestamp(Date.now());
              setUser(nextUser);
              setIsGuest(false);
              setIsBiometricLocked(false);
              void diag.info('auth.state.changed', { authenticated: true, uid: nextUser.uid });
              setIsLoading(false);
            }
          })().catch(async (error) => {
            await diag.error('auth.state.error', { message: String(error) });
            if (mounted) {
              setIsBiometricLocked(false);
              setIsLoading(false);
            }
          });
        });

        // Setup deep link listener for magic links (mobile only)
        if (Platform.OS !== 'web') {
          deepLinkSubscription = Linking.addEventListener('url', handleDeepLink);
        }
      } catch (error) {
        await diag.error('auth.bootstrap.error', { message: String(error) });
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
      unsubscribe?.();
      deepLinkSubscription?.remove();
    };
  }, []);

  const enterAsGuest = () => {
    setIsGuest(true);
    setUser(null);
    void diag.info('auth.guest.enabled');
  };

  const loginWithEmailPassword = async (email: string, password: string, options?: LoginOptions) => {
    const authenticatedUser = await login(email, password, options);
    setIsGuest(false);
    setUser(authenticatedUser);
    await saveLastAuthTimestamp(Date.now());
    if (biometricStatus.available) {
      await saveBiometricEmail(email);
      await saveBiometricEnabled(true);
    }
    await diag.info('auth.login.success', { uid: authenticatedUser.uid });
    return authenticatedUser;
  };

  const registerWithEmailPassword = async (email: string, password: string, profile?: RegisterProfile) => {
    const authenticatedUser = await register(email, password, profile);
    setIsGuest(false);
    setUser(authenticatedUser);
    await saveLastAuthTimestamp(Date.now());
    if (biometricStatus.available) {
      await saveBiometricEmail(email);
      await saveBiometricEnabled(true);
    }
    await diag.info('auth.register.success', { uid: authenticatedUser.uid });
    return authenticatedUser;
  };

  const sendResetPasswordEmail = async (email: string) => {
    await sendPasswordReset(email);
    await diag.info('auth.reset.sent', { email });
  };

  const loginWithGoogleWrapper = async () => {
    const isMobile = Platform.OS !== 'web';
    const authenticatedUser = await loginWithGoogleService(isMobile);
    setIsGuest(false);
    setUser(authenticatedUser);
    await saveLastAuthTimestamp(Date.now());
    if (biometricStatus.available) {
      await saveBiometricEmail(authenticatedUser.email || '');
      await saveBiometricEnabled(true);
    }
    await diag.info('auth.google.success', { uid: authenticatedUser.uid });
    return authenticatedUser;
  };

  const sendMagicLinkWrapper = async (email: string) => {
    const redirectUrl = Platform.OS === 'web' ? window.location.origin : 'mykit://auth';
    await sendMagicLinkService(email, redirectUrl);
    await diag.info('auth.magiclink.sent', { email: email.split('@')[0] });
  };

  const verifyMagicLinkWrapper = async (email: string, url: string) => {
    const authenticatedUser = await verifyMagicLinkService(email, url);
    setIsGuest(false);
    setUser(authenticatedUser);
    await saveLastAuthTimestamp(Date.now());
    if (biometricStatus.available) {
      await saveBiometricEmail(email);
      await saveBiometricEnabled(true);
    }
    await diag.info('auth.magiclink.success', { uid: authenticatedUser.uid });
    return authenticatedUser;
  };

  const unlockWithBiometric = async () => {
    const success = await authenticateWithBiometrics('Unlock MyKit');
    if (success) {
      await saveLastAuthTimestamp(Date.now());
      setIsBiometricLocked(false);
      setUser(user); // Keep existing user
      return true;
    }
    return false;
  };

  const logoutCurrentUser = async () => {
    await clearQueue();
    await clearNotesChecksum();
    await logout();
    await clearBiometricEmail();
    await saveBiometricEnabled(false);
    setUser(null);
    setIsGuest(false);
    setIsBiometricLocked(false);
    await clearLastAuthTimestamp();
    await diag.info('auth.logout.success');
  };

  const value = useMemo<AuthContextValue>(() => ({
    user,
    isLoading,
    isGuest,
    isBiometricLocked,
    biometricStatus,
    firebase,
    enterAsGuest,
    login: loginWithEmailPassword,
    register: registerWithEmailPassword,
    sendPasswordReset: sendResetPasswordEmail,
    loginWithGoogle: loginWithGoogleWrapper,
    sendMagicLink: sendMagicLinkWrapper,
    verifyMagicLink: verifyMagicLinkWrapper,
    unlockWithBiometric,
    logout: logoutCurrentUser,
  }), [firebase, isGuest, isLoading, user, isBiometricLocked, biometricStatus]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
