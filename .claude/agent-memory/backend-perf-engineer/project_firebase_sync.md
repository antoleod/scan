---
name: Firebase Sync Architecture
description: Firestore cross-device sync design, confirmed bugs, and fixes for MyKit scan/notes sync
type: project
---

Cross-device sync uses `subscribeToScans` (firebase.ts:467) mounting a Firestore `onSnapshot` listener.
The listener is only started when `user && persistenceMode === 'firebase'` (MainAppScreen.tsx:1152-1153).

**Confirmed bugs (2026-05-08)**:

1. **Race condition — `user` before `persistenceMode`**: `user` comes from `useAuth()` (authContext),
   `persistenceMode` is set inside the boot `useEffect` (line 345-346). If auth state resolves before
   boot completes, the sync `useEffect` fires with `persistenceMode === 'local'` and returns early.
   The effect deps are `[user?.uid, persistenceMode]` so it re-runs when mode finally changes — but
   the `subscribeToScans` promise is async and the `cancelled` flag may already flip if the component
   re-renders between the promise start and its `.then()`.

2. **Timestamp type mismatch (H2 confirmed)**: Scans are written with `serverTimestamp()` (line 418),
   which becomes a Firestore `Timestamp` object when read back. The merge at line 1175 does
   `Number(s.updatedAt ?? 0)` — `Number(Timestamp)` returns `NaN`, so `serverTs > localTs` is always
   false. Server records with `serverTimestamp` updatedAt are never treated as "newer" than local.
   Fix: use `s.updatedAt?.toMillis?.() ?? Number(s.updatedAt ?? 0)`.

3. **Notes sync missing from subscribeToNotes**: `subscribeToNotes` is defined in firebase.ts but
   NOT imported or used in MainAppScreen.tsx. Notes real-time sync is absent; only scans get the
   onSnapshot listener. Notes rely on `fetchNotesFromFirebase()` inside `syncNow()` (manual/periodic).

**Why:** - **How to apply:** Always use `.toMillis()` for Firestore Timestamp comparisons.
Keep `persistenceMode` derivation tight to avoid the race (see project fix roadmap).
