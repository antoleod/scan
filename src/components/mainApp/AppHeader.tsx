import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { mainAppStyles } from './styles';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

function LogoMark({ accent, foreground }: { accent: string; foreground: string }) {
  return (
    <View style={[mainAppStyles.logoShell, { width: 32, height: 32, borderColor: accent, backgroundColor: accent, borderRadius: 8 }]}>
      <View style={mainAppStyles.logoBars}>
        <View style={[mainAppStyles.logoBar, { height: 16, backgroundColor: foreground }]} />
        <View style={[mainAppStyles.logoBarThin, { height: 12, backgroundColor: foreground }]} />
        <View style={[mainAppStyles.logoBar, { height: 18, backgroundColor: foreground }]} />
        <View style={[mainAppStyles.logoBarThin, { height: 14, backgroundColor: foreground }]} />
      </View>
    </View>
  );
}

function formatSyncTime(ts: number): string {
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return 'ahora';
  if (diff < 3_600_000) return `hace ${Math.floor(diff / 60_000)}m`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function SyncChip({
  syncBusy,
  lastSyncedAt,
  persistenceMode,
  accent,
  muted,
  onPress,
}: {
  syncBusy: boolean;
  lastSyncedAt: number | null;
  persistenceMode: string;
  accent: string;
  muted: string;
  onPress: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!lastSyncedAt) return;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  }, [lastSyncedAt]);

  // Refresh label every 60s so "hace Xm" stays accurate.
  useEffect(() => {
    if (!lastSyncedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  if (persistenceMode === 'local') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="cloud-offline-outline" size={14} color={muted} />
        <Text style={{ color: muted, fontSize: 11 }}>local</Text>
      </View>
    );
  }

  if (syncBusy) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <ActivityIndicator size={12} color={accent} />
        <Text style={{ color: accent, fontSize: 11 }}>sync…</Text>
      </View>
    );
  }

  return (
    <Pressable onPress={onPress} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Animated.View style={{ opacity: fadeAnim, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="checkmark-circle-outline" size={14} color={accent} />
        <Text style={{ color: muted, fontSize: 11 }}>
          {lastSyncedAt ? formatSyncTime(lastSyncedAt) : 'sin sync'}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export function AppHeader({
  palette,
  email,
  onPressEmail,
  syncBusy = false,
  lastSyncedAt = null,
  persistenceMode = 'local',
  onSyncNow,
}: {
  palette: Palette;
  email: string;
  onPressEmail: () => void;
  syncBusy?: boolean;
  lastSyncedAt?: number | null;
  persistenceMode?: string;
  onSyncNow?: () => void;
}) {
  return (
    <View style={[mainAppStyles.header, { backgroundColor: palette.bg, borderColor: palette.border, height: 56, paddingHorizontal: 16 }]}>
      {/* Brand */}
      <View style={[mainAppStyles.brandBlock, { gap: 10 }]}>
        <LogoMark accent={palette.accent} foreground="#000000" />
        <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 }} numberOfLines={1}>
          Oryxen Scanner
        </Text>
      </View>

      {/* Right side */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
        <SyncChip
          syncBusy={syncBusy}
          lastSyncedAt={lastSyncedAt}
          persistenceMode={persistenceMode}
          accent={palette.accent}
          muted={palette.muted}
          onPress={onSyncNow ?? (() => undefined)}
        />

        {/* Divider */}
        <View style={{ width: 1, height: 20, backgroundColor: palette.border }} />

        <Pressable
          onPress={onPressEmail}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 160, flexShrink: 1 }}
        >
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: `${palette.accent}22`, borderWidth: 1, borderColor: `${palette.accent}44`, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '700' }}>
              {email.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '400', flexShrink: 1 }} numberOfLines={1}>
            {email.split('@')[0]}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
