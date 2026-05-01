import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from './useAuth';
import { useAppTheme } from '../constants/theme';
import { isValidEmail } from './validation';
import { resolveUsernameToAuthEmail } from '../core/firebase';

interface ForgotPasswordFormProps {
  onSwitchToLogin: () => void;
}

export default function ForgotPasswordForm({ onSwitchToLogin }: ForgotPasswordFormProps) {
  const { sendPasswordReset } = useAuth();
  const { theme } = useAppTheme();
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitDisabled = loading || !input.trim();

  const handleSubmit = async () => {
    setError(null);
    setSuccess(null);

    const value = input.trim().toLowerCase();

    if (!value) {
      setError('Enter your username or recovery email.');
      return;
    }

    setLoading(true);
    try {
      if (value.includes('@')) {
        // Direct email path
        await sendPasswordReset(value);
        setSuccess('Password reset email sent.');
      } else {
        // Username path — resolve via index
        let resolved: { authEmail: string; authEmailSource: string } | null = null;
        try {
          resolved = await resolveUsernameToAuthEmail(value);
        } catch {
          // Firebase unavailable — tell user to use email directly
          setError('Could not connect. If you registered with a recovery email, enter it directly.');
          return;
        }

        if (!resolved) {
          setError('No account found for that username. Try entering your recovery email instead.');
          return;
        }

        if (resolved.authEmailSource === 'recoveryEmail') {
          await sendPasswordReset(resolved.authEmail);
          setSuccess('Password reset email sent.');
        } else {
          // account exists but has no real recovery email
          setError(
            'This account does not have a recovery email. ' +
            'Please sign in and add one in Profile settings to enable password reset.'
          );
        }
      }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Failed to send reset email.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      {success ? <Text style={[styles.successText, { color: theme.success }]}>{success}</Text> : null}
      {error ? <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text> : null}

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.secondary }]}>Username or recovery email</Text>
        <TextInput
          value={input}
          onChangeText={setInput}
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }]}
          placeholder="jean or jean@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={submitDisabled}
        style={[styles.primaryButton, { backgroundColor: theme.secondary }, submitDisabled ? styles.primaryButtonDisabled : null]}
      >
        {({ pressed }) =>
          loading ? <ActivityIndicator color={theme.primary} /> : <Text style={[styles.primaryButtonText, { color: theme.primary, opacity: pressed ? 0.85 : 1 }]}>Send reset link</Text>
        }
      </Pressable>

      <View style={styles.linksBlock}>
        <Pressable onPress={onSwitchToLogin}>
          <Text style={[styles.primaryLink, { color: theme.secondary }]}>Back to login</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  successText: {
    color: '#15803d',
    fontSize: 13,
    marginBottom: 10,
    fontWeight: '600',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 13,
    marginBottom: 10,
    fontWeight: '600',
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
