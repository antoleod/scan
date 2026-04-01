import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import ForgotPasswordForm from './ForgotPasswordForm';
import LoginForm from './LoginForm';
import RegisterForm from './RegisterForm';
import { AuthView } from './authTypes';
import { useAuth } from './useAuth';

function FirebaseGuardCard() {
  const { firebase } = useAuth();

  if (firebase.enabled) {
    if (!firebase.missingOptionalEnv.length) {
      return null;
    }

    return (
      <View style={[styles.guardCard, styles.guardOptional]}>
        <Text style={styles.guardTitle}>Firebase configured</Text>
        <Text style={styles.guardText}>{firebase.message}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.guardCard, styles.guardError]}>
      <Text style={styles.guardTitle}>Firebase not configured</Text>
      <Text style={styles.guardText}>{firebase.message}</Text>
      <Text style={styles.guardHint}>Account access is disabled until these variables are defined.</Text>
    </View>
  );
}

export default function AuthScreen() {
  const { enterAsGuest } = useAuth();
  const [view, setView] = useState<AuthView>('login');

  if (view === 'login') {
    return (
      <LoginForm
        onSwitchToRegister={() => setView('register')}
        onSwitchToForgot={() => setView('forgot')}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.brandArea}>
          <Text style={styles.kicker}>ORYXEN TECH</Text>
          <Text style={styles.title}>BARRA SCANNER</Text>
          <Text style={styles.subtitle}>{view === 'register' ? 'Create account' : 'Recover password'}</Text>
        </View>

        <FirebaseGuardCard />

        <View style={styles.card}>
          {view === 'register' ? <RegisterForm onSwitchToLogin={() => setView('login')} /> : null}
          {view === 'forgot' ? <ForgotPasswordForm onSwitchToLogin={() => setView('login')} /> : null}
        </View>

        <View style={styles.guestBlock}>
          <Text style={styles.guestText}>or continue without an account to use local storage only</Text>
          <Pressable onPress={enterAsGuest} style={styles.guestButton}>
            <Text style={styles.guestButtonText}>Continue as guest</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070d1b',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  brandArea: {
    alignItems: 'center',
    marginBottom: 18,
  },
  kicker: { color: '#ffd84d', fontSize: 10, fontWeight: '900', letterSpacing: 2.5 },
  title: {
    color: '#eef4ff',
    fontSize: 24,
    fontWeight: '900',
    marginBottom: 4,
  },
  subtitle: {
    color: '#98a7c0',
    fontSize: 12,
    textAlign: 'center',
  },
  guardCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  guardError: {
    backgroundColor: '#2a1a13',
    borderColor: '#f59e0b',
  },
  guardOptional: {
    backgroundColor: '#0d1a33',
    borderColor: '#284b80',
  },
  guardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#e2e8f0',
    marginBottom: 4,
  },
  guardText: {
    fontSize: 13,
    color: '#9fb0c9',
  },
  guardHint: {
    fontSize: 12,
    color: '#fbbf24',
    marginTop: 6,
  },
  card: {
    backgroundColor: '#0d162b',
    borderWidth: 1,
    borderColor: '#1f3358',
    borderRadius: 16,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 4,
  },
  guestBlock: {
    marginTop: 18,
    alignItems: 'center',
  },
  guestText: {
    color: '#8da0be',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 8,
  },
  guestButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2a3f66',
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: '#0d162b',
  },
  guestButtonText: {
    color: '#dce7f8',
    fontWeight: '700',
    fontSize: 13,
  },
});
