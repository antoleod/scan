import AsyncStorage from '@react-native-async-storage/async-storage';

const TWOFA_STORAGE_KEY = '@MyKit_2fa_code_v1';
const TWOFA_ENABLED_KEY = '@MyKit_2fa_enabled_v1';
const TWOFA_TIMESTAMP_KEY = '@MyKit_2fa_timestamp_v1';
const TWOFA_CODE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

export interface TwoFAConfig {
  enabled: boolean;
  method: 'email' | 'sms';
  verified: boolean;
}

/**
 * Generate a random 6-digit code
 */
export function generateTwoFACode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * Save 2FA code temporarily (10-minute expiry)
 */
export async function saveTwoFACode(code: string, email: string): Promise<void> {
  const data = {
    code,
    email,
    timestamp: Date.now(),
  };
  await AsyncStorage.setItem(TWOFA_STORAGE_KEY, JSON.stringify(data));
}

/**
 * Verify 2FA code against stored code
 */
export async function verifyTwoFACode(inputCode: string): Promise<{ valid: boolean; message: string }> {
  try {
    const stored = await AsyncStorage.getItem(TWOFA_STORAGE_KEY);
    if (!stored) {
      return { valid: false, message: 'No 2FA code found. Request a new one.' };
    }

    const data = JSON.parse(stored);
    const { code, timestamp } = data;

    // Check expiry
    if (Date.now() - timestamp > TWOFA_CODE_EXPIRY_MS) {
      await AsyncStorage.removeItem(TWOFA_STORAGE_KEY);
      return { valid: false, message: '2FA code expired. Request a new one.' };
    }

    // Check code
    if (inputCode === code) {
      await AsyncStorage.removeItem(TWOFA_STORAGE_KEY);
      return { valid: true, message: 'Verified' };
    }

    return { valid: false, message: 'Invalid 2FA code. Try again.' };
  } catch {
    return { valid: false, message: 'Error verifying code.' };
  }
}

/**
 * Clear 2FA code
 */
export async function clearTwoFACode(): Promise<void> {
  await AsyncStorage.removeItem(TWOFA_STORAGE_KEY);
  await AsyncStorage.removeItem(TWOFA_TIMESTAMP_KEY);
}

/**
 * Enable/disable 2FA for user
 */
export async function setTwoFAEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(TWOFA_ENABLED_KEY, enabled ? '1' : '0');
}

/**
 * Check if 2FA is enabled
 */
export async function isTwoFAEnabled(): Promise<boolean> {
  const value = await AsyncStorage.getItem(TWOFA_ENABLED_KEY);
  return value === '1';
}

/**
 * Get stored 2FA email
 */
export async function getTwoFAEmail(): Promise<string | null> {
  const stored = await AsyncStorage.getItem(TWOFA_STORAGE_KEY);
  if (!stored) return null;
  try {
    const data = JSON.parse(stored);
    return data.email || null;
  } catch {
    return null;
  }
}
