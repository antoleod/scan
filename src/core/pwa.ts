import { Platform } from 'react-native';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let initialized = false;

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
  });
}

export function canInstallPwa() {
  return Boolean(deferredPrompt);
}

export async function triggerPwaInstall() {
  if (!deferredPrompt) return { supported: false, accepted: false };
  await deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  const accepted = choice?.outcome === 'accepted';
  deferredPrompt = null;
  return { supported: true, accepted };
}

