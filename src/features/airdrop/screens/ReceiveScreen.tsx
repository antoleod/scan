import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';

import type { Palette } from '../../../theme/theme';
import { AirdropCard } from '../components/AirdropCard';
import { FileChip } from '../components/FileChip';
import { MyDevicesSection } from '../components/MyDevicesSection';
import { TransferProgressView } from '../components/TransferProgressView';
import { useSession, useTransfer, useUserShares } from '../hooks/useAirdrop';
import { isAirdropQr, pairFromQrString } from '../qr/qrPairing';
import {
  joinSession,
  cancelSession,
  acceptIncomingFile,
  declineIncomingFile,
} from '../sessions/sessionService';
import type { FileMeta } from '../types';
import type { ReceiverHandlers } from '../transfer/transferService';

/**
 * Receive screen — scan a host's QR (camera) or type the pairing code manually
 * to join. After connecting and receiving the sender's file offer, shows a
 * "Download file?" confirmation; on accept the file streams in and is saved.
 */
export function ReceiveScreen({
  palette,
  autoJoinCode = null,
}: {
  palette: Palette;
  /** If set (deep-link open), auto-pair this QR string on mount. */
  autoJoinCode?: string | null;
}) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [joinedId, setJoinedId] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState<FileMeta | null>(null);
  const [pairingTimedOut, setPairingTimedOut] = useState(false);
  const lockedRef = useRef(false);
  const session = useSession(joinedId);
  const transfer = useTransfer(joinedId);
  const userShares = useUserShares();

  // Stable refs so attachReceiver's closure always calls the current setter,
  // even if the component re-renders between join and the offer arriving.
  const setOfferRef = useRef(setOffer);
  setOfferRef.current = setOffer;
  const receiverHandlers: ReceiverHandlers = useRef<ReceiverHandlers>({
    onOffer: (meta) => {
      setOfferRef.current(meta);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
    onComplete: () => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    },
  }).current;

  const handleScanned = async (raw: string) => {
    if (lockedRef.current) return;
    if (!isAirdropQr(raw)) {
      setError(t('airdrop.wrongQr'));
      setTimeout(() => setError(null), 2500);
      return;
    }
    lockedRef.current = true;
    setBusy(true);
    setError(null);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    const result = await pairFromQrString(raw, receiverHandlers);
    setBusy(false);
    if (result.ok && result.session) {
      setJoinedId(result.session.id);
    } else {
      setError(result.reason ?? 'Failed to pair.');
      lockedRef.current = false;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    }
  };

  // Deep-link open: auto-pair the join code exactly once on mount.
  const autoJoinedRef = useRef(false);
  useEffect(() => {
    if (autoJoinCode && !autoJoinedRef.current) {
      autoJoinedRef.current = true;
      void handleScanned(autoJoinCode);
    }
    // Run once for the initial code; handleScanned guards re-entry via lockedRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoinCode]);

  // Pairing timeout: if stuck in 'pairing' for 20s, surface a helpful message.
  useEffect(() => {
    if (session?.status !== 'pairing') {
      setPairingTimedOut(false);
      return;
    }
    const id = setTimeout(() => setPairingTimedOut(true), 20_000);
    return () => clearTimeout(id);
  }, [session?.status]);

  const handleManualJoin = async () => {
    const raw = manualCode.trim();
    if (!raw) return;
    setBusy(true);
    setError(null);
    try {
      if (isAirdropQr(raw)) {
        const result = await pairFromQrString(raw, receiverHandlers);
        if (result.ok && result.session) setJoinedId(result.session.id);
        else setError(result.reason ?? 'Failed to pair.');
        return;
      }

      const parts = raw.split(/[\s:]+/).filter(Boolean);
      if (parts.length < 2) {
        setError('Enter "<session>:<code>" or paste the full QR text from the sender.');
        return;
      }
      const s = await joinSession(parts[0], parts.slice(1).join(''), receiverHandlers);
      setJoinedId(s.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join session.');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (joinedId) await cancelSession(joinedId).catch(() => undefined);
    setJoinedId(null);
    setOffer(null);
    lockedRef.current = false;
  };

  const accept = () => {
    if (joinedId) acceptIncomingFile(joinedId);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  };
  const decline = () => {
    if (joinedId) declineIncomingFile(joinedId);
    setOffer(null);
  };

  // ── Joined: confirmation / progress ──
  if (session) {
    const transferring =
      transfer && (transfer.status === 'active' || transfer.status === 'done');
    const showConfirm = offer && (!transfer || transfer.status === 'offered');
    // Only call it "Connected" once the WebRTC channel is actually up — status
    // is 'pairing' immediately after join, before the handshake completes.
    const isConnected =
      session.status === 'connected' ||
      session.status === 'transferring' ||
      session.status === 'completed';
    const isErrored = session.status === 'error' || session.status === 'cancelled';
    const isPairing = !isConnected && !isErrored;

    return (
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 18, gap: 16, paddingBottom: 130 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: isErrored ? '#EF4444' : isConnected ? '#22C55E' : '#F59E0B',
            }}
          />
          <Text style={{ color: palette.fg, fontSize: 16, fontWeight: '800' }}>
            {isErrored ? 'Connection failed' : isConnected ? 'Connected' : 'Connecting…'}
          </Text>
        </View>

        {/* WebRTC failed / peer left */}
        {isErrored ? (
          <>
            <ErrorBanner
              palette={palette}
              message={
                session.status === 'cancelled'
                  ? 'The sender cancelled the session.'
                  : (session.error ?? 'Connection failed. The network may block direct P2P transfer.')
              }
              onDismiss={() => void leave()}
            />
            {userShares.length > 0 ? (
              <AirdropCard palette={palette}>
                <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '800', marginBottom: 8 }}>
                  Download directly from your account
                </Text>
                <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>
                  The sender's file may also be available below — no QR needed when you're on the same account.
                </Text>
                <MyDevicesSection palette={palette} />
              </AirdropCard>
            ) : null}
          </>
        ) : null}

        {/* Pairing in progress */}
        {isPairing ? <PairingIndicator palette={palette} /> : null}

        {/* Timeout hint: still pairing after 20s → guide the user */}
        {isPairing && pairingTimedOut ? (
          <AirdropCard palette={palette}>
            <Text style={{ color: '#F59E0B', fontSize: 13, fontWeight: '800', marginBottom: 6 }}>
              Taking longer than expected…
            </Text>
            <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>
              Direct P2P can fail when devices are on different networks. Make sure the sender's screen is still open.
              {userShares.length > 0
                ? ' Or use the direct download below — no scan needed when you\'re on the same account.'
                : ' If you\'re both signed in to the same account, go back and use the "Your devices" shortcut instead.'}
            </Text>
            {userShares.length > 0 ? (
              <View style={{ marginTop: 12 }}>
                <MyDevicesSection palette={palette} />
              </View>
            ) : null}
          </AirdropCard>
        ) : null}

        {offer ? (
          <FileChip palette={palette} name={offer.name} size={offer.size} mimeType={offer.mimeType} />
        ) : !isErrored && isConnected ? (
          <Text style={{ color: palette.muted, fontSize: 13 }}>
            Waiting for the sender to offer a file…
          </Text>
        ) : null}

        {showConfirm ? (
          <AirdropCard palette={palette} accent>
            <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800', marginBottom: 6 }}>
              Download this file?
            </Text>
            <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 18, marginBottom: 14 }}>
              {offer?.name} will be transferred directly from the other device.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ConfirmButton palette={palette} label="Download" primary onPress={accept} />
              <ConfirmButton palette={palette} label="Decline" onPress={decline} />
            </View>
          </AirdropCard>
        ) : null}

        {transferring && transfer ? (
          <AirdropCard palette={palette}>
            <TransferProgressView palette={palette} transfer={transfer} />
          </AirdropCard>
        ) : null}

        <LeaveButton palette={palette} onPress={() => void leave()} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 14, gap: 14, paddingBottom: 120 }}>
      {/* Same-account direct download — shown first when available so the user
          doesn't need to scan a QR at all if sender is on the same account. */}
      {userShares.length > 0 ? (
        <AirdropCard palette={palette} accent>
          <MyDevicesSection palette={palette} />
        </AirdropCard>
      ) : null}

      {/* Info card */}
      <AirdropCard palette={palette}>
        <Text style={{ color: palette.fg, fontSize: 14, fontWeight: '800', marginBottom: 6 }}>
          {userShares.length > 0 ? 'Or scan a QR code' : 'Scan to receive'}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }}>
          Point your camera at the sender's AirDrop QR code to instantly join their session.
        </Text>
      </AirdropCard>

      {/* Camera area */}
      {!permission?.granted ? (
        <CameraPermissionPrompt palette={palette} onRequest={requestPermission} />
      ) : (
        <CameraViewfinder
          palette={palette}
          busy={busy}
          onScanned={(raw) => void handleScanned(raw)}
        />
      )}

      {/* Busy indicator (overlay on camera) */}
      {busy ? (
        <PairingIndicator palette={palette} />
      ) : null}

      {/* Error banner */}
      {error ? (
        <ErrorBanner palette={palette} message={error} onDismiss={() => setError(null)} />
      ) : null}

      {/* Manual entry */}
      <AirdropCard palette={palette}>
        <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '800', marginBottom: 10 }}>
          Enter code manually
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            value={manualCode}
            onChangeText={setManualCode}
            placeholder="session:CODE  or paste QR text"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={() => void handleManualJoin()}
            accessibilityLabel="Pairing code input"
            style={{
              flex: 1,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: manualCode ? palette.accent + '66' : palette.border,
              color: palette.fg,
              fontWeight: '600',
              fontSize: 13,
            }}
          />
          <JoinButton palette={palette} onPress={() => void handleManualJoin()} />
        </View>
      </AirdropCard>
    </ScrollView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CameraViewfinder({
  palette,
  busy,
  onScanned,
}: {
  palette: Palette;
  busy: boolean;
  onScanned: (raw: string) => void;
}) {
  // Scanning pulse animation for the corner brackets
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.6, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);

  return (
    <View
      style={{
        height: 300,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#000',
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        autofocus="on"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={(event) => {
          onScanned(String(event.data || '').trim());
        }}
      />

      {/* Viewfinder overlay */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Corner brackets — more refined than a plain box */}
        <Animated.View
          style={{
            width: 180,
            height: 180,
            opacity: busy ? 1 : pulse,
          }}
        >
          {/* Top-left */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: 24,
              height: 24,
              borderTopWidth: 3,
              borderLeftWidth: 3,
              borderColor: palette.accent,
              borderTopLeftRadius: 6,
            }}
          />
          {/* Top-right */}
          <View
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 24,
              height: 24,
              borderTopWidth: 3,
              borderRightWidth: 3,
              borderColor: palette.accent,
              borderTopRightRadius: 6,
            }}
          />
          {/* Bottom-left */}
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: 24,
              height: 24,
              borderBottomWidth: 3,
              borderLeftWidth: 3,
              borderColor: palette.accent,
              borderBottomLeftRadius: 6,
            }}
          />
          {/* Bottom-right */}
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: 24,
              height: 24,
              borderBottomWidth: 3,
              borderRightWidth: 3,
              borderColor: palette.accent,
              borderBottomRightRadius: 6,
            }}
          />
        </Animated.View>

        {/* Scan hint label */}
        <View
          style={{
            position: 'absolute',
            bottom: 18,
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 20,
            backgroundColor: '#00000088',
          }}
        >
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
            Align QR code within the frame
          </Text>
        </View>
      </View>
    </View>
  );
}

