import { useEffect, useMemo, useState } from 'react';

import {
  captureClipboardNow,
  captureClipboardPasteText,
  getClipboardEngineSnapshot,
  importClipboardScreenshot,
  importClipboardScreenshotFromManual,
  startClipboardEngine,
  stopClipboardEngine,
  subscribeClipboardEntries,
} from './ClipboardEngine';
import type { ClipEntry, PermState } from '../core/clipboard.types';

export function useClipboard() {
  const [entries, setEntries] = useState<ClipEntry[]>(() => getClipboardEngineSnapshot().entries);
  const [permState, setPermState] = useState<PermState>(() => getClipboardEngineSnapshot().permState);

  useEffect(() => {
    let mounted = true;
    const unsub = subscribeClipboardEntries((next) => {
      if (!mounted) return;
      setEntries(next);
    });

    void startClipboardEngine().then(() => {
      if (!mounted) return;
      const snapshot = getClipboardEngineSnapshot();
      setEntries(snapshot.entries);
      setPermState(snapshot.permState);
    });

    return () => {
      mounted = false;
      unsub();
      stopClipboardEngine();
    };
  }, []);

  return useMemo(() => ({
    entries,
    permState,
    captureNow: async () => {
      const inserted = await captureClipboardNow();
      return inserted;
    },
    capturePastedText: async (text: string) => captureClipboardPasteText(text),
    importScreenshot: async (dataUrl: string) => importClipboardScreenshot(dataUrl),
    importScreenshotFromFile: async (dataUrl: string) => importClipboardScreenshotFromManual({ dataUrl, source: 'manual' }),
  }), [entries, permState]);
}
