---
name: audit-baseline-20260512
description: Inventory of P0/P1/P2 security findings from the comprehensive audit on 2026-05-12, with file:line pointers for re-verification on future audits
metadata:
  type: project
---

Comprehensive security audit completed 2026-05-12 against MyKit at `C:\Users\X1\Downloads\scan\scan`. Use this as the starting set when checking what's been fixed or regressed.

**Why:** Establishes a re-verification baseline so future audits can quickly diff against known issues rather than re-discovering everything.

**How to apply:** Before producing new audit output, re-check each item below by file+line to see if it's been remediated. If a finding is closed, remove it from the baseline; if a new one surfaces, append.

## P0 findings (open as of 2026-05-12)

1. **`functions/index.js:104` — `pinSession` cloud function**: unauthenticated callable, pin padded to 6 chars (`String(pin).padEnd(6,"0")` line 118), no global rate limiting (in-memory Map), no PIN length minimum. Brute-forceable; currently orphaned client (`firebase-service.js` not bundled into `dist/`) but **function is still deployed and publicly callable**.

2. **`firestore.rules:139-148` — `/noteGroups/{groupId}` self-join bypass**: any signed-in user can add themselves to any existing group ID without supplying the invite code by direct Firestore write. The `joinSharedNoteGroupByInvite` Cloud Function validates the invite code but the rules path bypasses it.

3. **`firestore.rules:152-157` — Group notes have no field validation**: `noteValid()` is enforced under `/users/{uid}/notes/{noteId}` but not under `/noteGroups/{groupId}/notes/{noteId}`. Members can write arbitrary fields.

4. **`firestore.rules:160-161` — `/usernames/{username}` public read leaks email**: `allow get: if true` plus the doc stores `authEmail` (set in `firebase.ts:329`). For users who registered with a recovery email, their real email is enumerable by username probing.

## P1 findings

5. **`firestore.rules` vs `firebase.ts:584` — schema mismatch**: `sanitizeNoteForFirestore` writes `smartType`, `workflowStatus`, `workflowMetadata`, `isSecret`, `draft`, `title`, `versions`, `imageRtdbPaths`, `hasLocalImage`, `hasLocalAttachments`, `groupId`. Rules `hasOnlyKeys` allowlist does not include any of these. Also category enum mismatch: rules allow `'general' | 'work'`; `notes.ts:36` allows `'general' | 'work' | 'health' | 'shopping'`. Result: medication and shopping notes will be rejected by rules on write.

6. **`src/core/extract.ts:16` — ReDoS via user templates**: `new RegExp(pattern, 'im')` from `TemplateRule[]` with no validation. `sanitizeTemplatePattern` exists in `src/core/validation.ts:82` but is never imported anywhere.

7. **`src/core/smartNotes.ts:55-57` and `src/core/settings.ts:65` — ReDoS via settings backup import**: `smartNotes.regex.{ip,hostname,pi}` is spread from imported backup JSON (`src/core/backup.ts:181`) without validation, then compiled with `new RegExp(source, 'gi')`. Malicious backup hangs the app permanently.

8. **`src/auth/authContext.tsx:196` — PII in diagnostics**: `diag.info('auth.reset.sent', { email })` logs full email. Logs are user-shareable (`MainAppScreen.tsx:1066-1086`).

9. **`src/auth/authService.ts:168,180` — PII (email local part) in diagnostics**: `email.split('@')[0]` for magic-link send/verify.

10. **`src/screens/MainAppScreen.tsx:690,695` — Full URL in diagnostics**: `diag.info('url.opened', { url: payload })` and `diag.error('url.open.error', { url: payload })`. URLs can contain tokens, session IDs.

11. **`src/auth/authContext.tsx:243-254` — Logout doesn't wipe local PII**: `clearQueue` + `clearNotesChecksum` only. AsyncStorage `@barra_history`, `@barra_notes_v1`, `@MyKit_clipboard_v2`, `@barra_templates`, settings, pending captures all persist. Next user on a shared device sees previous user's data.

12. **`src/clipboard/ClipboardEngine.ts` — Sensitive clipboard cloud sync**: When `clipboardCloudSync` is enabled, all clipboard contents (potentially passwords, MFA codes, credit cards, PII) sync to Firestore. No sensitive-data filter, no per-entry approval, no entry expiry (text entries don't have the image retention sweep).

## P2 findings

13. **`functions/index.js:122-123` — Server config disclosure**: returns `"Server configuration error"` message when env var missing; minor info leak.

14. **`dist/index.html` — No CSP header**: GitHub Pages doesn't easily allow custom headers, but a meta CSP can be injected in `deploy-pages.yml:69` alongside the manifest tags.

15. **`src/auth/authContext.tsx:41-66` — Mobile deep link handler references `window.location.origin`**: will throw on RN. Bug, but in a handler that only logs, so impact limited.

16. **`src/core/firebase.ts:175` — RN `initializeAuth(app)` called without persistence**: should pass `getReactNativePersistence(AsyncStorage)` so sessions actually persist on mobile. Otherwise the warning is benign because Firebase falls back to in-memory.

17. **`src/core/biometrics.ts:60` — `disableDeviceFallback: false`**: biometric lock falls back to device PIN. Standard behavior but means biometric isn't a hard security boundary.

18. **`src/core/nfc.ts:62-99` — NFC URI prefix table includes `file://`, `telnet://`, `smb://` etc.**: not auto-opened (consumer checks `http(s)://` only), but they enter the scan pipeline and get stored/synced. Low risk.

## What's correctly secured

- `.env` is gitignored; `.env.example` only committed; `EXPO_PUBLIC_*` keys are correctly public.
- No `dangerouslySetInnerHTML`, `eval`, or `Function()` in source.
- URL auto-open requires user confirmation and is restricted to `http(s)://` (`MainAppScreen.tsx:678`).
- Passwords are NOT stored locally (`auth-storage.ts:6` — legacy key explicitly cleared on startup).
- GitHub Actions secrets referenced correctly (`deploy-pages.yml`).
- `loginWithEmail` calls `setPersistence` correctly on web (`firebase.ts:269-272`).
- `expo-secure-store` used for biometric email (the only credential persisted natively).
