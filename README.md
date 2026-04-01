# Barra Scanner

Expo + React Native app in the repository root.

## Start

```bash
npm install
npm run start
```

## Local web

```bash
npm run web
```

Use this when you want to test the browser build locally.

## GitHub Pages

The site is deployed from the `main` branch with the workflow in
`.github/workflows/deploy-pages.yml`.

To produce the same static build locally:

```bash
npx expo export --platform web
```

The exported site is written to `dist/`.

## Scan behavior

- Camera, image, NFC, and manual paste all use the same scan processing pipeline.
- Successful scans are saved once and trigger vibration plus a beep.
- Duplicate scans are not saved again.
- Duplicate scans show a visible `Already exists` message.
- If live scanning takes too long, the app shows a `Tomar foto` fallback and saves the image locally.
- Captures saved by the fallback appear in `History > Capturas pendientes` for later review or processing.
- If a code is PI, the visible type is always `PI`.
- Image scan decodes a picked image with the barcode scanner pipeline.

## Backup / Restore

- Use `Settings > Backup > Export backup` to export settings, templates, and history as JSON.
- Use `Settings > Backup > Import backup` to paste a JSON backup and restore it.
- `Paste backup` imports directly from the clipboard.
- Full backups replace settings and templates, and merge history without duplicates.
- Legacy history-only JSON imports are still accepted.

## NFC

- NFC scanning works only on supported Android development builds.
- NFC does not work in Expo Go.
- Install the app with a dev build or EAS build before testing NFC.

## Expo tunnel

- `expo start --tunnel` depends on the external ngrok service.
- The repo patches `@expo/ngrok` so tunnel failures no longer crash on `undefined.body`.
- If ngrok is unavailable, the tunnel can still fail to connect; use `--lan` or retry later.

## Firebase

Optional environment variables:

- `EXPO_PUBLIC_FIREBASE_API_KEY`
- `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `EXPO_PUBLIC_FIREBASE_APP_ID`
- `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` (optional)
- `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` (optional)
- `EXPO_PUBLIC_ENABLE_UPDATES` (false by default)

Copy `.env.example` to `.env` and fill in the values if you want Firebase auth and sync.

## Notes

- Web still works where the underlying browser APIs are available.
- The scan list and exports normalize legacy PI labels to `PI`.
