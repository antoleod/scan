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

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const { register } = useAuth();
  const { theme } = useAppTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const normalizedEmail = email.trim().toLowerCase();

  const emailValid = isValidEmail(normalizedEmail);
  const passwordValid = password.length >= 6;
  const matches = password === confirmPassword && confirmPassword.length > 0;
  const submitDisabled = loading || !emailValid || !passwordValid || !matches;

  const handleSubmit = async () => {
    setError(null);

    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError('Invalid email format.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await register(normalizedEmail, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create the account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      {error ? <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text> : null}

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.secondary }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }]}
          placeholder="user@company.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.secondary }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }]}
          placeholder="At least 6 characters"
          secureTextEntry
          textContentType="newPassword"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.secondary }]}>Confirm password</Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }]}
          placeholder="Repeat password"
          secureTextEntry
          textContentType="password"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={submitDisabled}
        style={[styles.primaryButton, { backgroundColor: theme.secondary }, submitDisabled ? styles.primaryButtonDisabled : null]}
      >
        {loading ? <ActivityIndicator color={theme.primary} /> : <Text style={[styles.primaryButtonText, { color: theme.primary }]}>Create account</Text>}
      </Pressable>

      <View style={styles.linksBlock}>
        <Pressable onPress={onSwitchToLogin}>
          <Text style={[styles.primaryLink, { color: theme.secondary }]}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
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
