export function isDeviceOnline() {
  if (typeof navigator === 'undefined') {
    return true;
  }

  if ('onLine' in navigator) {
    return navigator.onLine;
  }

  return true;
}

export function onNetworkReconnect(cb: () => void): () => void {
  // Web: listen to the 'online' event
  if (typeof window !== 'undefined') {
    const handler = () => cb();
    window.addEventListener('online', handler);
    return () => window.removeEventListener('online', handler);
  }

  // React Native or other platforms: no-op (return cleanup function that does nothing)
  return () => undefined;
}

/**
 * Subscribe to online/offline transitions. Fires `cb(isOnline)` on every
 * change. Web-only (uses the `online`/`offline` window events); on native it
 * is a no-op that returns a cleanup function, since `navigator.onLine` is not
 * reliable there.
 */
export function onNetworkStatusChange(cb: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }
  const onOnline = () => cb(true);
  const onOffline = () => cb(false);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}
