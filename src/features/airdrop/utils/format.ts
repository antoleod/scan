/**
 * Presentation helpers for AirDrop (countdowns, sizes, device naming).
 * Pure functions only — safe to unit test and reuse in any renderer.
 */
import { Platform } from 'react-native';

import type { PeerPlatform } from '../types';

/** Format a remaining-time delta (ms) as a compact countdown, e.g. "4m 12s". */
export function formatCountdown(remainingMs: number): string {
  if (remainingMs <= 0) return 'Expired';
  const totalSec = Math.floor(remainingMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/** Human-readable byte size, e.g. "1.4 MB". */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

/** Detect the current device platform in the {@link PeerPlatform} shape. */
export function currentPlatform(): PeerPlatform {
  if (Platform.OS === 'web') return 'web';
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'unknown';
}

const ADJECTIVES = ['Swift', 'Calm', 'Bright', 'Bold', 'Lunar', 'Solar', 'Cobalt', 'Amber'];
const NOUNS = ['Falcon', 'Otter', 'Comet', 'Maple', 'Quartz', 'Heron', 'Cedar', 'Pixel'];

/** Generate a friendly, stable-feeling device alias when the user hasn't named theirs. */
export function generateDeviceAlias(seed?: string): string {
  const s = seed || String(Math.floor(Math.random() * 1e9));
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  const adj = ADJECTIVES[h % ADJECTIVES.length];
  const noun = NOUNS[(h >> 3) % NOUNS.length];
  return `${adj} ${noun}`;
}

const PLATFORM_AVATAR: Record<PeerPlatform, string> = {
  web: '🖥️',
  ios: '📱',
  android: '🤖',
  unknown: '📡',
};

export function avatarForPlatform(platform: PeerPlatform): string {
  return PLATFORM_AVATAR[platform] ?? PLATFORM_AVATAR.unknown;
}
