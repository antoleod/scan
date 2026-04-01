import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const beepSource = require('../../assets/laser.wav');

let nativeSound: any = null;
let audioModeReady = false;

async function ensureAudioMode() {
  if (audioModeReady) return;

  try {
    const { Audio, InterruptionModeAndroid, InterruptionModeIOS } = await import('expo-av');
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      allowsRecordingIOS: false,
      interruptionModeIOS: InterruptionModeIOS.DoNotMix,
      interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
    });
    audioModeReady = true;
  } catch {
    // Audio mode setup is best-effort only.
  }
}

async function playNativeBeep() {
  const { Audio } = await import('expo-av');
  await ensureAudioMode();

  if (nativeSound) {
    try {
      await nativeSound.unloadAsync();
    } catch {
      // ignore
    }
    nativeSound = null;
  }

  const { sound } = await Audio.Sound.createAsync(beepSource, {
    shouldPlay: true,
    volume: 1.0,
  });

  nativeSound = sound;
  sound.setOnPlaybackStatusUpdate((status) => {
    if (!status.isLoaded || !status.didJustFinish) return;

    sound.unloadAsync().catch(() => {});
    if (nativeSound === sound) {
      nativeSound = null;
    }
  });
}

async function playWebBeep() {
  if (typeof window === 'undefined') return;

  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return;

  const context = new AudioContextCtor();
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = 880;
  gain.gain.value = 0.0001;

  oscillator.connect(gain);
  gain.connect(context.destination);

  const now = context.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

  oscillator.start(now);
  oscillator.stop(now + 0.18);

  await new Promise<void>((resolve) => {
    oscillator.onended = () => {
      context.close().catch(() => {});
      resolve();
    };
  });
}

export async function playSuccessfulScanFeedback(): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate?.(35);
      }
      await playWebBeep();
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await playNativeBeep();
  } catch {
    // Feedback is best-effort only.
  }
}