function CameraPermissionPrompt({
  palette,
  onRequest,
}: {
  palette: Palette;
  onRequest: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <View
      style={{
        alignItems: 'center',
        gap: 14,
        paddingVertical: 32,
        paddingHorizontal: 24,
        borderRadius: 20,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.muted + '18',
          borderWidth: 1,
          borderColor: palette.muted + '33',
        }}
      >
        <Ionicons name="camera-outline" size={28} color={palette.muted} />
      </View>
      <Text style={{ color: palette.fg, fontWeight: '800', fontSize: 15, textAlign: 'center' }}>
        Camera access required
      </Text>
      <Text
        style={{
          color: palette.muted,
          fontSize: 13,
          textAlign: 'center',
          lineHeight: 18,
          maxWidth: 260,
        }}
      >
        To scan QR codes, AirDrop needs permission to use your camera.
      </Text>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Pressable
          onPress={onRequest}
          onPressIn={() =>
            Animated.spring(scale, { toValue: 0.95, useNativeDriver: false, friction: 5 }).start()
          }
          onPressOut={() =>
            Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 4 }).start()
          }
          accessibilityRole="button"
          accessibilityLabel="Allow camera access"
          style={{
            paddingHorizontal: 24,
            paddingVertical: 12,
            borderRadius: 14,
            backgroundColor: palette.accent,
          }}
        >
          <Text style={{ color: palette.bg, fontWeight: '800', fontSize: 14 }}>
            Allow camera
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function PairingIndicator({ palette }: { palette: Palette }) {
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = (anim: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 280, useNativeDriver: false }),
          Animated.timing(anim, { toValue: 0.3, duration: 280, useNativeDriver: false }),
          Animated.delay(560),
        ]),
      ).start();
    pulse(dot1, 0);
    pulse(dot2, 180);
    pulse(dot3, 360);
  }, [dot1, dot2, dot3]);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        justifyContent: 'center',
        paddingVertical: 8,
      }}
    >
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {[dot1, dot2, dot3].map((anim, i) => (
          <Animated.View
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: palette.accent,
              opacity: anim,
            }}
          />
        ))}
      </View>
      <Text style={{ color: palette.muted, fontSize: 13 }}>Pairing…</Text>
    </View>
  );
}

