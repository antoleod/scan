import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface BiometricStatus {
  available: boolean;
  type: 'fingerprint' | 'face' | 'iris' | 'none';
  label: string;
}

export async function getBiometricStatus(): Promise<BiometricStatus> {
  // Biometrics only available on mobile
  if (Platform.OS === 'web') {
    return { available: false, type: 'none', label: 'Not available on web' };
  }

  try {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    if (!compatible) {
      return { available: false, type: 'none', label: 'No biometric hardware' };
    }

    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (!enrolled) {
      return { available: false, type: 'none', label: 'Biometric not enrolled' };
    }

    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    let type: 'fingerprint' | 'face' | 'iris' = 'fingerprint';
    let label = 'Fingerprint';

    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      type = 'face';
      label = Platform.OS === 'ios' ? 'Face ID' : 'Face Unlock';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      type = 'fingerprint';
      label = Platform.OS === 'ios' ? 'Touch ID' : 'Fingerprint';
    } else if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      type = 'iris';
      label = 'Iris Scan';
    }

    return { available: true, type, label };
  } catch {
    return { available: false, type: 'none', label: 'Error checking biometrics' };
  }
}

export async function authenticateWithBiometrics(reason: string = 'Unlock MyKit'): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }

  try {
    const status = await getBiometricStatus();
    if (!status.available) {
      return false;
    }

    const result = await LocalAuthentication.authenticateAsync({
      disableDeviceFallback: false,
      fallbackLabel: 'Use passcode',
    });

    return result.success;
  } catch {
    return false;
  }
}
