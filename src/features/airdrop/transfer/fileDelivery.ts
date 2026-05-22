/**
 * Delivers a fully-received file to the user.
 *  - web    → triggers a browser download via an object URL.
 *  - native → writes to the cache dir and opens the OS share sheet so the user
 *             can save it (Expo has no generic "Downloads" write API).
 */
import { Platform } from 'react-native';

import { diag } from '../../../core/diagnostics';
import type { FileMeta } from '../types';

export async function deliverReceivedFile(bytes: Uint8Array, meta: FileMeta): Promise<void> {
  if (Platform.OS === 'web') {
    deliverWeb(bytes, meta);
    return;
  }
  await deliverNative(bytes, meta);
}

function deliverWeb(bytes: Uint8Array, meta: FileMeta): void {
  if (typeof document === 'undefined') return;
  // Copy into a fresh ArrayBuffer so the BlobPart type is concretely ArrayBuffer
  // (a Uint8Array may be backed by SharedArrayBuffer, which Blob rejects in TS).
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const blob = new Blob([buf], { type: meta.mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = meta.name || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click has a chance to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  void diag.info('airdrop.delivery.web_download', { name: meta.name, size: bytes.length });
}

async function deliverNative(bytes: Uint8Array, meta: FileMeta): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');

  const safeName = (meta.name || 'download').replace(/[^\w.\-]+/g, '_');
  const path = `${FileSystem.cacheDirectory}${safeName}`;
  await FileSystem.writeAsStringAsync(path, bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  void diag.info('airdrop.delivery.native_saved', { path, size: bytes.length });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, { mimeType: meta.mimeType || undefined });
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const g = globalThis as { btoa?: (s: string) => string };
  let bin = '';
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  if (typeof g.btoa === 'function') return g.btoa(bin);
  return manualBytesToBase64(bytes);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function manualBytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}
