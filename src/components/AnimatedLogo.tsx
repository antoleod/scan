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
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);
  const pulseRing1 = useSharedValue(0);
  const pulseRing2 = useSharedValue(0);

  // Main rotation animation
  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 12000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, [rotation]);

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
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
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

      {/* Main logo circle */}
      <Animated.View
        style={[
          styles.logoBg,
          { width: size, height: size, backgroundColor: accentColor + '15', borderColor: accentColor },
          logoStyle,
        ]}
      >
        {/* Inner gradient effect */}
        <View style={[styles.logoInner, { backgroundColor: accentColor }]}>
          <View
            style={[
              styles.logoCorner1,
              { backgroundColor: color, width: size * 0.4, height: size * 0.4 },
            ]}
          />
          <View
            style={[
              styles.logoCorner2,
              { backgroundColor: color, width: size * 0.35, height: size * 0.35 },
            ]}
          />
          <View
            style={[
              styles.logoCenter,
              { width: size * 0.3, height: size * 0.3, backgroundColor: color },
            ]}
          />
        </View>
      </Animated.View>

      {/* Static accent bar */}
      <View
        style={[
          styles.accentBar,
          { width: size * 0.3, height: 2, backgroundColor: accentColor, marginTop: size * 0.15 },
        ]}
      />
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
    borderRadius: 999,
    borderWidth: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: '90%',
    height: '90%',
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.95,
  },
  logoCorner1: {
    position: 'absolute',
    borderRadius: 999,
    top: -10,
    right: -10,
    opacity: 0.6,
  },
  logoCorner2: {
    position: 'absolute',
    borderRadius: 999,
    bottom: -8,
    left: -8,
    opacity: 0.5,
  },
  logoCenter: {
    borderRadius: 999,
    opacity: 0.8,
    zIndex: 10,
  },
  accentBar: {
    borderRadius: 1,
    marginTop: 12,
  },
});
