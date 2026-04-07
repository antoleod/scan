import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const resolveBasePath = () => {
    const expoScript = document.querySelector('script[src*="/_expo/static/js/web/"]') as HTMLScriptElement | null;
    if (expoScript?.src) {
      const scriptPath = new URL(expoScript.src, window.location.origin).pathname;
      const idx = scriptPath.indexOf('/_expo/');
      if (idx >= 0) {
        return `${scriptPath.slice(0, idx).replace(/\/+$/, '')}/`;
      }
    }
    const fromPath = window.location.pathname.replace(/\/[^/]*$/, '/');
    return fromPath.startsWith('/') ? fromPath : `/${fromPath}`;
  };

  const ensureManifestLink = (basePath: string) => {
    if (document.querySelector('link[rel="manifest"]')) return;
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = `${basePath}manifest.webmanifest`;
    document.head.appendChild(link);
  };

  window.addEventListener('load', () => {
    const basePath = resolveBasePath();
    ensureManifestLink(basePath);
    navigator.serviceWorker.register(`${basePath}sw.js`, { scope: basePath }).catch(() => {});
  });
}
