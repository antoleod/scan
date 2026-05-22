import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import type { Palette } from '../../theme/theme';

type ScanView = 'scan' | 'history';

const segments: { key: ScanView; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'scan', icon: 'scan-outline', label: 'Escanear' },
  { key: 'history', icon: 'time-outline', label: 'Historial' },
];

/**
 * Segmented control shown at the top of the Scan section. Switches between the
 * camera (#scan) and the saved-scan history (#history). The active view is
 * driven by `value`; `onChange` should map to setActiveTab so the URL hash and
 * bottom-nav highlight stay in sync.
 */
export function ScanHistoryToggle({
  value,
  palette,
  historyCount,
  onChange,
}: {
  value: ScanView;
  palette: Palette;
  historyCount?: number;
  onChange: (view: ScanView) => void;
}) {
  const onPress = async (view: ScanView) => {
    if (view === value) return;
    onChange(view);
    await Haptics.selectionAsync().catch(() => undefined);
  };

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: palette.card,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: palette.border,
        padding: 4,
        gap: 4,
        marginHorizontal: 12,
        marginTop: 10,
        marginBottom: 4,
      }}
    >
      {segments.map((seg) => {
        const active = value === seg.key;
        const showBadge = seg.key === 'history' && typeof historyCount === 'number' && historyCount > 0;
        return (
          <Pressable
            key={seg.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={seg.label}
            onPress={() => onPress(seg.key)}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 9,
              borderRadius: 9,
              backgroundColor: active ? palette.accent : 'transparent',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Ionicons
              name={active ? (seg.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap) : seg.icon}
              size={16}
              color={active ? palette.bg : palette.muted}
            />
            <Text
              style={{
                color: active ? palette.bg : palette.muted,
                fontSize: 13,
                fontWeight: active ? '800' : '600',
              }}
            >
              {seg.label}
            </Text>
            {showBadge ? (
              <View
                style={{
                  minWidth: 18,
                  height: 18,
                  paddingHorizontal: 5,
                  borderRadius: 9,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? palette.bg : palette.accent,
                }}
              >
                <Text style={{ color: active ? palette.accent : palette.bg, fontSize: 10, fontWeight: '800' }}>
                  {historyCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
