import React from 'react';
import { Text, View } from 'react-native';

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
  compact,
  themeName,
}: {
  palette: Palette;
  compact?: boolean;
  themeName: ThemeName;
}) {
  const isLightTheme = lightThemes.includes(themeName);

  return (
    <View style={[mainAppStyles.header, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <View style={mainAppStyles.brandBlock}>
        <LogoMark accent={palette.accent} foreground={isLightTheme ? '#162235' : '#0b1220'} compact={compact} />
        <View>
          <Text style={[mainAppStyles.kicker, { color: palette.accent }]}>BARRA CORE</Text>
          <Text style={[mainAppStyles.title, { color: palette.fg }]}>Oryxen Scanner</Text>
        </View>
      </View>
    </View>
  );
}
