import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { mainAppStyles } from './styles';

type Palette = {
  accent: string;
  muted: string;
  card: string;
  border: string;
};

type Tab = 'scan' | 'history' | 'notes' | 'settings';

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
  return (
    <View style={[mainAppStyles.footer, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Pressable onPress={() => onChangeTab('scan')} style={[mainAppStyles.footerBtn, activeTab === 'scan' ? { backgroundColor: palette.accent + '18', borderRadius: 10 } : null]}>
        <View style={mainAppStyles.footerBtnInner}>
          <Ionicons name="scan" size={18} color={activeTab === 'scan' ? palette.accent : palette.muted} />
          <Text style={{ color: activeTab === 'scan' ? palette.accent : palette.muted, fontWeight: '700' }}>SCAN</Text>
        </View>
      </Pressable>
      <Pressable onPress={onAddPress} style={[mainAppStyles.footerAddBtn, { backgroundColor: palette.accent, borderColor: palette.accent }]}>
        <View style={mainAppStyles.footerBtnInner}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800' }}>Add</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => onChangeTab('history')} style={[mainAppStyles.footerBtn, activeTab === 'history' ? { backgroundColor: palette.accent + '18', borderRadius: 10 } : null]}>
        <View style={mainAppStyles.footerBtnInner}>
          <Ionicons name="time-outline" size={18} color={activeTab === 'history' ? palette.accent : palette.muted} />
          <Text style={{ color: activeTab === 'history' ? palette.accent : palette.muted, fontWeight: '700' }}>HISTORY</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => onChangeTab('notes')} style={[mainAppStyles.footerBtn, activeTab === 'notes' ? { backgroundColor: palette.accent + '18', borderRadius: 10 } : null]}>
        <View style={mainAppStyles.footerBtnInner}>
          <Ionicons name="document-text-outline" size={18} color={activeTab === 'notes' ? palette.accent : palette.muted} />
          <Text style={{ color: activeTab === 'notes' ? palette.accent : palette.muted, fontWeight: '700' }}>NOTES</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => onChangeTab('settings')} style={[mainAppStyles.footerBtn, activeTab === 'settings' ? { backgroundColor: palette.accent + '18', borderRadius: 10 } : null]}>
        <View style={mainAppStyles.footerBtnInner}>
          <Ionicons name="settings-outline" size={18} color={activeTab === 'settings' ? palette.accent : palette.muted} />
          <Text style={{ color: activeTab === 'settings' ? palette.accent : palette.muted, fontWeight: '700' }}>SETTINGS</Text>
        </View>
      </Pressable>
    </View>
  );
}
