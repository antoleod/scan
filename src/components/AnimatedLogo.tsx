import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
} from 'react-native-reanimated';

interface AnimatedLogoProps {
  size?: number;
  color: string;
  accentColor: string;
}

export function AnimatedLogo({ size = 80, color, accentColor }: AnimatedLogoProps) {
  const scale = useSharedValue(1);
  const pulseRing1 = useSharedValue(0);
  const pulseRing2 = useSharedValue(0);

  // Breathing scale effect
  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.05, { duration: 2000, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
  }, [scale]);

  // Glow pulse rings
  useEffect(() => {
    pulseRing1.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 500 })
      ),
      -1,
      false
    );

    pulseRing2.value = withDelay(
      750,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }),
          withTiming(0, { duration: 500 })
        ),
        -1,
        false
      )
    );
  }, [pulseRing1, pulseRing2]);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pulseRing1Style = useAnimatedStyle(() => ({
    opacity: interpolate(pulseRing1.value, [0, 1], [0, 0.3]),
    transform: [{ scale: interpolate(pulseRing1.value, [0, 1], [0.8, 1.3]) }],
  }));

  const pulseRing2Style = useAnimatedStyle(() => ({
    opacity: interpolate(pulseRing2.value, [0, 1], [0, 0.25]),
    transform: [{ scale: interpolate(pulseRing2.value, [0, 1], [0.8, 1.5]) }],
  }));

  return (
    <View style={[styles.container, { width: size + 80, height: size + 80 }]}>
      {/* Outer pulse ring */}
      <Animated.View
        style={[
          styles.pulseRing,
          { width: size + 60, height: size + 60, borderColor: accentColor },
          pulseRing2Style,
        ]}
      />

      {/* Middle pulse ring */}
      <Animated.View
        style={[
          styles.pulseRing,
          { width: size + 40, height: size + 40, borderColor: accentColor },
          pulseRing1Style,
        ]}
      />

      {/* Main MyKit workflow mark */}
      <Animated.View
        style={[
          styles.logoBg,
          { width: size, height: size, borderColor: accentColor + '66' },
          logoStyle,
        ]}
      >
        <View style={[styles.connector, styles.connectorLeft, { backgroundColor: accentColor, width: size * 0.24, height: size * 0.06 }]} />
        <View style={[styles.connector, styles.connectorRight, { backgroundColor: '#2F6BFF', width: size * 0.24, height: size * 0.06 }]} />
        <View style={[styles.connector, styles.connectorBottom, { backgroundColor: '#FFB84D', width: size * 0.06, height: size * 0.24 }]} />

        <View style={[styles.node, styles.nodeLeft, { backgroundColor: accentColor, width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09 }]} />
        <View style={[styles.node, styles.nodeRight, { backgroundColor: '#2F6BFF', width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09 }]} />
        <View style={[styles.node, styles.nodeBottom, { backgroundColor: '#FFB84D', width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09 }]} />

        <View style={[styles.vault, { width: size * 0.44, height: size * 0.56, borderRadius: size * 0.09, borderColor: color, backgroundColor: '#07111E' }]}>
          <View style={[styles.vaultLine, { backgroundColor: accentColor, width: size * 0.2 }]} />
          <View style={[styles.vaultCore, { backgroundColor: color, width: size * 0.18, height: size * 0.18, borderRadius: size * 0.09 }]} />
          <View style={[styles.vaultLine, { backgroundColor: '#FFB84D', width: size * 0.2 }]} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.5,
  },
  logoBg: {
    borderRadius: 22,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    backgroundColor: 'rgba(7, 17, 30, 0.72)',
  },
  connector: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.85,
  },
  connectorLeft: {
    left: '8%',
    top: '31%',
    transform: [{ rotate: '31deg' }],
  },
  connectorRight: {
    right: '8%',
    top: '31%',
    transform: [{ rotate: '-31deg' }],
  },
  connectorBottom: {
    bottom: '8%',
  },
  node: {
    position: 'absolute',
  },
  nodeLeft: {
    left: '-2%',
    top: '20%',
  },
  nodeRight: {
    right: '-2%',
    top: '20%',
  },
  nodeBottom: {
    bottom: '-2%',
  },
  vault: {
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'space-evenly',
    zIndex: 4,
  },
  vaultLine: {
    height: 4,
    borderRadius: 999,
  },
  vaultCore: {
    shadowColor: '#fff',
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
});
