import React, { useState } from 'react';
import {
  Animated,
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

function AuthBackgroundEffects() {
  const pulse = React.useRef(new Animated.Value(0)).current;
  const drift = React.useRef(new Animated.Value(0)).current;
  const useNativeDriver = Platform.OS !== 'web';

  React.useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2600, useNativeDriver }),
        Animated.timing(pulse, { toValue: 0, duration: 2600, useNativeDriver }),
      ])
    );
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 4200, useNativeDriver }),
        Animated.timing(drift, { toValue: 0, duration: 4200, useNativeDriver }),
      ])
    );
    pulseLoop.start();
    driftLoop.start();
    return () => {
      pulseLoop.stop();
      driftLoop.stop();
    };
  }, [drift, pulse]);

  const haloStyle = {
    opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.2, 0.5] }),
    transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] }) }],
  };
  const starsStyle = {
    opacity: drift.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.5] }),
    transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) }],
  };

  return (
    <View pointerEvents="none" style={styles.fxWrap}>
      <Animated.View style={[styles.fxHalo, haloStyle]} />
      <View style={styles.fxGrid}>
        <View style={[styles.fxGridV, { left: '20%' }]} />
        <View style={[styles.fxGridV, { left: '40%' }]} />
        <View style={[styles.fxGridV, { left: '60%' }]} />
        <View style={[styles.fxGridV, { left: '80%' }]} />
        <View style={[styles.fxGridH, { top: '30%' }]} />
        <View style={[styles.fxGridH, { top: '55%' }]} />
        <View style={[styles.fxGridH, { top: '80%' }]} />
      </View>
      <Animated.View style={[styles.fxStars, starsStyle]}>
        <View style={[styles.fxStar, { top: '10%', left: '12%' }]} />
        <View style={[styles.fxStar, { top: '18%', right: '18%' }]} />
        <View style={[styles.fxStar, { top: '32%', left: '68%' }]} />
        <View style={[styles.fxStar, { top: '62%', left: '22%' }]} />
        <View style={[styles.fxStar, { top: '72%', right: '30%' }]} />
      </Animated.View>
      <View style={styles.fxReadability} />
    </View>
  );
}

function FirebaseGuardCard() {
  const { firebase } = useAuth();

  if (firebase.enabled) {
    return null;
  }

  return (
    <View style={[styles.guardCard, styles.guardError]}>
      <Text style={styles.guardTitle}>Service temporarily unavailable</Text>
      <Text style={styles.guardText}>Configuration in progress. Please try again shortly.</Text>
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
      <AuthBackgroundEffects />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.brandArea}>
          <Text style={styles.kicker}>ORYXEN TECH</Text>
          <Text style={styles.title}>ORYXEN SCANNER</Text>
          <Text style={styles.subtitle}>{view === 'register' ? 'Create account' : 'Recover password'}</Text>
        </View>

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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  brandArea: {
    alignItems: 'center',
    marginBottom: 18,
    width: '100%',
    maxWidth: 560,
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
    width: '100%',
    maxWidth: 560,
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
    width: '100%',
    maxWidth: 560,
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
  fxWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  fxReadability: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 10, 20, 0.26)',
  },
  fxHalo: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 153, 51, 0.16)',
    top: 90,
    alignSelf: 'center',
  },
  fxGrid: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.25,
  },
  fxGridV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255, 176, 96, 0.16)',
  },
  fxGridH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(106, 146, 255, 0.12)',
  },
  fxStars: {
    ...StyleSheet.absoluteFillObject,
  },
  fxStar: {
    position: 'absolute',
    width: 3,
    height: 3,
    borderRadius: 99,
    backgroundColor: 'rgba(228, 239, 255, 0.7)',
  },
});
