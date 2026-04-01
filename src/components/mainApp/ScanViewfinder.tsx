import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

const C = {
  overlay: 'rgba(0,0,0,0.55)',
  accent: '#FF6B00',
  hintBg: 'rgba(0,0,0,0.65)',
  hintBorder: 'rgba(255,255,255,0.1)',
  hintText: '#cccccc',
  flashBg: 'rgba(255,255,255,0.07)',
};

const VIEW_W = 220;
const VIEW_H = 180;
const BRACKET = 22;

export function ScanViewfinder({
  torchEnabled,
  onToggleTorch,
}: {
  torchEnabled: boolean;
  onToggleTorch: () => void;
}) {
  const lineProgress = useSharedValue(0);

  React.useEffect(() => {
    lineProgress.value = withRepeat(withTiming(1, { duration: 2000 }), -1, true);
  }, [lineProgress]);

  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(lineProgress.value, [0, 1], [VIEW_H * 0.1, VIEW_H * 0.85]) }],
  }));

  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.overlayTop} pointerEvents="none" />
      <View style={styles.middle} pointerEvents="none">
        <View style={styles.overlaySide} />
        <View style={styles.viewfinder}>
          <View style={[styles.corner, styles.tl]} />
          <View style={[styles.corner, styles.tr]} />
          <View style={[styles.corner, styles.bl]} />
          <View style={[styles.corner, styles.br]} />
          <Animated.View style={[styles.scanLine, lineStyle]} />
        </View>
        <View style={styles.overlaySide} />
      </View>
      <View style={styles.overlayBottom} pointerEvents="none" />

      <Pressable style={styles.flash} onPress={onToggleTorch}>
        <Ionicons name={torchEnabled ? 'flash' : 'flash-outline'} size={18} color={C.hintText} />
      </Pressable>

      <View style={styles.hintPill} pointerEvents="none">
        <Text style={styles.hintText}>Apunta el código al recuadro</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: C.overlay,
  },
  middle: {
    flexDirection: 'row',
    height: VIEW_H,
  },
  overlaySide: {
    flex: 1,
    backgroundColor: C.overlay,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: C.overlay,
  },
  viewfinder: {
    width: VIEW_W,
    height: VIEW_H,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: BRACKET,
    height: BRACKET,
    borderColor: C.accent,
  },
  tl: {
    top: 0,
    left: 0,
    borderTopWidth: 2.5,
    borderLeftWidth: 2.5,
  },
  tr: {
    top: 0,
    right: 0,
    borderTopWidth: 2.5,
    borderRightWidth: 2.5,
  },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 2.5,
    borderLeftWidth: 2.5,
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 2.5,
    borderRightWidth: 2.5,
  },
  scanLine: {
    position: 'absolute',
    left: '8%',
    right: '8%',
    height: 1.5,
    backgroundColor: C.accent,
  },
  flash: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: C.flashBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintPill: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.hintBorder,
    backgroundColor: C.hintBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  hintText: {
    color: C.hintText,
    fontSize: 12,
    fontWeight: '500',
  },
});

