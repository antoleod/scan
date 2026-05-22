import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import type { Palette } from '../../../theme/theme';
import type { ShareSession } from '../types';
import { encodeQrPayload } from '../utils/qr';
import { TTL_PRESET_LABEL } from '../constants';
import { formatCountdown } from '../utils/format';

/**
 * Renders the pairing QR for a host session plus the human-readable token as a
 * fallback. Scanning this on another device joins the session.
 * Animates in on mount for a premium reveal feel.
 */
export function SessionQrView({
  palette,
  session,
  now,
  size = 220,
}: {
  palette: Palette;
  session: ShareSession;
  now: number;
  size?: number;
}) {
  const value = encodeQrPayload(session.id, session.token);
  const remaining = session.expiresAt - now;

  // Urgency: highlight countdown when < 2 min
  const isUrgent = remaining < 120_000 && remaining > 0;
  const countdownColor = remaining < 60_000 ? '#EF4444' : isUrgent ? '#F59E0B' : palette.muted;

  // Entrance animation
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: false }),
      Animated.spring(scale, { toValue: 1, friction: 7, tension: 80, useNativeDriver: false }),
    ]).start();
  }, [opacity, scale]);

  return (
    <Animated.View style={{ alignItems: 'center', gap: 18, opacity, transform: [{ scale }] }}>
      {/* QR code with branded container */}
      <View
        style={{
          padding: 18,
          borderRadius: 24,
          backgroundColor: '#FFFFFF',
          // Subtle shadow for depth — works on web + native
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 6,
          borderWidth: 1,
          borderColor: palette.accent + '22',
        }}
      >
        <QRCode value={value} size={size} backgroundColor="#FFFFFF" color="#111111" />
      </View>

      {/* Token display */}
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Text
          style={{
            color: palette.muted,
            fontSize: 10,
            fontWeight: '700',
            letterSpacing: 2.5,
            textTransform: 'uppercase',
          }}
        >
          Pairing Code
        </Text>
        {/* Token rendered as spaced character groups for readability */}
        <View
          style={{
            paddingHorizontal: 18,
            paddingVertical: 8,
            borderRadius: 12,
            backgroundColor: palette.card,
            borderWidth: 1,
            borderColor: palette.border,
          }}
        >
          <Text
            style={{
              color: palette.fg,
              fontSize: 22,
              fontWeight: '900',
              letterSpacing: 5,
              fontVariant: ['tabular-nums'],
            }}
            accessibilityLabel={`Pairing code: ${session.token}`}
            selectable
          >
            {session.token}
          </Text>
        </View>
      </View>

      {/* Countdown + session length */}
      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={{ color: countdownColor, fontSize: 13, fontWeight: '700' }}>
          {remaining > 0 ? `Expires in ${formatCountdown(remaining)}` : 'Expired'}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 11 }}>
          {TTL_PRESET_LABEL[session.ttl]} session
        </Text>
      </View>

      {Platform.OS !== 'web' ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 6,
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: palette.accent + '12',
            borderWidth: 1,
            borderColor: palette.accent + '28',
            maxWidth: 280,
          }}
        >
          <Text style={{ color: palette.accent, fontSize: 12, textAlign: 'center' }}>
            Direct P2P transfer is web-only in this build. The session &amp; QR pairing still work.
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}
