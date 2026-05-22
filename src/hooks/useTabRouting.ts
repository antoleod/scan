import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { Tab, parseTabFromHash } from '../types';

/**
 * Syncs the active tab with the URL hash on web so each page is linkable and
 * shareable (e.g. http://localhost:8081/app#notes). On native it behaves like
 * a plain useState with the given default.
 *
 * - Initial value comes from the current hash if present, else `defaultTab`.
 * - Changing the tab writes the hash via replaceState (no extra history entry).
 * - Browser back/forward (hashchange) updates the active tab.
 */
export function useTabRouting(defaultTab: Tab): [Tab, (tab: Tab) => void] {
  const [activeTab, setActiveTabState] = useState<Tab>(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return defaultTab;
    return parseTabFromHash(window.location.hash) ?? defaultTab;
  });

  // Reflect tab changes in the URL hash (replaceState avoids polluting history).
  const setActiveTab = useCallback((tab: Tab) => {
    setActiveTabState(tab);
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (parseTabFromHash(window.location.hash) === tab) return;
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}#${tab}`);
  }, []);

  // Ensure the hash is present on first mount (so the URL is shareable immediately).
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (parseTabFromHash(window.location.hash)) return;
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, '', `${pathname}${search}#${activeTab}`);
    // activeTab intentionally read once on mount; subsequent writes go through setActiveTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // React to back/forward navigation.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onHashChange = () => {
      const next = parseTabFromHash(window.location.hash);
      if (next) setActiveTabState(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return [activeTab, setActiveTab];
}
