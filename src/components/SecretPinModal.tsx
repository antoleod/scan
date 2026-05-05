import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { hasPin, savePin, verifyPin } from '../core/secretPin';
import { mainAppStyles } from './mainApp/styles';

type Palette = { bg: string; fg: string; accent: string; muted: string; card: string; border: string };

type Mode = 'setup' | 'unlock';

const PIN_LENGTH = 6;

export function SecretPinModal({
  visible,
  mode,
  palette,
  onSuccess,
  onCancel,
}: {
  visible: boolean;
  mode: Mode;
  palette: Palette;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [phase, setPhase] = useState<'enter' | 'confirm'>('enter');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setPin('');
      setConfirmPin('');
      setPhase('enter');
      setError(null);
      setBusy(false);
    }
  }, [visible]);

  const triggerShake = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 12, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -12, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleDigit = async (digit: string) => {
    if (busy) return;
    Haptics.selectionAsync().catch(() => undefined);
    const isConfirming = mode === 'setup' && phase === 'confirm';
    const current = isConfirming ? confirmPin : pin;
    if (current.length >= PIN_LENGTH) return;
    const next = current + digit;
    if (isConfirming) {
      setConfirmPin(next);
      if (next.length === PIN_LENGTH) {
        await finalizeSetup(pin, next);
      }
    } else {
      setPin(next);
      if (next.length === PIN_LENGTH) {
        if (mode === 'setup') {
          setPhase('confirm');
          setError(null);
        } else {
          await finalizeUnlock(next);
        }
      }
    }
  };

  const handleBackspace = () => {
    if (busy) return;
    Haptics.selectionAsync().catch(() => undefined);
    if (mode === 'setup' && phase === 'confirm') {
      setConfirmPin((p) => p.slice(0, -1));
    } else {
      setPin((p) => p.slice(0, -1));
    }
    setError(null);
  };

  const finalizeSetup = async (a: string, b: string) => {
    setBusy(true);
    if (a !== b) {
      setError('PINs do not match. Try again.');
      triggerShake();
      setTimeout(() => {
        setPin('');
        setConfirmPin('');
        setPhase('enter');
        setBusy(false);
      }, 600);
      return;
    }
    try {
      await savePin(a);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onSuccess();
    } catch (e) {
      setError('Could not save PIN. Try again.');
      triggerShake();
      setBusy(false);
    }
  };

  const finalizeUnlock = async (entered: string) => {
    setBusy(true);
    const ok = await verifyPin(entered);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onSuccess();
    } else {
      setError('Incorrect PIN');
      triggerShake();
      setTimeout(() => {
        setPin('');
        setBusy(false);
      }, 600);
    }
  };

  const displayPin = mode === 'setup' && phase === 'confirm' ? confirmPin : pin;
  const title = mode === 'setup'
    ? phase === 'enter' ? 'Set up secret PIN' : 'Confirm PIN'
    : 'Enter PIN';
  const subtitle = mode === 'setup'
    ? phase === 'enter' ? 'Choose a 6-digit PIN to protect your secret notes' : 'Enter the same PIN again'
    : 'Unlock your secret notes';

  const keys: (string | 'back')[] = ['1','2','3','4','5','6','7','8','9','','0','back'];

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel} statusBarTranslucent>
      <Pressable style={mainAppStyles.modalBackdrop} onPress={onCancel}>
        <Animated.View style={{ width: '100%', maxWidth: 380, transform: [{ translateX: shake }] }}>
          <Pressable
            style={[mainAppStyles.modalForm, { backgroundColor: palette.card, borderColor: palette.border, gap: 16 }]}
            onPress={() => null}
          >
            <View style={mainAppStyles.modalHandle} />

            {/* Header */}
            <View style={{ alignItems: 'center', gap: 8 }}>
              <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: `${palette.accent}22`, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="lock-closed" size={28} color={palette.accent} />
              </View>
              <Text style={{ color: palette.fg, fontSize: 18, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
              <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 16, textAlign: 'center' }}>{subtitle}</Text>
            </View>

            {/* PIN dots */}
            <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center', paddingVertical: 8 }}>
              {Array.from({ length: PIN_LENGTH }).map((_, i) => {
                const filled = i < displayPin.length;
                return (
                  <View
                    key={i}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 999,
                      borderWidth: 2,
                      borderColor: filled ? palette.accent : palette.border,
                      backgroundColor: filled ? palette.accent : 'transparent',
                    }}
                  />
                );
              })}
            </View>

            {/* Error */}
            {error ? (
              <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600', textAlign: 'center' }}>{error}</Text>
            ) : null}

            {/* Numeric keypad */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
              {keys.map((key, idx) => {
                if (key === '') {
                  return <View key={`spacer-${idx}`} style={{ width: '33.33%', aspectRatio: 1.6 }} />;
                }
                if (key === 'back') {
                  return (
                    <Pressable
                      key="back"
                      onPress={handleBackspace}
                      style={({ pressed }) => ({
                        width: '33.33%',
                        aspectRatio: 1.6,
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <Ionicons name="backspace-outline" size={26} color={palette.fg} />
                    </Pressable>
                  );
                }
                return (
                  <Pressable
                    key={key}
                    onPress={() => handleDigit(key)}
                    style={({ pressed }) => ({
                      width: '33.33%',
                      aspectRatio: 1.6,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.5 : 1,
                      transform: [{ scale: pressed ? 0.9 : 1 }],
                    })}
                  >
                    <View style={{
                      width: 64,
                      height: 64,
                      borderRadius: 32,
                      borderWidth: 1,
                      borderColor: palette.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: palette.bg,
                    }}>
                      <Text style={{ color: palette.fg, fontSize: 24, fontWeight: '600' }}>{key}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* Cancel */}
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16, opacity: pressed ? 0.6 : 1 })}
            >
              <Text style={{ color: palette.muted, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

export async function shouldSetupPin(): Promise<boolean> {
  return !(await hasPin());
}
