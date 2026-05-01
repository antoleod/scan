import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../constants/theme';
import { verifyTwoFACode, getTwoFAEmail } from '../core/twofa';

interface TwoFAVerificationFormProps {
  email: string;
  onVerified: () => void;
  onRequestNewCode?: () => Promise<void>;
}

export default function TwoFAVerificationForm({
  email,
  onVerified,
  onRequestNewCode,
}: TwoFAVerificationFormProps) {
  const { theme } = useAppTheme();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(600); // 10 minutes
  const [didResend, setDidResend] = useState(false);

  // Countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const timerDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const handleVerify = async () => {
    if (!code.trim() || code.length !== 6) {
      setError('Please enter a 6-digit code.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await verifyTwoFACode(code);
      if (result.valid) {
        onVerified();
      } else {
        setError(result.message);
        setCode('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (onRequestNewCode) {
      try {
        setLoading(true);
        await onRequestNewCode();
        setDidResend(true);
        setTimeRemaining(600);
        setCode('');
        setError(null);
        setTimeout(() => setDidResend(false), 3000);
      } catch (err) {
        setError('Failed to resend code. Please try again.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.header}>
        <View style={[styles.iconBg, { backgroundColor: theme.secondary + '15' }]}>
          <Ionicons name="shield-checkmark-outline" size={40} color={theme.secondary} />
        </View>
        <Text style={[styles.title, { color: theme.text }]}>Two-Factor Authentication</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          We sent a code to {'\n'}
          <Text style={{ fontWeight: '700' }}>{email}</Text>
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.content}>
        {error && (
          <View style={[styles.errorBanner, { backgroundColor: theme.error + '15', borderColor: theme.error }]}>
            <Ionicons name="alert-circle" size={18} color={theme.error} />
            <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
          </View>
        )}

        {didResend && (
          <View style={[styles.successBanner, { backgroundColor: theme.secondary + '15', borderColor: theme.secondary }]}>
            <Ionicons name="checkmark-circle" size={18} color={theme.secondary} />
            <Text style={[styles.successText, { color: theme.secondary }]}>Code resent to your email</Text>
          </View>
        )}

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.secondary }]}>Verification Code</Text>
          <TextInput
            value={code}
            onChangeText={(text) => {
              setCode(text.replace(/\D/g, '').slice(0, 6));
              setError(null);
            }}
            style={[
              styles.codeInput,
              {
                borderColor: error ? theme.error : theme.border,
                backgroundColor: theme.inputBg,
                color: theme.text,
              },
            ]}
            placeholder="000000"
            keyboardType="number-pad"
            maxLength={6}
            editable={!loading && timeRemaining > 0}
            selectTextOnFocus
          />
          <Text style={[styles.timerText, { color: theme.textSecondary }]}>
            Expires in: <Text style={{ fontWeight: '700', color: timeRemaining < 60 ? theme.error : theme.text }}>{timerDisplay}</Text>
          </Text>
        </View>

        <Pressable
          onPress={handleVerify}
          disabled={loading || code.length !== 6}
          style={[
            styles.verifyButton,
            { backgroundColor: theme.secondary },
            (loading || code.length !== 6) && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <Text style={[styles.buttonText, { color: theme.primary }]}>Verify Code</Text>
          )}
        </Pressable>

        {onRequestNewCode && (
          <Pressable
            onPress={handleResendCode}
            disabled={loading}
            style={styles.resendButton}
          >
            <Text style={[styles.resendText, { color: theme.secondary, opacity: loading ? 0.5 : 1 }]}>
              Didn't receive the code? Resend
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  content: {
    gap: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  successBanner: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    gap: 10,
    alignItems: 'center',
  },
  successText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  inputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  codeInput: {
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 4,
    fontFamily: Platform.select({ default: 'monospace', web: 'monospace' }),
  },
  timerText: {
    fontSize: 12,
    textAlign: 'center',
  },
  verifyButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 15,
  },
  resendButton: {
    paddingVertical: 10,
  },
  resendText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
});
