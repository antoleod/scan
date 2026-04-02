import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Pressable,
  Text,
  TextInput,
  useWindowDimensions,
  View
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useAppTheme } from '../constants/theme';
import { normalizeIdentifier } from '../core/auth';
import {
  clearSavedCredentials,
  loadEncryptedCredentials,
  loadLastIdentifier,
  saveEncryptedCredentials,
  saveLastIdentifier,
} from '../core/auth-storage';
import { isDeviceOnline } from '../core/network';
import { loadSettings } from '../core/settings';
import { isValidIdentifier } from '../core/validation';
import { useAuth } from './useAuth';

const fullBrandingText = 'ORYXEN TECH Â· ORYXEN SCANNER Â· SECURE TRAIL';


function AnimatedStripe({ index, theme, baseHeight, width, opacity }: { index: number; theme: any; baseHeight: number; width: number; opacity: number }) {
  const eqValue = useSharedValue(0);
  useEffect(() => {
    // Desfase de animaciÃ³n para crear el efecto de ecualizador
    eqValue.value = withDelay(index * 15, withRepeat(withTiming(1, { duration: 500 + (index % 7) * 120 }), -1, true));
  }, [eqValue, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: interpolate(eqValue.value, [0, 1], [baseHeight, baseHeight + 8 + (index % 5) * 3]),
  }));

  return (
    <Animated.View style={[{ backgroundColor: theme.secondary, width, borderRadius: 1, opacity }, animatedStyle]} />
  );
}

interface LoginFormProps {
  onSwitchToRegister: () => void;
  onSwitchToForgot: () => void;
}

