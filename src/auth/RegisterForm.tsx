import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import React, { useState, useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useAuth } from './useAuth';
import { useAppTheme } from '../constants/theme';
import { isValidEmail } from './validation';

// Floating ambient orb for background depth
function FloatingOrb({ size, color, delay, dur, startX, startY }: {
  size: number; color: string; delay: number; dur: number; startX: number; startY: number;
}) {
  const prog = useSharedValue(0);
  useEffect(() => {
    prog.value = withDelay(delay, withRepeat(
      withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }), -1, true
    ));
  }, [prog, delay, dur]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(prog.value, [0, 0.5, 1], [0.03, 0.08, 0.03]),
    transform: [
      { translateX: interpolate(prog.value, [0, 1], [startX, startX + 20]) },
      { translateY: interpolate(prog.value, [0, 1], [startY, startY - 15]) },
      { scale: interpolate(prog.value, [0, 0.5, 1], [1, 1.1, 1]) },
    ],
  }));

  return (
    <Animated.View
      style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
      pointerEvents="none"
    />
  );
}

// Pulsing glow ring for the icon
function GlowRing({ size, color, delay, dur, opacity }: { size: number; color: string; delay: number; dur: number; opacity: number }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    pulse.value = withDelay(delay, withRepeat(
      withTiming(1, { duration: dur, easing: Easing.inOut(Easing.quad) }), -1, true
    ));
  }, [pulse, delay, dur]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0, opacity]),
    transform: [{ scale: interpolate(pulse.value, [0, 1], [0.85, 1.15]) }],
  }));

  return (
    <Animated.View
      style={[{
        position: 'absolute', width: size, height: size, borderRadius: size / 2,
        borderWidth: 1, borderColor: color,
      }, style]}
      pointerEvents="none"
    />
  );
}

// Pantalla de éxito post-registro
function SuccessOverlay({ theme }: { theme: any }) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400 });
    scale.value = withDelay(200, withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.5)) }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface, zIndex: 100, alignItems: 'center', justifyContent: 'center', borderRadius: 16 }]}>
      <Animated.View style={[{ alignItems: 'center' }, animatedStyle]}>
        <View style={{ marginBottom: 20 }}>
          <Ionicons name="checkmark-circle" size={100} color="#22C55E" />
        </View>
        <Text style={{ color: theme.text, fontSize: 22, fontWeight: '900', letterSpacing: 1, textAlign: 'center' }}>
          IDENTITY SECURED
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 14, marginTop: 8, textAlign: 'center', paddingHorizontal: 20 }}>
          Your account has been created successfully. Accessing terminal...
        </Text>
        <ActivityIndicator color={theme.secondary} style={{ marginTop: 24 }} />
      </Animated.View>
    </Animated.View>
  );
}

const PASSWORD_WORDS = ['choco', 'milk', 'sun', 'river', 'cloud', 'mint', 'lemon', 'tiger', 'magic', 'honey', 'rocket', 'ocean', 'forest', 'happy', 'coffee', 'pixel', 'anchor', 'velvet'];
const SYMBOLS = ['!', '@', '#', '$', '%', '&', '*', '?'];

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function stylizeSeed(seed: string) {
  const map: Record<string, string[]> = {
    a: ['a', 'A', '@', '4'],
    e: ['e', 'E', '3'],
    i: ['i', 'I', '1'],
    o: ['o', 'O', '0'],
    s: ['s', 'S', '$', '5'],
    t: ['t', 'T', '7'],
    n: ['n', 'N'],
    g: ['g', 'G', '9'],
  };
  return seed
    .trim()
    .split('')
    .map((char) => {
      const options = map[char.toLowerCase()];
      return options ? randomFrom(options) : randomFrom([char.toLowerCase(), char.toUpperCase()]);
    })
    .join('');
}

function mergeMemorableWords(first: string, second: string) {
  const left = first.slice(0, Math.max(2, Math.ceil(first.length * 0.7)));
  const right = second.slice(Math.max(1, Math.floor(second.length * 0.25)));
  return `${left}${right}`;
}

interface RegisterFormProps {
  onSwitchToLogin: () => void;
}

