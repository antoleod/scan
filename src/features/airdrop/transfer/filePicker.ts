/**
 * Cross-platform file picker adapter.
 *
 * Returns a {@link SelectedFile} whose bytes are read lazily via `getBytes()`,
 * so the UI can show name/size/type immediately without holding the whole file
 * in memory until the transfer actually starts.
 *
 *  - web    → native `<input type="file">` (any file type)
 *  - native → `expo-document-picker` (any file type), bytes via expo-file-system
 */
import { Platform } from 'react-native';

import { diag } from '../../../core/diagnostics';
import type { SelectedFile } from '../types';

/** Pick a single file. Resolves null if the user cancels. */
export async function pickFile(): Promise<SelectedFile | null> {
  try {
    return Platform.OS === 'web' ? await pickFileWeb() : await pickFileNative();
  } catch (e) {
    void diag.error('airdrop.picker.error', { error: String(e) });
    throw e;
  }
}

// ── Web ───────────────────────────────────────────────────────────────────

function pickFileWeb(): Promise<SelectedFile | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.style.position = 'fixed';
    input.style.left = '-9999px';

    let settled = false;
    const cleanup = () => {
      input.remove();
    };

    input.onchange = () => {
      settled = true;
      const file = input.files?.[0] ?? null;
      cleanup();
      if (!file) {
        resolve(null);
        return;
      }
      void diag.info('airdrop.picker.selected', {
        name: file.name,
        size: file.size,
        type: file.type,
      });
      resolve({
        name: file.name || 'file',
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        getBytes: async () => new Uint8Array(await file.arrayBuffer()),
      });
    };

    // If the dialog is dismissed, `change` never fires. `window.focus` after the
    // picker closes is the standard heuristic to detect cancellation.
    const onFocus = () => {
      window.removeEventListener('focus', onFocus);
      setTimeout(() => {
        if (!settled) {
          cleanup();
          resolve(null);
        }
      }, 400);
    };
    window.addEventListener('focus', onFocus);

    document.body.appendChild(input);
    try {
      input.click();
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

// ── Native ──────────────────────────────────────────────────────────────────

async function pickFileNative(): Promise<SelectedFile | null> {
  // Lazy-require keeps these native-only modules out of the web bundle path.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) return null;
  const asset = result.assets[0];

  void diag.info('airdrop.picker.selected', {
    name: asset.name,
    size: asset.size,
    type: asset.mimeType,
  });

  return {
    name: asset.name || 'file',
    size: asset.size ?? 0,
    mimeType: asset.mimeType || 'application/octet-stream',
    uri: asset.uri,
    getBytes: async () => readNativeFileBytes(asset.uri),
  };
}

async function readNativeFileBytes(uri: string): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return base64ToBytes(base64);
}

function base64ToBytes(base64: string): Uint8Array {
  // atob exists on web; on native Hermes it is polyfilled by Expo. Fall back to
  // a manual decoder if absent so this never throws on an unusual runtime.
  const g = globalThis as { atob?: (s: string) => string };
  if (typeof g.atob === 'function') {
    const bin = g.atob(base64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  return manualBase64ToBytes(base64);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function manualBase64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = Math.floor((clean.length * 3) / 4);
  const out = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64.indexOf(clean[i]);
    const c1 = B64.indexOf(clean[i + 1]);
    const c2 = B64.indexOf(clean[i + 2]);
    const c3 = B64.indexOf(clean[i + 3]);
    out[p++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0 && p < len) out[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (c3 >= 0 && p < len) out[p++] = ((c2 & 3) << 6) | c3;
  }
  return out;
}
