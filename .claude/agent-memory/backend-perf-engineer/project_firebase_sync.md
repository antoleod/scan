---
name: Firebase Sync Architecture
description: Firestore cross-device sync design, confirmed bugs, and fixes for MyKit scan/notes sync
type: project
---

Cross-device sync uses `subscribeToScans` (firebase.ts:529) and `subscribeToNotes` (firebase.ts:568)
mounting Firestore `onSnapshot` listeners. Notes are subscribed in NotesTab.tsx; scans in MainAppScreen.tsx.

**Confirmed bugs (2026-05-08, refreshed 2026-05-23)**:

1. **Race condition — `user` before `persistenceMode`**: `user` comes from `useAuth()` (authContext),
   `persistenceMode` is set inside the boot `useEffect`. If auth state resolves before boot completes,
   the sync `useEffect` fires with `persistenceMode === 'local'` and returns early.

2. **Timestamp NaN on merge (scans)**: Scans are written with `serverTimestamp()`. The merge at
   MainAppScreen.tsx:1198 does `Number(s.updatedAt ?? 0)` — `Number(Timestamp)` returns `NaN`, so
   `serverTs > localTs` is always false. Fix: use the local `tsMillis()` helper already defined at line 1175.
   BUG: `tsMillis` IS defined locally but the `serverTs` computation at line 1198 uses
   `tsMillis(s.updatedAt)` — verify whether `tsMillis` is actually applied there or `Number()` is used.

3. **Logout wipes wrong deletion-key AsyncStorage keys**: authContext.tsx:275-276 clears
   `@barra_deleted_notes` and `@barra_deleted_history` but the real keys used by the deletion modules are
   `@barra_deleted_note_keys_v1` and `@barra_deleted_history_keys_v1`. Those are NEVER wiped on logout.
   Additionally `noteDeletions.ts` has an in-memory `cachedKeys` that survives across logout — tombstones
   from User A bleed into a new User B session on the same device.

4. **`subscribeToNotes` does not filter soft-deletes**: The callback at firebase.ts:602 maps server docs
   to NoteItem but does NOT cross-check `loadDeletedNoteKeys()`. A deleted note reappears on the next
   real-time snapshot until the tombstone batch completes.

5. **`addHistoryUnique` has no write lock** (history.ts:71): Two rapid scans race on AsyncStorage.
   `historyDeletions.ts` also lacks an in-memory cache, causing one cold AsyncStorage read per `loadHistory()`.

6. **Offline queue replays stale snapshot**: `enqueueOperation` stores the NoteItem payload at enqueue
   time. If the note is edited while offline and then the queue flushes, the stale version overwrites the
   edited one in Firestore. No queue exists for scan failures.

**Why/How to apply:** Reference when reviewing any PR touching firebase.ts, notes.ts, history.ts,
offlineQueue.ts, or authContext.tsx. Always use `.toMillis()` for Firestore Timestamp comparisons.
