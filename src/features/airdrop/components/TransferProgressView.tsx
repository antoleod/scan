import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../../../theme/theme';
import type { TransferProgress } from '../types';
import { formatBytes } from '../utils/format';

/** Progress bar + stats for an in-flight or finished transfer. */
export function TransferProgressView({
  palette,
  transfer,
}: {
  palette: Palette;
  transfer: TransferProgress;
}) {
  const clampedProgress = Math.min(Math.max(transfer.progress, 0), 1);
  const pct = Math.round(clampedProgress * 100);
  const isError = transfer.status === 'error';
  const isDone = transfer.status === 'done';
  const isActive = transfer.status === 'active';
  const barColor = isError ? '#EF4444' : isDone ? '#22C55E' : palette.accent;
  const animatedProgress = useRef(new Animated.Value(clampedProgress)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(animatedProgress, {
      toValue: clampedProgress,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [animatedProgress, clampedProgress]);

  useEffect(() => {
    if (!isActive || transfer.bytesTransferred <= 0) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 520, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 520, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, pulse, transfer.bytesTransferred]);

  const animatedWidth = animatedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const headOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });
  const headScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.08],
  });
  const segmentCount = 18;
  const activeSegment = Math.min(segmentCount - 1, Math.max(0, Math.floor(clampedProgress * segmentCount)));
  const segmentFill = useMemo(
    () => Array.from({ length: segmentCount }, (_, index) => index < Math.ceil(clampedProgress * segmentCount)),
    [clampedProgress],
  );
  const etaSeconds = transfer.rate && transfer.rate > 0 && isActive
    ? Math.max(0, Math.ceil((transfer.totalBytes - transfer.bytesTransferred) / transfer.rate))
    : null;

  const label =
    transfer.status === 'offered'
      ? transfer.direction === 'send'
        ? 'Waiting for the other device to accept…'
        : 'Incoming file'
      : transfer.status === 'active'
        ? transfer.direction === 'send'
          ? 'Sending…'
          : 'Receiving…'
        : isDone
          ? transfer.direction === 'send'
            ? 'Sent'
            : 'Saved'
          : transfer.status === 'declined'
            ? 'Declined by the other device'
            : isError
              ? 'Transfer failed'
              : '';

  return (
    <View style={{ gap: 10, width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons
          name={isDone ? 'checkmark-circle' : isError ? 'alert-circle' : 'swap-vertical-outline'}
          size={16}
          color={barColor}
        />
        <Text style={{ color: palette.fg, fontSize: 14, fontWeight: '700', flex: 1 }}>{label}</Text>
        {transfer.status === 'active' || isDone ? (
          <Text style={{ color: palette.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{pct}%</Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
        {segmentFill.map((filled, index) => {
          const isHead = isActive && filled && index === activeSegment;
          return (
            <Animated.View
              key={index}
              style={{
                flex: 1,
                height: isHead ? 7 : 5,
                borderRadius: 3,
                backgroundColor: filled ? barColor : palette.border,
                opacity: isHead ? headOpacity : filled ? 0.86 : 0.45,
                transform: [{ scaleY: isHead ? headScale : 1 }],
              }}
            />
          );
        })}
      </View>

      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: palette.border,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            width: animatedWidth,
            height: '100%',
            borderRadius: 4,
            backgroundColor: barColor,
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: palette.muted, fontSize: 11 }}>
          {formatBytes(transfer.bytesTransferred)} / {formatBytes(transfer.totalBytes)}
        </Text>
        {transfer.rate && transfer.status === 'active' ? (
          <Text style={{ color: palette.muted, fontSize: 11 }}>
            {formatBytes(transfer.rate)}/s{etaSeconds !== null ? ` · ${etaSeconds}s left` : ''}
          </Text>
        ) : null}
      </View>

      {transfer.error ? (
        <Text style={{ color: '#EF4444', fontSize: 12 }}>{transfer.error}</Text>
      ) : null}
    </View>
  );
}
