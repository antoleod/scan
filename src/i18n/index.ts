/**
 * i18n/index.ts — i18next bootstrap for MyKit.
 *
 * - Resources are bundled TS objects (no async loading, no backend).
 * - The initial language is resolved by the caller (App) from the persisted
 *   AppSettings.uiLanguage; getDeviceUiLanguage() is the fallback when the user
 *   has never picked one.
 * - english is the canonical resource and the fallback for missing keys.
 *
 * Usage in components: `const { t } = useTranslation();  t('notes.inbox')`.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en';
import es from './locales/es';
import fr from './locales/fr';
import nl from './locales/nl';
import { DEFAULT_UI_LANGUAGE, normalizeUiLanguage, type UiLanguage } from './languages';

export const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  nl: { translation: nl },
} as const;

/** Best-effort device language, narrowed to a supported UI language. */
export function getDeviceUiLanguage(): UiLanguage {
  try {
    const tag = getLocales()?.[0]?.languageCode ?? undefined;
    return normalizeUiLanguage(tag, DEFAULT_UI_LANGUAGE);
  } catch {
    return DEFAULT_UI_LANGUAGE;
  }
}

let initialized = false;

/** Initialize i18next once. `initialLanguage` comes from persisted settings. */
export function initI18n(initialLanguage?: UiLanguage): typeof i18n {
  if (initialized) {
    if (initialLanguage && i18n.language !== initialLanguage) {
      void i18n.changeLanguage(initialLanguage);
    }
    return i18n;
  }

  const lng = initialLanguage ?? getDeviceUiLanguage();

  void i18n.use(initReactI18next).init({
    resources,
    lng,
    fallbackLng: DEFAULT_UI_LANGUAGE,
    interpolation: { escapeValue: false },
    returnNull: false,
    // React Native has no Suspense boundary around the tree here.
    react: { useSuspense: false },
  });

  initialized = true;
  return i18n;
}

/** Imperatively change the active UI language (called by the settings selector). */
export function setUiLanguage(language: UiLanguage): void {
  void i18n.changeLanguage(language);
}

// ── First-run language choice ──────────────────────────────────────────────
// Tracks whether the user has explicitly picked a UI language at least once
// (on register or via the first-run guest prompt). Lets us show the prompt only
// the very first time someone uses the app as a guest.
const LANGUAGE_CHOSEN_KEY = '@MyKit_ui_language_chosen';

export async function hasChosenUiLanguage(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LANGUAGE_CHOSEN_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function markUiLanguageChosen(): Promise<void> {
  try {
    await AsyncStorage.setItem(LANGUAGE_CHOSEN_KEY, '1');
  } catch {
    // Non-critical: the prompt may simply show again next launch.
  }
}

export default i18n;
