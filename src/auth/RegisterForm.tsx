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
  const { register, firebase } = useAuth();
  const { theme } = useAppTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const normalizedUsername = username.trim().toLowerCase().replace(/\s+/g, '');
  const usernameValid = /^[a-z0-9._-]{3,}$/.test(normalizedUsername);
  const normalizedEmail = `${normalizedUsername}@oryxen.tech`;

  const emailValid = usernameValid && isValidEmail(normalizedEmail);
  const passwordValid = password.length >= 6;
  const matches = password === confirmPassword && confirmPassword.length > 0;
  const submitDisabled = loading || !emailValid || !passwordValid || !matches;

  const handleSubmit = async () => {
    setError(null);
    if (!firebase.enabled) {
      setError('Firebase no esta configurado. Activa las variables/secrets primero.');
      return;
    }

    if (!normalizedUsername) {
      setError('Username is required.');
      return;
    }

    if (!usernameValid || !isValidEmail(normalizedEmail)) {
      setError('Username invalid. Use 3+ chars: a-z, 0-9, dot, underscore or hyphen.');
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
        <Text style={[styles.label, { color: theme.secondary }]}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }]}
          placeholder="jean"
          textContentType="username"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 6 }}>
          Email generated: {normalizedUsername ? normalizedEmail : '@oryxen.tech'}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 12, marginTop: 2 }}>Create account will be sent to Firebase Auth.</Text>
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
          returnKeyType="go"
          onSubmitEditing={() => {
            void handleSubmit();
          }}
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
