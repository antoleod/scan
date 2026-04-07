import React, { useEffect } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
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
    transform: [{ translateY: interpolate(scanFocus.value, [0, 1], [0, -4]) }, { scale: interpolate(scanFocus.value, [0, 1], [1, 1.08]) }],
    opacity: interpolate(scanFocus.value, [0, 1], [0.76, 1]),
  }));
  const historyAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(historyFocus.value, [0, 1], [0, -4]) }, { scale: interpolate(historyFocus.value, [0, 1], [1, 1.08]) }],
    opacity: interpolate(historyFocus.value, [0, 1], [0.76, 1]),
  }));
  const notesAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(notesFocus.value, [0, 1], [0, -4]) }, { scale: interpolate(notesFocus.value, [0, 1], [1, 1.08]) }],
    opacity: interpolate(notesFocus.value, [0, 1], [0.76, 1]),
  }));
  const settingsAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(settingsFocus.value, [0, 1], [0, -4]) }, { scale: interpolate(settingsFocus.value, [0, 1], [1, 1.08]) }],
    opacity: interpolate(settingsFocus.value, [0, 1], [0.76, 1]),
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

  function renderTab(tab: { key: Tab; icon: string; iconActive: string; label: string; anim: ReturnType<typeof useAnimatedStyle> }) {
    const active = activeTab === tab.key;
    return (
      <Animated.View key={tab.key} style={[tab.anim, { flex: 1 }]}>
        <Pressable
          onPress={() => onTabPress(tab.key)}
          style={({ pressed }) => [
            mainAppStyles.footerBtn,
            active ? { backgroundColor: palette.accent + '16' } : null,
            pressed ? { opacity: 0.75 } : null,
          ]}
        >
          {active && <View style={[mainAppStyles.footerIndicator, { backgroundColor: palette.accent }]} />}
          <View style={mainAppStyles.footerBtnInner}>
            <Ionicons
              name={(active ? tab.iconActive : tab.icon) as keyof typeof Ionicons.glyphMap}
              size={active ? 23 : 21}
              color={active ? palette.accent : palette.muted}
            />
            <Text style={{ color: active ? palette.accent : palette.muted, fontSize: 9, fontWeight: active ? '800' : '600', letterSpacing: 0.6 }}>
              {tab.label.toUpperCase()}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View
      style={[
        mainAppStyles.footer,
        { backgroundColor: palette.card, borderColor: palette.border },
        Platform.OS === 'web' ? { width: '100%', borderRadius: 0, marginBottom: 0, paddingHorizontal: 6 } : null,
      ]}
    >
      {renderTab({ key: 'notes', icon: 'document-text-outline', iconActive: 'document-text', label: 'Notes', anim: notesAnim })}
      <Animated.View style={[addAnim, { flex: 1 }]}>
        <Pressable onPress={onAdd} hitSlop={8} style={[mainAppStyles.footerAddBtn, { backgroundColor: palette.accent, borderColor: palette.accent + 'cc', transform: [{ translateY: -2 }] }]}>
          <View style={mainAppStyles.footerBtnInner}>
            <Ionicons name="add" size={24} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 }}>ADD</Text>
          </View>
        </Pressable>
      </Animated.View>
      {renderTab({ key: 'history', icon: 'time-outline', iconActive: 'time', label: 'History', anim: historyAnim })}
      {renderTab({ key: 'scan', icon: 'scan-outline', iconActive: 'scan', label: 'Scan', anim: scanAnim })}
      {renderTab({ key: 'settings', icon: 'settings-outline', iconActive: 'settings', label: 'Settings', anim: settingsAnim })}
    </View>
  );
}
