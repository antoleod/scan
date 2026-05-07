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
