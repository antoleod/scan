/**
 * languages.ts
 * Single source of truth for the UI languages MyKit supports.
 * Mirrors AppSettings.uiLanguage. Kept dependency-free so it can be imported
 * from settings, the language selector, and the i18n bootstrap alike.
 */

export const UI_LANGUAGES = ['en', 'es', 'fr', 'nl'] as const;

export type UiLanguage = (typeof UI_LANGUAGES)[number];

export const DEFAULT_UI_LANGUAGE: UiLanguage = 'en';

/** Native label shown in the language selector. */
export const UI_LANGUAGE_LABELS: Record<UiLanguage, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  nl: 'Nederlands',
};

/** Narrow an arbitrary value (stored setting, device locale) to a supported UI language. */
export function normalizeUiLanguage(value: unknown, fallback: UiLanguage = DEFAULT_UI_LANGUAGE): UiLanguage {
  if (typeof value !== 'string') return fallback;
  const two = value.slice(0, 2).toLowerCase();
  return (UI_LANGUAGES as readonly string[]).includes(two) ? (two as UiLanguage) : fallback;
}
