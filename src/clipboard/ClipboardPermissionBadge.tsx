import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { PermState } from '../core/clipboard.types';

type Props = {
  permState: PermState;
};

const META: Record<PermState, { label: string; dot: string; bg: string; fg: string }> = {
  granted: { label: 'Auto-capture active', dot: '#22c55e', bg: 'rgba(34, 197, 94, 0.14)', fg: '#dcfce7' },
  prompt: { label: "Click 'Capture now' to enable", dot: '#f59e0b', bg: 'rgba(245, 158, 11, 0.16)', fg: '#fde68a' },
  denied: { label: 'Manual capture only', dot: '#ef4444', bg: 'rgba(239, 68, 68, 0.16)', fg: '#fecaca' },
  unsupported: { label: 'Use paste or import', dot: '#94a3b8', bg: 'rgba(148, 163, 184, 0.16)', fg: '#e2e8f0' },
};

export function ClipboardPermissionBadge({ permState }: Props) {
  const meta = META[permState];
  return (
    <View style={[styles.badge, { backgroundColor: meta.bg }]}>
      <View style={[styles.dot, { backgroundColor: meta.dot }]} />
      <Text style={[styles.text, { color: meta.fg }]}>{meta.label}</Text>
    </View>
  );
}

export default ClipboardPermissionBadge;

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  text: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
