import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Registers a Ctrl+Enter (or Cmd+Enter on Mac) keyboard shortcut that calls
 * `onSave` on web. No-op on native. `enabled` can be used to deactivate when
 * a modal or form is not mounted/visible.
 */
export function useCtrlEnterSave(onSave: () => void, enabled = true) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !enabled) return;

    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        onSave();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave, enabled]);
}
