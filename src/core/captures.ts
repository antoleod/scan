import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const KEY = 'barra_pending_captures';
const CAPTURE_DIR = `${FileSystem.documentDirectory || ''}barra_captures/`;

export type PendingCaptureSource = 'live-timeout-photo';
export type PendingCaptureStatus = 'saved' | 'pending' | 'error';
export type PendingCaptureExpectedType = 'QR' | 'BARCODE' | 'unknown';

export interface PendingCaptureRecord {
  id: string;
  uri: string;
  timestamp: string;
  source: PendingCaptureSource;
  scanStatus: PendingCaptureStatus;
  expectedType: PendingCaptureExpectedType;
  extractedText: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asStatus(value: unknown): PendingCaptureStatus {
  return value === 'saved' || value === 'error' ? value : 'pending';
}

function asExpectedType(value: unknown): PendingCaptureExpectedType {
  return value === 'QR' || value === 'BARCODE' ? value : 'unknown';
}

function sanitizeCapture(value: unknown): PendingCaptureRecord | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id, '').trim();
  const uri = asString(value.uri, '').trim();
  const timestamp = asString(value.timestamp, '').trim();

  if (!id || !uri || !timestamp) return null;

  return {
    id,
    uri,
    timestamp,
    source: 'live-timeout-photo',
    scanStatus: asStatus(value.scanStatus),
    expectedType: asExpectedType(value.expectedType),
    extractedText: typeof value.extractedText === 'string' ? value.extractedText : null,
  };
}

export async function loadPendingCaptures(): Promise<PendingCaptureRecord[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(sanitizeCapture).filter((item): item is PendingCaptureRecord => Boolean(item)) : [];
  } catch {
    return [];
  }
}

export async function savePendingCaptures(items: PendingCaptureRecord[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

async function ensureCaptureDirectory(): Promise<void> {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) return;

  try {
    await FileSystem.makeDirectoryAsync(CAPTURE_DIR, { intermediates: true });
  } catch {
    // The directory may already exist or the runtime may not need it.
  }
}

function extensionFromUri(uri: string): string {
  const lowered = uri.toLowerCase();
  if (lowered.startsWith('data:image/png')) return 'png';
  if (lowered.startsWith('data:image/webp')) return 'webp';
  return 'jpg';
}

async function persistCaptureUri(uri: string, id: string): Promise<string> {
  if (Platform.OS === 'web' || !FileSystem.documentDirectory) {
    return uri;
  }

  await ensureCaptureDirectory();

  const destination = `${CAPTURE_DIR}${id}.${extensionFromUri(uri)}`;
  try {
    await FileSystem.copyAsync({ from: uri, to: destination });
    return destination;
  } catch {
    return uri;
  }
}

export async function addPendingCapture(input: {
  uri: string;
  expectedType?: PendingCaptureExpectedType;
}): Promise<{ capture: PendingCaptureRecord; items: PendingCaptureRecord[] }> {
  const id = `cap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const persistedUri = await persistCaptureUri(input.uri, id);
  const capture: PendingCaptureRecord = {
    id,
    uri: persistedUri,
    timestamp: new Date().toISOString(),
    source: 'live-timeout-photo',
    scanStatus: 'saved',
    expectedType: input.expectedType || 'unknown',
    extractedText: null,
  };

  const items = [capture, ...(await loadPendingCaptures())];
  await savePendingCaptures(items);
  return { capture, items };
}

export async function updatePendingCapture(
  id: string,
  patch: Partial<Pick<PendingCaptureRecord, 'scanStatus' | 'expectedType' | 'extractedText' | 'uri'>>,
): Promise<PendingCaptureRecord[]> {
  const items = await loadPendingCaptures();
  const next = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
  await savePendingCaptures(next);
  return next;
}

export async function removePendingCapture(id: string): Promise<PendingCaptureRecord[]> {
  const items = await loadPendingCaptures();
  const toDelete = items.find((item) => item.id === id);
  if (toDelete && Platform.OS !== 'web' && FileSystem.documentDirectory && toDelete.uri.startsWith('file://')) {
    try {
      await FileSystem.deleteAsync(toDelete.uri, { idempotent: true });
    } catch {
      // Ignore storage cleanup failures; metadata removal still succeeds.
    }
  }
  const next = items.filter((item) => item.id !== id);
  await savePendingCaptures(next);
  return next;
}

export async function clearPendingCaptures(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
