import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PIN_KEY = 'mykit_notes_pin_v1';
const PIN_SALT = 'mykit-notes-2026';

function hashPin(pin: string): string {
  const input = `${PIN_SALT}::${pin}::${PIN_SALT}`;
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i);
    h1 = ((h1 * 33) ^ c) & 0xffffffff;
    h2 = ((h2 * 31) + c) & 0xffffffff;
  }
  return `${(h1 >>> 0).toString(16)}-${(h2 >>> 0).toString(16)}`;
}

async function readStored(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return AsyncStorage.getItem(PIN_KEY);
  }
  try {
    return await SecureStore.getItemAsync(PIN_KEY);
  } catch {
    return AsyncStorage.getItem(PIN_KEY);
  }
}

async function writeStored(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.setItem(PIN_KEY, value);
    return;
  }
  try {
    await SecureStore.setItemAsync(PIN_KEY, value);
  } catch {
    await AsyncStorage.setItem(PIN_KEY, value);
  }
}

async function deleteStored(): Promise<void> {
  if (Platform.OS === 'web') {
    await AsyncStorage.removeItem(PIN_KEY);
    return;
  }
  try {
    await SecureStore.deleteItemAsync(PIN_KEY);
  } catch {
    await AsyncStorage.removeItem(PIN_KEY);
  }
}

export async function hasPin(): Promise<boolean> {
  const stored = await readStored();
  return Boolean(stored && stored.length > 0);
}

export async function savePin(pin: string): Promise<void> {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN must be 6 digits');
  await writeStored(hashPin(pin));
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (!/^\d{6}$/.test(pin)) return false;
  const stored = await readStored();
  if (!stored) return false;
  return stored === hashPin(pin);
}

export async function clearPin(): Promise<void> {
  await deleteStored();
}
