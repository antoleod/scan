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
import { isValidEmail } from './validation';

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const { firebase, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const normalizedEmail = email.trim().toLowerCase();

  const submitDisabled = loading || !firebase.enabled;

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

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError('Password must include letters and numbers.');
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
      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          placeholder="user@company.com"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          placeholder="At least 6 characters"
          secureTextEntry
          textContentType="newPassword"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          style={styles.input}
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
        style={[styles.primaryButton, submitDisabled ? styles.primaryButtonDisabled : null]}
      >
        {loading ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Create account</Text>}
      </Pressable>

      <View style={styles.linksBlock}>
        <Pressable onPress={onSwitchToLogin}>
          <Text style={styles.primaryLink}>I already have an account</Text>
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
