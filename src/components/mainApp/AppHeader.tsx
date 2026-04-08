import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { mainAppStyles } from './styles';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

function LogoMark({ accent, foreground }: { accent: string; foreground: string }) {
  return (
    <View style={[mainAppStyles.logoShell, { width: 32, height: 32, borderColor: accent, backgroundColor: accent, borderRadius: 8 }]}>
      <View style={mainAppStyles.logoBars}>
        <View style={[mainAppStyles.logoBar, { height: 16, backgroundColor: foreground }]} />
        <View style={[mainAppStyles.logoBarThin, { height: 12, backgroundColor: foreground }]} />
        <View style={[mainAppStyles.logoBar, { height: 18, backgroundColor: foreground }]} />
        <View style={[mainAppStyles.logoBarThin, { height: 14, backgroundColor: foreground }]} />
      </View>
    </View>
  );
}

export function AppHeader({
  palette,
  email,
  onPressEmail,
}: {
  palette: Palette;
  email: string;
  onPressEmail: () => void;
}) {
  return (
    <View style={[mainAppStyles.header, { backgroundColor: palette.bg, borderColor: palette.border, height: 52 }]}>
      <View style={[mainAppStyles.brandBlock, { gap: 10 }]}>
        <LogoMark accent={palette.accent} foreground="#000000" />
        <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '500', flex: 1, minWidth: 0 }} numberOfLines={1}>
          Oryxen Scanner
        </Text>
      </View>

      <Pressable onPress={onPressEmail} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center', maxWidth: '42%', flexShrink: 1 }}>
        <Text style={{ color: '#999999', fontSize: 12, fontWeight: '400', textAlign: 'right', flexShrink: 1 }} numberOfLines={1}>
          {email}
        </Text>
      </Pressable>
    </View>
  );
}
