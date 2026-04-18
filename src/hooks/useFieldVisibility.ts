/**
 * Global field-visibility store for ServiceNow structured notes.
 *
 * Uses a module-level singleton so toggling a field in one NoteCard immediately
 * reflects in every other mounted card (no extra context/provider needed).
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SENSITIVE_FIELD_KEYS } from '../core/smartNotes';

const STORAGE_KEY = '@MyKit_field_visibility_v1';

// ─── Module-level singleton state ─────────────────────────────────────────────

let _hiddenKeys: Set<string> = new Set(SENSITIVE_FIELD_KEYS);
let _loaded = false;
const _listeners = new Set<(keys: Set<string>) => void>();

function _notify() {
  const snapshot = new Set(_hiddenKeys);
  for (const cb of _listeners) cb(snapshot);
}

async function _load() {
  if (_loaded) return;
  _loaded = true;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        _hiddenKeys = new Set<string>(parsed);
        _notify();
      }
    }
  } catch { /* ignore */ }
}

export function toggleFieldVisibility(key: string): void {
  if (_hiddenKeys.has(key)) _hiddenKeys.delete(key);
  else _hiddenKeys.add(key);
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([..._hiddenKeys])).catch(() => undefined);
  _notify();
}

export function isFieldHidden(key: string): boolean {
  return _hiddenKeys.has(key);
}

// ─── React hook ───────────────────────────────────────────────────────────────

export function useFieldVisibility(): {
  hiddenKeys: Set<string>;
  toggleField: (key: string) => void;
  isHidden: (key: string) => boolean;
} {
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set(_hiddenKeys));

  useEffect(() => {
    // Subscribe to global state changes
    _listeners.add(setHiddenKeys);
    // Kick off load from storage (no-op if already loaded)
    void _load();
    return () => { _listeners.delete(setHiddenKeys); };
  }, []);

  return {
    hiddenKeys,
    toggleField: toggleFieldVisibility,
    isHidden: (k: string) => hiddenKeys.has(k),
  };
}
