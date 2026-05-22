# AIRDROP_ARCHITECTURE.md

Project:
- https://github.com/antoleod/scan.git

References:
- https://github.com/ShareDropio/sharedrop
- https://github.com/schlagmichdoch/PairDrop
- https://localsend.org

---

# Vision

AirDrop is an independent module inside Scan.

It is NOT tied to Notes.

It acts as:
- a local-first transfer platform
- a peer-to-peer communication layer
- a temporary sharing system
- a nearby device interaction module

Other modules may integrate with AirDrop later:
- Notes
- Audio
- Gallery
- Clipboard
- Files
- Export/Import
- Backup

AirDrop itself remains independent.

---

# Main Goal

The goal is to create:

- temporary sharing
- cross-platform transfer
- local-first communication
- peer-to-peer transfers
- QR pairing
- nearby device discovery
- minimal infrastructure
- privacy-first UX

WITHOUT:
- mandatory accounts
- permanent cloud storage
- expensive backend infrastructure

---

# Product Philosophy

## Local First

Prefer:
device ⇄ device

instead of:
device → cloud → device

---

## Temporary First

Everything should expire automatically.

No permanent uploads by default.

---

## Privacy First

Files should remain:
- local
- encrypted
- temporary

---

## Infrastructure Minimalism

The system should avoid:
- dedicated backend servers
- large databases
- permanent storage systems

Firebase should only be used for:
- signaling
- session metadata
- QR negotiation

NOT:
- file storage

---

# Product Identity

AirDrop is NOT:
"a file sender"

AirDrop IS:
"a temporary local-first transfer platform"

---

# Module Independence

AirDrop must remain isolated from:
- Notes logic
- Media logic
- Task logic

Other modules consume AirDrop APIs.

NOT the opposite.

Correct architecture:

Notes
↓
uses AirDrop

NOT:

AirDrop
↓
depends on Notes

---

# Technical Stack

## Frontend
- React
- TypeScript
- Zustand
- React Native
- PWA

---

# Communication Layer

## Primary
WebRTC DataChannels

Advantages:
- encrypted
- peer-to-peer
- fast
- low infrastructure cost

---

## Secondary
Local WebSocket transfer

Used only as fallback.

---

# Signaling Layer

## Firebase Realtime Database

Used only for:
- signaling
- session negotiation
- QR session metadata
- temporary presence

Firebase does NOT store files.

This keeps:
- cost near zero
- infrastructure simple

---

# Why Firebase Is Acceptable

Only tiny JSON payloads are transmitted.

Examples:
- SDP offers
- SDP answers
- ICE candidates
- session IDs
- temporary tokens

Large files NEVER go through Firebase.

---

# QR Architecture

QR codes should contain:

{
  "sessionId":"abc123",
  "token":"xyz789"
}

NOT:
- direct files
- permanent URLs

QR simply initializes pairing.

---

# Session Lifecycle

## 1. Create Session

User selects:
- file
- folder
- media
- clipboard
- object

AirDrop creates:
ShareSession

---

## 2. Generate QR

QR contains:
- temporary token
- session ID
- signaling reference

---

## 3. Pair Devices

Receiver:
- scans QR
OR
- uses nearby discovery

---

## 4. WebRTC Negotiation

Devices exchange:
- SDP
- ICE candidates

through Firebase signaling.

---

## 5. Direct Transfer

Once connected:

device ⇄ device

Files stream directly.

---

## 6. Expiration

Session automatically expires.

All metadata is removed.

---

# Expiration Strategy

Each session may define:
- 5 min
- 30 min
- 1 hour
- 24 hours

Expiration removes:
- signaling data
- tokens
- temporary cache

---

# Transfer Strategy

## Chunk Streaming

Files should transfer in chunks.

Advantages:
- lower RAM usage
- progress tracking
- resumable possibilities
- better mobile performance

---

# Discovery Strategy

## Phase 1
QR-only pairing.

Simplest implementation.

---

## Phase 2
LAN discovery:
- mDNS
- Bonjour
- Zeroconf

---

## Phase 3
Nearby automatic discovery.

---

# Nearby Devices Screen

Recommended UI:

Nearby Devices
----------------
📱 Android Phone
💻 Windows PC
📱 Tablet

[ Scan QR ]
[ Create Session ]

---

# Tabs Structure

