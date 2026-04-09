import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type ToastType = 'success' | 'info' | 'error';

type ToastState = {
  message: string;
  type: ToastType;
  id: number;
} | null;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const [toast, setToast] = useState<ToastState>(null);
  const counterRef = useRef(0);

  const show = useCallback((message: string, type: ToastType = 'success') => {
    counterRef.current += 1;
    setToast({ message, type, id: counterRef.current });
  }, []);

  const hide = useCallback(() => setToast(null), []);

  return { toast, show, hide };
}

// ─── View ─────────────────────────────────────────────────────────────────────

const ICON: Record<ToastType, React.ComponentProps<typeof Ionicons>['name']> = {
  success: 'checkmark-circle',
  info: 'information-circle',
  error: 'close-circle',
};

const COLOR: Record<ToastType, string> = {
  success: '#059669',
  info: '#2563eb',
  error: '#dc2626',
};

export function Toast({
  toast,
  onHide,
}: {
  toast: ToastState;
  onHide: () => void;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!toast) return;

    // Fade + slide in
    Animated.parallel([
      Animated.spring(opacity, { toValue: 1, useNativeDriver: true, tension: 120, friction: 10 }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, tension: 120, friction: 10 }),
    ]).start();

    // Auto-dismiss after 2.2s
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 16, duration: 250, useNativeDriver: true }),
      ]).start(() => onHide());
    }, 2200);

    return () => {
      clearTimeout(timer);
      opacity.setValue(0);
      translateY.setValue(20);
    };
  }, [toast?.id]); // re-run whenever a new toast is shown

  if (!toast) return null;

  const color = COLOR[toast.type];
  const icon  = ICON[toast.type];

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 90,
        left: 20,
        right: 20,
        opacity,
        transform: [{ translateY }],
        zIndex: 9999,
        // Pointer events: none so it doesn't block touches
        pointerEvents: 'none',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingVertical: 12,
          borderRadius: 14,
          backgroundColor: '#1a1a1a',
          borderWidth: 1,
          borderColor: `${color}40`,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 8,
        }}
      >
        <Ionicons name={icon} size={18} color={color} />
        <Text style={{ color: '#f5f5f5', fontSize: 13, fontWeight: '600', flex: 1 }}>
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
}
