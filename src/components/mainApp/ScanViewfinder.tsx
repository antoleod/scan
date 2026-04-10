import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { ScanState } from '../../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT   = '#FF6B00';
const ACCENT2  = '#FFD84D';
const OVERLAY  = 'rgba(0,0,0,0.52)';
const BRACKET  = 26;
const LINE_W   = 2.5;

// ─── ScanViewfinder ──────────────────────────────────────────────────────────

export function ScanViewfinder({
  torchEnabled,
  onToggleTorch,
  scanState,
}: {
  torchEnabled: boolean;
  onToggleTorch: () => void;
  scanState?: ScanState;
}) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const isLandscape = screenW > screenH;
  const isDesktop = screenW >= 1024;

  // ── Responsive viewfinder dimensions ───────────────────────────────────────
  // Portrait  → narrower, taller   (good for vertical phone hold)
  // Landscape → wider, shorter     (natural barcode alignment)
  // Desktop   → comfortable fixed size
  let vw: number;
  let vh: number;

  if (isDesktop) {
    vw = Math.round(Math.min(380, screenW * 0.3));
    vh = 230;
  } else if (isLandscape) {
    vw = Math.round(Math.min(screenW * 0.38, 380));
    vh = Math.round(Math.min(vw * 0.5, screenH * 0.42));
  } else {
    vw = Math.round(Math.min(screenW * 0.6, 270));
    vh = Math.round(Math.min(vw * 1.05, screenH * 0.24));
  }

  // ── Animation shared values ────────────────────────────────────────────────
  const lineY      = useSharedValue(0);
  const cornerPop  = useSharedValue(1);
  const glowPulse  = useSharedValue(0);
  const areaFlash  = useSharedValue(0);

  useEffect(() => {
    // Scan-line: fast sweep top→bottom→top, continuous
    lineY.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
      false,
    );

    // Corners gently pulse (scale + opacity)
    cornerPop.value = withRepeat(
      withSequence(
        withTiming(1.04, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.97, { duration: 700, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      true,
    );

    // Outer glow ring breathes slowly
    glowPulse.value = withRepeat(
      withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, []);

  // ── Success flash ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (scanState === 'success') {
      areaFlash.value = withSequence(
        withTiming(0.55, { duration: 80, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 450, easing: Easing.inOut(Easing.quad) }),
      );
    }
  }, [scanState]);

  // ── Animated styles ────────────────────────────────────────────────────────

  const lineStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(lineY.value, [0, 1], [4, vh - 6]) }],
    opacity: interpolate(lineY.value, [0, 0.08, 0.5, 0.92, 1], [0, 1, 1, 1, 0]),
  }));

  const trailStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(lineY.value, [0, 1], [4, vh - 6]) }],
    opacity: interpolate(lineY.value, [0, 0.1, 0.5, 0.9, 1], [0, 0.35, 0.35, 0.35, 0]),
  }));

  const cornerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: cornerPop.value }],
    opacity: interpolate(cornerPop.value, [0.97, 1.04], [0.85, 1]),
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(glowPulse.value, [0, 1], [0.15, 0.38]),
    transform: [{ scale: interpolate(glowPulse.value, [0, 1], [0.97, 1.03]) }],
  }));

  const flashStyle = useAnimatedStyle(() => ({
    opacity: areaFlash.value,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* ── Dark overlays around viewfinder ── */}
      <View style={styles.overlayTop} pointerEvents="none" />
      <View style={[styles.middle, { height: vh }]} pointerEvents="none">
        <View style={styles.overlaySide} />

        {/* ── Viewfinder box ── */}
        <View style={{ width: vw, height: vh }}>

          {/* Glow ring behind corners */}
          <Animated.View
            style={[styles.glowRing, { width: vw + 20, height: vh + 20, top: -10, left: -10 }, glowStyle]}
            pointerEvents="none"
          />

          {/* Scan area subtle fill */}
          <View style={[StyleSheet.absoluteFill, styles.scanAreaFill]} pointerEvents="none" />

          {/* Success flash overlay */}
          <Animated.View style={[StyleSheet.absoluteFill, styles.flashOverlay, flashStyle]} pointerEvents="none" />

          {/* Grid lines (subtle) */}
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            {[0.33, 0.66].map((frac) => (
              <View
                key={`h${frac}`}
                style={{
                  position: 'absolute',
                  left: '5%',
                  right: '5%',
                  top: `${frac * 100}%`,
                  height: 1,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                }}
              />
            ))}
            {[0.33, 0.66].map((frac) => (
              <View
                key={`v${frac}`}
                style={{
                  position: 'absolute',
                  top: '5%',
                  bottom: '5%',
                  left: `${frac * 100}%`,
                  width: 1,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                }}
              />
            ))}
          </View>

          {/* ── Corner brackets ── */}
          <Animated.View style={[StyleSheet.absoluteFill, cornerStyle]} pointerEvents="none">
            <Corner pos="tl" />
            <Corner pos="tr" />
            <Corner pos="bl" />
            <Corner pos="br" />
          </Animated.View>

          {/* ── Scan-line trail ── */}
          <Animated.View
            style={[styles.scanTrail, { left: '4%', right: '4%' }, trailStyle]}
            pointerEvents="none"
          />

          {/* ── Scan-line ── */}
          <Animated.View
            style={[styles.scanLine, { left: '4%', right: '4%' }, lineStyle]}
            pointerEvents="none"
          />

        </View>

        <View style={styles.overlaySide} />
      </View>
      <View style={styles.overlayBottom} pointerEvents="none" />

      {/* ── Torch button ── */}
      <Pressable
        style={[styles.torchBtn, torchEnabled && styles.torchBtnActive]}
        onPress={onToggleTorch}
        hitSlop={12}
      >
        <Ionicons
          name={torchEnabled ? 'flash' : 'flash-outline'}
          size={17}
          color={torchEnabled ? ACCENT : 'rgba(255,255,255,0.75)'}
        />
      </Pressable>

      {/* ── Hint pill ── */}
      <View style={styles.hintPill} pointerEvents="none">
        <View style={[styles.hintDot, { backgroundColor: ACCENT }]} />
        <Text style={[styles.hintText, isDesktop && { fontSize: 13 }]}>
          {isLandscape ? 'Align barcode in frame' : 'Point the code at the frame'}
        </Text>
      </View>
    </View>
  );
}

