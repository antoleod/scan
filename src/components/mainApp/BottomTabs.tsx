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

  return (
    <View
      style={[
        mainAppStyles.footer,
        { backgroundColor: palette.card, borderColor: palette.border },
        Platform.OS === 'web' ? { width: '100%', borderRadius: 0, marginBottom: 0, paddingHorizontal: 10 } : null,
      ]}
    >
      <Animated.View style={[notesAnim, { flex: 1 }]}>
        <Pressable onPress={() => onTabPress('notes')} style={[mainAppStyles.footerBtn, activeTab === 'notes' ? { backgroundColor: palette.accent + '14' } : null]}>
          {activeTab === 'notes' && <View style={[mainAppStyles.footerIndicator, { backgroundColor: palette.accent }]} />}
          <View style={mainAppStyles.footerBtnInner}>
            <Ionicons name="document-text-outline" size={activeTab === 'notes' ? 22 : 20} color={activeTab === 'notes' ? palette.accent : palette.muted} />
            <Text style={{ color: activeTab === 'notes' ? palette.accent : palette.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>NOTES</Text>
          </View>
        </Pressable>
      </Animated.View>
      <Animated.View style={[addAnim, { flex: 1 }]}>
        <Pressable onPress={onAdd} style={[mainAppStyles.footerAddBtn, { backgroundColor: palette.accent, borderColor: palette.accent + 'cc' }]}>
          <View style={mainAppStyles.footerBtnInner}>
            <Ionicons name="add" size={22} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.6 }}>ADD</Text>
          </View>
        </Pressable>
      </Animated.View>
      <Animated.View style={[historyAnim, { flex: 1 }]}>
        <Pressable onPress={() => onTabPress('history')} style={[mainAppStyles.footerBtn, activeTab === 'history' ? { backgroundColor: palette.accent + '14' } : null]}>
          {activeTab === 'history' && <View style={[mainAppStyles.footerIndicator, { backgroundColor: palette.accent }]} />}
          <View style={mainAppStyles.footerBtnInner}>
            <Ionicons name="time-outline" size={activeTab === 'history' ? 22 : 20} color={activeTab === 'history' ? palette.accent : palette.muted} />
            <Text style={{ color: activeTab === 'history' ? palette.accent : palette.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>HISTORY</Text>
          </View>
        </Pressable>
      </Animated.View>
      <Animated.View style={[scanAnim, { flex: 1 }]}>
        <Pressable onPress={() => onTabPress('scan')} style={[mainAppStyles.footerBtn, activeTab === 'scan' ? { backgroundColor: palette.accent + '14' } : null]}>
          {activeTab === 'scan' && <View style={[mainAppStyles.footerIndicator, { backgroundColor: palette.accent }]} />}
          <View style={mainAppStyles.footerBtnInner}>
            <Ionicons name="scan" size={activeTab === 'scan' ? 22 : 20} color={activeTab === 'scan' ? palette.accent : palette.muted} />
            <Text style={{ color: activeTab === 'scan' ? palette.accent : palette.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>SCAN</Text>
          </View>
        </Pressable>
      </Animated.View>
      <Animated.View style={[settingsAnim, { flex: 1 }]}>
        <Pressable onPress={() => onTabPress('settings')} style={[mainAppStyles.footerBtn, activeTab === 'settings' ? { backgroundColor: palette.accent + '14' } : null]}>
          {activeTab === 'settings' && <View style={[mainAppStyles.footerIndicator, { backgroundColor: palette.accent }]} />}
          <View style={mainAppStyles.footerBtnInner}>
            <Ionicons name="settings-outline" size={activeTab === 'settings' ? 22 : 20} color={activeTab === 'settings' ? palette.accent : palette.muted} />
            <Text style={{ color: activeTab === 'settings' ? palette.accent : palette.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.8 }}>SETTINGS</Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}
