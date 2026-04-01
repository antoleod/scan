import React from 'react';
import { Alert, Linking, Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { lightThemes, ThemeName } from '../../theme/theme';
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

  async function openClipboardShortcut() {
    const url = 'https://oryxen.tech/clipboard/';

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('Clipboard', `No se puede abrir este enlace:\n${url}`);
        return;
      }
      await Linking.openURL(url);
    } catch (error) {
      Alert.alert('Clipboard', `No se pudo abrir el enlace:\n${String(error)}`);
    }
  }

  return (
    <View style={[mainAppStyles.header, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={mainAppStyles.brandBlock}>
        <LogoMark accent={palette.accent} foreground={isLightTheme ? '#162235' : '#0b1220'} compact={compact} />
        <View>
          <Text style={[mainAppStyles.kicker, { color: palette.accent }]}>BARRA CORE</Text>
          <Text style={[mainAppStyles.title, { color: palette.fg }]}>Barra Scanner RN</Text>
          <Text style={[mainAppStyles.subtitle, { color: palette.muted }]}>{statusChip}</Text>
        </View>
      </View>
      <View style={mainAppStyles.headerActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Clipboard link"
          onPress={openClipboardShortcut}
          style={[
            mainAppStyles.qrAction,
            { backgroundColor: palette.accent + '22', borderColor: palette.accent },
          ]}
        >
          <Ionicons name="clipboard-outline" size={16} color={palette.fg} />
          <Text style={[mainAppStyles.qrActionText, { color: palette.fg }]}>Clipboard</Text>
        </Pressable>
        <View style={[mainAppStyles.badge, { backgroundColor: palette.accent + '33', borderColor: palette.accent }]}>
          <Text style={[mainAppStyles.badgeText, { color: palette.fg }]}>{autoDetectLabel}</Text>
        </View>
      </View>
    </View>
  );
}
