---
name: rtdb-rules-tracked-but-weak
description: database.rules.json IS now git-tracked, but airdrop/sessions is fully public (.read/.write true) with no per-uid scoping or payload validation
metadata:
  type: project
---

`database.rules.json` (the RTDB security rules) is wired into `firebase.json` and is now version-controlled (`git ls-files database.rules.json` returns it, as of 2026-05-23). The earlier concern that it was untracked is resolved.

**Current weakness (still open):** the `airdrop/sessions/$sessionId` subtree has `.read: true` and `.write: true` — fully public to unauthenticated clients. There is no `auth.uid` scoping on the signaling room, no per-message size cap, and no auto-expiry. Authorization is enforced only in the *client* (`isPresenceAuthorized` token gate in sessionService.ts), which is bypassable by anyone speaking RTDB directly. The `airdrop/users/$uid` and `users/$uid/pendingImages` subtrees ARE correctly locked to `auth.uid === $uid`.

**Why it matters:** unauthenticated write to `airdrop/sessions/**` allows RTDB quota DoS (SDP/ICE flooding), signaling-room pollution, and offer-injection MITM attempts. Defense-in-depth requires server-side `.validate` size limits and (ideally) `auth != null` on writes, not just client-side token checks.

**How to apply:** when assessing AirDrop / RTDB posture, treat the public sessions room as the top finding. Recommend `.validate` byte caps on `sdp`/`candidate`, `auth != null` write gating, and an `expiresAt`/`_srv` based cleanup. See [[airdrop-signaling-review]].
