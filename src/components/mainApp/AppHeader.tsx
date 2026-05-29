import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { mainAppStyles } from './styles';
import { ProfileMenu } from './ProfileMenu';
import { isDeviceOnline, onNetworkStatusChange } from '../../core/network';

/** Tracks online/offline status (web). On native always reports online. */
function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => isDeviceOnline());
  useEffect(() => onNetworkStatusChange(setOnline), []);
  return online;
}

function OfflineChip() {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLabel="Sin conexión. Los cambios se guardan localmente y se sincronizarán al reconectar."
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: '#F59E0B22',
        borderWidth: 1,
        borderColor: '#F59E0B55',
      }}
    >
      <Ionicons name="cloud-offline-outline" size={13} color="#F59E0B" />
      <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '600' }}>Sin conexión</Text>
    </View>
  );
}

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

function LogoMark({ accent, foreground }: { accent: string; foreground: string }) {
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.05, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();
  }, [scaleAnim]);

  return (
    <Animated.View style={[mainAppStyles.logoShell, { width: 32, height: 32, borderColor: accent, backgroundColor: accent, borderRadius: 8, transform: [{ scale: scaleAnim }] }]}>
      <View style={mainAppStyles.logoBars}>
        <View style={[mainAppStyles.logoBar, { height: 16, backgroundColor: foreground }]} />
        <View style={[mainAppStyles.logoBarThin, { height: 12, backgroundColor: foreground }]} />
        <View style={[mainAppStyles.logoBar, { height: 18, backgroundColor: foreground }]} />
        <View style={[mainAppStyles.logoBarThin, { height: 14, backgroundColor: foreground }]} />
      </View>
    </Animated.View>
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
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    if (!lastSyncedAt) return;
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [lastSyncedAt]);

  // Refresh label every 60s so "hace Xm" stays accurate.
  useEffect(() => {
    if (!lastSyncedAt) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  if (syncBusy) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Sync in progress"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
      >
        <ActivityIndicator size={12} color={accent} />
        <Text style={{ color: accent, fontSize: 11 }}>sync…</Text>
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={persistenceMode === 'firebase' ? 'Sync now' : 'Local storage status'}
      hitSlop={10}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, opacity: pressed ? 0.85 : 1 }}
    >
      <Animated.View style={{ opacity: fadeAnim, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="sync-circle-outline" size={14} color={accent} />
        <Text style={{ color: muted, fontSize: 11 }}>
          {persistenceMode === 'firebase' ? (lastSyncedAt ? formatSyncTime(lastSyncedAt) : 'auto sync') : 'local'}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export function AppHeader({
  palette,
  email,
  onPressEmail,
  syncBusy = false,
  lastSyncedAt = null,
  persistenceMode = 'local',
  onSyncNow,
  onOpenCommandPalette,
  profileMenuVisible = false,
  onToggleProfileMenu,
  profileMenuItems = [],
}: {
  palette: Palette;
  email: string;
  onPressEmail: () => void;
  syncBusy?: boolean;
  lastSyncedAt?: number | null;
  persistenceMode?: string;
  onSyncNow?: () => void;
  onOpenCommandPalette?: () => void;
  profileMenuVisible?: boolean;
  onToggleProfileMenu?: () => void;
  profileMenuItems?: MenuItem[];
}) {
  const online = useOnlineStatus();
  return (
    <>
      <View style={[mainAppStyles.header, { backgroundColor: palette.bg, borderColor: palette.border, height: 56, paddingHorizontal: 16 }]}>
        {/* Brand */}
        <View style={[mainAppStyles.brandBlock, { gap: 10 }]}>
          <LogoMark accent={palette.accent} foreground="#000000" />
          <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 }} numberOfLines={1}>
            MyKit
          </Text>
        </View>

        {/* Right side */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          <Pressable
            onPress={onOpenCommandPalette}
            accessibilityRole="button"
            accessibilityLabel="Open global search"
            hitSlop={8}
            style={({ pressed }) => ({
              width: 30,
              height: 30,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.card,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Ionicons name="search-outline" size={16} color={palette.accent} />
          </Pressable>

          {online ? (
            <SyncChip
              syncBusy={syncBusy}
              lastSyncedAt={lastSyncedAt}
              persistenceMode={persistenceMode}
              accent={palette.accent}
              muted={palette.muted}
              onPress={onSyncNow ?? (() => undefined)}
            />
          ) : (
            <OfflineChip />
          )}

          {/* Divider */}
          <View style={{ width: 1, height: 20, backgroundColor: palette.border }} />

          <Pressable
            onPress={onToggleProfileMenu}
            accessibilityRole="button"
            accessibilityLabel="Open profile menu"
            accessibilityState={{ expanded: profileMenuVisible }}
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

      {/* Profile menu dropdown */}
      <ProfileMenu
        visible={profileMenuVisible ?? false}
        email={email}
        palette={palette}
        onClose={onToggleProfileMenu ?? (() => undefined)}
        menuItems={profileMenuItems ?? []}
      />
    </>
  );
}