// ─── Corner bracket sub-component ────────────────────────────────────────────

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const isTop    = pos === 'tl' || pos === 'tr';
  const isLeft   = pos === 'tl' || pos === 'bl';
  const radius   = 4;

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: BRACKET,
        height: BRACKET,
        top:    isTop  ? 0 : undefined,
        bottom: !isTop ? 0 : undefined,
        left:   isLeft  ? 0 : undefined,
        right:  !isLeft ? 0 : undefined,
      }}
    >
      {/* Horizontal arm */}
      <View
        style={{
          position: 'absolute',
          height: LINE_W,
          width: BRACKET,
          top:    isTop  ? 0 : undefined,
          bottom: !isTop ? 0 : undefined,
          left:   isLeft  ? 0 : undefined,
          right:  !isLeft ? 0 : undefined,
          backgroundColor: ACCENT,
          borderTopLeftRadius:     pos === 'tl' ? radius : 0,
          borderTopRightRadius:    pos === 'tr' ? radius : 0,
          borderBottomLeftRadius:  pos === 'bl' ? radius : 0,
          borderBottomRightRadius: pos === 'br' ? radius : 0,
          shadowColor: ACCENT,
          shadowOpacity: 0.9,
          shadowRadius: 5,
          elevation: 4,
        }}
      />
      {/* Vertical arm */}
      <View
        style={{
          position: 'absolute',
          width: LINE_W,
          height: BRACKET,
          top:    isTop  ? 0 : undefined,
          bottom: !isTop ? 0 : undefined,
          left:   isLeft  ? 0 : undefined,
          right:  !isLeft ? 0 : undefined,
          backgroundColor: ACCENT,
          borderTopLeftRadius:     pos === 'tl' ? radius : 0,
          borderTopRightRadius:    pos === 'tr' ? radius : 0,
          borderBottomLeftRadius:  pos === 'bl' ? radius : 0,
          borderBottomRightRadius: pos === 'br' ? radius : 0,
          shadowColor: ACCENT,
          shadowOpacity: 0.9,
          shadowRadius: 5,
          elevation: 4,
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlayTop: {
    flex: 1,
    backgroundColor: OVERLAY,
  },
  middle: {
    flexDirection: 'row',
  },
  overlaySide: {
    flex: 1,
    backgroundColor: OVERLAY,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: OVERLAY,
  },
  glowRing: {
    position: 'absolute',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: `${ACCENT}55`,
    shadowColor: ACCENT,
    shadowOpacity: 0.5,
    shadowRadius: 22,
    elevation: 6,
  },
  scanAreaFill: {
    backgroundColor: 'rgba(255,107,0,0.028)',
    borderRadius: 4,
  },
  flashOverlay: {
    backgroundColor: `${ACCENT2}28`,
    borderRadius: 4,
  },
  scanLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: ACCENT,
    borderRadius: 2,
    shadowColor: ACCENT,
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 8,
  },
  scanTrail: {
    position: 'absolute',
    height: 16,
    borderRadius: 8,
    backgroundColor: `${ACCENT}22`,
    shadowColor: ACCENT,
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  torchBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  torchBtnActive: {
    borderColor: `${ACCENT}66`,
    backgroundColor: `${ACCENT}18`,
  },
  hintPill: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  hintDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  hintText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
});
