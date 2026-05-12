import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from './useAuth';
import { useAppTheme } from '../constants/theme';
import { isValidEmail } from '../core/validation';
import { resolveUsernameToAuthEmail } from '../core/firebase';

interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
}

export default function ForgotPasswordForm({ onSwitchToLogin }: ForgotPasswordFormProps) {
  const { sendPasswordReset, sendMagicLink } = useAuth();
  const { theme } = useAppTheme();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [successType, setSuccessType] = useState<'email' | 'magic' | null>(null);
  const [loading, setLoading] = useState(false);
  const [recoveryMethod, setRecoveryMethod] = useState<'password' | 'magic'>('password');

  const submitDisabled = loading || !input.trim();

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    const value = input.trim().toLowerCase();

    if (!value) {
      setError('Enter your username or recovery email.');
      return;
    }

    // For magic link method, email is required
    if (recoveryMethod === 'magic' && !value.includes('@')) {
      setError('Magic link requires an email address.');
      return;
    }

    setLoading(true);
    try {
      if (recoveryMethod === 'magic') {
        // Magic link requires email directly
        if (!isValidEmail(value)) {
          setError('Please enter a valid email address.');
          setLoading(false);
          return;
        }
        await sendMagicLink(value);
        setSuccess('Sign-in link sent to your email!');
        setSuccessType('magic');
      } else {
        // Password reset
        if (value.includes('@')) {
          // Direct email path
          await sendPasswordReset(value);
          setSuccess('Password reset email sent.');
          setSuccessType('email');
        } else {
          // Username path — resolve via index
          let resolved: { authEmail: string; authEmailSource: string } | null = null;
          try {
            resolved = await resolveUsernameToAuthEmail(value);
          } catch {
            setError('Could not connect. If you registered with a recovery email, enter it directly.');
            setLoading(false);
            return;
          }

          if (!resolved) {
            setError('No account found for that username. Try entering your recovery email instead.');
            setLoading(false);
            return;
          }

          if (resolved.authEmailSource === 'recoveryEmail') {
            // The recovery email is not stored in the public username index
            // (PII protection). Ask the user to enter it directly so the reset
            // is sent to a verified address.
            setError(
              'For your account, please enter your recovery email directly to receive the reset link.'
            );
            setLoading(false);
            return;
          } else {
            setError(
              'This account has no recovery email. Try "Passwordless login" or sign in and add one in Profile settings.'
            );
            setLoading(false);
            return;
          }
        }
      }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to send recovery link.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      {/* Success Message */}
      {success && (
        <Animated.View entering={FadeIn.duration(300)} style={[styles.successCard, { backgroundColor: theme.surface, borderColor: theme.secondary }]}>
          <Ionicons name={successType === 'magic' ? 'mail-outline' : 'checkmark-circle'} size={20} color={theme.secondary} />
          <Text style={[styles.successText, { color: theme.text }]}>{success}</Text>
        </Animated.View>
      )}

      {/* Error Message */}
      {error && (
        <Animated.View entering={FadeIn.duration(300)} style={[styles.errorCard, { backgroundColor: theme.surface, borderColor: theme.error }]}>
          <Ionicons name="alert-circle" size={20} color={theme.error} />
          <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
        </Animated.View>
      )}

      {/* Recovery Method Selector */}
      <Animated.View entering={FadeInDown.delay(100).duration(400)} style={styles.methodSelector}>
        <Pressable
          onPress={() => setRecoveryMethod('password')}
          style={[
            styles.methodOption,
            {
              backgroundColor: recoveryMethod === 'password' ? theme.secondary + '20' : theme.surface,
              borderColor: recoveryMethod === 'password' ? theme.secondary : theme.border,
            },
          ]}
        >
          <Ionicons name="lock-closed-outline" size={18} color={theme.secondary} style={{ marginRight: 8 }} />
          <Text style={[styles.methodLabel, { color: recoveryMethod === 'password' ? theme.secondary : theme.textSecondary }]}>
            Password reset
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setRecoveryMethod('magic')}
          style={[
            styles.methodOption,
            {
              backgroundColor: recoveryMethod === 'magic' ? theme.secondary + '20' : theme.surface,
              borderColor: recoveryMethod === 'magic' ? theme.secondary : theme.border,
            },
          ]}
        >
          <Ionicons name="mail-outline" size={18} color={theme.secondary} style={{ marginRight: 8 }} />
          <Text style={[styles.methodLabel, { color: recoveryMethod === 'magic' ? theme.secondary : theme.textSecondary }]}>
            Magic link
          </Text>
        </Pressable>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(400)} style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.secondary }]}>
          {recoveryMethod === 'magic' ? 'Email address' : 'Username or recovery email'}
        </Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }]}
          placeholder={recoveryMethod === 'magic' ? 'you@example.com' : 'jean or jean@example.com'}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(300).duration(400)}>
        <Pressable
          onPress={handleSubmit}
          disabled={submitDisabled}
          style={[styles.primaryButton, { backgroundColor: theme.secondary }, submitDisabled ? styles.primaryButtonDisabled : null]}
        >
          {({ pressed }) =>
            loading ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: theme.primary, opacity: pressed ? 0.85 : 1 }]}>
                {recoveryMethod === 'magic' ? 'Send sign-in link' : 'Send reset link'}
              </Text>
            )
          }
        </Pressable>
      </Animated.View>

      <View style={styles.linksBlock}>
        <Pressable onPress={onSwitchToLogin}>
          <Text style={[styles.primaryLink, { color: theme.secondary }]}>Back to login</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  successCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
    gap: 10,
  },
  successText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  errorCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
    gap: 10,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  methodSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  methodOption: {
    flex: 1,
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4b5563',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderColor: '#9fb2cf',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#0b1322',
    backgroundColor: '#f6f9ff',
  },
  primaryButton: {
    backgroundColor: '#0f82f8',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryButtonDisabled: {
    opacity: 0.55,
  },
  primaryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  linksBlock: {
    marginTop: 18,
    gap: 10,
    alignItems: 'center',
  },
  primaryLink: {
    color: '#0f82f8',
    fontWeight: '700',
  },
});
