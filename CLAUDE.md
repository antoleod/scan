# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MyKit** is an Expo + React Native application for scanning and managing barcodes and codes (ServiceNow tickets, PIs, QR codes, office codes, etc.). The app captures scans from camera, images, NFC, or manual input; classifies them using configurable templates; and syncs with Firebase for cloud persistence and cross-device access. It also includes clipboard monitoring, smart note generation, and backup/restore functionality.

Multi-platform support:
- **Android**: Full feature set, including NFC (requires EAS build)
- **iOS**: Via EAS build, limited NFC
- **Web**: Full feature set via Expo web, static export to GitHub Pages

---

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server (tunnel mode for external device access via ngrok)
npm start

# Start with LAN access only (faster, local network only)
npm start -- --lan

# Web development (local browser testing, hot reload)
npm run web

# Build static web export for production (writes to dist/)
npm run build:web

# Mobile platforms (requires device/emulator)
npm run android
npm run ios

# Type checking (tsc --noEmit, fast)
npm run typecheck

# Run tests (Node.js-based, not browser-based)
npm test

# Watch mode for single test file
npm test -- src/core/classify.test.ts
```

**Port Notes**: Dev server runs on port 8081 (Expo default). Web runs on 19006.

---

## Architecture Overview

### Folder Structure

```
src/
├── auth/                 # Firebase auth UI + context
│   ├── authContext.tsx   # Auth provider with session management
│   ├── authService.ts    # Service layer (login, register, reset, Firebase guard)
│   ├── useAuth.ts        # Hook to consume AuthContext
│   ├── AuthScreen.tsx    # Container routing to forms
│   ├── LoginForm.tsx
│   ├── RegisterForm.tsx
│   └── ForgotPasswordForm.tsx
├── core/                 # Business logic (no React)
│   ├── scanPipeline.ts   # Main scan → ScanRecord pipeline
│   ├── classify.ts       # Code type detection (PI, RITM, etc.)
│   ├── codeStrategy.ts   # Code normalization + preview
│   ├── settings.ts       # AppSettings persistence + piLogic
│   ├── templates.ts      # Custom TemplateRule persistence
│   ├── extract.ts        # Field extraction (templates + fallback regex)
│   ├── history.ts        # ScanRecord persistence + dedup
│   ├── historyDeletions.ts   # Soft-delete tracking
│   ├── firebase.ts       # Firebase runtime, auth, Firestore sync
│   ├── dataSync.ts       # Web-specific cleanup (cookies, IndexedDB, etc.)
│   ├── notes.ts          # Note persistence
│   ├── smartNotes.ts     # OCR-based note generation
│   ├── noteDeletions.ts  # Note soft-delete tracking
│   ├── barcode.ts        # Barcode generation (CODE128, QR, etc.)
│   ├── nfc.ts            # NFC reading (Android only)
│   ├── clipboard.ts      # Clipboard re-export (actual impl in clipboard/)
│   ├── smartSearch.ts    # History search + filter
│   ├── validation.ts     # Input validation rules
│   ├── diagnostics.ts    # Event logging
│   ├── feedback.ts       # Audio/haptics (beep, vibration, laser)
│   ├── pwa.ts            # PWA manifest helpers
│   ├── network.ts        # Network utilities
│   └── auth.ts           # Low-level Firebase auth helpers
├── clipboard/            # Clipboard engine
│   ├── ClipboardEngine.ts    # Main clipboard monitoring + dedup engine
│   ├── useClipboard.ts       # Hook for clipboard state
│   ├── ClipboardPermissionBadge.tsx
│   └── ManualCaptureBar.tsx
├── screens/              # Top-level screens
│   ├── MainAppScreen.tsx # Main scanner + history + notes + settings
│   └── ClipboardScreen.tsx
├── components/           # UI components (mostly stateless)
│   ├── mainApp/          # Main app specific components
│   │   ├── ScanTab.tsx       # Camera + barcode scanning UI
│   │   ├── HistoryTab.tsx    # History list + filter + batch
│   │   ├── NotesTab.tsx      # Notes list + create + search
│   │   ├── SettingsTab.tsx   # Settings UI
│   │   ├── BarcodeModal.tsx  # Display CODE128 barcode
│   │   ├── QrModal.tsx       # Display QR code
│   │   ├── OfficeScanModal.tsx
│   │   ├── HistoryItemModal.tsx
│   │   ├── HistoryDateModal.tsx
│   │   ├── BackupImportModal.tsx
│   │   ├── BatchSessionModal.tsx
│   │   ├── ScanFeedbackBanner.tsx   # Toast-like feedback during scan
│   │   ├── ScanViewfinder.tsx
│   │   ├── AppLayout.tsx    # Main layout structure
│   │   ├── AppHeader.tsx
│   │   ├── BottomTabs.tsx
│   │   ├── SelectionFooter.tsx
│   │   └── styles.ts        # Shared ScanTab styles
│   ├── Toast.tsx        # Global notification toast
│   ├── SearchFilterBar.tsx
│   ├── NoteDetailModal.tsx
│   ├── NoteOcrModal.tsx
│   ├── NoteCard.tsx
│   ├── SmartNoteGeneratorModal.tsx
│   ├── ShoppingListBlock.tsx
│   ├── ComposerSection.tsx
│   └── TabBar.tsx
├── hooks/                # Custom React hooks
│   ├── useVoiceCommands.ts   # Web Speech API + command parsing (Spanish/English)
│   ├── useCtrlEnterSave.ts
│   └── useFieldVisibility.ts
├── theme/                # Theme system
│   ├── theme.ts          # Theme definitions (dark, light, custom presets)
│   └── colors.ts         # Color palette
├── constants/
│   └── theme.ts
├── types.ts              # Central TypeScript types
├── declarations.d.ts     # Module declaration merges
└── App.tsx              # Root entry: auth gate + main app

public/                  # Static assets for web export
├── favicon.png
├── icon.png
├── manifest.webmanifest
└── ...

scripts/                 # Build/setup scripts
├── patch-ngrok.js       # Patch @expo/ngrok to handle undefined.body
├── ensure-worklets-shim.js
└── inject-pwa.js        # Inject PWA metadata into dist/index.html

tests/
├── run-tests.ts         # Custom Node.js test runner
└── ci.yml               # (Legacy) CI config

.github/workflows/
├── ci.yml               # Typecheck + test on push/PR
└── deploy-pages.yml     # Build + deploy web to GitHub Pages

