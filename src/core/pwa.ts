import { Platform } from 'react-native';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export type BrowserInstallSupport =
  | 'chromium'   // Chrome, Edge, Samsung Browser – supports beforeinstallprompt
  | 'firefox'    // Firefox Android – supports PWA via browser menu, no prompt API
  | 'safari'     // Safari iOS/macOS – Add to Home Screen only
  | 'unknown';

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<(available: boolean) => void>();

function emitAvailability() {
  const available = Boolean(deferredPrompt);
  listeners.forEach((listener) => {
    try { listener(available); } catch { /* ignore */ }
  });
}

function getWindowSafe() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window as Window;
}

export function detectBrowserInstallSupport(): BrowserInstallSupport {
  const win = getWindowSafe();
  if (!win) return 'unknown';
  const ua = win.navigator.userAgent;
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/Safari/i.test(ua) && !/Chrome|Chromium|CriOS|Edg|OPR|Samsung/i.test(ua)) return 'safari';
  if (/Chrome|Chromium|Edg|OPR|Samsung/i.test(ua)) return 'chromium';
  return 'unknown';
}

/** Returns human-readable install instructions for browsers that don't support the prompt API. */
export function getManualInstallInstructions(): string | null {
  const win = getWindowSafe();
  const isMobile = Boolean(win?.matchMedia?.('(max-width: 900px)').matches);
  const browser = detectBrowserInstallSupport();
  if (browser === 'safari') {
    return isMobile
      ? 'Safari iOS: tap Share (square with arrow), then "Add to Home Screen".'
      : 'Safari macOS: File > Add to Dock to install this app.';
  }
  if (browser === 'firefox') {
    return isMobile
      ? 'Firefox Android: open menu (⋮) and choose "Install" or "Add to Home screen".'
      : 'Firefox desktop has limited install UX. Use Edge/Chrome for one-click install, or keep as pinned tab.';
  }
  return null;
}

export function initPwaInstallBridge() {
  const win = getWindowSafe();
  if (!win || initialized) return;
  initialized = true;

  win.addEventListener('beforeinstallprompt', (event: Event) => {
    event.preventDefault?.();
    deferredPrompt = event as BeforeInstallPromptEvent;
    emitAvailability();
  });

  win.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emitAvailability();
  });
}

export function canInstallPwa() {
  return Boolean(deferredPrompt);
}

export function isAlreadyInstalled(): boolean {
  const win = getWindowSafe();
  if (!win) return false;
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return win.matchMedia?.('(display-mode: standalone)').matches || Boolean(nav.standalone);
}

export function getPwaInstallDiagnostics() {
  const win = getWindowSafe();
  if (!win) {
    return { installable: false, reason: 'Not running in web environment.' };
  }
  if (isAlreadyInstalled()) {
    return { installable: false, reason: 'Already installed in this browser profile.' };
  }
  if (deferredPrompt) {
    return { installable: true, reason: 'Installer event is available.' };
  }
  const browser = detectBrowserInstallSupport();
  if (browser === 'safari') {
    return { installable: false, reason: getManualInstallInstructions()! };
  }
  if (browser === 'firefox') {
    return { installable: false, reason: getManualInstallInstructions()! };
  }
  if (!('serviceWorker' in win.navigator)) {
    return { installable: false, reason: 'Service Worker is not supported in this browser.' };
  }
  return {
    installable: false,
    reason: 'Installer event not fired yet. Use HTTPS, keep tab active, and interact with the app before retrying.',
  };
}

export async function triggerPwaInstall() {
  if (!deferredPrompt) return { supported: false, accepted: false };
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  const accepted = choice?.outcome === 'accepted';
  deferredPrompt = null;
  emitAvailability();
  return { supported: true, accepted };
}

export function subscribePwaInstallAvailability(listener: (available: boolean) => void) {
  listeners.add(listener);
  listener(Boolean(deferredPrompt));
  return () => { listeners.delete(listener); };
}
