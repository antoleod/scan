import React, { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import type { Palette } from '../../../theme/theme';
import { useActiveSessions, useAirdropNow, useSelf } from '../hooks/useAirdrop';
import { useAirdropLifecycle } from '../hooks/useAirdropLifecycle';
import { useUserSharePresence } from '../hooks/useUserSharePresence';
import { dismissSession } from '../sessions/sessionService';
import { encodeQrPayload, readJoinFromCurrentUrl, clearJoinFromUrl } from '../utils/qr';
import { SessionCard } from '../components/SessionCard';
import { MyDevicesSection } from '../components/MyDevicesSection';
import { AirdropLogPanel } from '../components/AirdropLogPanel';
import { SendScreen } from './SendScreen';
import { ReceiveScreen } from './ReceiveScreen';

type Mode = 'home' | 'send' | 'receive' | 'logs';

/**
 * AirDrop tab — single minimalist screen, AirDrop-style.
 *
 * `home` shows your identity, any live sessions, and two large actions
 * (Send / Receive). Picking one opens its flow full-screen with a back affordance.
 * Self-contained: imports nothing from Notes or other features.
 */
export function AirDropScreen({ palette }: { palette: Palette }) {
  useAirdropLifecycle();
  // Keep the "Your devices" list in sync with shares from this account's other
  // signed-in devices (no-op for guests). Powers direct download without a QR.
  useUserSharePresence();

  // If the app was opened from a scanned deep-link QR (?airdrop=session:token),
  // jump straight to Receive and hand the join code to it for auto-pairing.
  const initialJoin = useMemo(() => {
    const payload = readJoinFromCurrentUrl();
    if (payload) {
      clearJoinFromUrl(); // consume once so a refresh doesn't re-trigger
      return encodeQrPayload(payload.session, payload.token);
    }
    return null;
  }, []);

  const [mode, setMode] = useState<Mode>(initialJoin ? 'receive' : 'home');
  const self = useSelf();
  const activeSessions = useActiveSessions();
  const now = useAirdropNow();

  const goHome = () => {
    setMode('home');
    void Haptics.selectionAsync().catch(() => undefined);
  };

  if (mode !== 'home') {
    const title = mode === 'send' ? 'Send' : mode === 'receive' ? 'Receive' : 'Diagnostics';
    return (
      <View style={{ flex: 1, backgroundColor: palette.bg }}>
        <SubHeader palette={palette} title={title} onBack={goHome} />
        <View style={{ flex: 1 }}>
          {mode === 'send' ? (
            <SendScreen palette={palette} />
          ) : mode === 'receive' ? (
            <ReceiveScreen palette={palette} autoJoinCode={initialJoin} />
          ) : (
            <AirdropLogPanel palette={palette} />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingBottom: 28 }}>
        {/* Identity */}
        <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 28, gap: 10 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: palette.accent + '14',
              borderWidth: 1,
              borderColor: palette.accent + '2e',
            }}
          >
            <Text style={{ fontSize: 30 }}>{self?.avatar ?? '📡'}</Text>
          </View>
          <Text style={{ color: palette.fg, fontSize: 20, fontWeight: '900', letterSpacing: -0.3 }}>
            {self?.name ?? 'AirDrop'}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            {self ? 'Ready to share via QR or your account' : 'Discovering your identity…'}
          </Text>
        </View>

        {/* Your other devices' shares — one-tap download, no QR (signed-in only) */}
        <MyDevicesSection palette={palette} />

        {/* Live sessions (only when present) */}
        {activeSessions.length > 0 ? (
          <View style={{ gap: 10, marginBottom: 24 }}>
            {activeSessions.map((s) => (
              <SessionCard
                key={s.id}
                palette={palette}
                session={s}
                now={now}
                onDismiss={(x) => void dismissSession(x.id)}
              />
            ))}
          </View>
        ) : null}

        <View style={{ flex: 1 }} />

        {/* Two primary actions */}
        <View style={{ flexDirection: 'row', gap: 14 }}>
          <ActionButton
            palette={palette}
            icon="arrow-up-circle"
            label="Send"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
              setMode('send');
            }}
          />
          <ActionButton
            palette={palette}
            icon="arrow-down-circle"
            label="Receive"
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
              setMode('receive');
            }}
          />
        </View>

        {/* Diagnostics affordance — discreet, for debugging pairing */}
        <Pressable
          onPress={() => {
            void Haptics.selectionAsync().catch(() => undefined);
            setMode('logs');
          }}
          accessibilityRole="button"
          accessibilityLabel="Open diagnostics logs"
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignSelf: 'center',
            alignItems: 'center',
            gap: 6,
            marginTop: 16,
            paddingHorizontal: 14,
            paddingVertical: 8,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Ionicons name="pulse-outline" size={14} color={palette.muted} />
          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700' }}>Diagnostics</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SubHeader({
  palette,
  title,
  onBack,
}: {
  palette: Palette;
  title: string;
  onBack: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 6,
      }}
    >
      <Pressable
        onPress={onBack}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Back to AirDrop"
        style={({ pressed }) => ({
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.border,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name="chevron-back" size={20} color={palette.fg} />
      </Pressable>
      <Text style={{ color: palette.fg, fontSize: 17, fontWeight: '800' }} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

function ActionButton({
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
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ flex: 1, transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.96, useNativeDriver: false, friction: 5 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 4 }).start()
        }
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          paddingVertical: 22,
          borderRadius: 20,
          backgroundColor: palette.card,
          borderWidth: 1,
          borderColor: palette.border,
        }}
      >
        <Ionicons name={icon} size={30} color={palette.accent} />
        <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800' }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}