docs/
└── auth-technical-notes.md  # Auth implementation notes
```

---

## Core Modules Deep Dive

### 1. Settings & PI Logic (`src/core/settings.ts`)

**Default Settings** (with smart note regex patterns):
```typescript
const defaultSettings: AppSettings = {
  fullPrefix: '02PI20',           // e.g., 02PI2012345
  shortPrefix: 'MUSTBRUN',        // e.g., MUSTBRUN12345
  ocrCorrection: true,            // Replace 'O' with '0'
  autoDetect: true,               // Auto-classify or use scanProfile
  scanProfile: 'auto',            // 'auto' | 'pi_full' | 'pi_short'
  theme: 'noirGraphite',
  barcodeOutputFormat: 'CODE128', // Display format
  barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8'],
  openUrls: true,                 // Auto-open scanned URLs
  historyAutoClearDays: 0,        // 0 = no auto-clear
  staySignedIn: true,
  savePasswordEncrypted: false,
  clipboardCloudSync: false,
  smartNotes: {
    offices: ['Spinelli', 'Kohl', 'Strasbourg'],
    ipDetectionEnabled: true,
    detectionEnabled: { ip: true, hostname: true, office: true, asset: true },
    regex: {
      ip: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b`,
      hostname: String.raw`\b(?:IPOLBRUP[A-Z0-9-]*|P\d{2}[A-Z]{2}[A-Z0-9-]*)\b`,
      pi: String.raw`\b02PI[A-Z0-9]*\b`,
    },
  },
};
```

**`piLogic` object**: Handles PI-specific transformations
```typescript
piLogic.normalize(code, settings)  // Trim, uppercase, replace O→0 if ocrCorrection
piLogic.convert(code, 'FULL' | 'SHORT', settings)  // Convert between formats
piLogic.validate(code, 'FULL' | 'SHORT', settings) // Check format + prefixes
```

PI formats:
- **FULL**: `02PI20{core}{check}` (13 chars, e.g., `02PI2012345` + 2 check digits)
- **SHORT**: `MUSTBRUN{core}` (e.g., `MUSTBRUN12345`)

Both must have >= 5 chars and match prefix. Conversion is bidirectional.

### 2. Classification Flow (`src/core/classify.ts`)

Classification order:
1. **ServiceNow Tickets** (exact match):
   - `RITM\d+` → `type: 'RITM'`
   - `REQ\d+` → `type: 'REQ'`
   - `INC\d+` → `type: 'INC'`
   - `SCTASK\d+` → `type: 'SCTASK'`
2. **PI Logic** (via `piLogic.convert()` + `validate()`):
   - Try FULL → if valid, return `type: 'PI', piMode: 'FULL'`
   - Try SHORT → if valid, return `type: 'PI', piMode: 'SHORT'`
3. **Fallback**: Return `type: 'QR'` (generic)

Returns `Classified` object with `profileId`, `type`, `normalized`, `piMode`.

### 3. Scan Pipeline (`src/core/scanPipeline.ts`)

**Main entry**: `buildScanRecord(raw: string, source, settings, templates)`

Steps:
1. Trim input
2. `classifyIncomingScan()` → `Classified`
3. Validate PI if `type === 'PI'`
4. `extractFields(raw, templates)` → structured fields
5. Detect code type (PI vs office vs generic)
6. Build `ScanRecord` with full metadata
7. Return `BuiltScanRecord` or `null`

**`ScanOutcome`** (result of `processScanInput()`):
- `{ status: 'saved', record, history }` — new record added
- `{ status: 'duplicate', duplicate, history }` — already exists
- `{ status: 'invalid', history }` — failed validation
- `{ status: 'empty', history }` — no input

### 4. Field Extraction (`src/core/extract.ts`)

Two-phase approach:

**Phase 1: Template Rules**
- Iterate through `TemplateRule[]`
- Apply regex patterns (field name → regex)
- Return first matching template

**Phase 2: Fallback Patterns** (if no template matched)
- `ticketNumber`: `RITM\d+|REQ\d+|INC\d+|SCTASK\d+`
- `customerId`: `customer\s+id\s*[:#-]?\s*([A-Z0-9_-]+)`
- `officeCode` / `officeNumber`
- `phoneNumber`: International + domestic formats
- `email`: RFC-like pattern
- `shortDescription`

Returns dict of matched fields or `{}`.

### 5. History Management (`src/core/history.ts`)

**ID Generation**: `{prefix}_{timestamp}_{counter}_{random}`

**Deduplication Key** (`historyKey()`):
```typescript
`${item.codeValue || item.codeNormalized}::{normalizedType}`
```
- Prevents duplicate scans by (value, type) pair
- `normalizeHistoryType()` converts `pi_full`/`pi_short` → `PI`

**Soft Delete**: Marks `deletedAt` timestamp + tracks in separate deletion set

**Storage**: AsyncStorage `@barra_history` (max 5000 items)

### 6. Firebase Integration (`src/core/firebase.ts`)

**Env Var Guards**:
- **Required**: API_KEY, AUTH_DOMAIN, PROJECT_ID, APP_ID
- **Optional**: STORAGE_BUCKET, MESSAGING_SENDER_ID, MEASUREMENT_ID, FUNCTIONS_REGION

Missing required vars → Firebase disabled, auth shows guard message.

**Runtime Singleton**:
```typescript
let runtime: FirebaseRuntime | null = null;
export async function initFirebaseRuntime(): Promise<FirebaseRuntime> { ... }
export function getFirebaseRuntime(): FirebaseRuntime | null { ... }
```

**Auth Persistence**:
- **Web**: `browserLocalPersistence` (stays signed in across tab close)
- **React Native**: Platform-native persistence via `initializeAuth()`

**15-Day Session Window**:
- Timestamp stored in `@MyKit_auth_timestamp`
- Extended on every auth state change
- Expired session forces re-login

**Firestore Sync**:
- Scans: `/users/{uid}/scans/{id}`
- Notes: `/users/{uid}/notes/{id}`
- Bidirectional merge on login/sync
- Deletion tracking via soft-delete

### 7. Clipboard Engine (`src/clipboard/ClipboardEngine.ts`)

**Deduplication**:
- Hash signature of content (first 200 chars)
- 8-second dedup window (prevent identical pastes)
- 30-second TTL cleanup

**Classification**:
- `url` if starts with `http://` or `https://`
- `servicenow` if contains `INC|RITM|SCTASK|REQ` + 7 digits
- `email` if has email-like pattern
- `code` if multiline or contains `{}[];=`
- `general` fallback

**Entry Limits**: Max 3000 entries per device

**Web-Specific**:
- IndexedDB + localStorage
- Cache Storage cleanup (PWA)
- Cookie expiration

### 8. Voice Commands (`src/hooks/useVoiceCommands.ts`)

**Web Speech API** (web only):
- Spanish primary (`es-ES`), falls back to English words
- Supports both Spanish and English commands

**Recognized Commands**:
```
Navigation: historial, history, ajustes, settings, configuración, notas, notes, scanner, scan tab
Scan: escanear, scan, foto, capturar, capture, toma foto
Batch: batch, lote, modo lote, batch mode
Batch Save: guardar lote, save batch, guardar todo, save all
Note: nota [text], note [text]
```

Returns `{ voiceState, lastTranscript, lastCommand, start, stop, toggle }`

---

## Authentication Flow

### Session Lifecycle

1. **Boot** (`AuthProvider` effect):
   - Check Firebase guard (env vars)
   - Attach `onAuthStateChanged()` listener
   - If user exists:
     - Load settings → check `staySignedIn`
     - Load timestamp → check 15-day window
     - If expired → logout, reset timestamp
     - Else → extend timestamp to now
   - If no user → guest mode

2. **Login** (`LoginForm.tsx`):
   - `authService.login(email, password)`
   - Calls Firebase `signInWithEmailAndPassword()`
   - On success:
     - `authContext` updates `user` state
     - Timestamp saved
     - Firebase sync initializes

3. **Register** (`RegisterForm.tsx`):
   - `authService.register(email, password)`
   - Calls Firebase `createUserWithEmailAndPassword()`
   - Same side effects as login

4. **Password Reset** (`ForgotPasswordForm.tsx`):
   - `authService.resetPassword(email)`
   - Calls Firebase `sendPasswordResetEmail()`
   - Email sent, user navigates to reset link

5. **Logout** (`useAuth()` hook):
   - `logout()` calls Firebase `signOut()`
   - Timestamp cleared
   - Cloud data optionally deleted
   - State resets to guest

### Firebase Guard

In `AuthScreen.tsx`:
- If guard is enabled but `missingRequiredEnv.length > 0`:
  - Show red error banner
  - List missing variables
  - Disable auth UI

---

## Component Patterns

### 1. Presentation Components (Stateless)

Most components in `src/components/mainApp/` follow this pattern:

```typescript
export function ScanTab({
  palette,
  isCompactLayout,
  cameraRef,
  scanState,
  onBarcodeScanned,
  // ... 30+ props
}: {
  palette: Palette;
  isCompactLayout: boolean;
  cameraRef: React.RefObject<CameraView | null>;
  scanState: ScanState;
  onBarcodeScanned: (data: string) => void;
  // ...
}) {
  // Minimal local state (animations, toasts, UI-only)
  const [toastVisible, setToastVisible] = useState(false);
  const toastY = useSharedValue(60);

  return (
    <View>
      {/* JSX */}
    </View>
  );
}
```

**Benefits**:
- Easy to test (pure functions)
- Props are explicit data contract
- Container manages all state

### 2. Container Component (MainAppScreen.tsx)

Manages:
- `ScanRecord[]` (history)
- `AppSettings` (sync'd with AsyncStorage)
- `TemplateRule[]`
- Camera/NFC permissions
- Firebase sync subscriptions

Passes down as props to child components. Child component handlers call back to container via callbacks (e.g., `onBarcodeScanned`).

### 3. Custom Hooks

**`useAuth()`** → `{ user, isLoading, isGuest, login, register, logout, resetPassword, firebase }`

**`useVoiceCommands(handlers)`** → `{ voiceState, lastTranscript, lastCommand, start, stop, toggle }`

**`useCtrlEnterSave(onSave)`** → Keyboard shortcut hook for web

### 4. Navigation Slug System

The app's bottom navigation uses a canonical **Tab** type defined in `src/types.ts`:

```typescript
export type Tab = 'scan' | 'history' | 'notes' | 'settings';

export const TAB_SLUGS: Record<Tab, string> = {
  scan:     'scan',
  history:  'history',
  notes:    'notes',
  settings: 'settings',
};

export const VALID_TABS = new Set<string>(Object.values(TAB_SLUGS));

export function isValidTab(slug: unknown): slug is Tab {
  return typeof slug === 'string' && VALID_TABS.has(slug);
}
```

**Usage**:
- Import `Tab` from `src/types.ts` in tab-aware components (`BottomTabs.tsx`, `MainAppScreen.tsx`)
- Use `isValidTab()` to validate untrusted input (e.g., from voice commands or deep links)
- All internal navigation uses literal Tab values; never construct slugs from user input

### 5. Themed Toolbar Icon Button

**Location**: `src/components/ThemedActionIconButton.tsx`

A reusable animated button component for the ComposerSection toolbar with semantic accent colors, press animations (scale 0.94), and staggered entrance effects.

```typescript
interface ThemedActionIconButtonProps {
  icon: string;              // MaterialCommunityIcons icon name
  label: string;             // accessibilityLabel + tooltip
  accentColor: string;       // Hex color (e.g., '#FF6B35')
  active?: boolean;          // Stronger border + bg tint if true
  disabled?: boolean;        // Reduced opacity if true
  onPress: () => void;
  palette: Palette;          // For background tokens if needed
  compact?: boolean;         // 36px vs 38px size
  entranceDelay?: number;    // Stagger delay in ms
}
```

**Accent Color Map** (ComposerSection):
```typescript
'media' (camera):    '#FF6B35' (warm orange)
'paste' (clipboard): '#F59E0B' (amber)
'dictation' (mic):   '#00D4FF' (cyan)
'ocr':               '#4DA3FF' (soft blue)
'templates' (layers):'#A855F7' (violet)
'save':              '#7CFF6B' (green)
'generate' (magic):  '#EC4899' (pink)
```

**Animations**:
- **Press**: `Animated.spring` scale `1 → 0.94 → 1`, friction 4-5
- **Entrance**: `Animated.timing` opacity `0→1` + translateY `8→0` over 200ms with configurable delay
- Both use `useNativeDriver: false` for Expo web compatibility

**Color Derivation** (from hex accentColor):
```typescript
bg:           `${accentColor}14`   // 8% opacity background
border:       `${accentColor}55`   // 33% opacity border
activeBg:     `${accentColor}28`   // 16% opacity when active
activeBorder: `${accentColor}cc`   // 80% opacity when active
icon:         accentColor           // Full color
```

---

## Data Persistence Layer

### AsyncStorage Keys

| Key | Type | Notes |
|-----|------|-------|
| `@barra_settings` | JSON | AppSettings |
| `@barra_history` | JSON | ScanRecord[] |
| `@barra_templates` | JSON | TemplateRule[] |
| `@barra_notes` | JSON | NoteItem[] |
| `@barra_pending_captures` | JSON | PendingCaptureRecord[] |
| `@barra_deleted_history` | Set | Soft-delete keys |
| `@barra_deleted_notes` | Set | Soft-delete keys |
| `@MyKit_clipboard_v2` | JSON | ClipboardEntry[] |
| `@MyKit_auth_timestamp` | number | Session timestamp (ms) |

### Firebase Firestore Structure

```
users/{uid}/
├── scans/{id}           # ScanRecord mirror
├── notes/{id}           # NoteItem mirror
└── settings/{id}        # Settings backup
```

---

## Testing Strategy

### Test Runner

Custom Node.js runner in `tests/run-tests.ts`:
- No Jest, no React Testing Library
- Direct imports of core modules
- `node:assert` for assertions
- Simple `run(name, fn)` API

### Current Test Coverage

- PI logic (convert, normalize, validate)
- Classification (RITM, REQ, INC, SCTASK, PI, QR)
- Field extraction (templates + fallback)
- Backup export/import roundtrips
- History deduplication

### Adding Tests

1. Add test case in `tests/run-tests.ts`:
   ```typescript
   run("my test", () => {
     const result = myFunction("input");
     assert.equal(result, "expected");
   });
   ```
2. Run: `npm test`
3. Check console output for ✅ PASS / ❌ FAIL

---

## Build & Deployment

### Local Web Build

```bash
npm run build:web
# Outputs to dist/
```

Process:
1. `expo export --platform web` (Expo bundler + static assets)
2. `scripts/inject-pwa.js` (add manifest + apple-touch-icon meta tags)

### CI/CD Workflows

**`.github/workflows/ci.yml`** (on push/PR):
- Node 20 setup
- `npm ci` (clean install)
- `npm run typecheck` (tsc --noEmit)
- `npm test` (continue on error)

**`.github/workflows/deploy-pages.yml`** (on push to main):
- Node 20 setup
- `npm ci`
- Install Expo + Reanimated + Worklets runtimes
- `expo export --platform web`
- PWA metadata injection
- Upload to GitHub Pages

**Env vars for deploy** (set as Secrets):
- All Firebase vars (EXPO_PUBLIC_FIREBASE_*)
- `EXPO_PUBLIC_BASE_PATH: /scan` (GitHub Pages subpath)
- `EXPO_PUBLIC_ENABLE_UPDATES: false`

---

## Performance Considerations

### Optimization Strategies

1. **History Deduplication** (early exit on duplicate)
   - Prevents redundant Firebase writes
   - Reduces storage size

2. **Lazy Loading** (modals, screens)
   - Scan UI loads only when tab is active
   - Reduces initial bundle size

3. **Reanimated Animations** (not Animated.View)
   - Gesture detection on camera
   - Laser animation during scan
   - Toast slide-in/out

4. **AsyncStorage Batching**
   - Load all settings on boot, not on every change
   - Batch history writes (push to array, save once)

5. **Firebase Listeners** (subscription cleanup)
   - Unsubscribe on unmount
   - Single listener per data type (scans, notes, templates)

### Bundle Size Notes

- **jsbarcode**: Barcode generation (loaded on demand, cached)
- **tesseract.js**: OCR for smart notes (large, lazy-loaded)
- **react-native-reanimated**: Animations (included in build)
- **Firebase SDK**: Only loaded if env vars present

---

## Common Development Tasks

### Adding a New Scan Type

1. **Update `classify.ts`**:
   ```typescript
   if (/^NEWTYPE\d+$/.test(upper)) {
     return { profileId: 'auto', type: 'NEWTYPE', normalized: upper, piMode: 'N/A' };
   }
   ```

2. **Add to `types.ts`** (Classified type):
   ```typescript
   type: 'PI' | 'RITM' | 'REQ' | 'INC' | 'SCTASK' | 'QR' | 'NEWTYPE';
   ```

3. **Create display modal** (`src/components/mainApp/NewTypeModal.tsx`):
   ```typescript
   export function NewTypeModal({ visible, code, onClose }: { ... }) {
     return (
       <Modal visible={visible} onRequestClose={onClose}>
         {/* Display NEW_TYPE code */}
       </Modal>
     );
   }
   ```

4. **Wire in `MainAppScreen.tsx`**:
   ```typescript
   {record?.type === 'NEWTYPE' && (
     <NewTypeModal visible={...} code={...} onClose={...} />
   )}
   ```

### Adding Custom Field Extraction

**Option A: Fallback Regex** (`src/core/extract.ts`):
```typescript
const defaults: Record<string, string> = {
  myField: matchFirst(text, /my\s+field\s*[:#-]?\s*(.+)/i),
  // ...
};
```

**Option B: Template UI** (in-app):
- Settings > Templates > Create
- Define regex rules: `myField: (regex)`, `otherField: (regex)`
- Save as `TemplateRule`

### Modifying Layout

1. **Overall structure** → Edit `src/components/mainApp/AppLayout.tsx`
2. **Tab bar** → Edit `src/components/mainApp/BottomTabs.tsx`
3. **Tab content** → Edit `src/components/mainApp/tabs/{Tab}.tsx`
4. **Colors** → Edit `src/theme/colors.ts` or use `palette` prop

### Enabling Firebase Sync

1. Set env vars in `.env` (copy from `.env.example`)
2. Run: `npm run web` (or `npm start`)
3. Auth UI automatically enables if guard passes
4. Scan and check Firestore console for `/users/{uid}/scans`

### Deploying Firestore Rules

1. Edit `firestore.rules` (if exists; or create)
2. Install Firebase CLI: `npm install -g firebase-tools`
3. Authenticate: `firebase login`
4. Deploy: `firebase deploy --only firestore:rules`

---

## Architecture Decisions

### Why Custom Test Runner?

- No Jest/Babel overhead during dev
- Fast TypeScript compilation + node execution
- Direct imports of core logic (no test utils needed)
- Good for testing pure functions (PI logic, classification, extraction)

### Why Soft Deletes?

- Preserves deletion history for recovery
- Syncs between devices (soft-delete sets)
- Simplifies undo/recovery UI

### Why AsyncStorage for Settings?

- Available on all platforms (web, iOS, Android)
- Synchronous reads after initial load
- No external dependencies beyond React Native

### Why Two-Phase Field Extraction?

- **Phase 1 (Templates)**: User-defined, high priority
- **Phase 2 (Fallback)**: Built-in common patterns
- Allows power users to override defaults

### Why Service Layer + Context?

- Separation of Firebase logic (service) from UI (context)
- Testable without mocking React
- Cleaner error handling

---

## Debugging Tips

### 1. Check Diagnostics Logs

```typescript
import { diag } from './core/diagnostics';

diag.info('my.event', { key: 'value' });
diag.error('my.error', { error: String(e) });
```

Check console for output (platform-dependent sink).

### 2. Inspect AsyncStorage

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';

const settings = await AsyncStorage.getItem('@barra_settings');
console.log(JSON.parse(settings || '{}'));
```

### 3. Firebase Rules Testing

- Use Firestore Emulator: `firebase emulators:start`
- Test reads/writes against your rules
- Use Firestore console to inspect documents

### 4. Voice Commands (Web Only)

```typescript
const { voiceState, lastTranscript, lastCommand } = useVoiceCommands({...});
console.log(`State: ${voiceState}, Command: ${lastCommand}, Transcript: ${lastTranscript}`);
```

### 5. Performance Profiling

- React DevTools Profiler (web)
- Expo DevTools (tunnel mode)
- AsyncStorage.getAllKeys() to check storage size

### 6. Offline Testing

- Dev Tools > Network > Offline
- Verify pending captures behavior
- Check sync queue on reconnect

---

## Git Workflow

- Branch from `main`
- Feature branch: `feature/my-feature`
- PR against `main`
- CI runs typecheck + tests
- Deploy to Pages on merge to main

---

---

# 3 Core Flows: Login, Notes & Clipboard

## 1. LOGIN FLOW (Firebase Auth + Session Management)

### Entry Point: `LoginForm.tsx`

The login form is a presentation component with heavy animations (Reanimated) and no business logic.

**Key UI Elements**:
- Username/Email input → normalized to Firebase email via `normalizeIdentifier()`
- Password input (can show/hide via eye icon)
- "Remember session" toggle (saves `savePasswordEncrypted` setting)
- Status dot showing Firebase connectivity
- Guest access button (optional, no auth required)

### Step-by-Step Login Process

#### 1. **User Submits Form** (`handleSignIn()`)
```typescript
const handleSignIn = async () => {
  if (!validate()) { triggerShake(); return; }
  
  setIsLoading(true);
  setAuthError(null);
  try {
    // Call auth service (converts errors to friendly messages)
    await login(firebaseEmail, pin, { persistSession: rememberPassword });
    
    // Persist the username (shows on next login)
    await saveLastIdentifier(username);
    
    // Update settings with remember preference
    const prev = await loadSettings();
    await saveSettings({ ...prev, savePasswordEncrypted: rememberPassword });
  } catch (error) {
    const message = error instanceof Error ? error.message : "...";
    setAuthError(message);
    triggerShake(); // Shake animation
  } finally {
    setIsLoading(false);
  }
};
```

#### 2. **Auth Service Converts to Firebase** (`authService.ts`)
```typescript
export async function login(email: string, password: string, options?: LoginOptions): Promise<User> {
  await diag.info('auth.login.attempt', { emailDomain: getDomain(email) });
  try {
    // Delegates to low-level Firebase helper
    return await loginWithEmail(email, password, { persistSession: true });
  } catch (error) {
    // Maps Firebase codes to friendly user messages
    const friendly = toFriendlyAuthError(error); // "Invalid credentials..."
    await diag.warn('auth.login.error', { reason: friendly });
    throw new Error(friendly);
  }
}
```

**Error Code Mapping**:
- `auth/invalid-email` → "Email format is invalid"
- `auth/user-not-found` → "No account exists with this email"
- `auth/wrong-password` → "Password is incorrect"
- `auth/too-many-requests` → "Too many attempts. Try again in a few minutes"
- `auth/network-request-failed` → "Network error. Check your connection"

#### 3. **Firebase Authentication** (`firebase.ts`)
```typescript
export async function loginWithEmail(
  email: string,
  password: string,
  options?: { persistSession?: boolean }
): Promise<User> {
  const runtime = await getFirebaseRuntimeSnapshot();
  if (!runtime.enabled) throw new Error('Firebase not configured');
  
  // Set persistence strategy
  if (runtime.auth && options?.persistSession) {
    const persistence = Platform.OS === 'web' 
      ? browserLocalPersistence  // Web: stays signed in across tabs
      : undefined;               // React Native: platform-native
    
    if (persistence) {
      await setPersistence(runtime.auth, persistence);
    }
  }
  
  // Firebase sign-in
  const result = await signInWithEmailAndPassword(runtime.auth!, email, password);
  
  return result.user;
}
```

**Persistence Strategies**:
- **Web** (`browserLocalPersistence`): User stays signed in even after closing browser
- **React Native** (`initializeAuth`): Uses platform defaults (device keystore)

#### 4. **Auth Context Updates State** (`authContext.tsx`)
```typescript
useEffect(() => {
  let unsubscribe: (() => void) | undefined;
  let mounted = true;

  const bootstrap = async () => {
    const guard = await getFirebaseGuardState();
    if (mounted) setFirebase(guard);
    
    // Listen to Firebase auth state changes
    unsubscribe = await onFirebaseAuthState((nextUser) => {
      if (!mounted) return;
      
      if (!nextUser) {
        setUser(null);
        setIsLoading(false);
        return;
      }
      
      // User exists: check session expiry
      const appSettings = await loadSettings();
      const staySignedIn = appSettings.staySignedIn ?? true;
      const lastAuthTs = await loadLastAuthTimestamp();
      const sessionExpired = lastAuthTs > 0 && Date.now() - lastAuthTs > SESSION_MAX_AGE_MS;
      
      if (!staySignedIn || sessionExpired) {
        // Expired: force re-auth
        await logout().catch(() => undefined);
        await clearLastAuthTimestamp();
        if (mounted) {
          setUser(null);
          setIsLoading(false);
        }
        return;
      }
      
      // Extend 15-day session window
      await saveLastAuthTimestamp(Date.now());
      
      setUser(nextUser);
      setIsLoading(false);
    });
  };
  
  void bootstrap();
  return () => {
    mounted = false;
    unsubscribe?.();
  };
}, []);
```

#### 5. **Session Management**
- **Timestamp Storage**: `@MyKit_auth_timestamp` (milliseconds)
- **Window**: 15 days (1,296,000,000 ms)
- **Reset On**: Every auth state change (extends the window)
- **Clear On**: Manual logout, `staySignedIn: false`, or 15-day expiry

---

## 2. NOTES SYSTEM (Full-Featured Note Taking)

### Data Model (`src/core/notes.ts`)

**NoteItem**:
```typescript
export interface NoteItem {
  id: string;
  kind: 'text' | 'image';
  category: 'general' | 'work';
  title?: string;
  text: string;
  groupId?: string;                  // For shared group notes
  color?: 'default' | 'amber' | 'mint' | 'sky' | 'rose';
  archived?: boolean;
  imageBase64?: string;               // For image notes
  imageMimeType?: string;
  attachments?: string[];             // URLs or file references
  versions?: NoteVersion[];            // Version history (max 12)
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;                 // Soft delete
}
```

### Creating a Note: `addNoteUnique(text, category)`

**Process**:
1. Trim input text
2. Load existing notes
3. Check for duplicates (normalized text comparison)
4. If duplicate → return existing, `inserted: false`
5. If new → create `NoteItem` with auto-generated ID:
   ```typescript
   const now = Date.now();
   const next: NoteItem[] = [
     {
       id: makeId('note'),           // "note_{timestamp}_{random}"
       kind: 'text',
       category,
       text: trimmed,
       pinned: false,
       createdAt: now,
       updatedAt: now,
     },
     ...current,
   ];
   ```
6. Save to AsyncStorage (`@barra_notes_v1`)
7. Sync to Firebase if authenticated (`pushNoteIfAuthenticated()`)
8. Return `{ notes, inserted: true }`

### Note Operations

#### Creating Rich Notes (with attachments)
```typescript
export async function addRichNoteUnique(
  text: string,
  category: NoteCategory = 'general',
  attachments: string[] = [],
  groupId?: string,
): Promise<{ notes: NoteItem[]; inserted: boolean }>
```
- Accepts text + multiple attachment URLs
- Max 8 attachments per note
- Can be associated with a group for sharing

#### Creating Image Notes
```typescript
export async function addImageNoteUnique(
  dataUri: string,
  title = 'Screenshot capture'
): Promise<{ notes: NoteItem[]; inserted: boolean }>
```
- Accepts `data:image/*;base64,...` format
- Extracts MIME type and base64 data
- Deduplicates by base64 content
- Useful for screenshots, receipts, etc.

#### Editing Notes
```typescript
export async function updateNoteText(id: string, text: string)
```
- Creates a **version** of the current note before updating
- Versions stored in `versions` array (max 12)
- Each version has `id`, `title`, `text`, `createdAt`
- Allows rollback to any previous version

#### Version Management
```typescript
export async function createBranchFromNoteVersion(noteId: string, versionId?: string)
// Creates a NEW note from an old version (doesn't replace current)

export async function mergeNoteVersion(noteId: string, versionId: string)
// Restores the note to a specific version (pushes current to versions first)
```

#### Other Operations
- `togglePinned(id)` — Pin/unpin a note (pinned notes sort first)
- `toggleArchived(id)` — Archive notes (hidden unless explicitly shown)
- `setNoteColor(id, color)` — Color-code for visual organization
- `removeNote(id)` — Soft delete (tracked in `noteDeletions`)
- `clearNotes()` — Clear all (also clears cloud)

### Smart Note Detection (`smartNotes.ts`)

Automatically parses note content for structured data:

```typescript
export function detectNoteEntities(text: string, settings: AppSettings): SmartNoteEntities {
  // Detects and extracts:
  // - IP addresses (regex configurable)
  // - Hostnames (pattern: IPOLBRUP*, P##[A-Z]*)
  // - PI codes (02PI*)
  // - Office names (from settings)
  
  return {
    type: 'network' | 'device' | 'office' | 'asset' | 'general',
    ip: [],
    hostname: [],
    office: [],
    pi: [],
  };
}
```

### List & Checklist Detection
```typescript
export function buildSmartNoteModel(text: string, entities: SmartNoteEntities): SmartNoteModel
```
- Detects checklists: `[x] Item`, `[ ] Item`
- Detects bullet lists: `- Item`, `* Item`
- Detects numbered lists: `1. Item`, `1) Item`
- Min 60% of lines must be list items to be detected as list
- Returns `items` array with `text`, `checked`, `kind`

### ServiceNow Field Parsing
```typescript
export function parseServiceNowFields(text: string): ServiceNowModel
```
Parses OCR'd ServiceNow tickets in format:
```
Field Label | Value
Another Field | Value
---
Footer text
```
- Cleans OCR noise (parentheses, symbols, etc.)
- Normalizes labels to keys (`affected_end_user`)
- Separates fields, free text, and footer
- Detects sensitive fields (`affected_end_user`, `phone`, etc.)

### Persistence & Sync

**Storage**:
- AsyncStorage key: `@barra_notes_v1`
- Max 3000 notes per device
- Soft deletes tracked in `@barra_deleted_notes`

**Firestore** (if authenticated):
- Path: `/users/{uid}/notes/{id}`
- Bidirectional sync on login/logout
- Group notes can be shared: `/sharedGroups/{groupId}/notes/{id}`

### Smart Type Detection (`smartNoteWorkflows.ts` + `smartNotes.ts`)

Automatically classifies notes into smart workflow types: `medication`, `shopping`, `reminder`, `task`, or `none`.

**Auto-Detection on Creation**:
```typescript
const { notes, inserted } = await addRichNoteUnique(
  text,
  'health',
  [],
  undefined,
  true  // autoDetectSmartType: detects smartType from content
);
```

**Detection Algorithm**:
1. **Medication** (≥ 0.65 confidence):
   - Detects direct medication names from EU medication database
   - Multilingual keywords: `took`, `tomé`, `pris`, plus dose/time patterns
   - Blocks false positives from health contexts (doctor, pharmacy, hospital)
   - Generates `WorkflowMetadata` with dose, time, reason, follow-up

2. **Shopping** (≥ 0.65 confidence):
   - Uses grocery catalog for item detection
   - Health keywords block classification (prevents medication notes from being shopping lists)
   - Time patterns (HH:MM, HH:MM AM/PM) exclude quantity detection
   - Multilingual support: English, Spanish, French

3. **Reminder** (≥ 0.65 confidence):
   - Keywords: `remind`, `recordar`, `rappel`
   - Boosts on future references: `tomorrow`, `mañana`, `demain`

4. **Task** (≥ 0.65 confidence):
   - Keywords: `task`, `tarea`, `tâche`
   - Detects `todo` style items

**Detection Optimization**:
- Uses Trie data structure for O(1) keyword matching (vs. O(n) linear search)
- Confidence scoring: Base + keyword matches + pattern matches
- Caching via `useMemo` in NoteCard for render optimization

**Example**: Medication Note with Follow-up
```typescript
const result = await addRichNoteUnique(
  'Tomé ibuprofeno 400mg a las 8:00 por dolor de cabeza',
  'health'
);
// Automatically detects: smartType='medication'
// Metadata: { medicationName: 'ibuprofen', doseText: '400mg', takenAtText: '8:00', reason: 'headache' }
```

**Updating Smart Type Post-Creation**:
```typescript
export async function updateNoteSmartType(
  id: string,
  smartType: SmartWorkflowType,
  workflowStatus?: WorkflowStatus,
  workflowMetadata?: WorkflowMetadata
): Promise<NoteItem[]>
```
- Sets `smartType`, `workflowStatus`, `workflowMetadata` on existing note
- Syncs to Firestore if authenticated
- Used by medication follow-up flow to set metadata after note creation

**Content Rendering** (`NoteContentRenderer.tsx`):
Centralized component that renders notes based on smartType:
1. Medication → `MedicationCard` (event/reminder UI — see below)
2. Shopping → `ShoppingListBlock` (with editable items)
3. List-like → `NoteListBlock` (checkboxes, bullets, numbered)
4. Default → Plain text

`NoteContentRenderer` passes `note.text` and `expanded` into `MedicationCard` so it can parse multi-med follow-up notes that only have a single `medicationName` in their stored metadata.

**Medication card as cyclic event/reminder** (`MedicationCard.tsx`):
Each medication in a follow-up note is rendered as **its own independent reminder row** with its own `[Taken] [Snooze] [Dismiss]` actions. There is no "global" or "focused" action that could affect the wrong medication. Single-medication notes use the same row layout (no special focus/secondary split).
- Top label: `MEDICATION REMINDER` or `N MEDICATION REMINDERS` (and `SNOOZED REMINDER` if all active meds are snoozed).
- Per-row content (one per medication):
  - Name + dose chip + per-row badge (`SNOOZED` / `CANCELLED` if applicable).
  - `Next suggested · HH:mm` or `Follow prescription schedule`.
  - Countdown (color-coded: safe green / warn amber / due amber / overdue red / snoozed violet).
  - Subtle taken meta: `Taken HH:mm · dose 500 mg` (uses the **user-entered dose label**; never a fabricated "dose 12" count).
  - Inline action row: green `Taken`, violet outline `Snooze`, plain outline `Dismiss`.
  - Snooze opens an inline `+10m / +30m / +1h` picker scoped to that row.
  - Dismiss opens an inline confirmation row scoped to that row.
- When *all* medications are dismissed, the whole card collapses to an `All reminders dismissed` placeholder; the note itself is never deleted.

**Cycle data model** (`src/core/notes.ts`):
- Time row: `Next suggested · HH:mm` or `Follow prescription schedule`.
- Prominent countdown block: `in 2h 10m` / `Due now` / `Overdue 35m` / `Snoozed · in 25m`, color-coded:
  - safe (>30m away): green `#22c55e`
  - warn (≤30m away): amber `#f59e0b`
  - due (±60s): amber `Due now`
  - danger (overdue): red `#ef4444`
  - snoozed: violet `#A970FF`
- Secondary meds list ("Also today") — tappable rows switch focus; rows show snoozed/dismissed icons inline.
- Subtle footer: `Taken HH:mm · dose N` (always when present), `Reason: …` (expanded only), `safetyNote` (expanded only).
- Cyclic actions:
  - **Taken** (green primary) → resets the cycle: `takenAt = now`, `nextSuggestedAt = now + recommendedIntervalHours·3600000`. If the medication has no `recommendedIntervalHours`, falls back to `Follow prescription schedule` (no invented intervals — important for antibiotics and meds without a fixed cadence).
  - **Snooze** → inline picker with `+10m`, `+30m`, `+1h`. Sets med status to `snoozed`, shifts `nextSuggestedAt = now + snoozeMs`, the countdown updates immediately.
  - **Dismiss** → inline confirmation ("Dismiss this reminder? The note stays saved.") before calling `dismissMedication`. Marks the focused med's status as `dismissed` *without* deleting the note.

All three actions affect only the focused/selected medication — never the whole batch.

**Cycle data model** (`src/core/notes.ts`):
- `WorkflowStatus` extended to include `'snoozed'` (alongside `draft | active | completed | dismissed`).
- `MedicationCycleEntry`: `{ name, dose?, takenAt?, lastTakenAt?, nextSuggestedAt?, snoozedUntil?, lastActionAt?, recommendedIntervalHours?, minimumIntervalHours?, followPrescription?, status?: 'active'|'snoozed'|'dismissed', safetyNote? }`. `dose` is **never** mutated by the cycle helpers — it only changes when the user edits it manually.
- `WorkflowMetadata.medications?: MedicationCycleEntry[]` is now persisted on the note (was previously dropped after creation).
- Note-level `workflowStatus` is derived from per-med statuses by `deriveNoteStatusFromMeds`: any active → `active`; all dismissed → `dismissed`; otherwise `snoozed`.
- `syncMetadataFromMeds` keeps top-level shortcuts (`medicationName`, `doseText`, `followUpAt`, `takenAt`) aligned with the focused (nearest active/snoozed) med so legacy consumers keep working.

**New cycle helpers** (`src/core/notes.ts`) — each operates on a **single medIndex** and never touches sibling medications:
- `markMedicationTaken(noteId, medIndex, takenAt = Date.now())` — sets `takenAt = lastTakenAt = takenAt`, recalculates `nextSuggestedAt` from `recommendedIntervalHours` (or sets `followPrescription` when no interval is configured — no invented intervals), clears `snoozedUntil`, sets `status = 'active'`, updates `lastActionAt`. **Does not touch `dose`.**
- `snoozeMedication(noteId, medIndex, snoozeMs)` — sets `snoozedUntil = nextSuggestedAt = now + snoozeMs`, `status = 'snoozed'`, updates `lastActionAt`. `takenAt` is preserved. Clamps `snoozeMs >= 60s`.
- `dismissMedication(noteId, medIndex)` — sets med `status = 'dismissed'`, clears `nextSuggestedAt` and `snoozedUntil`, updates `lastActionAt`. For legacy notes without a `medications` array, falls back to setting note `workflowStatus = 'dismissed'`.
- All three reuse a shared `persistNoteMutation(id, mutate)` helper that loads → mutates → saves → pushes to Firebase (or falls back to shared-group upsert).

**Datetime UX in `MedicationWorkflowModal`**:
- `Taken at` is no longer a manual `YYYY-MM-DD HH:mm` string. On web it renders a native `<input type="datetime-local">` (via `React.createElement` to bypass RN-Web TextInput limits); on native it falls back to a tolerant `TextInput`.
- Quick presets below the picker: `Now`, `1h ago`, `4h ago`, `6h ago` (interpreted as offsets from now).
- Internally `takenAtMs` is held as a number, persisted on each `MedicationCycleEntry` as `takenAt` (ms epoch) and as ISO via `takenAtIso` for legacy consumers; the human-readable string `takenAtText` is also written for backward compatibility.

**Reminder scheduling integration**:
`NotesTab.handleMedicationTaken` reschedules the reminder for the new `nextSuggestedAt` after a Taken action; `handleMedicationSnooze` reschedules to the snoozed time; `handleMedicationDismissCycle` calls `dismissReminder` so the reminders panel stops surfacing it.

**Backwards compatibility**:
- Notes created before the cycle work have no `medications[]` array. `resolveMedications` in the card synthesizes one entry from `metadata.medicationName/doseText/takenAt/followUpAt` if present, else falls back to `parseLegacyMedicationNote` which parses the legacy note text format (`{name} · {dose} · Next suggested HH:MM`).
- The legacy `onMedicationComplete` / `onMedicationDismiss` path on `NoteContentRenderer` is preserved; the new `onTaken` / `onSnooze` / `onDismissCycle` callbacks take precedence when wired.
- Legacy `'completed'` status still renders the green "Completed" placeholder (no auto-completion in the new flow — Taken keeps the card active).

**Constraints preserved**:
- Swipe actions (Remind / Archive / Delete) and footer actions (Copy / Edit / Duplicate / Pin) live at the `NoteCard` level. The redesigned medication card only replaces the card *content*; all gestures, sync, offline queue and selection mode remain intact.
- No new dependencies. Theme tokens reused (`surface`, `border`, `textPrimary`, `textBody`, `textDim`, `textMuted`) plus the existing `#4DA3FF` (medication accent) and `#A970FF` (snoozed/device accent — already in palette via `typeMeta`).
- Mobile-first; flex rows wrap cleanly on desktop. Inline confirmations / snooze picker reuse the card body so the bottom navigation is never overlapped.
- Defensive parsing: `safeStr`, `Number.isFinite` checks on every timestamp, hour/minute bounds, `clampMedIndex` for selection, `ensureMedicationsList` for legacy notes — no `undefined.trim()` paths.

**Tests** (run with `npm run typecheck` + `npm test`):
- Existing test suite (23/23 ✅) including smart-type detection, shopping list parsing, classify/extract/PI, backup roundtrip — all green after the refactor.
- Manual verification (no UI test harness in repo):
  - create follow-up: modal saves `medications[]` with proper `takenAt` ms + ISO; note shows on the list.
  - datetime picker: web shows native `datetime-local`; native shows tolerant `TextInput`; quick buttons set `takenAt = now − offset`.
  - Taken: `markMedicationTaken` → fresh `nextSuggestedAt`, card stays active, countdown re-renders, reminder rescheduled.
  - Snooze: `+10m / +30m / +1h` shifts `nextSuggestedAt`, countdown immediately reflects, label switches to `Snoozed · in …`.
  - Dismiss: confirmation row appears first; confirming sets med `status = 'dismissed'`, card greys out and shows "Reminder cancelled" once *all* meds are dismissed; the underlying note is not deleted (Copy / Edit / Archive / Delete remain available).
  - Multi-medication: secondary rows tappable to switch focus; per-med actions (only the focused med advances/snoozes/dismisses); pager `i/N` reflects selection.
  - Old notes: notes without `medications[]` still render — `parseLegacyMedicationNote` reconstructs from text + top-level metadata, and the legacy complete/dismiss callbacks still work.

**Health Keyword Blockers**:
Prevents medication/doctor/health notes from being misclassified as shopping lists:
- **English**: `health`, `doctor`, `pharmacy`, `medication`, `ibuprofen`, `aspirin`, etc. (60+ keywords)
- **Spanish**: `salud`, `médico`, `farmacia`, `medicamento`, `ibuprofeno`, `aspirina`, etc.
- **French**: `santé`, `docteur`, `pharmacie`, `médicament`, `ibuprofène`, etc.

---

## 3. CLIPBOARD SYSTEM (Continuous Monitoring + Dedup)

### Architecture

The clipboard system runs as a background service (`ClipboardEngine.ts`) on web and React Native, monitoring the system clipboard for new content.

### Data Model (`clipboard.types.ts`)

```typescript
export interface ClipboardEntry {
  id: string;                    // "clip_{timestamp}_{random}"
  kind: 'text' | 'image';
  content: string;               // Text or base64 image
  category: 'url' | 'servicenow' | 'email' | 'code' | 'general';
  source: 'paste' | 'copy' | 'focus' | 'poll' | 'manual';
  capturedAt: number;            // Timestamp
  sig: string;                   // Dedup signature
  imageDataUri?: string;         // For image entries
}
```

### Deduplication Strategy

**Signature Generation**:
```typescript
export function signature(content: string): string {
  let h = 0;
  const limit = Math.min(content.length, 200);
  for (let i = 0; i < limit; i += 1) {
    h = (h * 31 + content.charCodeAt(i)) & 0x7fffffff;
  }
  return `${content.length}:${h}`;  // e.g., "45:1234567890"
}
```

**Dedup Logic**:
```typescript
export function isDuplicate(sig: string): boolean {
  const last = recentSigs.get(sig);
  if (!last) return false;
  return now() - last < DEDUP_WINDOW_MS;  // 8 seconds
}
```

- Tracks recent signatures in memory map
- 8-second dedup window (same content pasted twice = duplicate)
- Signatures expire after 30 seconds (cleanup)
- Prevents duplicate entries from rapid copy/paste

### Classification

```typescript
export function classify(text: string): ClipCategory {
  if (/^https?:\/\//i.test(text)) return 'url';
  if (/\b(INC|RITM|SCTASK|REQ)\d{7}/i.test(text)) return 'servicenow';
  if (/\S+@\S+\.\S+/.test(text)) return 'email';
  if (/\n.*[{};=><]/.test(text) || text.split('\n').length > 4) return 'code';
  return 'general';
}
```

**Categories**:
- `url`: HTTP/HTTPS links
- `servicenow`: Ticket codes (INC, RITM, SCTASK, REQ with 7+ digits)
- `email`: Email addresses
- `code`: Multiline or contains code-like characters
- `general`: Everything else

### Clipboard Engine Lifecycle (`ClipboardEngine.ts`)

#### 1. **Initialization**: `startClipboardEngine()`
```typescript
export async function startClipboardEngine(): Promise<void> {
  if (Platform.OS === 'web') {
    // Web: use Permissions API to check clipboard-read access
    const perm = await getClipboardPermission();
    if (perm === 'prompt') { /* Ask user */ }
    if (perm === 'denied') { return; } // Can't access clipboard
    
    // Poll system clipboard on interval
    startClipboardPoll(); // Every ~1.2 seconds
  } else {
    // React Native: use Expo clipboard API
    startClipboardPoll();
  }
  
  // Subscribe to state changes
  subscribeClipboardEntries((entries) => {
    // Notify listeners (UI components)
  });
}
```

#### 2. **Polling** (Platform Differences)

**Web**:
```typescript
async function readClipboardText(): Promise<string> {
  if (navigator.clipboard?.readText) {
    try {
      return await navigator.clipboard.readText();
    } catch {
      return '';
    }
  }
  return '';
}
```
- Uses Permissions API (`navigator.permissions.query`)
- Requires user permission (browser dialog)
- Graceful fallback if permission denied

**React Native** (Expo):
```typescript
// In non-web:
import * as Clipboard from 'expo-clipboard';
const text = await Clipboard.getStringAsync();
```
- No permission dialog needed
- Direct read from device clipboard

#### 3. **Entry Processing**

```typescript
async function captureClipboardNow(): Promise<void> {
  const text = await readClipboardText();
  if (!text) return;
  
  const normalized = normalizeText(text);
  if (!normalized) return; // Too short or too long
  
  const sig = signature(normalized);
  if (isDuplicate(sig)) return; // Within 8-second window
  
  const entry = toEntry({
    content: normalized,
    kind: 'text',
    source: 'paste',  // Or 'poll', 'copy', etc.
    sig,
  });
  
  if (!entry) return;
  
  // Check for duplicate content (not just signature)
  const current = await loadClipboardEntries();
  if (isDuplicateContent(current, entry)) return;
  
  // Add to history
  await addClipboardEntryUnique(entry);
  
  // Sync to Firebase if authenticated
  await syncClipboardWithFirebase([entry]);
}
```

#### 4. **Storage & Limits**

- AsyncStorage key: `@MyKit_clipboard_v2`
- Max 3000 entries per device
- Sorted by `capturedAt` (newest first)
- Text entries deduped on save

#### 5. **Firebase Sync** (if authenticated)

```typescript
export async function syncClipboardWithFirebase(entries: ClipboardEntry[]): Promise<void> {
  for (const entry of entries) {
    try {
      await upsertClipboardEntryInFirebase(entry);
    } catch (error) {
      // Silently fail (non-critical)
    }
  }
}
```

- Path: `/users/{uid}/clipboard/{id}`
- Bidirectional merge on auth changes
- Can be toggled off via `clipboardCloudSync` setting

### Web-Specific Cleanup (`dataSync.ts`)

Clipboard sync uses browser storage that needs cleanup:

```typescript
// Clear cookies
export function clearDomainCookies(filter?: string): void {}

// Clear Cache Storage (PWA)
export async function clearCacheStorage(filter?: string): Promise<void> {}

// Clear localStorage
export function clearAppLocalStorage(keyFilter?: string): void {}

// Clear IndexedDB
export async function deleteIndexedDB(dbName: string): Promise<void> {}
```

Useful for:
- Privacy cleanup on logout
- Removing old clipboard data
- Clearing browser caches

### Clipboard in MainAppScreen

Integration in the main app (`MainAppScreen.tsx`):

```typescript
// Load clipboard entries on boot
useEffect(() => {
  const loadClipboard = async () => {
    const entries = await loadClipboardEntries();
    // Display in clipboard tab/modal
  };
  loadClipboard();
}, []);

// Start monitoring
useEffect(() => {
  void startClipboardEngine();
  return () => stopClipboardEngine();
}, []);

// Listen to updates
useEffect(() => {
  const unsubscribe = subscribeClipboardEntries((entries) => {
    // Update UI
  });
  return unsubscribe;
}, []);
```

---

## Project Metadata

- **Name**: MyKit
- **Main Platform**: Expo/React Native
- **Build Tool**: Expo CLI
- **Language**: TypeScript (strict mode)
- **Auth**: Firebase Auth + AsyncStorage
- **Database**: Firestore (optional)
- **Deployment**: GitHub Pages (web) + EAS (mobile)
- **Node Version**: 20+
