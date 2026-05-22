import React from 'react';
import { View, type ViewStyle } from 'react-native';

import type { Palette } from '../../../theme/theme';

/**
 * Premium surface card used across AirDrop screens. Rounded, subtle border,
 * generous padding — the visual primitive every AirDrop screen composes.
 */
export function AirdropCard({
  palette,
  children,
  style,
  accent,
}: {
  palette: Palette;
  children: React.ReactNode;
  style?: ViewStyle;
  /** Optional accent-tinted left edge for emphasis. */
  accent?: boolean;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: palette.card,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: accent ? palette.accent + '55' : palette.border,
          padding: 18,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
