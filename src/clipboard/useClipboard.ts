import { useEffect, useMemo, useState } from 'react';

import {
  captureClipboardNow,
  captureClipboardPasteText,
  getClipboardEngineSnapshot,
  importClipboardScreenshot,
  importClipboardScreenshotFromManual,
  setClipboardBackgroundCapture,
  startClipboardEngine,
  stopClipboardEngine,
  subscribeClipboardEntries,
} from './ClipboardEngine';
import type { ClipEntry, PermState } from '../core/clipboard.types';

type UseClipboardOptions = {
  backgroundCapture?: boolean;
};

export function useClipboard(options: UseClipboardOptions = {}) {
  const { backgroundCapture = false } = options;
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
      setClipboardBackgroundCapture(backgroundCapture);
    });

    return () => {
      mounted = false;
      unsub();
      stopClipboardEngine();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setClipboardBackgroundCapture(backgroundCapture);
  }, [backgroundCapture]);

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
