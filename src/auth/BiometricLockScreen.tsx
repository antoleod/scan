import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from './useAuth';
import { useAppTheme } from '../constants/theme';
import { loadLastIdentifier } from '../core/auth-storage';

export default function BiometricLockScreen() {
  const { biometricStatus, unlockWithBiometric } = useAuth();
  const { theme } = useAppTheme();
  const [lastUsername, setLastUsername] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUsername = async () => {
      const username = await loadLastIdentifier();
      setLastUsername(username);
    };
    loadUsername();
  }, []);

  useEffect(() => {
    // Auto-trigger biometric on mount
    const autoUnlock = async () => {
      setIsUnlocking(true);
      const success = await unlockWithBiometric();
      if (!success) {
        setError('Biometric authentication failed. Try again or use password.');
        setIsUnlocking(false);
      }
    };

    if (biometricStatus.available && !isUnlocking) {
      autoUnlock();
    }
  }, [biometricStatus, unlockWithBiometric]);

  const handleManualUnlock = async () => {
    setIsUnlocking(true);
    setError(null);
    const success = await unlockWithBiometric();
    if (!success) {
      setError('Biometric authentication failed. Try again or use password.');
    }
    setIsUnlocking(false);
  };

  const getBiometricIcon = () => {
    switch (biometricStatus.type) {
      case 'face':
        return 'id-card';
      case 'fingerprint':
        return 'scan';
      case 'iris':
        return 'eye';
      default:
        return 'lock-closed';
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      {/* Background accent */}
      <View
        style={[
          styles.accentBlob,
          { backgroundColor: theme.secondary + '15' },
        ]}
      />

      {/* Icon and title */}
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <View
            style={[
              styles.iconBg,
              { borderColor: theme.secondary },
            ]}
          >
            <Ionicons
              name={getBiometricIcon()}
              size={48}
              color={theme.secondary}
            />
          </View>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>
          Unlock MyKit
        </Text>

        {lastUsername && (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Welcome back, {lastUsername}
          </Text>
        )}

        {error && (
          <Text style={[styles.errorText, { color: theme.error }]}>
            {error}
          </Text>
        )}

        <Pressable
          onPress={handleManualUnlock}
          disabled={isUnlocking}
          style={[
            styles.primaryButton,
            { backgroundColor: theme.secondary },
            isUnlocking && styles.buttonDisabled,
          ]}
        >
          {isUnlocking ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <>
              <Ionicons
                name={getBiometricIcon()}
                size={24}
                color={theme.primary}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.buttonText, { color: theme.primary }]}>
                {biometricStatus.label}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      {/* This screen doesn't allow password fallback here —
          that's handled by AuthScreen routing based on isBiometricLocked state */}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  accentBlob: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 300,
    height: 300,
    borderRadius: 150,
    opacity: 0.1,
  },
  content: {
    alignItems: 'center',
    zIndex: 1,
  },
  iconContainer: {
    marginBottom: 32,
  },
  iconBg: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    marginBottom: 12,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 13,
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    minWidth: 240,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
