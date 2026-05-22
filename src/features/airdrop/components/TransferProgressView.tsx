import React from 'react';
import { Text, View } from 'react-native';
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
  const pct = Math.round(Math.min(Math.max(transfer.progress, 0), 1) * 100);
  const isError = transfer.status === 'error';
  const isDone = transfer.status === 'done';
  const barColor = isError ? '#EF4444' : isDone ? '#22C55E' : palette.accent;

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

      {/* Progress track */}
      <View
        style={{
          height: 8,
          borderRadius: 4,
          backgroundColor: palette.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${pct}%`,
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
          <Text style={{ color: palette.muted, fontSize: 11 }}>{formatBytes(transfer.rate)}/s</Text>
        ) : null}
      </View>

      {transfer.error ? (
        <Text style={{ color: '#EF4444', fontSize: 12 }}>{transfer.error}</Text>
      ) : null}
    </View>
  );
}
