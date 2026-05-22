import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Tab } from '../../types';

type Palette = {
  accent: string;
  muted: string;
  bg: string;
  border: string;
};

// History lives as a sub-tab inside Scan now, so it is not a top-level nav entry.
// Tapping Scan lands on the camera (#scan); the in-Scan toggle switches to #history.
const tabs: { key: Tab; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'notes', icon: 'document-text-outline', label: 'Notes' },
  { key: 'scan', icon: 'scan-outline', label: 'Scan' },
  { key: 'airdrop', icon: 'paper-plane-outline', label: 'AirDrop' },
  { key: 'settings', icon: 'settings-outline', label: 'Settings' },
];

export function BottomTabs({
  activeTab,
  palette,
  onChangeTab,
  onAddPress,
}: {
  activeTab: Tab;
  palette: Palette;
  onChangeTab: (tab: Tab) => void;
  onAddPress: () => void;
}) {
  const onTabPress = async (tab: Tab) => {
    onChangeTab(tab);
    await Haptics.selectionAsync().catch(() => undefined);
  };

  const onAdd = async () => {
    onAddPress();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  };

  return (
    <View style={{ width: '100%', minWidth: 0, flexShrink: 0, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.bg, paddingHorizontal: 8 }}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between', minHeight: 56 }}>
        {tabs.map((tab, idx) => {
          // Scan owns the History sub-tab, so it stays highlighted on #history too.
          const active = tab.key === 'scan' ? activeTab === 'scan' || activeTab === 'history' : activeTab === tab.key;
          return (
            <React.Fragment key={tab.key}>
              {idx === 2 && <View style={{ flex: 1.2 }} />} {/* Spacer para el FAB del centro */}
              <Pressable
                onPress={() => onTabPress(tab.key)}
                style={({ pressed }) => ({
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                  transform: [{ scale: pressed ? 0.92 : active ? 1.05 : 1 }],
                  borderTopWidth: active ? 2 : 0,
                  borderTopColor: active ? palette.accent : 'transparent',
                })}
              >
                <Ionicons name={active ? tab.icon.replace('-outline', '') as keyof typeof Ionicons.glyphMap : tab.icon} size={24} color={active ? palette.accent : palette.muted} />
                <Text style={{ marginTop: 2, color: active ? palette.accent : palette.muted, fontSize: 10, fontWeight: active ? '700' : '500' }}>
                  {tab.label}
                </Text>
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>

      <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, top: -14, alignItems: 'center' }}>
        <Pressable
          onPress={onAdd}
          hitSlop={10}
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: palette.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.9 : 1,
            transform: [{ scale: pressed ? 0.9 : 1 }],
            shadowColor: palette.accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
            borderWidth: 3,
            borderColor: palette.bg
          })}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}
