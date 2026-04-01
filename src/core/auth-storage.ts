import AsyncStorage from '@react-native-async-storage/async-storage';

const LAST_IDENTIFIER_KEY = '@barra_last_identifier_v1';
const ONBOARDING_DONE_KEY = '@barra_onboarding_done_v1';

export async function saveLastIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return;
  await AsyncStorage.setItem(LAST_IDENTIFIER_KEY, value);
}

export async function loadLastIdentifier() {
  return AsyncStorage.getItem(LAST_IDENTIFIER_KEY);
}

export async function setOnboardingDone(done: boolean) {
  await AsyncStorage.setItem(ONBOARDING_DONE_KEY, done ? '1' : '0');
}

export async function isOnboardingDone() {
  return (await AsyncStorage.getItem(ONBOARDING_DONE_KEY)) === '1';
}
