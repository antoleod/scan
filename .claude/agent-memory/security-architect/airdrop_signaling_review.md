---
name: airdrop-signaling-review
description: AirDrop P2P signaling security findings — public RTDB sessions, unenforced pairing token, low-entropy sessionId
metadata:
  type: project
---

AirDrop P2P file-sharing feature (`src/features/airdrop/`) uses Firebase RTDB for WebRTC signaling. Reviewed 2026-05-23 before first prod deploy of `database.rules.json`.

**Core design:** `/airdrop/sessions/$sessionId` is intentionally PUBLIC (`.read:true, .write:true`, ShareDrop model). File bytes flow P2P over WebRTC DTLS, never through Firebase. `/airdrop/users/$uid/shares` and `users/$uid/pendingImages` are owner-locked (correct). firestore.rules reviewed clean (catch-all deny, owner-scoped, usernames doc is PII-free by design).

**CRITICAL — pairing `token` is decorative.** The per-session `token` (10 chars, ~2^50, generated in `utils/ids.ts`) is generated, put in the QR, and passed to `joinSession`, but is NEVER compared anywhere. `handleHostSignal` in `sessions/sessionService.ts` reacts to ANY `presence` frame and immediately sends a WebRTC offer — no `msg.token === session.token` check. Combined with public read+write, anyone who learns/guesses a sessionId can hijack/MITM the session. **Why it matters:** signaling is the auth boundary for the P2P session; DTLS only protects the channel AFTER negotiation, it doesn't authenticate WHO you negotiated with.
**How to apply:** if reviewing/changing AirDrop pairing, confirm the token is enforced host-side before trusting any "it's secure because P2P" claim. The same-account auto-accept path (`joinUserShare`) makes this worse — it auto-saves whatever file the peer offers.

**HIGH — sessionId entropy is ~2^20.** `generateSessionId()` = `ssn_{Date.now() base36}_{generateToken(4)}`. Only 4 random chars (32^4); timestamp is predictable. With public read, rooms are enumerable. The 50-bit token would fix this IF enforced. `randomBytes` falls back to `Math.random()` if no CSPRNG (ids.ts).

**HIGH — unbounded anonymous writes** to `/airdrop/sessions/*` (cost/DoS/storage). No server-side TTL reaper; `expiresAt` is client-side only. `.validate` on `signals/$pushId` is shape-only (3 keys), bypassable via sibling paths, and is NOT access control.

**Deploy verdict given:** NOT safe as-is. Minimal fix = enforce token in code (publish token on guest presence frame, reject mismatch in handleHostSignal) + bound/auth the public RTDB write branch + lengthen sessionId.

Related: [[stack-posture]], [[audit-baseline-20260512]].
