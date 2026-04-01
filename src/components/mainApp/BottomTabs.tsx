import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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
  const scanFocus = useSharedValue(activeTab === 'scan' ? 1 : 0);
  const historyFocus = useSharedValue(activeTab === 'history' ? 1 : 0);
  const notesFocus = useSharedValue(activeTab === 'notes' ? 1 : 0);
  const settingsFocus = useSharedValue(activeTab === 'settings' ? 1 : 0);
  const addPulse = useSharedValue(0);

  useEffect(() => {
    scanFocus.value = withTiming(activeTab === 'scan' ? 1 : 0, { duration: 180 });
    historyFocus.value = withTiming(activeTab === 'history' ? 1 : 0, { duration: 180 });
    notesFocus.value = withTiming(activeTab === 'notes' ? 1 : 0, { duration: 180 });
    settingsFocus.value = withTiming(activeTab === 'settings' ? 1 : 0, { duration: 180 });
    addPulse.value = withTiming(activeTab === 'scan' ? 1 : 0, { duration: 260 });
  }, [activeTab, addPulse, historyFocus, notesFocus, scanFocus, settingsFocus]);

  const scanAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scanFocus.value, [0, 1], [0, -2]) }, { scale: interpolate(scanFocus.value, [0, 1], [1, 1.04]) }],
    opacity: interpolate(scanFocus.value, [0, 1], [0.86, 1]),
  }));
  const historyAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(historyFocus.value, [0, 1], [0, -2]) }, { scale: interpolate(historyFocus.value, [0, 1], [1, 1.04]) }],
    opacity: interpolate(historyFocus.value, [0, 1], [0.86, 1]),
  }));
  const notesAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(notesFocus.value, [0, 1], [0, -2]) }, { scale: interpolate(notesFocus.value, [0, 1], [1, 1.04]) }],
    opacity: interpolate(notesFocus.value, [0, 1], [0.86, 1]),
  }));
  const settingsAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(settingsFocus.value, [0, 1], [0, -2]) }, { scale: interpolate(settingsFocus.value, [0, 1], [1, 1.04]) }],
    opacity: interpolate(settingsFocus.value, [0, 1], [0.86, 1]),
  }));
  const addAnim = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(addPulse.value, [0, 1], [1, 1.06]) }],
    shadowOpacity: interpolate(addPulse.value, [0, 1], [0.1, 0.34]),
    shadowRadius: interpolate(addPulse.value, [0, 1], [6, 12]),
  }));

  const onTabPress = async (tab: Tab) => {
    onChangeTab(tab);
    await Haptics.selectionAsync().catch(() => {});
  };

  const onAdd = async () => {
    onAddPress();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  return (
    <View style={[mainAppStyles.footer, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Animated.View style={scanAnim}>
      <Pressable onPress={() => onTabPress('scan')} style={[mainAppStyles.footerBtn, activeTab === 'scan' ? { backgroundColor: palette.accent + '18', borderRadius: 10 } : null]}>
        <View style={mainAppStyles.footerBtnInner}>
          <Ionicons name="scan" size={18} color={activeTab === 'scan' ? palette.accent : palette.muted} />
          <Text style={{ color: activeTab === 'scan' ? palette.accent : palette.muted, fontWeight: '700' }}>SCAN</Text>
        </View>
      </Pressable>
      </Animated.View>
      <Animated.View style={addAnim}>
      <Pressable onPress={onAdd} style={[mainAppStyles.footerAddBtn, { backgroundColor: palette.accent, borderColor: palette.accent }]}>
        <View style={mainAppStyles.footerBtnInner}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800' }}>Add</Text>
        </View>
      </Pressable>
      </Animated.View>
      <Animated.View style={historyAnim}>
      <Pressable onPress={() => onTabPress('history')} style={[mainAppStyles.footerBtn, activeTab === 'history' ? { backgroundColor: palette.accent + '18', borderRadius: 10 } : null]}>
        <View style={mainAppStyles.footerBtnInner}>
          <Ionicons name="time-outline" size={18} color={activeTab === 'history' ? palette.accent : palette.muted} />
          <Text style={{ color: activeTab === 'history' ? palette.accent : palette.muted, fontWeight: '700' }}>HISTORY</Text>
        </View>
      </Pressable>
      </Animated.View>
      <Animated.View style={notesAnim}>
      <Pressable onPress={() => onTabPress('notes')} style={[mainAppStyles.footerBtn, activeTab === 'notes' ? { backgroundColor: palette.accent + '18', borderRadius: 10 } : null]}>
        <View style={mainAppStyles.footerBtnInner}>
          <Ionicons name="document-text-outline" size={18} color={activeTab === 'notes' ? palette.accent : palette.muted} />
          <Text style={{ color: activeTab === 'notes' ? palette.accent : palette.muted, fontWeight: '700' }}>NOTES</Text>
        </View>
      </Pressable>
      </Animated.View>
      <Animated.View style={settingsAnim}>
      <Pressable onPress={() => onTabPress('settings')} style={[mainAppStyles.footerBtn, activeTab === 'settings' ? { backgroundColor: palette.accent + '18', borderRadius: 10 } : null]}>
        <View style={mainAppStyles.footerBtnInner}>
          <Ionicons name="settings-outline" size={18} color={activeTab === 'settings' ? palette.accent : palette.muted} />
          <Text style={{ color: activeTab === 'settings' ? palette.accent : palette.muted, fontWeight: '700' }}>SETTINGS</Text>
        </View>
      </Pressable>
      </Animated.View>
    </View>
  );
}
