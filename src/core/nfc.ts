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
  if (Platform.OS !== 'android') return false;

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

export async function readNfcPayload(): Promise<string | null> {
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
