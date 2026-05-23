---
name: project-firebase-rtdb-audit
description: RTDB security rules audit findings for AirDrop + imageSync; deploy-blocking issues identified May 2026
metadata:
  type: project
---

Audited `database.rules.json` against all RTDB path usage in the codebase (2026-05-23).

**Why:** User preparing to deploy RTDB rules; suspected invisible bugs in AirDrop same-account download path and Notes image sync.

**Key findings:**
- `.validate` on `airdrop/users/$uid/shares/$sessionId` requires `['sessionId','token','hostPeerId','fileName','expiresAt']` but `publishMyShare` also writes `_srv` (serverTimestamp). RTDB validate does NOT block extra fields — this is fine.
- `.validate` on `users/$uid/pendingImages/$imageId` requires `['data','uploadedAt']` but `uploadImageToRTDB` writes `{data, uploadedAt, expiresAt}`. Extra field is fine — validate only checks required fields exist.
- `deleteImageFromRTDB` uses `remove()` (writes null). RTDB rules: write permission granted by `.write` on parent; `.validate` only runs on non-null writes. Delete (null write) bypasses `.validate` — safe.
- CRITICAL: `resolveRtdbImage(path, deleteAfterDownload=true)` deletes from RTDB after first device downloads. Second device of same account gets null. Data-loss on multi-device scenarios.
- `onFirebaseAuthState` return type is `Unsubscribe | (() => {})`. `useUserSharePresence` casts it as `() => void` — works fine; both forms are callable.
- Token in signaling (`/airdrop/sessions`) is NOT verified server-side; it's present in UserShare but joinSession only passes it through. Anyone who knows/guesses sessionId can inject signals. Cosmetic for v1 given random 10-char sessionId.
- Session expiry via `tick()` → `teardown()` → `clearMyShare()` is correctly wired. No orphan path on normal expiry.
- App close / page reload mid-share: RTDB entry at `airdrop/users/$uid/shares/$sessionId` is NOT cleaned up (no onDisconnect handler). Stale entry persists until TTL expiry shows it as expired client-side.

**How to apply:** Reference this when the user asks about RTDB rules, imageSync multi-device sync, or AirDrop security hardening.
