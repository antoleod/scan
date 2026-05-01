import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from './useAuth';
import { useAppTheme } from '../constants/theme';
import { isValidEmail } from './validation';

interface MagicLinkFormProps {
  onBack: () => void;
}

export default function MagicLinkForm({ onBack }: MagicLinkFormProps) {
  const { sendMagicLink } = useAuth();
  const { theme } = useAppTheme();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendLink = async () => {
    setError(null);
    setSuccess(false);

    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      setError('Email is required.');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError('Invalid email format.');
      return;
    }

    setLoading(true);
    try {
      await sendMagicLink(normalizedEmail);
      setSuccess(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Could not send link. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.container, { backgroundColor: theme.surface }]}>
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Ionicons
              name="mail-outline"
              size={60}
              color={theme.success || '#22C55E'}
            />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>
            Check your email
          </Text>

          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            We've sent a sign-in link to {'\n'}
            <Text style={{ fontWeight: '600', color: theme.text }}>
              {email}
            </Text>
          </Text>

          {Platform.OS !== 'web' && (
            <Text style={[styles.mobileNote, { color: theme.textSecondary }]}>
              The link will open MyKit automatically
            </Text>
          )}

          <Pressable
            onPress={onBack}
            style={[styles.button, { backgroundColor: theme.secondary }]}
          >
            <Text style={[styles.buttonText, { color: theme.primary }]}>
              Back to login
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <Pressable onPress={onBack} style={styles.backButton}>
        <Ionicons name="chevron-back" size={24} color={theme.secondary} />
      </Pressable>

      <View style={styles.content}>
        <Text style={[styles.title, { color: theme.text }]}>
          Passwordless login
        </Text>

        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Enter your email and we'll send you a link to sign in
        </Text>

        {error && (
          <Text style={[styles.errorText, { color: theme.error }]}>
            {error}
          </Text>
        )}

        <View style={styles.inputGroup}>
          <Text style={[styles.label, { color: theme.secondary }]}>
            Email
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            style={[
              styles.input,
              { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text },
            ]}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
        </View>

        <Pressable
          onPress={handleSendLink}
          disabled={loading || !email.trim()}
          style={[
            styles.button,
            { backgroundColor: theme.secondary },
            (loading || !email.trim()) && styles.buttonDisabled,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <>
              <Ionicons
                name="mail-outline"
                size={18}
                color={theme.primary}
                style={{ marginRight: 8 }}
              />
              <Text style={[styles.buttonText, { color: theme.primary }]}>
                Send sign-in link
              </Text>
            </>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  content: {
    gap: 16,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8,
  },
  mobileNote: {
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    marginBottom: 8,
    fontWeight: '600',
  },
  inputGroup: {
    marginVertical: 8,
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    fontWeight: '700',
    fontSize: 15,
  },
});