function ErrorBanner({
  palette,
  message,
  onDismiss,
}: {
  palette: Palette;
  message: string;
  onDismiss: () => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 12,
        borderRadius: 14,
        backgroundColor: '#EF444414',
        borderWidth: 1,
        borderColor: '#EF444430',
      }}
    >
      <Ionicons name="alert-circle-outline" size={16} color="#EF4444" style={{ marginTop: 1 }} />
      <Text style={{ color: '#EF4444', fontSize: 13, flex: 1, lineHeight: 18 }}>{message}</Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Dismiss error"
      >
        <Ionicons name="close" size={15} color="#EF4444" />
      </Pressable>
    </View>
  );
}

function JoinButton({ palette, onPress }: { palette: Palette; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.93, useNativeDriver: false, friction: 5 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 4 }).start()
        }
        accessibilityRole="button"
        accessibilityLabel="Join session"
        style={{
          paddingHorizontal: 18,
          justifyContent: 'center',
          borderRadius: 12,
          backgroundColor: palette.accent,
          minHeight: 44,
        }}
      >
        <Text style={{ color: palette.bg, fontWeight: '800', fontSize: 14 }}>Join</Text>
      </Pressable>
    </Animated.View>
  );
}

function LeaveButton({ palette, onPress }: { palette: Palette; onPress: () => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Animated.View style={{ alignSelf: 'flex-start', transform: [{ scale }] }}>
      <Pressable
        onPress={onPress}
        onPressIn={() =>
          Animated.spring(scale, { toValue: 0.95, useNativeDriver: false, friction: 5 }).start()
        }
        onPressOut={() =>
          Animated.spring(scale, { toValue: 1, useNativeDriver: false, friction: 4 }).start()
        }
        accessibilityRole="button"
        accessibilityLabel="Leave session"
        style={{
          paddingHorizontal: 20,
          paddingVertical: 11,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: palette.border,
          backgroundColor: palette.card,
        }}
      >
        <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 14 }}>Leave session</Text>
      </Pressable>
    </Animated.View>
  );
}

function ConfirmButton({
  palette,
  label,
  primary,
  onPress,
}: {
  palette: Palette;
  label: string;
  primary?: boolean;
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
          paddingVertical: 13,
          borderRadius: 13,
          backgroundColor: primary ? palette.accent : palette.card,
          borderWidth: 1,
          borderColor: primary ? palette.accent : palette.border,
        }}
      >
        <Text
          style={{ color: primary ? palette.bg : palette.fg, fontWeight: '800', fontSize: 14 }}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
