import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const basePath = window.location.pathname.replace(/\/[^/]*$/, '/');
    navigator.serviceWorker.register(`${basePath}sw.js`, { scope: basePath }).catch(() => {});
  });
}
