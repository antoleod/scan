export function isDeviceOnline() {
  if (typeof navigator === 'undefined') {
    return true;
  }

  if ('onLine' in navigator) {
    return navigator.onLine;
  }

  return true;
}
