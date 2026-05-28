import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import type { Palette } from '../../../theme/theme';
import { AirdropCard } from '../components/AirdropCard';
import { FileChip } from '../components/FileChip';
import { SessionQrView } from '../components/SessionQrView';
import { TransferProgressView } from '../components/TransferProgressView';
import { useAirdropNow, useSession, useTransfer } from '../hooks/useAirdrop';
import { createSession, cancelSession, dismissSession } from '../sessions/sessionService';
import { pickFile } from '../transfer/filePicker';
import { isWebRtcSupported } from '../webrtc';
import { TTL_PRESETS, TTL_PRESET_LABEL, DEFAULT_TTL } from '../constants';
import { diag } from '../../../core/diagnostics';
import { onFirebaseAuthState } from '../../../core/firebase';
import type { SelectedFile, SessionTtlPreset } from '../types';

/**
 * Send flow — file-first, then QR.
 *
 *   idle → pick a file → file selected → "Generate QR" → session waiting/pairing
 *   → connected → transferring → completed (or failed/declined/cancelled)
 *
 * A session/QR is created ONLY after a file is selected. Cancelling clears the
 * session and QR but keeps the chosen file so the user can re-share it.
 */
export function SendScreen({ palette }: { palette: Palette }) {
  const now = useAirdropNow();
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [ttl, setTtl] = useState<SessionTtlPreset>(DEFAULT_TTL);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const session = useSession(sessionId);
  const transfer = useTransfer(sessionId);

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | null = null;
    void onFirebaseAuthState((user) => {
      if (mounted) setSignedIn(Boolean(user));
    }).then((off) => {
      if (!mounted) off();
      else unsubscribe = off;
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const choose = async () => {
    setPicking(true);
    try {
      const picked = await pickFile();
      if (picked) {
        setFile(picked);
        await Haptics.selectionAsync().catch(() => undefined);
      }
    } catch (e) {
      void diag.error('airdrop.send.pick_failed', { error: String(e) });
    } finally {
      setPicking(false);
    }
  };

  const generate = async () => {
    if (!file) return; // QR blocked without a file
    setStarting(true);
    setError(null);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      const created = await createSession({
        file,
        ttl,
        payload: { kind: 'file', title: file.name, byteSize: file.size, mimeType: file.mimeType, fileName: file.name },
      });
      setSessionId(created.id);
    } catch (e) {
      // createSession can throw on a signaling publish failure (RTDB rules) —
      // surface it instead of silently re-enabling the button with no QR.
      const msg = e instanceof Error ? e.message : 'Could not start the session.';
      setError(msg);
      void diag.error('airdrop.send.create_failed', { error: String(e) });
    } finally {
      setStarting(false);
    }
  };

  // End the current session cleanly. A completed session is dismissed (store
  // cleanup) rather than cancelled — cancelSession would send a spurious `bye`
  // to a peer that already finished and left.
  const endSession = async () => {
    if (sessionId) {
      if (session?.status === 'completed') await dismissSession(sessionId).catch(() => undefined);
      else await cancelSession(sessionId).catch(() => undefined);
    }
  };

  // Cancel: clear session + QR, keep the selected file.
  const cancelShare = async () => {
    await endSession();
    setSessionId(null);
    await Haptics.selectionAsync().catch(() => undefined);
  };

  // Back to file selection: clear everything including the file.
  const changeFile = async () => {
    await endSession();
    setSessionId(null);
    setFile(null);
  };

  // After a finished transfer: dismiss and reset to the file-selection step.
  const finishDone = async () => {
    await endSession();
    setSessionId(null);
    await Haptics.selectionAsync().catch(() => undefined);
  };

  // ── Active session: QR + status + transfer progress ──
  const sessionActive =
    session &&
    (session.status === 'waiting' ||
      session.status === 'pairing' ||
      session.status === 'connected' ||
      session.status === 'transferring');

  if (session && (sessionActive || transfer)) {
    const transferring = transfer && (transfer.status === 'active' || transfer.status === 'done' || transfer.status === 'offered');
    return (
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 18, paddingBottom: 130, gap: 18 }}
      >
        {file ? <FileChip palette={palette} name={file.name} size={file.size} mimeType={file.mimeType} /> : null}

        {/* While not yet transferring, show the QR centered */}
        {!transferring ? (
          <View style={{ alignItems: 'center', gap: 18 }}>
            <AirdropCard palette={palette} accent style={{ width: '100%', maxWidth: 360, alignItems: 'center' }}>
              <SessionQrView palette={palette} session={session} now={now} />
            </AirdropCard>
            <Text style={{ color: palette.muted, fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 18 }}>
              On the other device, open AirDrop → Receive and scan this code. The file is offered
              only after it connects.
            </Text>
            {signedIn ? (
              <Text style={{ color: palette.muted, fontSize: 12, textAlign: 'center', maxWidth: 320, lineHeight: 17 }}>
                Devices signed into this account will also show this file in Your devices with a Download button.
                Keep this screen open until the transfer finishes.
              </Text>
            ) : null}
          </View>
        ) : (
          <AirdropCard palette={palette}>
            {transfer ? <TransferProgressView palette={palette} transfer={transfer} /> : null}
          </AirdropCard>
        )}

        {transfer?.status === 'done' ? (
          <View style={{ alignItems: 'center' }}>
            <PrimaryButton palette={palette} icon="checkmark-circle-outline" label="Done" onPress={() => void finishDone()} />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
            <SecondaryButton palette={palette} label="Cancel" onPress={() => void cancelShare()} />
            <SecondaryButton palette={palette} label="Change file" onPress={() => void changeFile()} />
          </View>
        )}
      </ScrollView>
    );
  }

  // ── File-selection step ──
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, paddingBottom: 130, gap: 16 }}>
      <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800' }} accessibilityRole="header">
        1. Choose a file
      </Text>

      {file ? (
        <FileChip palette={palette} name={file.name} size={file.size} mimeType={file.mimeType} />
      ) : null}

      <PrimaryButton
        palette={palette}
        icon={file ? 'swap-horizontal-outline' : 'folder-open-outline'}
        label={picking ? 'Opening…' : file ? 'Choose a different file' : 'Choose file to share'}
        disabled={picking}
        onPress={() => void choose()}
      />

      {/* TTL */}
      <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800', marginTop: 4 }}>
        2. Session length
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {TTL_PRESETS.map((preset) => {
          const active = ttl === preset;
          return (
            <TtlChip
              key={preset}
              preset={preset}
              active={active}
              palette={palette}
              onPress={() => {
                setTtl(preset);
                void Haptics.selectionAsync().catch(() => undefined);
              }}
            />
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      {/* Generate QR — blocked until a file is selected */}
      <PrimaryButton
        palette={palette}
        icon="qr-code-outline"
        label={starting ? 'Starting session…' : 'Generate QR / Start sharing'}
        disabled={!file || starting}
        loading={starting}
        onPress={() => void generate()}
      />
      {error ? (
        <Text style={{ color: '#EF4444', fontSize: 12, textAlign: 'center', lineHeight: 17 }}>
          {error}
        </Text>
      ) : null}
      {!file ? (
        <Text style={{ color: palette.muted, fontSize: 12, textAlign: 'center' }}>
          Select a file first to generate the QR.
        </Text>
      ) : !isWebRtcSupported() ? (
        <Text style={{ color: palette.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 }}>
          Note: direct transfer runs on web in this build. The QR/pairing still works on native.
        </Text>
      ) : null}
    </ScrollView>
  );
}

// ── Buttons / chips ───────────────────────────────────────────────────────────

function PrimaryButton({
  palette,
  icon,
  label,
  onPress,
  disabled,
  loading,
}: {
  palette: Palette;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.5 : 1 }}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={() =>
          !disabled && Animated.spring(scale, { toValue: 0.97, useNativeDriver: false, friction: 5 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 4 }).start()
        }
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(disabled) }}
        accessibilityLabel={label}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          paddingVertical: 16,
          borderRadius: 16,
          backgroundColor: palette.accent,
        }}
      >
        {loading ? (
          <ActivityIndicator color={palette.bg} />
        ) : (
          <Ionicons name={icon} size={20} color={palette.bg} />
        )}
        <Text style={{ color: palette.bg, fontSize: 15, fontWeight: '800' }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function SecondaryButton({
  palette,
  label,
  onPress,
}: {
  palette: Palette;
  label: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.95, useNativeDriver: false, friction: 5 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 4 }).start()
        }
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{
          paddingHorizontal: 22,
          paddingVertical: 12,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.card,
        }}
      >
        <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function TtlChip({
  preset,
  active,
  palette,
  onPress,
}: {
  preset: SessionTtlPreset;
  active: boolean;
  palette: Palette;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      accessibilityLabel={`Session length: ${TTL_PRESET_LABEL[preset]}`}
      style={({ pressed }) => ({
        paddingHorizontal: 16,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? palette.accent : 'transparent',
        borderWidth: 1,
        borderColor: active ? palette.accent : palette.border,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: active ? palette.bg : palette.fg, fontWeight: '700', fontSize: 13 }}>
        {TTL_PRESET_LABEL[preset]}
      </Text>
    </Pressable>
  );
}
