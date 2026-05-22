import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

import type { Palette } from '../../../theme/theme';
import { diag, type LogEntry } from '../../../core/diagnostics';

const LEVEL_COLOR: Record<LogEntry['level'], string> = {
  info: '#22C55E',
  warn: '#F59E0B',
  error: '#EF4444',
};

/**
 * Live diagnostics viewer for AirDrop. Subscribes to the shared `diag` log and
 * shows only `airdrop.*` events in real time. This is the tool to diagnose why
 * a QR session won't pair (no RTDB, rules denial, missing offer/answer, etc.).
 */
export function AirdropLogPanel({ palette }: { palette: Palette }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  useEffect(() => diag.subscribe(setLogs), []);

  // Newest first, AirDrop-only.
  const airdropLogs = useMemo(
    () => logs.filter((l) => l.event.startsWith('airdrop.')).slice().reverse(),
    [logs],
  );

  const copyAll = async () => {
    const text = airdropLogs
      .slice()
      .reverse()
      .map((l) => `${l.ts} [${l.level.toUpperCase()}] ${l.event}${l.data ? ` ${JSON.stringify(l.data)}` : ''}`)
      .join('\n');
    await Clipboard.setStringAsync(text || 'No AirDrop logs yet.');
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const clearAll = async () => {
    await diag.clear();
    await Haptics.selectionAsync().catch(() => undefined);
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Toolbar */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 14,
          paddingBottom: 10,
        }}
      >
        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700', flex: 1 }}>
          {airdropLogs.length} event{airdropLogs.length === 1 ? '' : 's'} · live
        </Text>
        <ToolbarButton palette={palette} icon="copy-outline" label="Copy" onPress={copyAll} />
        <ToolbarButton palette={palette} icon="trash-outline" label="Clear" onPress={clearAll} />
      </View>

      {airdropLogs.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
          <Ionicons name="pulse-outline" size={28} color={palette.muted} />
          <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center', maxWidth: 260 }}>
            No AirDrop events yet. Open Send or Receive to start a session and watch the
            signaling here.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 120, gap: 6 }}
        >
          {airdropLogs.map((l, i) => (
            <LogRow key={`${l.ts}-${i}`} palette={palette} entry={l} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function LogRow({ palette, entry }: { palette: Palette; entry: LogEntry }) {
  const color = LEVEL_COLOR[entry.level];
  const time = entry.ts.slice(11, 19); // HH:MM:SS
  const label = entry.event.replace(/^airdrop\./, '');
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: 8,
        padding: 10,
        borderRadius: 10,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <View style={{ width: 4, borderRadius: 2, backgroundColor: color }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color, fontSize: 12, fontWeight: '800', flex: 1 }} numberOfLines={1}>
            {label}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 10, fontVariant: ['tabular-nums'] }}>
            {time}
          </Text>
        </View>
        {entry.data && Object.keys(entry.data as object).length > 0 ? (
          <Text style={{ color: palette.muted, fontSize: 11, marginTop: 3, lineHeight: 15 }}>
            {JSON.stringify(entry.data)}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function ToolbarButton({
  palette,
  icon,
  label,
  onPress,
}: {
  palette: Palette;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={14} color={palette.fg} />
      <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}
