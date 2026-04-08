import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AuthScreen from './src/auth/AuthScreen';
import { AuthProvider } from './src/auth/authContext';
import { useAuth } from './src/auth/useAuth';
import { useAppTheme } from './src/constants/theme';
import { ThemeProvider } from './src/core/theme';
import { loadSettings } from './src/core/settings';
import { initPwaInstallBridge } from './src/core/pwa';
import MainAppScreen from './src/screens/MainAppScreen';

function AuthGate() {
  const { user, isGuest, isLoading } = useAuth();
  const { setThemeName } = useAppTheme();

  useEffect(() => {
    initPwaInstallBridge();
    loadSettings()
      .then((settings) => {
        const key = settings.theme === 'eu_blue' ? 'euBlue' : settings.theme;
        setThemeName(key as 'euBlue' | 'dark' | 'light' | 'parliament' | 'custom' | 'noirGraphite' | 'midnightSteel' | 'obsidianGold');
      })
      .catch(() => undefined);
  }, [setThemeName]);

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0f82f8" />
        <Text style={styles.loadingText}>Verifying session...</Text>
      </View>
    );
  }

  if (user || isGuest) {
    return <MainAppScreen />;
  }

  return <AuthScreen />;
}

export default function App() {
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.style.width = '100%';
    html.style.height = '100%';
    html.style.margin = '0';
    html.style.overflowX = 'hidden';
    html.style.backgroundColor = '#070d1b';

    body.style.width = '100%';
    body.style.height = '100%';
    body.style.margin = '0';
    body.style.overflowX = 'hidden';
    body.style.backgroundColor = '#070d1b';

    if (root) {
      root.style.width = '100%';
      root.style.height = '100%';
      root.style.minHeight = '100%';
      root.style.overflowX = 'hidden';
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

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b0f15',
    paddingHorizontal: 20,
  },
  loadingText: {
    marginTop: 12,
    color: '#dce3ef',
    fontSize: 14,
    fontWeight: '600',
  },
});
