import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const LAST_IDENTIFIER_KEY = '@barra_last_identifier_v1';
const ONBOARDING_DONE_KEY = '@barra_onboarding_done_v1';
/** @deprecated Legacy key — cleared on startup; passwords are never stored locally anymore. */
const SAVED_CREDENTIALS_KEY = '@barra_saved_credentials_v1';
const BIOMETRIC_EMAIL_KEY = '@MyKit_biometric_email_v1';
const BIOMETRIC_ENABLED_KEY = '@MyKit_biometric_enabled_v1';

export async function saveLastIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return;
  await AsyncStorage.setItem(LAST_IDENTIFIER_KEY, value);
}

export async function loadLastIdentifier() {
  return AsyncStorage.getItem(LAST_IDENTIFIER_KEY);
}

/** Removes any legacy encrypted credential blob from older app versions. */
export async function clearSavedCredentials() {
  await AsyncStorage.removeItem(SAVED_CREDENTIALS_KEY);
}

export async function saveLastAuthTimestamp(ts: number) {
  await AsyncStorage.setItem('@barra_last_auth_ts_v1', String(ts));
}

export async function loadLastAuthTimestamp() {
  const raw = await AsyncStorage.getItem('@barra_last_auth_ts_v1');
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function clearLastAuthTimestamp() {
  await AsyncStorage.removeItem('@barra_last_auth_ts_v1');
}

export async function setOnboardingDone(done: boolean) {
  await AsyncStorage.setItem(ONBOARDING_DONE_KEY, done ? '1' : '0');
}

export async function isOnboardingDone() {
  return (await AsyncStorage.getItem(ONBOARDING_DONE_KEY)) === '1';
}

// ─── Biometric Email Storage ───────────────────────────────────────

export async function saveBiometricEmail(email: string): Promise<void> {
  const value = email.trim().toLowerCase();
  if (!value) return;
  try {
    await SecureStore.setItemAsync(BIOMETRIC_EMAIL_KEY, value);
  } catch {
    // Fallback on web or if secure store unavailable
  }
}

export async function loadBiometricEmail(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(BIOMETRIC_EMAIL_KEY);
  } catch {
    return null;
  }
}

export async function clearBiometricEmail(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(BIOMETRIC_EMAIL_KEY);
  } catch {
    // Ignore
  }
}

export async function saveBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? '1' : '0');
}

export async function loadBiometricEnabled(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(BIOMETRIC_ENABLED_KEY);
    return value === '1';
  } catch {
    return false;
  }
}
