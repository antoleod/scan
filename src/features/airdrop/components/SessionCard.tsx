import React, { useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../../../theme/theme';
import type { ShareSession, SessionStatus } from '../types';
import { formatCountdown } from '../utils/format';

const STATUS_META: Record<
  SessionStatus,
  { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  creating: { label: 'Creating', color: '#9CA3AF', icon: 'ellipsis-horizontal' },
  waiting: { label: 'Waiting for peer', color: '#F59E0B', icon: 'qr-code-outline' },
  pairing: { label: 'Pairing', color: '#3B82F6', icon: 'sync-outline' },
  connected: { label: 'Connected', color: '#22C55E', icon: 'checkmark-circle-outline' },
  transferring: { label: 'Transferring', color: '#22C55E', icon: 'swap-vertical-outline' },
  completed: { label: 'Completed', color: '#22C55E', icon: 'checkmark-done-outline' },
  expired: { label: 'Expired', color: '#6B7280', icon: 'time-outline' },
  cancelled: { label: 'Cancelled', color: '#6B7280', icon: 'close-circle-outline' },
  error: { label: 'Error', color: '#EF4444', icon: 'alert-circle-outline' },
};

/** Live session row with status chip, countdown and dismiss action. */
export function SessionCard({
  palette,
  session,
  now,
  onPress,
  onDismiss,
}: {
  palette: Palette;
  session: ShareSession;
  /** Store clock for countdown; pass from useAirdropNow(). */
  now: number;
  onPress?: (s: ShareSession) => void;
  onDismiss?: (s: ShareSession) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const meta = STATUS_META[session.status];
  const remaining = session.expiresAt - now;
  const isLive =
    session.status !== 'expired' &&
    session.status !== 'cancelled' &&
    session.status !== 'completed';

  // Color countdown red when < 60s, amber when < 5min
  const countdownColor =
    remaining < 60_000 ? '#EF4444' : remaining < 300_000 ? '#F59E0B' : palette.muted;

  const handlePressIn = () => {
    if (!onPress) return;
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: false, friction: 5 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 4 }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => onPress?.(session)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={`${session.payload?.title ?? (session.role === 'host' ? 'Outgoing share' : 'Incoming share')}, ${meta.label}`}
        style={{
          padding: 14,
          borderRadius: 16,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.border,
          gap: 10,
        }}
      >
        {/* Top row: role icon + title + dismiss */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: palette.accent + '18',
            }}
          >
            <Ionicons
              name={session.role === 'host' ? 'arrow-up-circle' : 'arrow-down-circle'}
              size={18}
              color={palette.accent}
            />
          </View>
          <Text
            style={{ color: palette.fg, fontSize: 15, fontWeight: '800', flex: 1 }}
            numberOfLines={1}
          >
            {session.payload?.title ||
              (session.role === 'host' ? 'Outgoing share' : 'Incoming share')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dismiss session"
            hitSlop={12}
            onPress={() => onDismiss?.(session)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: palette.border + '88',
            }}
          >
            <Ionicons name="close" size={15} color={palette.muted} />
          </Pressable>
        </View>

        {/* Bottom row: status chip + countdown */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: meta.color + '1f',
              borderWidth: 1,
              borderColor: meta.color + '33',
            }}
          >
            <Ionicons name={meta.icon} size={12} color={meta.color} />
            <Text style={{ color: meta.color, fontSize: 11, fontWeight: '800' }}>
              {meta.label}
            </Text>
          </View>
          {isLive ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="time-outline" size={12} color={countdownColor} />
              <Text style={{ color: countdownColor, fontSize: 12, fontWeight: '700' }}>
                {formatCountdown(remaining)} left
              </Text>
            </View>
          ) : null}
        </View>

        {session.error ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              padding: 8,
              borderRadius: 10,
              backgroundColor: '#EF444414',
              borderWidth: 1,
              borderColor: '#EF444430',
            }}
          >
            <Ionicons name="alert-circle-outline" size={13} color="#EF4444" />
            <Text style={{ color: '#EF4444', fontSize: 12, flex: 1 }}>{session.error}</Text>
          </View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
