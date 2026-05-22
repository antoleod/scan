# ShareDrop Technical Analysis
Reference:
- https://github.com/ShareDropio/sharedrop

---

# Purpose

This document analyzes how ShareDrop works internally in order to:
- understand the architecture
- understand the WebRTC lifecycle
- understand signaling
- understand peer discovery
- reuse concepts only
- avoid directly copying implementation/code

This document is NOT intended for cloning or reproducing ShareDrop.

The goal is to:
- learn architectural ideas
- understand UX flow
- implement our own modern solution inside Scan

---

# What ShareDrop Actually Is

ShareDrop is:
- a browser-based peer-to-peer file sharing application
- inspired by Apple AirDrop
- based on WebRTC DataChannels
- using Firebase only for signaling

Important:
Files are NOT normally uploaded to Firebase.

Files are transferred:
device ⇄ device

---

# Core Technologies

## Frontend
- Ember.js
- JavaScript
- HTML/CSS

## Communication
- WebRTC DataChannels

## Signaling
- Firebase Realtime Database

## Connectivity
- STUN servers
- ICE negotiation

---

# High-Level Architecture

Device A
↓
Firebase signaling
↓
Device B
↓
WebRTC direct connection
↓
P2P transfer

---

# Why Firebase Exists

WebRTC cannot automatically discover peers.

Devices must exchange:
- SDP offers
- SDP answers
- ICE candidates

This process is called:
SIGNALING

Firebase is only used for:
- room creation
- peer discovery
- exchanging connection metadata

Firebase is NOT the file storage layer.

---

# Transfer Lifecycle

## 1. User Opens Website

Two devices open ShareDrop.

Example:
- Windows browser
- Android browser

---

## 2. Peer Discovery

Devices register presence using Firebase.

Each device announces:
- device ID
- room
- availability

---

## 3. WebRTC Negotiation

Devices exchange:
- SDP offer
- SDP answer
- ICE candidates

through Firebase.

---

## 4. Direct Connection

Once negotiation succeeds:
- direct WebRTC DataChannel is established

At this point:
- Firebase is no longer involved in file transfer

---

## 5. File Transfer

The sender:
- splits file into chunks
- streams chunks through WebRTC

Receiver:
- reconstructs file locally

---

# Important Technical Concepts

## Chunk Transfer

Large files are split into:
- small binary chunks

Advantages:
- lower memory usage
- transfer progress tracking
- resumable strategies possible

---

## ICE / STUN

WebRTC uses:
- STUN servers
- ICE candidates

to discover possible network routes.

---

## TURN Servers

ShareDrop intentionally avoids TURN infrastructure.

Consequence:
Some networks/firewalls fail.

This explains why ShareDrop occasionally cannot connect devices.

---

# Strengths of ShareDrop

## Very Low Infrastructure Cost
Firebase only handles:
- signaling
- metadata
- presence

No large cloud storage.

---

## Privacy
Files are transferred:
peer ⇄ peer

---

## Cross-Platform
Works on:
- Windows
- Mac
- Android
- Linux
- browsers

---

## Minimal Setup
No accounts required.

---

# Weaknesses of ShareDrop

## Old Frontend Stack
Uses Ember.js.

Modern React architecture would be easier to maintain.

---

## No TURN Fallback
Many corporate/firewalled networks fail.

---

## Weak Mobile UX
The experience is functional but limited.

---

## Limited Session Management
No:
- expiration system
- smart sessions
- collaborative objects
- persistence model

---

## Limited Product Identity
Mostly:
"send files"

---

# Concepts Worth Reusing

## Peer Lifecycle
- discovery
- negotiation
- disconnect
- reconnect

---

## QR Pairing
QR-driven device pairing is excellent UX.

---

## Temporary Session Philosophy
No permanent storage.

---

## Device-to-Device Transfer
Core philosophy aligns with privacy-first architecture.

---

# Concepts NOT Worth Reusing

## Ember Architecture
Should be rewritten entirely.

---

## UI/UX
Scan should build its own product identity.

---

## Firebase Coupling
Scan should keep signaling abstracted.

---

# Lessons Learned

The most valuable idea from ShareDrop is NOT the code.

It is:
- peer lifecycle
- temporary sessions
- direct device transfer
- simple UX
- low-cost infrastructure

---

# Recommended Direction for Scan

Do NOT clone ShareDrop.

Instead:
- study architecture
- reimplement concepts
- modernize stack
- integrate deeply into Scan

The result should become:
"temporary smart collaborative sharing"

NOT:
"another file transfer app"

---

# Final Conclusion

ShareDrop proves that:
- peer-to-peer browser transfer is viable
- minimal backend architecture is possible
- Firebase signaling costs are minimal
- temporary sharing UX works very well

However:
Scan should create:
- its own architecture
- its own identity
- its own UX
- its own session model
- its own smart object system

instead of reproducing ShareDrop itself.