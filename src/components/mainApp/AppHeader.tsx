import React, { useEffect, useState } from 'react';
import { Alert, Platform, Pressable, Text, View } from 'react-native';

import { lightThemes, ThemeName } from '../../theme/theme';
import { canInstallPwa, subscribePwaInstallAvailability, triggerPwaInstall } from '../../core/pwa';
import { mainAppStyles } from './styles';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

function LogoMark({ accent, foreground, compact }: { accent: string; foreground: string; compact?: boolean }) {
  const size = compact ? 44 : 52;
  const lineHeight = compact ? 18 : 22;
  return (
    <View style={[mainAppStyles.logoShell, { width: size, height: size, borderColor: accent }]}>
      <View style={[mainAppStyles.logoHalo, { backgroundColor: accent + '22' }]} />
      <View style={[mainAppStyles.logoCore, { backgroundColor: accent }]}>
        <View style={mainAppStyles.logoBars}>
          <View style={[mainAppStyles.logoBar, { height: lineHeight, backgroundColor: foreground }]} />
          <View style={[mainAppStyles.logoBarThin, { height: lineHeight - 4, backgroundColor: foreground }]} />
          <View style={[mainAppStyles.logoBar, { height: lineHeight + 2, backgroundColor: foreground }]} />
          <View style={[mainAppStyles.logoBarThin, { height: lineHeight - 2, backgroundColor: foreground }]} />
        </View>
      </View>
    </View>
  );
}

export function AppHeader({
  palette,
  statusChip,
  autoDetectLabel,
  compact,
  themeName,
}: {
  palette: Palette;
  statusChip: string;
  autoDetectLabel: string;
  compact?: boolean;
  themeName: ThemeName;
}) {
  const isLightTheme = lightThemes.includes(themeName);
  const [pwaInstallAvailable, setPwaInstallAvailable] = useState(canInstallPwa());
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => subscribePwaInstallAvailability(setPwaInstallAvailable), []);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    setIsInstalled(window.matchMedia('(display-mode: standalone)').matches);
    const onInstall = () => setIsInstalled(true);
    window.addEventListener('appinstalled', onInstall);
    return () => window.removeEventListener('appinstalled', onInstall);
  }, []);

  return (
    <View style={[mainAppStyles.header, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={mainAppStyles.brandBlock}>
        <LogoMark accent={palette.accent} foreground={isLightTheme ? '#162235' : '#0b1220'} compact={compact} />
        <View>
          <Text style={[mainAppStyles.kicker, { color: palette.accent }]}>BARRA CORE</Text>
          <Text style={[mainAppStyles.title, { color: palette.fg }]}>Oryxen Scanner</Text>
          <Text style={[mainAppStyles.subtitle, { color: palette.muted }]}>{statusChip}</Text>
        </View>
      </View>
      <View style={mainAppStyles.headerActions}>
        {Platform.OS === 'web' ? (
          <Pressable
            style={({ pressed }) => [
              mainAppStyles.badge,
              { backgroundColor: palette.accent + '1f', borderColor: palette.accent, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={async () => {
              if (pwaInstallAvailable) {
                const result = await triggerPwaInstall();
                Alert.alert(result.accepted ? 'Installed' : 'Install canceled', result.accepted ? 'App installed successfully.' : 'Installation was canceled.');
                return;
              }
              Alert.alert('Install app', 'Use browser menu (three dots) and choose "Install app".');
            }}
          >
            <Text style={[mainAppStyles.badgeText, { color: palette.fg }]}>{isInstalled ? 'PWA INSTALLED' : (pwaInstallAvailable ? 'INSTALL APP' : 'HOW TO INSTALL')}</Text>
          </Pressable>
        ) : null}
        <View style={[mainAppStyles.badge, { backgroundColor: palette.accent + '33', borderColor: palette.accent }]}>
          <Text style={[mainAppStyles.badgeText, { color: palette.fg }]}>{autoDetectLabel}</Text>
        </View>
      </View>
    </View>
  );
}
