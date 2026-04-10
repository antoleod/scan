import React, { useEffect } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

type Feedback = {
  type: 'success' | 'duplicate' | 'error';
  message: string;
} | null;

const CONFIG = {
  success:   { bg: '#052e16', border: '#16a34a', text: '#86efac', icon: 'checkmark-circle' as const },
  duplicate: { bg: '#172554', border: '#3b82f6', text: '#93c5fd', icon: 'copy-outline' as const },
  error:     { bg: '#2d0e0e', border: '#dc2626', text: '#fca5a5', icon: 'alert-circle-outline' as const },
};

export function ScanFeedbackBanner({ feedback }: { feedback: Feedback }) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-14);
  const scale = useSharedValue(0.94);

  useEffect(() => {
    if (feedback) {
      // Snap in fast, stay, no auto-exit (parent controls lifecycle via state)
      opacity.value = withTiming(1, { duration: 120, easing: Easing.out(Easing.quad) });
      translateY.value = withTiming(0, { duration: 140, easing: Easing.out(Easing.back(1.6)) });
      scale.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.back(1.4)) });
    } else {
      // Fade + slide out
      opacity.value = withTiming(0, { duration: 160 });
      translateY.value = withTiming(-10, { duration: 160 });
      scale.value = withTiming(0.96, { duration: 160 });
    }
  }, [feedback?.type, feedback?.message]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
  }));

  const cfg = feedback ? CONFIG[feedback.type] : CONFIG.success;

  return (
    <Animated.View
      style={[
        styles.banner,
        { backgroundColor: cfg.bg, borderColor: cfg.border },
        animStyle,
      ]}
      pointerEvents="none"
    >
      <Ionicons name={cfg.icon} size={16} color={cfg.text} />
      <Text style={[styles.text, { color: cfg.text }]} numberOfLines={1}>
        {feedback?.message ?? ''}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 2,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 40,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    letterSpacing: 0.1,
  },
});
