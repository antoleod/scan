# i18n Migration Workflow & Tracking

Internationalization of MyKit's UI into **EN / ES / FR / NL**. Built on
`i18next` + `react-i18next` + `expo-localization`. This document is the live
tracker — update the checkboxes and the "Last updated" line as phases land.

**Last updated:** 2026-05-26 — Phases 0-3 done; Phase 4 in progress (ScanTab, HistoryTab, ManualCaptureBar, BarcodeModal, OfficeScanModal migrated).

---

## Architecture

| Piece | Location | Notes |
|-------|----------|-------|
| Supported languages | [src/i18n/languages.ts](src/i18n/languages.ts) | `UI_LANGUAGES`, `UiLanguage`, labels, `normalizeUiLanguage()` |
| i18next bootstrap | [src/i18n/index.ts](src/i18n/index.ts) | `initI18n()`, `setUiLanguage()`, `getDeviceUiLanguage()` |
| Translation resources | [src/i18n/locales/](src/i18n/locales/) | `en.ts` (canonical), `es.ts`, `fr.ts`, `nl.ts` |
| Persisted preference | `AppSettings.uiLanguage` ([src/types.ts](src/types.ts)) | default `'en'`, validated in [settings.ts](src/core/settings.ts) |
| Mounted | [App.tsx](App.tsx) | `initI18n()` at module load; `AuthGate` aligns to persisted setting |
| Selector UI | [SettingsTab.tsx](src/components/mainApp/tabs/SettingsTab.tsx) | "App language" chips in the *Notes features* section |

### Key rules
1. **`en.ts` is the source of truth.** Add a key there first, then translate in `es/fr/nl`.
2. Keys are namespaced by feature: `common.*`, `notes.*`, `settings.*`, … Add new namespaces as phases land.
3. Components consume with `const { t } = useTranslation();  t('notes.inbox')`.
   - If the file already uses `t` as a local variable (e.g. NotesTab), alias it: `const { t: tr } = useTranslation()`.
4. The shopping **catalog** language (`shoppingListLanguage`) is a *separate* setting and is unaffected by `uiLanguage`.

---

## How to migrate one component (recipe)

1. Find hardcoded user-facing strings (JSX text, `placeholder=`, `accessibilityLabel=`, `Alert.alert`, toast messages).
2. Add the keys to `en.ts` under the right namespace, then mirror into `es.ts`/`fr.ts`/`nl.ts`.
3. In the component: `import { useTranslation } from 'react-i18next';` and `const { t } = useTranslation();`.
4. Replace each literal with `t('namespace.key')`. For interpolation use `t('key', { name })` + `"{{name}}"` in the resource.
5. Run `npm run typecheck && npm test`. Manually flip the language selector and confirm the screen updates live.

> ⚠️ Don't blind-rename: many files use `t`/`copy` as local variable names. Replace **only** the user-facing literals.

---

## Phases & tracking

### ✅ Phase 0 — Foundation (DONE)
- [x] Install deps, add `expo-localization` plugin to `app.config.ts`
- [x] `src/i18n/` (languages, bootstrap, en/es/fr/nl resources)
- [x] `AppSettings.uiLanguage` + default + load-time validation
- [x] Mount in `App.tsx` (device default → persisted setting)
- [x] App-language selector in Settings (lives next to the shopping-list language selector)

### ✅ Phase 1 — Notes copy (DONE)
- [x] NotesTab: removed local `detectUiLang`/`UI_COPY`, now uses `useTranslation` (`tr`). Keys: `notes.noteVersions`, `notes.noVersions` (the other `UI_COPY` keys were unused and seeded the base resource for later reuse).

### ✅ Phase 2 — Auth screens (DONE)
Namespace `auth.*` (+ `language.*` for the picker). All visible copy, placeholders, a11y labels, validation + error fallbacks migrated.
- [x] [LoginForm.tsx](src/auth/LoginForm.tsx)
- [x] [RegisterForm.tsx](src/auth/RegisterForm.tsx) — **+ language selector** at the top (persists `uiLanguage` on successful register)
- [x] [ForgotPasswordForm.tsx](src/auth/ForgotPasswordForm.tsx)
- [x] [MagicLinkForm.tsx](src/auth/MagicLinkForm.tsx)
- [x] [BiometricLockScreen.tsx](src/auth/BiometricLockScreen.tsx)
- [x] First-run **guest language prompt**: [LanguagePromptModal.tsx](src/components/LanguagePromptModal.tsx) shown by [AuthScreen.tsx](src/auth/AuthScreen.tsx) when `hasChosenUiLanguage()` is false. Reusable [LanguagePicker.tsx](src/components/LanguagePicker.tsx).
- [ ] Remaining: friendly auth error messages in [authService.ts](src/auth/authService.ts) (Firebase code → message map) → future `auth.errors.*`; password-strength words in RegisterForm a11y label.

