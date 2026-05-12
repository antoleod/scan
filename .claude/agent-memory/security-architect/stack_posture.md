---
name: stack-posture
description: MyKit security posture summary — what the architecture covers well, what's structurally weak, useful for triaging future review requests
metadata:
  type: project
---

MyKit is a client-heavy Expo RN + Firebase app deployed to GitHub Pages (web), Android, iOS. Server-side logic lives in Firestore rules and a tiny `functions/index.js`. Most data flows are client → Firestore (via per-user paths and rules).

**Why this matters:** Security review priorities differ from typical web apps. The threat model is: (a) the Firestore rules layer is THE main authorization boundary, (b) the client bundle is fully public (anyone can read it), (c) any "cloud function" or callable that takes credentials must be airtight because it's the smallest server surface.

**How to apply when scoping reviews:**
- Always read `firestore.rules` first. Field-level `hasOnlyKeys` allowlists matter — the data layer mirrors the rules layer.
- When client code writes to a path, cross-check rule allowlist matches the payload (`sanitizeNoteForFirestore` style functions are the canonical reference). Schema drift between rules and code is the most common bug.
- For each Cloud Function, check: auth required? rate limit global or per-instance? PII in logs? secrets via env or Secret Manager?
- For each AsyncStorage key, ask: cleared on logout? synced to cloud? encrypted at rest?
- `EXPO_PUBLIC_*` vars are always public — never flag the Firebase web API key as a finding; it's by design.
- Firebase Auth handles credential storage; the app does NOT store passwords locally (legacy key explicitly cleared).