AirDrop
 ├── Nearby
 ├── Send
 ├── Receive
 ├── Devices
 ├── Sessions
 └── History

---

# Suggested Folder Structure

src/
 ├── features/
 │    ├── airdrop/
 │    │    ├── components/
 │    │    ├── screens/
 │    │    ├── sessions/
 │    │    ├── qr/
 │    │    ├── signaling/
 │    │    ├── webrtc/
 │    │    ├── transfer/
 │    │    ├── nearby/
 │    │    ├── expiration/
 │    │    ├── hooks/
 │    │    ├── services/
 │    │    ├── types/
 │    │    └── utils/

---

# Security

## Temporary Tokens
All sessions use:
- signed tokens
- expiration

---

## Encrypted Transport
WebRTC already provides encrypted communication.

---

## Peer Isolation
Sessions must remain isolated from each other.

---

# Offline Philosophy

LAN mode should work:
WITHOUT internet

when possible.

This becomes a major product advantage.

---

# Future Relay Mode (Optional)

Relay mode should ONLY exist if:
- WebRTC fails
- firewall blocks connection

Relay remains:
- temporary
- auto-cleaned
- minimal

---

# Integration Layer

Other modules can later use:

shareViaAirDrop()

Examples:
- Notes
- Gallery
- Music
- Clipboard

But AirDrop remains independent.

---

# Example Future Integrations

## Notes
Share note instantly.

---

## Audio
Transfer currently playing audio.

---

## Clipboard
Sync clipboard across devices.

---

## Gallery
Quick media transfer.

---

# UX Goals

## One Tap Sharing
Minimal friction.

---

## QR First
QR remains central.

---

## Fast Pairing
Connection should feel instant.

---

## Minimal UI Complexity
Avoid technical jargon.

---

# Long-Term Vision

AirDrop should evolve into:

- local-first communication
- temporary smart sharing
- peer-to-peer collaboration
- cross-device interaction platform

NOT:
"a cloud upload app"

---

# Core Principle

AirDrop is infrastructure.

Other Scan modules are integrations.

This separation is essential for:
- scalability
- maintainability
- future expansion

---

# Final Conclusion

The architecture prioritizes:
- privacy
- simplicity
- low cost
- local-first workflows
- temporary sessions
- direct device communication

The final experience should feel like:
- AirDrop
- LocalSend
- PairDrop
- Wormhole

but integrated naturally into Scan with its own identity.
---

# Same-Account Direct Download (no QR)

When two devices are signed into the **same account**, the receiver can download
a share without scanning a QR code.

## Flow

1. Device A (signed in) picks a file and starts a session (`createSession`).
2. Alongside the normal signaling room, A announces the share under
   `airdrop/users/{uid}/shares/{sessionId}` — **only** the join coordinates
   (`sessionId` + `token`) and file metadata. **No file bytes.**
3. Device B (same `uid`) is subscribed to `airdrop/users/{uid}/shares` and shows
   the share in a **"Your devices"** list with a one-tap **Download** button.
   (B filters out its own announcements and any expired entries.)
4. Tapping Download calls `joinUserShare(sessionId, token)` — the *exact* guest
   pairing + WebRTC transfer pipeline used by QR — and **auto-accepts** the
   offer (intent already confirmed by the tap). Bytes stream peer-to-peer.
5. When A cancels / the session expires / teardown runs, A removes its presence
   node so the share disappears from B.

The QR path is untouched and still works for cross-account / guest sharing.

## Required RTDB security rule

Lock the user-presence subtree to its owner (set in the Firebase console):

```json
{
  "rules": {
    "airdrop": {
      "users": {
        "$uid": {
          ".read":  "auth != null && auth.uid === $uid",
          ".write": "auth != null && auth.uid === $uid"
        }
      }
    }
  }
}
```

## Key modules

- `presence/userPresence.ts` — publish / clear / subscribe (only Firebase touch).
- `presence/shareFilter.ts` — pure self/expired/forged filtering (unit-tested).
- `sessions/sessionService.ts` — publishes on create, clears on host teardown,
  `joinUserShare()` joins + auto-accepts.
- `components/MyDevicesSection.tsx` — the "Your devices" UI with inline progress.
- `hooks/useUserSharePresence.ts` — keeps the store synced, re-subscribes on auth.
