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
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  withRepeat,
  withTiming,
  useSharedValue,
  useAnimatedStyle,
  interpolate,
} from 'react-native-reanimated';

import { useTranslation } from 'react-i18next';
import { useAuth } from './useAuth';
import { useAppTheme } from '../constants/theme';
import { loadLastIdentifier } from '../core/auth-storage';

export default function BiometricLockScreen() {
  const { t } = useTranslation();
  const { biometricStatus, unlockWithBiometric } = useAuth();
  const { theme } = useAppTheme();
  const [lastUsername, setLastUsername] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animations
  const scanPulse = useSharedValue(0);
  const iconGlow = useSharedValue(0);
  const successPulse = useSharedValue(0);

  useEffect(() => {
    const loadUsername = async () => {
      const username = await loadLastIdentifier();
      setLastUsername(username);
    };
    loadUsername();
  }, []);

  // Animate scan pulse
  useEffect(() => {
    scanPulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [scanPulse]);

  // Animate icon glow
  useEffect(() => {
    iconGlow.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      -1,
      false
    );
  }, [iconGlow]);

  const scanPulseStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scanPulse.value, [0, 1], [0.3, 0.8]),
    transform: [{ scale: interpolate(scanPulse.value, [0, 1], [0.9, 1.15]) }],
  }));

  const iconGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(iconGlow.value, [0, 0.5, 1], [0.2, 0.6, 0.2]),
  }));

  useEffect(() => {
    // Auto-trigger biometric on mount
    const autoUnlock = async () => {
      setIsUnlocking(true);
      const success = await unlockWithBiometric();
      if (!success) {
        setError(t('auth.biometricAuthFailed'));
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
      <Animated.View
        entering={FadeIn.duration(600)}
        style={[
          styles.accentBlob,
          { backgroundColor: theme.secondary + '15' },
        ]}
      />

      {/* Icon and title */}
      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.content}>
        <View style={styles.iconContainer}>
          {/* Animated pulse rings */}
          <Animated.View
            style={[
              styles.pulseRing,
              { borderColor: theme.secondary },
              scanPulseStyle,
            ]}
          />
          <Animated.View
            style={[
              styles.glowRing,
              { borderColor: theme.secondary },
              iconGlowStyle,
            ]}
          />

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
          {t('auth.biometricUnlock')}
        </Text>

        {lastUsername && (
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {t('auth.biometricWelcomeBack', { name: lastUsername })}
          </Text>
        )}

        {error && (
          <Animated.View entering={FadeIn.duration(300)}>
            <Text style={[styles.errorText, { color: theme.error }]}>
              {error}
            </Text>
          </Animated.View>
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
      </Animated.View>

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
    position: 'relative',
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1,
  },
  glowRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
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
