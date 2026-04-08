import React from 'react';
import { Pressable, Text, View } from 'react-native';

type Palette = {
  bg: string;
  accent: string;
  border: string;
  textMuted: string;
  textPrimary: string;
};

export type WorkspaceTabKey = 'notes' | 'templates' | 'clipboard';

type TabItem = {
  key: WorkspaceTabKey;
  label: string;
};

export function TabBar({
  activeTab,
  palette,
  tabs,
  onChangeTab,
}: {
  activeTab: WorkspaceTabKey;
  palette: Palette;
  tabs: TabItem[];
  onChangeTab: (tab: WorkspaceTabKey) => void;
}) {
  return (
    <View style={{ width: '100%', borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.bg, flexDirection: 'row', height: 44 }}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChangeTab(tab.key)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.8 : 1,
              borderBottomWidth: 2,
              borderBottomColor: active ? palette.accent : 'transparent',
            })}
          >
            <Text style={{ color: active ? palette.accent : palette.textMuted, fontSize: 13, fontWeight: active ? '600' : '500' }}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
