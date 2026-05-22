import React, { useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import type { Palette } from '../../../theme/theme';
import { AirdropCard } from './AirdropCard';
import { iconForFile } from './FileChip';
import { TransferProgressView } from './TransferProgressView';
import { useSession, useTransfer, useUserShares } from '../hooks/useAirdrop';
import { joinUserShare, cancelSession } from '../sessions/sessionService';
import { formatBytes } from '../utils/format';
import type { ReceiverHandlers } from '../transfer/transferService';
import type { UserShare } from '../types';

/**
 * "My Devices" — shares offered by THIS account's other signed-in devices.
 *
 * When another of your devices is sharing a file, it appears here with a
 * one-tap **Download** button — no QR scan needed. Tapping Download joins the
 * existing session and auto-accepts the offer (intent is already confirmed),
 * then streams the file directly peer-to-peer. The card shows live progress.
 *
 * Renders nothing when there are no shares (guest mode, or no other device is
 * sharing right now), so it stays invisible until it's useful.
 */
export function MyDevicesSection({ palette }: { palette: Palette }) {
  const shares = useUserShares();
  // sessionId of the share we're actively downloading (only one at a time).
  const [activeId, setActiveId] = useState<string | null>(null);

  if (shares.length === 0) return null;

  return (
    <View style={{ gap: 10, marginBottom: 24 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Ionicons name="phone-portrait-outline" size={15} color={palette.accent} />
        <Text style={{ color: palette.fg, fontSize: 14, fontWeight: '800' }}>Your devices</Text>
      </View>
      <Text style={{ color: palette.muted, fontSize: 12, marginTop: -4, marginBottom: 2 }}>
        Files shared from devices on your account — download directly, no scan.
      </Text>

      {shares.map((share) => (
        <ShareRow
          key={share.sessionId}
          palette={palette}
          share={share}
          active={activeId === share.sessionId}
          busy={activeId !== null && activeId !== share.sessionId}
          onStart={() => setActiveId(share.sessionId)}
          onDone={() => setActiveId(null)}
        />
      ))}
    </View>
  );
}

// ── One share row ─────────────────────────────────────────────────────────────

function ShareRow({
  palette,
  share,
  active,
  busy,
  onStart,
  onDone,
}: {
  palette: Palette;
  share: UserShare;
  /** This row is the one currently downloading. */
  active: boolean;
  /** Another row is downloading — disable this one. */
  busy: boolean;
  onStart: () => void;
  onDone: () => void;
}) {
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useSession(active ? share.sessionId : null);
  const transfer = useTransfer(active ? share.sessionId : null);

  const handlers: Partial<ReceiverHandlers> = {
    onComplete: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
  };

  const download = async () => {
    setJoining(true);
    setError(null);
    onStart();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      await joinUserShare(share.sessionId, share.token, handlers);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect to your other device.');
      onDone();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      setJoining(false);
    }
  };

  const cancel = async () => {
    await cancelSession(share.sessionId).catch(() => undefined);
    onDone();
  };

  const transferring = transfer && (transfer.status === 'active' || transfer.status === 'done');
  const done = transfer?.status === 'done';

  return (
    <AirdropCard palette={palette} accent={active}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: palette.accent + '18',
            borderWidth: 1,
            borderColor: palette.accent + '33',
          }}
        >
          <Ionicons name={iconForFile(share.mimeType, share.fileName)} size={20} color={palette.accent} />
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: palette.fg, fontSize: 14, fontWeight: '800' }} numberOfLines={1}>
            {share.fileName}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
            {share.deviceAvatar} {share.deviceName} · {formatBytes(share.fileSize)}
          </Text>
        </View>

        {!active ? (
          <DownloadButton palette={palette} disabled={busy} onPress={() => void download()} />
        ) : null}
      </View>

      {/* Connection / progress states (only for the active row) */}
      {active ? (
        <View style={{ marginTop: 12, gap: 10 }}>
          {joining || (session && !transferring && !error) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator color={palette.accent} />
              <Text style={{ color: palette.muted, fontSize: 12 }}>
                Connecting to {share.deviceName}…
              </Text>
            </View>
          ) : null}

          {transferring && transfer ? (
            <TransferProgressView palette={palette} transfer={transfer} />
          ) : null}

          {error ? (
            <Text style={{ color: '#EF4444', fontSize: 12, lineHeight: 17 }}>{error}</Text>
          ) : null}

          {!done ? (
            <Pressable
              onPress={() => void cancel()}
              accessibilityRole="button"
              accessibilityLabel="Cancel download"
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: palette.border,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={onDone}
              accessibilityRole="button"
              accessibilityLabel="Done"
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                backgroundColor: palette.accent,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: palette.bg, fontSize: 12, fontWeight: '800' }}>Done</Text>
            </Pressable>
          )}
        </View>
      ) : null}
    </AirdropCard>
  );
}

function DownloadButton({
  palette,
  disabled,
  onPress,
}: {
  palette: Palette;
  disabled: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.4 : 1 }}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={() =>
          !disabled && Animated.spring(scale, { toValue: 0.93, useNativeDriver: false, friction: 5 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 4 }).start()
        }
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        accessibilityLabel="Download this file"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: palette.accent,
        }}
      >
        <Ionicons name="arrow-down-circle" size={16} color={palette.bg} />
        <Text style={{ color: palette.bg, fontSize: 13, fontWeight: '800' }}>Download</Text>
      </Pressable>
    </Animated.View>
  );
}