> New i18n helpers: `hasChosenUiLanguage()` / `markUiLanguageChosen()` in [src/i18n/index.ts](src/i18n/index.ts) (AsyncStorage key `@MyKit_ui_language_chosen`).
> Locale parity is now guarded by a test in `tests/run-tests.ts` (es/fr/nl must match en's key set).

### ✅ Phase 3 — Settings (DONE)
- [x] [SettingsTab.tsx](src/components/mainApp/tabs/SettingsTab.tsx) — all section titles/subtitles, toggles, buttons, labels, placeholders, destructive Alert confirmations, header/toolbar. ~70 new `settings.*` keys. `ThemeCard` got its own `useTranslation` for the "ACTIVE" badge.
- [ ] Left in English on purpose (technical/branding): PI prefix placeholders (`02PI20`, `MUSTBRUN`), custom accent hex placeholder, laser-speed (`slow/normal/fast`) and scan-profile (`Auto/PI Full/PI Short`) chip labels, internal `runDataSyncAction` log labels.

### 🟡 Phase 4 — Main app surfaces (in progress)
Namespaces added: `scan.*`, `history.*`, `capture.*`.
- [x] [ScanTab.tsx](src/components/mainApp/tabs/ScanTab.tsx) — permission, modes (Barcode/Image/NFC/Batch), photo toast, clear image
- [x] [HistoryTab.tsx](src/components/mainApp/tabs/HistoryTab.tsx) + `HistoryItemCard` (own useTranslation) — swipe DELETE, Copy/Edit/Use/Delete, Used/Ready/Copied, search, more-filters, delete modal
- [x] [ManualCaptureBar.tsx](src/clipboard/ManualCaptureBar.tsx) — capture/paste/import + hints
- [x] [BarcodeModal.tsx](src/components/mainApp/BarcodeModal.tsx) — title, format metas, no-value
- [x] [OfficeScanModal.tsx](src/components/mainApp/OfficeScanModal.tsx) — full
- [x] Toast.tsx — no literals (text comes via prop)
- [ ] [ComposerSection.tsx](src/components/ComposerSection.tsx) (~21) — `navigator.language` is for **speech recognition**, not UI copy; migrate visible labels only
- [ ] [HistoryItemModal.tsx](src/components/mainApp/HistoryItemModal.tsx) (~11)
- [ ] [ClipboardScreen.tsx](src/screens/ClipboardScreen.tsx) (~17)
- [ ] [MedicationCard.tsx](src/components/MedicationCard.tsx) (~13) + [MedicationWorkflowModal.tsx](src/components/MedicationWorkflowModal.tsx)
- [ ] [ShoppingListBlockV2.tsx](src/components/ShoppingListBlockV2.tsx) (~11) + [ShoppingListBlock.tsx](src/components/ShoppingListBlock.tsx) + [ShoppingWorkflowModal.tsx](src/components/ShoppingWorkflowModal.tsx)
- [ ] [QuickTemplatesModal.tsx](src/components/QuickTemplatesModal.tsx) — `navigator.language` here picks catalog names; migrate visible labels only
- [ ] Misc modals: NoteOcrModal, BackupImportModal, CommandPalette, ScanViewfinder

### ⬜ Phase 5 — AirDrop feature (~22 strings)
- [ ] [ReceiveScreen.tsx](src/features/airdrop/screens/ReceiveScreen.tsx), [SendScreen.tsx](src/features/airdrop/screens/SendScreen.tsx), [AirDropScreen.tsx](src/features/airdrop/screens/AirDropScreen.tsx), [MyDevicesSection.tsx](src/features/airdrop/components/MyDevicesSection.tsx)

### ⬜ Phase 6 — Polish
- [ ] Sweep for remaining literals (`>Capitalized Text<`, placeholders, a11y labels, Alerts)
- [ ] Add a test that every locale has the same key set as `en.ts` (no missing keys)
- [ ] Consider plural/`count` handling where lists are summarized

---

## Verification per phase
- `npm run typecheck` — must stay clean.
- `npm test` — 133+ tests stay green.
- Manual: open Settings → *App language*, switch EN→FR→ES→NL, confirm the migrated screen re-renders translated text live (i18next updates without reload).