export default function LoginForm({ onSwitchToRegister, onSwitchToForgot }: LoginFormProps) {
  const { login, enterAsGuest, firebase } = useAuth();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<'checking' | 'connected' | 'limited' | 'error'>('checking');
  const [errors, setErrors] = useState<{ username?: string; pin?: string }>({});
  const [focusedField, setFocusedField] = useState<'username' | 'pin' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [rememberPassword, setRememberPassword] = useState(false);

  const [displayedBrandingText, setDisplayedBrandingText] = useState('');

  const cursorOpacity = useSharedValue(0);
  useEffect(() => {
    cursorOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 400 }),
        withTiming(0, { duration: 400 })
      ),
      -1
    );
  }, [cursorOpacity]);

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayedBrandingText(fullBrandingText.slice(0, i));
      i++;
      if (i > fullBrandingText.length) clearInterval(interval);
    }, 60);
    return () => clearInterval(interval);
  }, []);


  const { theme, themeName } = useAppTheme();
  const isWeb = Platform.OS === 'web';
  const { height } = useWindowDimensions();
  const scanProgress = useSharedValue(0);
  const fx = useMemo(
    () => ({
      qrOpacity: isWeb ? 0.18 : 0.1,
      stripeOpacity: isWeb ? 0.05 : 0.02,
      brandingOpacity: isWeb ? 0.62 : 0.4,
      brandingStripeOpacity: isWeb ? 0.12 : 0.06,
      dataStripeOpacity: isWeb ? 0.06 : 0.03,
      textOpacity: isWeb ? 0.2 : 0.12,
    }),
    [isWeb]
  );

  const palette = useMemo(() => {
    if (themeName === 'euBlue') {
      return {
        logoFamily: Platform.select({ web: 'Courier New, monospace', default: 'monospace' }),
        logoWeight: '900' as const,
        logoStyle: 'normal' as const,
        logoLetterSpacing: 1,
        logoMarkWidth: 60,
        logoMarkHeight: 1,
        subtitle: 'SYSTEM ACCESS :: CORE-TERMINAL',
        primaryText: 'EXECUTE LOGIN',
        watermark: true,
      };
    }

    if (themeName === 'midnightSteel') {
      return {
        logoFamily: Platform.select({ web: 'Arial Black, Arial, sans-serif', default: 'sans-serif' }),
        logoWeight: '900' as const,
        logoStyle: 'normal' as const,
        logoLetterSpacing: -1,
        logoMarkWidth: 40,
        logoMarkHeight: 1,
        subtitle: 'Warehouse scanner terminal for quick access.',
        primaryText: 'SIGN IN',
        watermark: false,
      };
    }

    return {
      logoFamily: Platform.select({ web: 'Georgia, Times New Roman, serif', default: 'serif' }),
      logoWeight: '700' as const,
      logoStyle: 'italic' as const,
      logoLetterSpacing: -1,
      logoMarkWidth: 28,
      logoMarkHeight: 2,
      primaryText: 'SIGN IN',
      watermark: themeName === 'obsidianGold',
    };
  }, [themeName]);

  const normalizedUsername = username.trim().toLowerCase();
  const firebaseApiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
  const firebaseEmail = normalizeIdentifier(username);

  useEffect(() => {
    scanProgress.value = withRepeat(
      withTiming(1, {
        duration: 2400,
        easing: Easing.bezier(0.45, 0, 0.55, 1)
      }), -1, true);
  }, [scanProgress]);

  const scanLineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scanProgress.value, [0, 0.2, 0.5, 0.8, 1], [0, 0.75, 1, 0.75, 0]),
    transform: [{ translateY: interpolate(scanProgress.value, [0, 1], [-26, 26]) }],
  }));

  const cursorStyle = useAnimatedStyle(() => ({
    opacity: cursorOpacity.value,
  }));

  const iconScanLineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scanProgress.value, [0, 1], [-22, 22]) }],
    opacity: interpolate(scanProgress.value, [0, 0.2, 0.5, 0.8, 1], [0, 1, 1, 1, 0]),
  }));

  const brandingScanStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(scanProgress.value, [0, 1], [-160, 160]) }],
    opacity: interpolate(scanProgress.value, [0, 0.1, 0.5, 0.9, 1], [0, 1, 1, 1, 0]),
  }));

  const glitchValue = useSharedValue(0);
  const footerPulse = useSharedValue(0);

  const chromaticRedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(glitchValue.value, [0, 1], [0, -6]) }],
    opacity: interpolate(glitchValue.value, [0, 1], [0, 0.45]),
  }));

  const chromaticBlueStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(glitchValue.value, [0, 1], [0, 6]) }],
    opacity: interpolate(glitchValue.value, [0, 1], [0, 0.45]),
  }));
  useEffect(() => {
    const triggerGlitch = () => {
      glitchValue.value = withSequence(
        withTiming(1, { duration: 50 }),
        withTiming(0.3, { duration: 40 }),
        withTiming(0.7, { duration: 40 }),
        withTiming(0, { duration: 50 })
      );
      // Disparar glitch aleatoriamente cada 4-9 segundos
      setTimeout(triggerGlitch, 4000 + Math.random() * 5000);
    };
    triggerGlitch();
  }, [glitchValue]);

  useEffect(() => {
    footerPulse.value = withRepeat(
      withSequence(withTiming(1, { duration: 1200 }), withTiming(0, { duration: 1200 })),
      -1,
      false
    );
  }, [footerPulse]);

  const glitchStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(glitchValue.value, [0, 0.2, 0.5, 0.8, 1], [0, -4, 6, -2, 0]) },
      { skewX: `${glitchValue.value * 0.05}rad` },
      { scale: interpolate(glitchValue.value, [0, 1], [1, 1.012]) },
      { translateY: interpolate(scanProgress.value, [0, 0.5, 1], [0, -4, 0]) },
    ],
    opacity: interpolate(glitchValue.value, [0, 0.5, 1], [1, 0.92, 1]),
  }));
  const pulseStyle = useAnimatedStyle(() => {
    // Efecto de distorsión sutil: jitter horizontal y skew diagonal
    // Se intensifica cerca del centro (0.5) del progreso de escaneo
    const jitter = interpolate(scanProgress.value, [0, 0.45, 0.5, 0.55, 1], [0, 0, 2.5, -2.5, 0]);
    const skew = interpolate(scanProgress.value, [0, 0.45, 0.5, 0.55, 1], [0, 0, 0.04, -0.04, 0]);

    return {
      transform: [
        { scale: interpolate(scanProgress.value, [0, 0.5, 1], [0.96, 1.05, 0.96]) },
        { translateX: jitter },
        { skewX: `${skew}rad` },
      ],
      opacity: interpolate(scanProgress.value, [0, 0.5, 1], [0.8, 1, 0.8]),
    };
  });

  const footerLinePulse = useAnimatedStyle(() => ({
    opacity: interpolate(footerPulse.value, [0, 1], [0.35, 0.95]),
    transform: [{ scaleX: interpolate(footerPulse.value, [0, 1], [0.7, 1.12]) }],
  }));

  const footerDotPulse = useAnimatedStyle(() => ({
    opacity: interpolate(footerPulse.value, [0, 1], [0.3, 1]),
    transform: [{ scale: interpolate(footerPulse.value, [0, 1], [0.8, 1.25]) }],
  }));

  const starsStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scanProgress.value, [0, 0.2, 0.5, 0.8, 1], [0.3, 0.6, 1, 0.6, 0.3]),
    transform: [
      { rotate: `${interpolate(scanProgress.value, [0, 1], [0, 20])}deg` },
      { scale: interpolate(scanProgress.value, [0, 0.5, 1], [0.96, 1.06, 0.96]) }
    ],
  }));



  // SincronizaciÃ³n del pulso hÃ¡ptico â€” evita useAnimatedReaction/runOnJS en web
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let prevVal: number | null = null;
    let rafId: number;
    const poll = () => {
      const now = scanProgress.value;
      if (prevVal !== null && ((prevVal < 0.5 && now >= 0.5) || (prevVal > 0.5 && now <= 0.5))) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => { });
      }
      prevVal = now;
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, [scanProgress]);

  useEffect(() => {
    let cancelled = false;

    loadLastIdentifier()
      .then((stored) => {
        if (!cancelled && stored) setUsername(stored);
      })
      .catch(() => { });

    loadSettings()
      .then((settings) => {
        if (cancelled) return; setRememberPassword(settings.savePasswordEncrypted ?? false);
      })
      .catch(() => undefined);

    loadEncryptedCredentials()
      .then((saved) => {
        if (!saved || cancelled) return;
        setUsername(saved.identifier);
        setPin(saved.password);
        setRememberPassword(true);
      })
      .catch(() => undefined);

    const checkConnection = async () => {
      if (!firebaseApiKey) {
        if (!cancelled) setConnectionState('error');
        return;
      }

      if (!isDeviceOnline()) {
        if (!cancelled) setConnectionState('limited');
        return;
      }

      try {
        const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${firebaseApiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: 'connectivity-check@company.com', continueUri: 'http://localhost' }),
        });

        await response.json().catch(() => null);
        if (!cancelled) setConnectionState('connected');
      } catch (error) {
        if (!cancelled) setConnectionState('limited');
        console.warn('[Firebase] Connection check failed:', error instanceof Error ? error.message : error);
      }
    };

    checkConnection();
    return () => {
      cancelled = true;
    };
  }, [firebaseApiKey]);

  const validate = () => {
    const newErrors: { username?: string; pin?: string } = {};
    let valid = true;

    if (!isValidIdentifier(username)) {
      newErrors.username = 'Enter a valid username or email';
      valid = false;
    }

    if (!pin) {
      newErrors.pin = 'PIN is required';
      valid = false;
    } else if (!/^\d+$/.test(pin)) {
      newErrors.pin = 'PIN must contain only numbers';
      valid = false;
    } else if (pin.length < 6) {
      newErrors.pin = 'PIN must be at least 6 digits';
      valid = false;
    }

    setErrors(newErrors);
    return valid;
  };

  const handleSignIn = async () => {
    if (!validate()) return;

    setIsLoading(true);
    setAuthError(null);
    try {
      await login(firebaseEmail, pin);
      await saveLastIdentifier(username);
      if (rememberPassword) {
        await saveEncryptedCredentials(firebaseEmail, pin);
      } else {
        await clearSavedCredentials();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to sign in right now.';
      setAuthError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestAccess = async () => {
    enterAsGuest();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.background, palette.watermark ? styles.watermarkShell : null]}>
        {palette.watermark && (
          <View style={[styles.watermarkContainer, styles.watermarkVisible]} pointerEvents="none">
            {/* Capa de Aberración: Rojo (Shift Left) */}
            <Animated.View style={[StyleSheet.absoluteFill, chromaticRedStyle]} pointerEvents="none">
              <View style={[styles.gridLineV, { left: '20%', backgroundColor: theme.error }]} />
              <View style={[styles.gridLineV, { left: '40%', backgroundColor: theme.error }]} />
              <View style={[styles.gridLineV, { left: '60%', backgroundColor: theme.error }]} />
              <View style={[styles.gridLineV, { left: '80%', backgroundColor: theme.error }]} />
              <View style={[styles.gridLineH, { top: '25%', backgroundColor: theme.error }]} />
              <View style={[styles.gridLineH, { top: '50%', backgroundColor: theme.error }]} />
              <View style={[styles.gridLineH, { top: '75%', backgroundColor: theme.error }]} />
              <View style={[styles.techCircle, { top: -50, right: -50, width: 200, height: 200, borderColor: theme.error, opacity: 0.05 }]} />
              <View style={[styles.techCircle, { bottom: -100, left: -60, width: 300, height: 300, borderColor: theme.error, opacity: 0.03 }]} />
            </Animated.View>

            {/* Capa de Aberración: Azul (Shift Right) */}
            <Animated.View style={[StyleSheet.absoluteFill, chromaticBlueStyle]} pointerEvents="none">
              <View style={[styles.gridLineV, { left: '20%', backgroundColor: theme.primary }]} />
              <View style={[styles.gridLineV, { left: '40%', backgroundColor: theme.primary }]} />
              <View style={[styles.gridLineV, { left: '60%', backgroundColor: theme.primary }]} />
              <View style={[styles.gridLineV, { left: '80%', backgroundColor: theme.primary }]} />
              <View style={[styles.gridLineH, { top: '25%', backgroundColor: theme.primary }]} />
              <View style={[styles.gridLineH, { top: '50%', backgroundColor: theme.primary }]} />
              <View style={[styles.gridLineH, { top: '75%', backgroundColor: theme.primary }]} />
              <View style={[styles.techCircle, { top: -50, right: -50, width: 200, height: 200, borderColor: theme.primary, opacity: 0.05 }]} />
              <View style={[styles.techCircle, { bottom: -100, left: -60, width: 300, height: 300, borderColor: theme.primary, opacity: 0.03 }]} />
            </Animated.View>


            {/* Rejilla Técnica */}
            <View style={[styles.gridLineV, { left: '20%', backgroundColor: theme.secondary }]} />
            <View style={[styles.gridLineV, { left: '40%', backgroundColor: theme.secondary }]} />
            <View style={[styles.gridLineV, { left: '60%', backgroundColor: theme.secondary }]} />
            <View style={[styles.gridLineV, { left: '80%', backgroundColor: theme.secondary }]} />
            <View style={[styles.gridLineH, { top: '25%', backgroundColor: theme.secondary }]} />
            <View style={[styles.gridLineH, { top: '50%', backgroundColor: theme.secondary }]} />
            <View style={[styles.gridLineH, { top: '75%', backgroundColor: theme.secondary }]} />

            {/* Círculos de Radar */}
            <View style={[styles.techCircle, { top: -50, right: -50, width: 200, height: 200, borderColor: theme.secondary }]} />
            <View style={[styles.techCircle, { bottom: -100, left: -60, width: 300, height: 300, borderColor: theme.secondary, opacity: 0.03 }]} />

            {/* Marcadores de Escaneo */}
            <Text style={[styles.watermarkMarker, { top: '15%', left: '10%', color: theme.secondary }]}>+</Text>
            <Text style={[styles.watermarkMarker, { top: '15%', right: '10%', color: theme.secondary }]}>+</Text>
            <Text style={[styles.watermarkMarker, { bottom: '20%', left: '15%', color: theme.secondary }]}>+</Text>
            <Text style={[styles.watermarkMarker, { bottom: '35%', right: '12%', color: theme.secondary }]}>0x100</Text>

            {/* QR Code Watermark */}
            <View style={[styles.qrWatermark, { borderColor: theme.secondary }]}>
              <Ionicons name="qr-code-outline" size={44} color={theme.secondary} style={{ opacity: fx.qrOpacity }} />
            </View>

            {/* Left technical watermark with vertical barcode and central branding */}
            <View style={styles.leftWatermark}>
              <View style={styles.leftBarcode}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <View key={i} style={[styles.barcodeStripe, { backgroundColor: theme.secondary, height: '100%', opacity: fx.stripeOpacity, width: (i % 3 === 0) ? 6 : 2 }]} />
                ))}
              </View>
              <Text style={[styles.oryxenText, { color: theme.secondary, opacity: fx.textOpacity }]}>ORYXEN.TECH</Text>
            </View>

            {/* Bottom branding watermark with barcode and version */}
            <Animated.View style={[styles.brandingWatermark, glitchStyle, { opacity: fx.brandingOpacity }]}>
              <Animated.View style={[styles.brandingLaser, { backgroundColor: theme.secondary }, brandingScanStyle]} />
              <View style={styles.brandingBarcode}>
                {Array.from({ length: 48 }).map((_, i) => (
                  <AnimatedStripe key={i} index={i} theme={theme} baseHeight={14} width={(i % 5 === 0 || i % 9 === 0) ? 3 : 1} opacity={fx.brandingStripeOpacity} />
                ))}
              </View>
              <Text style={[styles.brandingText, { color: theme.secondary }]}>
                {displayedBrandingText}
                <Animated.Text style={cursorStyle}>_</Animated.Text>
              </Text>
            </Animated.View>

            {/* Data bars (enhanced original barcode effect) */}
            <View style={styles.barcodeField}>
              {Array.from({ length: 12 }).map((_, i) => (
                <AnimatedStripe key={i} index={i} theme={theme} baseHeight={i % 3 === 0 ? 180 : 120} width={2} opacity={fx.dataStripeOpacity} />
              ))}
            </View>
          </View>
        )}
        <View pointerEvents="none" style={styles.readabilityVeil} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { minHeight: height }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeIn.duration(450)} style={styles.shell}>
          <Animated.View entering={FadeInDown.delay(0).duration(450)} style={styles.badgeRow}>

          </Animated.View>

          <Animated.View entering={FadeInDown.delay(80).duration(450)} style={styles.logoRow}>
            <View style={styles.logoWrap}>
              <Text
                style={[
                  styles.logo,
                  {
                    color: theme.text,
                    fontFamily: palette.logoFamily,
                    fontWeight: palette.logoWeight,
                    fontStyle: palette.logoStyle,
                    letterSpacing: palette.logoLetterSpacing,
                  },
                ]}
              >
                Oryxen Scanner
              </Text>
              <View style={[styles.logoBar, { backgroundColor: theme.secondary, width: palette.logoMarkWidth, height: palette.logoMarkHeight }]} />
            </View>
            <View style={[styles.logoDivider, { backgroundColor: theme.secondary, opacity: 0.1 }]} />
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(160).duration(450)} style={styles.iconRow}>
            <Animated.View style={pulseStyle}>
              <View style={styles.iconShell}>
                {/* Círculo de Estrellas Europeas */}
                <Animated.View style={[styles.starsContainer, starsStyle]}>
                  {Array.from({ length: 12 }).map((_, i) => {
                    const angle = (i * 30) * (Math.PI / 180);
                    const radius = 56;
                    const x = 65 + radius * Math.cos(angle) - 6;
                    const y = 65 + radius * Math.sin(angle) - 6;
                    return (
                      <View key={i} style={{ position: 'absolute', left: x, top: y }}>
                        <Ionicons name="star" size={12} color={theme.secondary} style={{ opacity: 0.8 }} />
                      </View>
                    );
                  })}
                </Animated.View>

                {themeName === 'obsidianGold' ? (
                  <View style={styles.crosshairWrap}>
                    <Animated.View style={[styles.iconLaser, { backgroundColor: theme.secondary }, iconScanLineStyle]} />
                    <View style={[styles.crosshairCircle, { borderColor: theme.secondary }]} />
                    <View style={[styles.crosshairRing, { borderColor: theme.secondary }]} />
                    <View style={[styles.crosshairLineV, { backgroundColor: theme.secondary }]} />
                    <View style={[styles.crosshairLineH, { backgroundColor: theme.secondary }]} />
                    <View style={[styles.crosshairDot, { backgroundColor: theme.secondary }]} />
                  </View>
                ) : (
                  <View style={[styles.midnightIcon, { borderColor: `${theme.secondary}40` }]}>
                    <Animated.View style={[styles.iconLaser, { backgroundColor: theme.secondary, width: '80%', left: '10%' }, iconScanLineStyle]} />
                    <View style={[styles.midnightIconInner, { borderColor: theme.secondary }]} />
                  </View>
                )}
              </View>
            </Animated.View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(400).duration(450)} style={[styles.formCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.secondary }]}>USERNAME OR EMAIL</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.text,
                    borderColor: errors.username ? theme.error : focusedField === 'username' ? theme.secondary : theme.border,
                    shadowColor: focusedField === 'username' ? theme.secondary : 'transparent',
                    shadowOpacity: focusedField === 'username' ? 0.35 : 0,
                  },
                ]}
                placeholder="jcdioses or jdioses@oryxen.tech"
                placeholderTextColor={theme.textSecondary}
                value={username}
                onChangeText={(text) => {
                  setUsername(text);
                  if (errors.username) setErrors({ ...errors, username: undefined });
                }}
                onFocus={() => setFocusedField('username')}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardAppearance="dark"
                autoFocus // change 2: open keyboard immediately on mount
                returnKeyType="next"
                blurOnSubmit={false}
              />
              {errors.username ? <Text style={[styles.error, { color: theme.error }]}>{errors.username}</Text> : null}
              {username ? <Text style={[styles.helper, { color: theme.textSecondary }]}>Login id: <Text style={styles.helperStrong}>{normalizedUsername}</Text></Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.secondary }]}>PASSWORD</Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.inputBg,
                    color: theme.text,
                    borderColor: errors.pin ? theme.error : focusedField === 'pin' ? theme.secondary : theme.border,
                    shadowColor: focusedField === 'pin' ? theme.secondary : 'transparent',
                    shadowOpacity: focusedField === 'pin' ? 0.35 : 0,
                  },
                ]}
                placeholder="••••••"
                placeholderTextColor={theme.textSecondary}
                value={pin}
                onChangeText={(text) => {
                  setPin(text);
                  if (errors.pin) setErrors({ ...errors, pin: undefined });
                }}
                onFocus={() => setFocusedField('pin')}
                onBlur={() => setFocusedField(null)}
                secureTextEntry
                keyboardAppearance="dark"
                returnKeyType="go"
                onSubmitEditing={() => {
                  void handleSignIn();
                }}
              />
              {errors.pin ? <Text style={[styles.error, { color: theme.error }]}>{errors.pin}</Text> : null}
              <Text style={[styles.note, { color: theme.textSecondary }]}>Use your workspace password.</Text>
            </View>

            <Pressable
              style={[styles.primaryButton, { backgroundColor: theme.secondary }, isLoading && styles.primaryDisabled]}
              onPress={handleSignIn}
              disabled={isLoading || !firebase.enabled}
            >
              {({ pressed }) => (
                <View style={[styles.primaryButtonInner, pressed && { opacity: 0.86, transform: [{ scale: 0.99 }] }]}>
                  {isLoading ? (
                    <ActivityIndicator color={theme.primary} />
                  ) : (
                    <Text style={[styles.primaryText, { color: theme.primary }]}>{palette.primaryText}</Text>
                  )}
                  <Animated.View style={[styles.buttonScan, scanLineStyle, { backgroundColor: `${theme.secondary}66` }]} />
                </View>
              )}
            </Pressable>

            {authError ? (
              <Text style={[styles.authError, { color: theme.error, borderColor: `${theme.error}40`, backgroundColor: `${theme.error}12` }]}>
                {authError}
              </Text>
            ) : null}

            <View style={styles.statusRow}>
              <Animated.View
                style={[
                  styles.statusDot,
                  { backgroundColor: !firebase.enabled ? '#B38A1A' : connectionState === 'connected' ? `${theme.secondary}CC` : '#B38A1A' },
                  pulseStyle,
                ]}
              />
              <Text style={[styles.statusText, { color: theme.textSecondary }]}>
                {!firebase.enabled
                  ? (firebase.missingRequiredEnv.length
                    ? `Firebase not configured in this deploy. Missing: ${firebase.missingRequiredEnv.join(', ')}`
                    : 'Firebase not configured in this deploy.')
                  : connectionState === 'connected'
                    ? 'Firebase ready'
                    : 'Connectivity check limited (login may still work)'}
              </Text>
            </View>

            <View style={styles.links}>
              <Pressable onPress={onSwitchToRegister} style={styles.linkAction}>
                <Text style={[styles.link, { color: theme.secondary }]}>Create account</Text>
              </Pressable>
              <Text style={[styles.linkDivider, { color: theme.textSecondary }]}>|</Text>
              <Pressable onPress={onSwitchToForgot} style={styles.linkAction}>
                <Text style={[styles.link, { color: theme.textSecondary }]}>Forgot password</Text>
              </Pressable>
              <Text style={[styles.linkDivider, { color: theme.textSecondary }]}>|</Text>
              <Pressable onPress={handleGuestAccess} style={styles.linkAction}>
                <Text style={[styles.link, { color: theme.textSecondary }]}>Guest access</Text>
              </Pressable>
            </View>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(480).duration(450)} style={styles.footer}>
            <View style={styles.footerTrack}>
              <Animated.View style={[styles.footerLine, { backgroundColor: theme.border }, footerLinePulse]} />
              <Animated.View style={[styles.footerSignalDot, { backgroundColor: theme.secondary }, footerDotPulse]} />
            </View>
            <Text style={[styles.version, { color: theme.textSecondary }]}>secure login channel</Text>
          </Animated.View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  background: { ...StyleSheet.absoluteFillObject },
  watermarkShell: {},
  watermarkContainer: { ...StyleSheet.absoluteFillObject },
  watermarkVisible: { opacity: 1 },
  readabilityVeil: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6, 11, 20, 0.28)' },
  gridLineV: { position: 'absolute', top: 0, bottom: 0, width: 1, opacity: 0.04 },
  gridLineH: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.04 },
  techCircle: { position: 'absolute', borderRadius: 1000, borderWidth: 1, opacity: 0.07 },
  watermarkMarker: { position: 'absolute', fontSize: 10, fontWeight: '800', opacity: 0.06, letterSpacing: 1 },
  qrWatermark: { position: 'absolute', bottom: '30%', right: 20, width: 60, height: 60, borderWidth: 1, borderRadius: 6, alignItems: 'center', justifyContent: 'center', opacity: 0.1 },
  leftWatermark: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 32, alignItems: 'center', justifyContent: 'center', gap: 8 },
  leftBarcode: { height: 80, flexDirection: 'row', alignItems: 'center', gap: 1 },
  barcodeStripe: { borderRadius: 1 },
  oryxenText: { fontSize: 6, fontWeight: '700', letterSpacing: 1.5, opacity: 0.12, transform: [{ rotate: '-90deg' }] },
  brandingWatermark: { position: 'absolute', bottom: 24, left: 40, right: 40, alignItems: 'center', gap: 4 },
  brandingLaser: { position: 'absolute', top: 0, bottom: 0, width: 40, opacity: 0.08 },
  brandingBarcode: { flexDirection: 'row', alignItems: 'flex-end', height: 28, gap: 1, overflow: 'hidden' },
  brandingText: { fontSize: 8, fontWeight: '700', letterSpacing: 2, opacity: 0.15, textTransform: 'uppercase' },
  barcodeField: { position: 'absolute', top: 0, right: 20, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 2, overflow: 'hidden' },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
  shell: { width: '100%', maxWidth: 420, gap: 14 },
  badgeRow: { flexDirection: 'row', gap: 8 },
  logoRow: { gap: 10 },
  logoWrap: { gap: 4 },
  logo: { fontSize: 28, lineHeight: 32 },
  logoBar: {},
  logoDivider: { height: 1, opacity: 0.2 },
  iconRow: { alignItems: 'center', paddingVertical: 12 },
  iconShell: { width: 130, height: 130, alignItems: 'center', justifyContent: 'center' },
  starsContainer: { position: 'absolute', width: 130, height: 130 },
  starDot: { position: 'absolute', width: 8, height: 8, borderRadius: 99 },
  crosshairWrap: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  iconLaser: { position: 'absolute', height: 1, zIndex: 2 },
  crosshairCircle: { position: 'absolute', width: 80, height: 80, borderRadius: 40, borderWidth: 1 },
  crosshairRing: { position: 'absolute', width: 60, height: 60, borderRadius: 30, borderWidth: 1, opacity: 0.5 },
  crosshairLineV: { position: 'absolute', width: 1, height: 80 },
  crosshairLineH: { position: 'absolute', height: 1, width: 80 },
  crosshairDot: { width: 4, height: 4, borderRadius: 2 },
  midnightIcon: { width: 72, height: 72, borderRadius: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  midnightIconInner: { width: 36, height: 36, borderRadius: 18, borderWidth: 1 },
  pasteCard: { borderRadius: 10, borderWidth: 1, borderLeftWidth: 3, overflow: 'hidden' },
  pasteAction: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  pastePrefix: { fontSize: 13, fontWeight: '700', fontFamily: Platform.select({ web: 'monospace', default: 'monospace' }) },
  pasteText: { fontSize: 13, fontWeight: '600' },
  formCard: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 16 },
  field: { gap: 6 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  input: { height: 48, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, fontSize: 15, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8 },
  error: { fontSize: 11, fontWeight: '600' },
  helper: { fontSize: 10 },
  helperStrong: { fontWeight: '700' },
  note: { fontSize: 10, lineHeight: 15 },
  primaryButton: { borderRadius: 10, overflow: 'hidden' },
  primaryDisabled: { opacity: 0.6 },
  primaryButtonInner: { height: 48, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  primaryText: { fontSize: 14, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  buttonScan: { position: 'absolute', top: 0, bottom: 0, width: 30, borderRadius: 4 },
  authError: { borderWidth: 1, borderRadius: 8, padding: 10, fontSize: 12, fontWeight: '600', textAlign: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '600' },
  links: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  linkAction: { paddingVertical: 4 },
  link: { fontSize: 12, fontWeight: '700' },
  linkDivider: { fontSize: 12 },
  footer: { alignItems: 'center', gap: 8, paddingTop: 8 },
  footerTrack: { width: 72, height: 12, alignItems: 'center', justifyContent: 'center' },
  footerLine: { width: 44, height: 1, borderRadius: 999 },
  footerSignalDot: { position: 'absolute', width: 4, height: 4, borderRadius: 999, right: 12 },
  version: { fontSize: 9, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase', opacity: 0.4 },
});
