import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Palette {
  surfaceAlt: string;
  textDim: string;
}

interface ThemedActionIconButtonProps {
  icon: string;
  label: string;
  accentColor: string;
  active?: boolean;
  disabled?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  delayLongPress?: number;
  onHoverIn?: () => void;
  onHoverOut?: () => void;
  palette: Palette;
  compact?: boolean;
  entranceDelay?: number;
}

export function ThemedActionIconButton({
  icon,
  label,
  accentColor,
  active = false,
  disabled = false,
  onPress,
  onLongPress,
  delayLongPress,
  onHoverIn,
  onHoverOut,
  palette,
  compact = false,
  entranceDelay = 0,
}: ThemedActionIconButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const translateYAnim = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    // Entrance animation with delay
    Animated.parallel([
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        delay: entranceDelay,
        useNativeDriver: false,
      }),
      Animated.timing(translateYAnim, {
        toValue: 0,
        duration: 200,
        delay: entranceDelay,
        useNativeDriver: false,
      }),
    ]).start();
  }, [opacityAnim, translateYAnim, entranceDelay]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      useNativeDriver: false,
      friction: 5,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      useNativeDriver: false,
    }).start();
  };

  // Derive colors from accent color with opacity
  const bg = `${accentColor}14`; // 8% opacity
  const border = `${accentColor}55`; // 33% opacity
  const activeBg = `${accentColor}28`; // 16% opacity
  const activeBorder = `${accentColor}cc`; // 80% opacity

  const size = compact ? 36 : 38;
  const iconSize = compact ? 17 : 18;

  return (
    <Animated.View
      style={{
        opacity: opacityAnim,
        transform: [{ scale: scaleAnim }, { translateY: translateYAnim }],
      }}
    >
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        delayLongPress={delayLongPress}
        onHoverIn={onHoverIn}
        onHoverOut={onHoverOut}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        accessibilityLabel={label}
        accessibilityRole="button"
        style={{
          width: size,
          height: size,
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: active ? activeBorder : border,
          backgroundColor: active ? activeBg : bg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.35 : 1,
        }}
      >
        <MaterialCommunityIcons
          name={icon as any}
          size={iconSize}
          color={accentColor}
        />
      </Pressable>
    </Animated.View>
  );
}
