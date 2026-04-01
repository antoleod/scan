import { Platform } from 'react-native';

import NfcManager, { NfcTech } from 'react-native-nfc-manager';

type AnyRecord = {
  payload?: unknown;
  type?: unknown;
};

type AnyTag = {
  id?: string;
  ndefMessage?: AnyRecord[];
};

let startPromise: Promise<boolean> | null = null;
let webNfcSupportedCache: boolean | null = null;

function toBytes(value: unknown): Uint8Array | null {
  if (!value) return null;
  if (value instanceof Uint8Array) return value;
  if (Array.isArray(value)) {
    const numericValues = value.filter((item): item is number => typeof item === 'number');
    return Uint8Array.from(numericValues);
  }
  return null;
}

function bytesToString(value: unknown): string {
  if (typeof value === 'string') return value.trim();

  const bytes = toBytes(value);
  if (!bytes || bytes.length === 0) return String(value ?? '').trim();

  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(bytes).trim();
    }
  } catch {
    // Fallback below.
  }

  return Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join('')
    .trim();
}

function decodeRecord(record: AnyRecord): string {
  const type = bytesToString(record.type);
  const payloadBytes = toBytes(record.payload);

  if (!payloadBytes || payloadBytes.length === 0) {
    return bytesToString(record.payload);
  }

  if (type === 'T' || type === 'text/plain') {
    const languageLength = payloadBytes[0] & 0x3f;
    return bytesToString(payloadBytes.slice(1 + languageLength));
  }

  if (type === 'U' || type === 'uri') {
    const prefixes = [
      '',
      'http://www.',
      'https://www.',
      'http://',
      'https://',
      'tel:',
      'mailto:',
      'ftp://anonymous:anonymous@',
      'ftp://ftp.',
      'ftps://',
      'sftp://',
      'smb://',
      'nfs://',
      'ftp://',
      'dav://',
      'news:',
      'telnet://',
      'imap:',
      'rtsp://',
      'urn:',
      'pop:',
      'sip:',
      'sips:',
      'tftp:',
      'btspp://',
      'btl2cap://',
      'btgoep://',
      'tcpobex://',
      'irdaobex://',
      'file://',
      'urn:epc:id:',
      'urn:epc:tag:',
      'urn:epc:pat:',
      'urn:epc:raw:',
      'urn:epc:',
      'urn:nfc:',
    ];

    const prefix = prefixes[payloadBytes[0]] || '';
    return `${prefix}${bytesToString(payloadBytes.slice(1))}`.trim();
  }

  return bytesToString(payloadBytes);
}

function extractTagText(tag: AnyTag | null | undefined): string {
  if (!tag) return '';

  const records = Array.isArray(tag.ndefMessage) ? tag.ndefMessage : [];
  for (const record of records) {
    const decoded = decodeRecord(record);
    if (decoded) return decoded;
  }

  return tag.id?.trim() || '';
}

export async function ensureNfcReady(): Promise<boolean> {
  if (Platform.OS === 'android') {
    if (!startPromise) {
      startPromise = (async () => {
        const supported = await NfcManager.isSupported();
        if (!supported) return false;
        await NfcManager.start();
        return true;
      })().catch(() => false);
    }

    return startPromise;
  }

  if (Platform.OS === 'web') {
    if (webNfcSupportedCache != null) return webNfcSupportedCache;
    const supported = typeof window !== 'undefined' && 'NDEFReader' in window;
    webNfcSupportedCache = supported;
    return supported;
  }

  return false;
}

export async function readNfcPayload(): Promise<string | null> {
  if (Platform.OS === 'web') {
    const ready = await ensureNfcReady();
    if (!ready || typeof window === 'undefined' || !('NDEFReader' in window)) return null;

    return new Promise<string | null>(async (resolve, reject) => {
      try {
        const ReaderCtor = (window as unknown as { NDEFReader: new () => { scan: () => Promise<void>; addEventListener: (type: string, cb: (event: unknown) => void) => void } }).NDEFReader;
        const reader = new ReaderCtor();
        let finished = false;

        const timeout = setTimeout(() => {
          if (finished) return;
          finished = true;
          resolve(null);
        }, 12000);

        reader.addEventListener('reading', (event: unknown) => {
          if (finished) return;
          const ndefEvent = event as { message?: { records?: AnyRecord[] }; serialNumber?: string };
          const payload = extractTagText({ id: ndefEvent.serialNumber, ndefMessage: ndefEvent.message?.records });
          finished = true;
          clearTimeout(timeout);
          resolve(payload || null);
        });

        await reader.scan();
      } catch (error) {
        reject(error);
      }
    });
  }

  const ready = await ensureNfcReady();
  if (!ready) return null;

  try {
    await NfcManager.requestTechnology(NfcTech.Ndef);
    const tag = (await NfcManager.getTag()) as AnyTag | null;
    const payload = extractTagText(tag);
    return payload || null;
  } finally {
    try {
      await NfcManager.cancelTechnologyRequest();
    } catch {
      // Ignore cancellation errors.
    }
  }
}
