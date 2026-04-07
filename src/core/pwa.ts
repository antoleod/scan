import { Platform } from 'react-native';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;
const listeners = new Set<(available: boolean) => void>();

function emitAvailability() {
  const available = Boolean(deferredPrompt);
  listeners.forEach((listener) => {
    try {
      listener(available);
    } catch {
      // Ignore listener errors.
    }
  });
}

function getWindowSafe() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window as Window;
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

export function getPwaInstallDiagnostics() {
  const win = getWindowSafe();
  if (!win) {
    return { installable: false, reason: 'Not running in web environment.' };
  }
  const nav = win.navigator as Navigator & { standalone?: boolean };
  const standaloneMatch = win.matchMedia?.('(display-mode: standalone)').matches;
  if (standaloneMatch || nav.standalone) {
    return { installable: false, reason: 'Already installed in this browser profile.' };
  }
  if (deferredPrompt) {
    return { installable: true, reason: 'Installer event is available.' };
  }
  if (!('serviceWorker' in nav)) {
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
  return () => {
    listeners.delete(listener);
  };
}