export default function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const { register, firebase } = useAuth();
  const { theme } = useAppTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const normalizedUsername = username.trim().toLowerCase().replace(/\s+/g, '');
  const usernameValid = /^[a-z0-9._-]{3,}$/.test(normalizedUsername);
  const normalizedEmail = `${normalizedUsername}@oryxen.tech`;

  const emailValid = usernameValid && isValidEmail(normalizedEmail);
  const passwordValid = password.length >= 6;
  const matches = password === confirmPassword && confirmPassword.length > 0;
  const submitDisabled = loading || !emailValid || !passwordValid || !matches;

  const passwordStrength = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 6) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/[0-9]/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return s;
  }, [password]);

  // Tooltip Animation
  const tooltipOpacity = useSharedValue(0);
  const tooltipY = useSharedValue(0);

  const tooltipStyle = useAnimatedStyle(() => ({
    opacity: tooltipOpacity.value,
    transform: [{ translateY: tooltipY.value }],
  }));

  const showTooltip = () => {
    tooltipY.value = 0;
    tooltipOpacity.value = withSequence(
      withTiming(1, { duration: 200 }),
      withDelay(1500, withTiming(0, { duration: 400 }))
    );
    tooltipY.value = withSequence(
      withTiming(-10, { duration: 200 }),
      withDelay(1500, withTiming(-15, { duration: 400 }))
    );
  };

  const handleCopyPassword = async () => {
    if (!password) return;
    await Clipboard.setStringAsync(password);
    showTooltip();
    if (Platform.OS !== 'web') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleGeneratePassword = async () => {
    const currentYear = String(new Date().getFullYear());
    const words = Array.from({ length: 2 }, () => randomFrom(PASSWORD_WORDS));
    const first = words[0];
    const second = words[1];
    const shownSecond = stylizeSeed(second);
    const merged = mergeMemorableWords(first, second);
    const generated = `${first[0].toUpperCase()}${first.slice(1)}+${shownSecond[0].toUpperCase()}${shownSecond.slice(1)}=${merged[0].toUpperCase()}${merged.slice(1)}${randomFrom(SYMBOLS)}${currentYear}`;
    
    setPassword(generated);
    setConfirmPassword(generated);
    setShowPassword(true); // Se muestra automáticamente para que el usuario vea qué se generó

    if (Platform.OS !== 'web') {
      // Efecto "brillante" mediante secuencia haptica
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 60);
      setTimeout(() => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 120);
    }
  };

  const scanProgress = useSharedValue(0);

  useEffect(() => {
    scanProgress.value = withRepeat(
      withTiming(1, { duration: 2400, easing: Easing.bezier(0.45, 0, 0.55, 1) }),
      -1, true
    );
  }, [scanProgress]);

  const starsStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${interpolate(scanProgress.value, [0, 1], [0, -360])}deg` }, // Rotación completa y continua
      { scale: interpolate(scanProgress.value, [0, 0.5, 1], [1, 1.05, 1]) }, // Sutil pulsación
    ],
  }));

  const handleSubmit = async () => {
    setError(null);
    if (!firebase.enabled) {
      const missing = firebase.missingRequiredEnv.join(', ');
      setError(missing ? `Firebase not configured. Missing: ${missing}` : 'Firebase not configured in this build.');
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
      setIsSuccess(true);
      // Web Credential Management API support
      if (Platform.OS === 'web' && typeof window !== 'undefined' && 'credentials' in navigator && (window as any).PasswordCredential) {
        try {
          const cred = new (window as any).PasswordCredential({ id: normalizedEmail, password: password });
          await navigator.credentials.store(cred);
        } catch (e) {
          console.warn('Web credential store error:', e);
        }
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create the account.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {isSuccess && <SuccessOverlay theme={theme} />}

      {/* Background Orbs */}
      <FloatingOrb size={150} color={theme.secondary} delay={0} dur={7000} startX={-40} startY={-20} />
      <FloatingOrb size={120} color={theme.primary} delay={2000} dur={9000} startX={200} startY={150} />

      {/* European Star Circle & Icon */}
      <View style={styles.iconSection}>
        <GlowRing size={110} color={theme.secondary} delay={0} dur={2800} opacity={0.15} />
        <Animated.View style={[styles.starsContainer, starsStyle]}>
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30) * (Math.PI / 180);
            const radius = 48;
            const x = 50 + radius * Math.cos(angle) - 6;
            const y = 50 + radius * Math.sin(angle) - 6;
            return (
              <View key={i} style={{ position: 'absolute', left: x, top: y }}>
                <Ionicons name="star" size={10} color={theme.secondary} style={{ opacity: 0.6 }} />
              </View>
            );
          })}
        </Animated.View>
        <View style={[styles.iconBadge, { borderColor: theme.secondary }]}>
          <Ionicons name="person-add-outline" size={32} color={theme.secondary} />
        </View>
      </View>

      {error ? <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text> : null}

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.secondary }]}>Username</Text>
        <TextInput
          value={username}
          onChangeText={setUsername}
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }]}
          placeholder="jean"
          textContentType="username"
          autoComplete="username"
          importantForAutofill="yes"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 6 }}>
          Email generated: {normalizedUsername ? normalizedEmail : '@oryxen.tech'}
        </Text>
        <Text style={{ color: theme.textSecondary, fontSize: 11, marginTop: 2 }}>Create account will be sent to Firebase Auth.</Text>
      </View>

      <View style={styles.inputGroup}>
        <View style={styles.labelRow}>
          <Text style={[styles.label, { color: theme.secondary }]}>Password</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={handleGeneratePassword} style={styles.generateBtn}>
              <Ionicons name="sparkles-outline" size={14} color={theme.secondary} />
              <Text style={[styles.generateText, { color: theme.secondary }]}>Magic pass</Text>
            </Pressable>
            {password.length > 0 && (
              <Pressable onPress={handleCopyPassword} style={styles.generateBtn}>
                <Ionicons name="copy-outline" size={14} color={theme.secondary} />
                <Text style={[styles.generateText, { color: theme.secondary }]}>Copy</Text>
              </Pressable>
            )}
          </View>
          {/* Tooltip Copied Overlay */}
          <Animated.View style={[styles.tooltip, { backgroundColor: theme.secondary }, tooltipStyle]} pointerEvents="none">
            <Text style={[styles.tooltipText, { color: theme.primary }]}>COPIED!</Text>
          </Animated.View>
        </View>
        <View style={styles.passwordWrapper}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={[styles.input, styles.passwordInput, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }]}
            placeholder="At least 6 characters"
            secureTextEntry={!showPassword}
            textContentType="newPassword"
            autoComplete="password-new"
            importantForAutofill="yes"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable 
            onPress={() => setShowPassword(!showPassword)}
            style={styles.eyeIcon}
          >
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.textSecondary} />
          </Pressable>
        </View>
        {password.length > 0 && (
          <View style={styles.strengthRow}>
            <Text style={[styles.strengthText, { color: theme.textSecondary }]}>STRENGTH</Text>
            <View style={styles.strengthBar}>
              {[1, 2, 3, 4].map((step) => (
                <View 
                  key={step} 
                  style={[
                    styles.strengthSegment, 
                    { backgroundColor: passwordStrength >= step ? getStrengthColor(passwordStrength, theme) : theme.border + '40' }
                  ]} 
                />
              ))}
            </View>
          </View>
        )}
      </View>

      <View style={styles.inputGroup}>
        <Text style={[styles.label, { color: theme.secondary }]}>Confirm password</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={[styles.input, styles.passwordInput, { borderColor: theme.border, backgroundColor: theme.inputBg, color: theme.text }]}
            placeholder="Repeat password"
            secureTextEntry={!showPassword}
            textContentType="password"
            autoComplete="password"
            importantForAutofill="yes"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={() => {
              void handleSubmit();
            }}
          />
        </View>
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={submitDisabled}
        style={[styles.primaryButton, { backgroundColor: theme.secondary }, submitDisabled ? styles.primaryButtonDisabled : null]}
      >
        {({ pressed }) =>
          loading ? <ActivityIndicator color={theme.primary} /> : <Text style={[styles.primaryButtonText, { color: theme.primary, opacity: pressed ? 0.85 : 1 }]}>Create account</Text>
        }
      </Pressable>

      <View style={styles.linksBlock}>
        <Pressable onPress={onSwitchToLogin}>
          <Text style={[styles.primaryLink, { color: theme.secondary }]}>I already have an account</Text>
        </Pressable>
      </View>
    </View>
  );
}

const getStrengthColor = (strength: number, theme: any) => {
  if (strength <= 1) return theme.error;
  if (strength === 2) return '#EAB308';
  if (strength === 3) return '#3B82F6';
  return '#22C55E';
};

const styles = StyleSheet.create({
  container: { position: 'relative' },
  iconSection: { height: 120, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  starsContainer: { position: 'absolute', width: 100, height: 100 },
  iconBadge: { 
    width: 64, height: 64, borderRadius: 32, borderWidth: 1, 
    alignItems: 'center', justifyContent: 'center', 
    backgroundColor: 'rgba(255,255,255,0.03)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8
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
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  generateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  generateText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  passwordWrapper: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 40 },
  eyeIcon: { position: 'absolute', right: 12, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  tooltip: { position: 'absolute', top: -30, right: 0, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, zIndex: 50 },
  tooltipText: { fontSize: 10, fontWeight: '900' },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4b5563',
    marginBottom: 0,
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
  strengthRow: { marginTop: 8, gap: 6 },
  strengthText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  strengthBar: { flexDirection: 'row', gap: 4, height: 4 },
  strengthSegment: { flex: 1, borderRadius: 2 },
});
