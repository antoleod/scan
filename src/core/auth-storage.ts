import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const LAST_IDENTIFIER_KEY = '@barra_last_identifier_v1';
const ONBOARDING_DONE_KEY = '@barra_onboarding_done_v1';
const SAVED_CREDENTIALS_KEY = '@barra_saved_credentials_v1';
const REMEMBER_PASSWORD_KEY = '@barra_remember_password_v1';
const LAST_AUTH_TS_KEY = '@barra_last_auth_ts_v1';

export async function saveLastIdentifier(identifier: string) {
  const value = identifier.trim();
  if (!value) return;
  await AsyncStorage.setItem(LAST_IDENTIFIER_KEY, value);
}

export async function loadLastIdentifier() {
  return AsyncStorage.getItem(LAST_IDENTIFIER_KEY);
}

type EncryptedCredentialsPayload = {
  v: 1;
  identifier: string;
  iv: string;
  cipher: string;
  updatedAt: number;
};

function bytesToBase64(input: Uint8Array) {
  let binary = '';
  for (let i = 0; i < input.length; i += 1) {
    binary += String.fromCharCode(input[i]);
  }
  return btoa(binary);
}

function base64ToBytes(input: string) {
  const binary = atob(input);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveWebKey(): Promise<CryptoKey | null> {
  if (Platform.OS !== 'web') return null;
  if (typeof window === 'undefined' || !window.crypto?.subtle) return null;

  const material = `${window.location.origin}|${window.navigator.userAgent}|barra-web-credential-lock-v1`;
  const hash = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
  return window.crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function saveRememberPasswordPreference(enabled: boolean) {
  await AsyncStorage.setItem(REMEMBER_PASSWORD_KEY, enabled ? '1' : '0');
}

export async function loadRememberPasswordPreference() {
  return (await AsyncStorage.getItem(REMEMBER_PASSWORD_KEY)) === '1';
}

export async function clearSavedCredentials() {
  await AsyncStorage.removeItem(SAVED_CREDENTIALS_KEY);
}

export async function saveEncryptedCredentials(identifier: string, password: string) {
  const normalizedIdentifier = identifier.trim().toLowerCase();
  const normalizedPassword = password.trim();
  if (!normalizedIdentifier || !normalizedPassword) return false;

  const key = await deriveWebKey();
  if (!key || Platform.OS !== 'web') return false;

  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(normalizedPassword);
  const encryptedBuffer = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);

  const payload: EncryptedCredentialsPayload = {
    v: 1,
    identifier: normalizedIdentifier,
    iv: bytesToBase64(iv),
    cipher: bytesToBase64(new Uint8Array(encryptedBuffer)),
    updatedAt: Date.now(),
  };

  await AsyncStorage.setItem(SAVED_CREDENTIALS_KEY, JSON.stringify(payload));
  return true;
}

export async function loadEncryptedCredentials() {
  const raw = await AsyncStorage.getItem(SAVED_CREDENTIALS_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as EncryptedCredentialsPayload;
    if (!parsed?.identifier || !parsed?.iv || !parsed?.cipher) return null;

    const key = await deriveWebKey();
    if (!key || Platform.OS !== 'web') return null;

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(parsed.iv) },
      key,
      base64ToBytes(parsed.cipher)
    );

    return {
      identifier: parsed.identifier,
      password: new TextDecoder().decode(decryptedBuffer),
    };
  } catch {
    return null;
  }
}

export async function saveLastAuthTimestamp(ts: number) {
  await AsyncStorage.setItem(LAST_AUTH_TS_KEY, String(ts));
}

export async function loadLastAuthTimestamp() {
  const raw = await AsyncStorage.getItem(LAST_AUTH_TS_KEY);
  const parsed = Number(raw || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export async function clearLastAuthTimestamp() {
  await AsyncStorage.removeItem(LAST_AUTH_TS_KEY);
}

export async function setOnboardingDone(done: boolean) {
  await AsyncStorage.setItem(ONBOARDING_DONE_KEY, done ? '1' : '0');
}

export async function isOnboardingDone() {
  return (await AsyncStorage.getItem(ONBOARDING_DONE_KEY)) === '1';
}
