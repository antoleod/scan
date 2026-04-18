import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_IDENTIFIER_KEY = '@barra_last_identifier_v1';
const ONBOARDING_DONE_KEY = '@barra_onboarding_done_v1';
/** @deprecated Legacy key — cleared on startup; passwords are never stored locally anymore. */
const SAVED_CREDENTIALS_KEY = '@barra_saved_credentials_v1';

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
