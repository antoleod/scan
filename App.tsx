import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthScreen from './src/auth/AuthScreen';
import { AuthProvider } from './src/auth/authContext';
import { useAuth } from './src/auth/useAuth';
import { AnimatedLogo } from './src/components/AnimatedLogo';
import { useAppTheme } from './src/constants/theme';
import { ThemeProvider } from './src/core/theme';
import { loadSettings } from './src/core/settings';
import { initPwaInstallBridge } from './src/core/pwa';
import { getAuthRedirectPath } from './src/core/routes';
import { initI18n, setUiLanguage } from './src/i18n';
import MainAppScreen from './src/screens/MainAppScreen';

// Initialize i18next synchronously at module load (device language) so the very
// first render has translations. AuthGate then aligns it to the persisted setting.
initI18n();

function SplashScreen() {
  const { theme } = useAppTheme();

  const glow = useSharedValue(0);
  const shimmer = useSharedValue(0);
  const fadeIn = useSharedValue(0);

  useEffect(() => {
    fadeIn.value = withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) });

    glow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.quad) })
      ),
      -1
    );

    shimmer.value = withDelay(
      600,
      withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.cubic) }), -1)
    );
  }, [fadeIn, glow, shimmer]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: fadeIn.value,
  }));

  const glowRingStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.08, 0.28]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.88, 1.12]) }],
  }));

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(shimmer.value, [0, 1], [-180, 260]) }],
    opacity: interpolate(shimmer.value, [0, 0.08, 0.92, 1], [0, 1, 1, 0]),
  }));

  const dotPulse = useAnimatedStyle(() => ({
    opacity: interpolate(glow.value, [0, 1], [0.3, 1]),
    transform: [{ scale: interpolate(glow.value, [0, 1], [0.8, 1.3]) }],
  }));

  return (
    <Animated.View style={[splashStyles.container, { backgroundColor: theme.background }, containerStyle]}>
      {/* Ambient orb top-left */}
      <View
        style={[splashStyles.orb, { backgroundColor: theme.secondary + '18', pointerEvents: 'none' }]}
      />
      {/* Ambient orb bottom-right */}
      <View
        style={[splashStyles.orbBr, { backgroundColor: theme.primary + '12', pointerEvents: 'none' }]}
      />

      {/* Pulsing glow ring behind logo */}
      <Animated.View
        style={[splashStyles.glowRing, { borderColor: theme.secondary, pointerEvents: 'none' }, glowRingStyle]}
      />

      <AnimatedLogo size={56} color={theme.text} accentColor={theme.secondary} />

      <View style={splashStyles.textGroup}>
        <Text style={[splashStyles.appName, { color: theme.text }]}>MyKit</Text>
        <Text style={[splashStyles.tagline, { color: theme.textSecondary }]}>VERIFYING SESSION</Text>
      </View>

      {/* Shimmer progress bar */}
      <View style={[splashStyles.trackOuter, { backgroundColor: theme.border }]}>
        <View style={[splashStyles.trackFill, { backgroundColor: theme.secondary + '40' }]} />
        <Animated.View
          style={[splashStyles.trackShimmer, { backgroundColor: theme.secondary, pointerEvents: 'none' }, shimmerStyle]}
        />
      </View>

      {/* Footer pulse dot */}
      <View style={splashStyles.footer}>
        <Animated.View style={[splashStyles.dot, { backgroundColor: theme.secondary }, dotPulse]} />
        <Text style={[splashStyles.footerText, { color: theme.textSecondary }]}>secure channel</Text>
      </View>
    </Animated.View>
  );
}

function AuthGate() {
  const { user, isGuest, isLoading } = useAuth();
  const { setThemeName } = useAppTheme();
  const isAuthenticated = Boolean(user || isGuest);

  useEffect(() => {
    initPwaInstallBridge();
    loadSettings()
      .then((settings) => {
        const key = settings.theme === 'eu_blue' ? 'euBlue' : settings.theme;
        setThemeName(key as 'euBlue' | 'dark' | 'light' | 'parliament' | 'custom' | 'noirGraphite' | 'midnightSteel' | 'obsidianGold');
        setUiLanguage(settings.uiLanguage);
      })
      .catch(() => undefined);
  }, [setThemeName]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isLoading) return;

    const redirectPath = getAuthRedirectPath(window.location.pathname, isAuthenticated);
    if (!redirectPath) return;

    window.history.replaceState(window.history.state, '', `${redirectPath}${window.location.search}${window.location.hash}`);
  }, [isAuthenticated, isLoading]);

  if (isLoading) return <SplashScreen />;
  if (isAuthenticated) return <MainAppScreen />;
  return <AuthScreen />;
}

export default function App() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    const dvh = typeof CSS !== 'undefined' && CSS.supports?.('height', '100dvh');
    const fullH = dvh ? '100dvh' : '100%';

    html.style.width = '100%';
    html.style.height = fullH;
    html.style.margin = '0';
    html.style.overflow = 'hidden';
    html.style.backgroundColor = '#070d1b';

    body.style.width = '100%';
    body.style.height = fullH;
    body.style.margin = '0';
    body.style.overflow = 'hidden';
    body.style.backgroundColor = '#070d1b';

    if (root) {
      root.style.width = '100%';
      root.style.height = fullH;
      root.style.minHeight = fullH;
      root.style.overflow = 'hidden';
      root.style.backgroundColor = '#070d1b';
    }
  }, []);

  return (
    <SafeAreaProvider>
      <ThemeProvider initialThemeName="noirGraphite">
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    overflow: 'hidden',
  },
  orb: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    top: -100,
    left: -100,
    // blur not available in RN StyleSheet — use opacity + large size for glow effect
  },
  orbBr: {
    position: 'absolute',
    width: 260,
    height: 260,
    borderRadius: 130,
    bottom: -80,
    right: -80,
  },
  glowRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
  },
  textGroup: {
    alignItems: 'center',
    gap: 6,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  trackOuter: {
    width: 160,
    height: 2,
    borderRadius: 999,
    overflow: 'hidden',
    position: 'relative',
    marginTop: 8,
  },
  trackFill: {
    ...StyleSheet.absoluteFillObject,
  },
  trackShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 60,
    borderRadius: 999,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    position: 'absolute',
    bottom: 40,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 999,
  },
  footerText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
    opacity: 0.5,
  },
});
