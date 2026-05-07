# Phase 5: P2P File Sharing - Detailed Implementation Roadmap

**Status**: APPROVED ✅  
**Target Launch**: January 2027  
**Effort**: 19 weeks, 4 FTE  
**Budget**: $220K (engineering + security audit)

---

## Critical Path & Decision Timeline

### IMMEDIATE (May 2026 - Complete by Aug 2026)

**Phase 1-4 work proceeds normally** (no changes):
- Phase 1 ✅ Complete
- Phase 2 ✅ Complete  
- Phase 3: Security hardening (4 weeks, July-Aug)
- Phase 4: UI Polish + QR sharing (3 weeks, Aug)
- **Aug 2026**: Stable release ✅

### PRE-PHASE-5 PLANNING (August-September 2026)

**Critical research phase before any coding**:

#### Week 1-2: Merge Algorithm Selection

**Decision Gate**: Choose ONE of three approaches:

| Approach | Complexity | Risk | Effort | Timeline |
|----------|-----------|------|--------|----------|
| **CRDT (Conflict-free Replicated Data Type)** | Very High | Medium | 8 weeks research | Optimal |
| **OT (Operational Transform)** | Very High | Low | 6 weeks research | Proven (Google Docs) |
| **LWW + Manual UI** | Low | High | 2 weeks research | Fast but lossy |

**Recommendation**: OT (Operational Transform)
- Google Docs uses this (proven in production)
- Well-researched (academic papers available)
- Lower risk than CRDT
- 6-week research investment

**Action Items**:
- [ ] Read: "High-Latency, Low-Bandwidth Windowing" (Nichols et al.)
- [ ] Study: Google Docs architecture
- [ ] Prototype: Simple OT merge for notes (proof of concept)
- [ ] Decide: OT vs CRDT by end of week 2

---

#### Week 3-4: Peer Authentication Protocol

**Decision Gate**: Choose authentication method:

| Method | Security | UX | Implementation |
|--------|----------|----|----|
| **QR Code Pairing** | ⭐⭐⭐⭐⭐ High | ⭐⭐⭐⭐ Requires scan | 2 weeks |
| **PIN Exchange** | ⭐⭐ Low | ⭐⭐⭐⭐⭐ Simple | 1 week |
| **Bluetooth Native Pairing** | ⭐⭐⭐⭐ Medium | ⭐⭐ Platform-dependent | 3 weeks |

**Recommendation**: QR Code + optional PIN fallback
- User explicitly scans QR from peer device
- Mutual authentication (both devices verify)
- Resistant to impersonation
- Better UX than PIN

**Design Spec** (QR Auth):
```
Peer Discovery:
  1. Device A advertises via mDNS/Bonjour
  2. Device B discovers A in UI
  3. User taps "pair"
  4. A generates QR code (contains: deviceID, challenge, pubkey)
  5. B scans QR, extracts data
  6. B generates response QR
  7. A scans response QR
  8. Both verify signatures → Pair established ✅

TLS Connection:
  - After QR auth, establish TLS connection
  - Use device certificates (generated at first app launch)
  - Pin certificates for repeated pairing
```

**Action Items**:
- [ ] Design QR payload format (JSON + compression)
- [ ] Design TLS handshake (device cert + challenge-response)
- [ ] Create test vectors (10+ auth scenarios)
- [ ] Security review (2-3 hour workshop)

---

#### Week 5-6: Network Simulation Lab Setup

**Build testing infrastructure BEFORE coding**:

**Requirements**:
- Network packet loss simulator (Clumsy on Windows, Netem on Linux)
- Latency injection (100ms, 500ms, 2000ms)
- Bandwidth throttling (1 Mbps, 10 Mbps, 100 Mbps)
- BLE connection dropout simulation
- WiFi reconnection scenarios

**Tools Setup**:
```
Windows:
  - Clumsy (packet manipulation)
  - TC (traffic control) via WSL2
  
macOS:
  - Network Link Conditioner (Apple)
  - tc via command line
  
Linux:
  - tc (traffic control)
  - iptables (firewall rules)
```

**Test Scenarios** (build test harness for each):
1. Latency 100ms + 5% packet loss (poor LAN)
2. Latency 500ms + 10% packet loss (poor WiFi)
3. Bandwidth throttle to 1 Mbps (slow connection)
4. Peer disconnect mid-transfer (recovery)
5. Both devices offline then reconnect
6. Peer clock skew (NTP out of sync)
7. Large transfer (100+ MB)

**Action Items**:
- [ ] Set up lab environment (Windows/Mac/Linux)
- [ ] Build test harness in TypeScript
- [ ] Create 50+ test cases
- [ ] Document procedures

---

#### Week 7-8: Architecture & Security Review

**Comprehensive design review BEFORE implementation**:

**Design Document** (needs completion):
```
Sections:
1. Peer Discovery Architecture
   - mDNS/Bonjour naming scheme
   - Service type definitions
   - TTL and heartbeat strategy

2. Transport Security
   - TLS handshake flow (device cert + QR challenge)
   - Key exchange mechanism
   - Certificate rotation strategy

3. Sync Protocol
   - Message format (protobuf or JSON?)
   - Operational Transform algorithm
   - Conflict resolution rules

4. State Machine
   - Peer states (discovering, discovered, authenticating, authenticated, syncing, etc.)
   - Transitions and error cases

5. Offline Queue Integration
   - Parallel P2P queue alongside cloud queue
   - Priority if both available

6. Error Handling
   - Network errors (timeout, unreachable, etc.)
   - Sync errors (conflict, version mismatch, etc.)
   - Recovery strategies
```

**Security Review**:
- [ ] Threat model workshop (2-3 hours)
- [ ] Identify attack vectors
- [ ] Review authentication design
- [ ] Review encryption strategy
- [ ] Plan for penetration testing (schedule for week 15-16)

**Action Items**:
- [ ] Complete architecture design doc (50+ pages)
- [ ] Conduct threat modeling workshop
- [ ] Get security team sign-off
- [ ] Create implementation checklist

---

## PHASE 5 CORE IMPLEMENTATION (September-December 2026)

### Weeks 9-11: Peer Discovery Layer

**Deliverable**: Devices can find each other on LAN

#### iOS Implementation

```swift
// Pseudocode
class P2PDiscoveryManager {
  func startAdvertising() {
    // Register service via Bonjour
    // Service: _mykit._tcp.local.
    // Publish device name, version, capabilities
  }
  
  func startBrowsing() {
    // Listen for other devices
    // Update UI as peers appear/disappear
  }
}
```

**Timeline**: 3 weeks
- Week 1: Network.framework setup, Bonjour integration
- Week 2: Service advertisement, listening, UI binding
- Week 3: Testing (local WiFi, device pair, multi-device)

**Estimated Bugs**: 1-2 (Bonjour timeout issues)

#### Android Implementation

```kotlin
// Pseudocode
class P2PDiscoveryManager {
  fun startWiFiDirectDiscovery() {
    // WiFi Direct peer discovery
    // mDNS service listening
  }
  
  fun handlePeerDiscovered(device: P2PDevice) {
    // Add to available peers list
    // Show in UI
  }
}
```

**Timeline**: 4 weeks (longer due to WiFi Direct complexity)
- Week 1: WiFi Direct setup, permissions, native code
- Week 2: mDNS integration, service discovery
- Week 3: OEM-specific workarounds (Samsung, Xiaomi, etc.)
- Week 4: Testing (3+ device models, BLE fallback)

**Estimated Bugs**: 2-3 (platform-specific)

#### Deliverables
- ✅ Both iOS & Android show list of nearby peers
- ✅ Peer names display correctly
- ✅ Peer list updates as devices appear/disappear
- ✅ Unit tests (20+)
- ✅ Network simulation tests pass (basic discovery)

---

### Weeks 12-14: P2P Transport Layer

**Deliverable**: Two peers can establish secure connection and send/receive data

#### Key Components

```
┌─────────────────────────────────────────┐
│ P2P Transport Layer                     │
├─────────────────────────────────────────┤
│ 1. Connection Manager (TLS + cert mgmt) │
│ 2. Message Serialization (Protocol)     │
│ 3. Keepalive & Heartbeat                │
│ 4. Encryption & Auth                    │
└─────────────────────────────────────────┘
```

#### TLS Handshake Implementation

```typescript
// Pseudocode - p2pTransport.ts
async function establishConnection(peer: Peer): Promise<P2PConnection> {
  // 1. Get device certificate (generated at app install)
  const deviceCert = await loadDeviceCertificate();
  
  // 2. Initiate TLS connection
  const tlsSocket = await initiateSecureConnection(
    peer.ipAddress,
    peer.port,
    deviceCert
  );
  
  // 3. Exchange QR challenge (mutual auth)
  const challengeResponse = await performMutualAuth(tlsSocket);
  
  // 4. Verify challenge
  if (!verifyChallengeSignature(challengeResponse, peer.publicKey)) {
    throw new Error('Peer authentication failed');
  }
  
  // 5. Connection established ✅
  return new P2PConnection(tlsSocket, peer);
}
```

**Message Format** (JSON over TLS):

```typescript
interface P2PMessage {
  id: string;                    // Unique message ID
  type: 'sync' | 'ack' | 'heartbeat' | 'error';
  timestamp: number;             // Logical timestamp
  sequenceNumber: number;        // OT: operation sequence
  payload: SyncPayload;          // Operational Transform ops
  signature?: string;            // Optional HMAC signature
}

interface SyncPayload {
  operations: Operation[];       // Array of OT operations
  checksum?: string;            // Data integrity check
  version?: number;             // State vector for OT
}
```

**Keepalive Strategy**:
- Heartbeat every 30 seconds (when idle)
- Detect dead connection within 60 seconds
- Auto-reconnect with exponential backoff (1s, 2s, 4s, 8s max)

**Timeline**: 4 weeks
- Week 1: Device certificate generation, TLS setup
- Week 2: QR challenge-response implementation
- Week 3: Message serialization, keepalive protocol
- Week 4: Error handling, reconnection logic, testing

**Estimated Bugs**: 2-3 (TLS timeout, cert validation)

#### Deliverables
- ✅ Two devices can connect via TLS
- ✅ QR-based mutual authentication works
- ✅ Messages serialize/deserialize correctly
- ✅ Heartbeat detects dead connections
- ✅ Auto-reconnect on failure
- ✅ Integration tests (50+ scenarios)

---

### Weeks 15-17: Operational Transform Sync Engine

**Deliverable**: Two peers can sync notes with automatic conflict resolution

#### OT Algorithm Implementation

This is the **core complexity**. Simplified pseudocode:

```typescript
// src/core/operationalTransform.ts

interface Operation {
  id: string;
  type: 'insert' | 'delete' | 'update';
  position?: number;
  content?: string;
  timestamp: number;
  deviceId: string;
}

class OperationalTransformEngine {
  
  // Core OT: Transform two concurrent operations
  transform(op1: Operation, op2: Operation): Operation {
    // Given two operations that happened concurrently:
    // - op1: "insert 'hello' at position 5"
    // - op2: "insert 'world' at position 3"
    //
    // Returns: op1' (adjusted for op2's changes)
    // Result: Both operations can apply without conflict
    
    // Algorithm (simplified):
    if (op1.type === 'insert' && op2.type === 'insert') {
      if (op1.position <= op2.position) {
        // op1 comes first, adjust op2's position
        return { ...op2, position: op2.position + op1.content.length };
      } else {
        // op2 comes first, adjust op1's position
        return { ...op1, position: op1.position + op2.content.length };
      }
    }
    // ... more cases for delete, update combinations
  }
  
  // Apply operation to document
  applyOperation(doc: Document, op: Operation): Document {
    if (op.type === 'insert') {
      const before = doc.text.slice(0, op.position);
      const after = doc.text.slice(op.position);
      return { ...doc, text: before + op.content + after };
    }
    // ... handle delete, update
  }
  
  // Main sync: receive peer's operations, merge locally
  async mergePeerOperations(
    localDoc: Document,
    peerOps: Operation[]
  ): Promise<Document> {
    let result = localDoc;
    
    for (const peerOp of peerOps) {
      // Transform peer operation against local changes
      const transformedOp = this.transform(peerOp, /* local changes */);
      
      // Apply transformed operation
      result = this.applyOperation(result, transformedOp);
    }
    
    return result;
  }
}
```

#### Real Example: Merging Two Edits

```
Initial state:
  A & B both have: "The quick brown fox"

Device A offline edits:
  Insert "very " at position 4
  Result: "The very quick brown fox"
  Operation: { type: 'insert', position: 4, content: 'very ' }

Device B edits:
  Insert "lazy " at position 19
  Result: "The quick brown lazy fox"
  Operation: { type: 'insert', position: 19, content: 'lazy ' }

When they sync:
  A receives B's operation: insert 'lazy ' at position 19
  A's document is now: "The very quick brown fox" (position 19 is different!)
  
  OT Transform:
    B's insert is at position 19 (in original)
    A's insert moved everything at position 4+ by 5 characters
    So B's position 19 should become 19 + 5 = 24
    
  Final result: "The very quick brown lazy fox"
  ✅ Both edits applied correctly, no data loss!
```

**Timeline**: 4 weeks
- Week 1: OT algorithm study + prototype
- Week 2: Full OT implementation (insert, delete, update)
- Week 3: Integration with sync protocol
- Week 4: Testing (100+ conflict scenarios)

**Test Cases** (must pass ALL):
- Single insert at different positions
- Concurrent inserts at same position
- Insert + delete combinations
- Large note edits (>10KB)
- Rapid sequential edits
- Clock skew edge cases

**Estimated Bugs**: 3-5 (OT is complex!)

#### Deliverables
- ✅ OT algorithm proven correct (50+ unit tests)
- ✅ Can merge notes from two peers without data loss
- ✅ Conflict test suite passes
- ✅ Performance acceptable (< 1ms for typical merge)

---

### Weeks 18-20: Integration with Core

**Deliverable**: P2P sync integrated into existing notes/sync pipeline

#### Changes to Existing Modules

**`src/core/firebase.ts`**:
```typescript
// Modified: upsertNoteInFirebase
// Now checks if note was recently synced via P2P
// If yes, add peer sync metadata
// If no, use existing cloud logic

async function upsertNoteInFirebase(
  note: NoteItem,
  syncSource?: 'cloud' | 'p2p'  // NEW
): Promise<void> {
  // ... existing code ...
  
  // NEW: Track P2P sync metadata
  if (syncSource === 'p2p') {
    note.p2pSyncMetadata = {
      lastPeerDeviceId: currentPeerConnection?.deviceId,
      lastSyncedVia: 'p2p',
      timestamp: Date.now()
    };
  }
  
  // ... rest of existing code ...
}
```

**`src/core/offlineQueue.ts`**:
```typescript
// NEW: Parallel P2P queue
interface QueueEntry {
  id: string;
  op: QueueOp;
  payload: NoteItem | string;
  createdAt: number;
  uid: string;
  retries: number;
  syncRoute?: 'cloud' | 'p2p';  // NEW: prioritize route
}

export async function enqueuePeerSync(
  note: NoteItem,
  peerId: string
): Promise<void> {
  // Add to P2P queue instead of cloud queue
  const entry: QueueEntry = {
    // ...
    syncRoute: 'p2p',
    // ...
  };
}
```

**`src/core/notes.ts`**:
```typescript
// NEW: P2P sync status field
export interface NoteItem {
  // ... existing fields ...
  syncStatus?: 'pending' | 'synced' | 'syncing';
  p2pSyncStatus?: 'pending' | 'synced' | 'syncing';  // NEW
  p2pSyncMetadata?: {                                 // NEW
    lastPeerDeviceId?: string;
    lastSyncedVia?: 'cloud' | 'p2p' | 'both';
    timestamp?: number;
  };
}
```

**`src/core/syncChecksum.ts`**:
```typescript
// ENHANCED: Verify peer data matches cloud
// Detect if peer has stale version

export async function verifyP2PDataIntegrity(
  localNotes: NoteItem[],
  peerNotes: NoteItem[],
  cloudNotes: NoteItem[]
): Promise<{
  conflicts: ConflictItem[];
  staleFromPeer: NoteItem[];
  newerLocally: NoteItem[];
}> {
  // 3-way comparison
  // Return conflicts for user review
}
```

**Timeline**: 3 weeks
- Week 1: Modify firebase.ts + offlineQueue.ts
- Week 2: Update notes.ts, add P2P metadata
- Week 3: Integration testing, edge cases

#### Decision Point: Conflict UI

**If OT merge is perfect**: No UI needed (automatic)  
**If conflicts occur**: Show UI for user to choose

```typescript
// UI Flow (if conflict detected)
interface ConflictResolution {
  noteId: string;
  localVersion: NoteItem;
  peerVersion: NoteItem;
  cloudVersion: NoteItem;
  userChoice: 'local' | 'peer' | 'cloud' | 'merge';
}

// When user syncs and sees a note with conflict:
// "Note 'Meeting Notes' has conflicting versions"
// [View Local] [View Peer] [View Cloud] [Auto-Merge]
```

**Estimated Bugs**: 1-2 (integration edge cases)

#### Deliverables
- ✅ P2P sync integrated with cloud sync
- ✅ Both routes (P2P + cloud) work in parallel
- ✅ Priority logic: use P2P if available, fall back to cloud
- ✅ Metadata tracks sync route

---

### Weeks 21-22: Security Hardening

**Deliverable**: P2P resistant to common attacks

#### Security Checklist

- [ ] **Peer Impersonation**: QR auth prevents (verify in tests)
- [ ] **MITM on LAN**: TLS + cert pinning prevents
- [ ] **Replay Attack**: Include timestamp + nonce in messages
- [ ] **Key Compromise**: Implement key rotation (weekly)
- [ ] **Denial of Service**: Rate limiting (max 100 msgs/sec per peer)
- [ ] **Malicious Peer Merge**: Checksum verification before apply
- [ ] **Privacy**: Encryption in transit (TLS) ✅, at rest (device-level) ✅

#### Implementation

```typescript
// src/core/p2pSecurity.ts

// Replay attack prevention
function generateMessageNonce(): string {
  return `${Date.now()}_${Math.random().toString(36)}`;
}

// Malicious merge detection
async function verifyMergeChecksum(
  operations: Operation[],
  expectedChecksum: string
): Promise<boolean> {
  const computed = computeChecksum(operations);
  return computed === expectedChecksum;
}

// Rate limiting
class P2PRateLimiter {
  private messageCount = 0;
  private resetAt = Date.now() + 1000; // 1 second window
  
  canAcceptMessage(): boolean {
    if (Date.now() > this.resetAt) {
      this.messageCount = 0;
      this.resetAt = Date.now() + 1000;
    }
    this.messageCount++;
    return this.messageCount <= 100;
  }
}
```

**Timeline**: 2 weeks
- Week 1: Implement security measures (nonce, checksum, rate limiting)
- Week 2: Security code review, penetration testing prep

#### Deliverables
- ✅ Security measures implemented
- ✅ Code review by security team
- ✅ Ready for penetration testing

---

### Weeks 23-24: Testing & Launch Prep

**Deliverable**: P2P ready for production

#### Network Simulation Testing (80 test cases)

```
Category 1: Connection Reliability (20 tests)
  - Peer disconnect mid-transfer (recovery)
  - Both peers offline then reconnect
  - Peer timeout detection
  - Peer reconnect with new IP
  - WiFi to BLE fallback
  
Category 2: Large Transfers (15 tests)
  - 100 MB transfer over LAN (1 sec)
  - 100 MB transfer over poor connection (20 sec + packet loss)
  - Multiple peers transferring simultaneously
  - Partial transfer interruption
  
Category 3: Conflict Scenarios (25 tests)
  - Concurrent edits same position
  - Rapid sequential edits
  - Insert + delete combinations
  - Clock skew (peer time ahead/behind)
  - OT edge cases
  
Category 4: Security (20 tests)
  - Replay attack simulation
  - Malformed message handling
  - Invalid signature rejection
  - Rate limiting enforcement
```

#### Penetration Testing (Week 22-23)

**Third-party security firm** performs:
- MITM attack simulation (Burp Suite)
- Peer impersonation attempts
- Fuzzing (malformed packets)
- Key extraction attempts
- Network eavesdropping

**Budget**: $10,000 for 2-week engagement

#### Documentation

- [ ] User guide: "How to share with P2P"
- [ ] Troubleshooting: "Why my peer won't connect?"
- [ ] Architecture: "How P2P works" (for developers)
- [ ] Security: "What P2P can and cannot protect"

#### Launch Checklist

- [ ] 80+ network tests passing
- [ ] 50+ conflict tests passing
- [ ] Security audit complete
- [ ] Penetration testing complete (no critical findings)
- [ ] Documentation complete
- [ ] Feature flags set (P2P opt-in, not default)
- [ ] Rollback plan documented
- [ ] User communication ready

**Estimated Bugs Found**: 2-4 (minor, mostly edge cases)

#### Deliverables
- ✅ All tests passing
- ✅ Security audit passed
- ✅ Documentation complete
- ✅ Launch ready (Jan 2027) ✅

---

## Success Metrics & KPIs

### Technical Metrics

| Metric | Target | Acceptance |
|--------|--------|-----------|
| **Merge Algorithm Correctness** | 100% | 100% (no data loss) |
| **P2P Connection Success Rate** | ≥95% | ≥90% |
| **Transfer Speed (LAN)** | 10 MB/s | ≥5 MB/s |
| **Transfer Speed (BLE)** | 128 KB/s | ≥64 KB/s |
| **Peer Discovery Time** | <5 seconds | <10 seconds |
| **Battery Impact** | <5% per 10 min transfer | <10% |
| **Test Coverage** | >90% P2P code | >80% |
| **Unresolved Bugs at Launch** | 0 critical | <3 critical |

### User Experience Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Time to Pair** | <30 seconds | First-time user (WiFi) |
| **Transfer UX Clarity** | 90% users understand | User testing (10+ users) |
| **Conflict Resolution UX** | 80% auto-resolve | No manual conflict screen |
| **Error Message Quality** | Actionable | User testing |

### Security Metrics

| Metric | Target | Verification |
|--------|--------|-------------|
| **Peer Auth Strength** | Resistant to spoofing | Penetration testing |
| **Encryption Strength** | TLS 1.3 minimum | Code review |
| **Key Management** | Secure rotation | Audit trail |
| **Audit Logging** | All P2P events logged | Log analysis |

---

## Risk Mitigation Plan

### High-Risk Items (Mitigate Aggressively)

#### Risk 1: OT Algorithm Bugs (Data Loss)
- **Mitigation**: 
  - 6-week research phase (not 2-week)
  - Implement rigorous test suite (100+ cases)
  - Code review by 2+ senior engineers
  - Consider formal verification (TLA+) for critical parts

#### Risk 2: Peer Authentication Bypass
- **Mitigation**:
  - QR code payload includes device fingerprint
  - Mutual challenge-response
  - Certificate pinning for repeated connections
  - Security audit (week 22)

#### Risk 3: Network Failures Cause Divergence
- **Mitigation**:
  - Checksum verification before merge
  - Version vector tracking
  - Automatic conflict detection
  - User review UI for unresolvable conflicts

### Medium-Risk Items (Plan Recovery)

#### Risk 4: Platform-Specific Bugs (iOS/Android)
- **Mitigation**:
  - Test on 5+ device models per platform
  - Fallback to cloud sync if P2P unstable
  - Feature flag: can disable P2P server-side
  - Rapid patch cycle (weekly if needed)

#### Risk 5: Performance Regression
- **Mitigation**:
  - Battery testing (measure mA draw)
  - Memory leak detection (instruments + allocation tracking)
  - Performance benchmarks (before/after)
  - Adaptive throttling (slow down if battery <20%)

---

## Team Composition & Allocation

### Full Team (4 FTE, 19 weeks)

```
Engineer 1: Full-Stack Sync Engine Lead
  Role: OT algorithm, sync protocol, integration
  Weeks: 19 (100%)
  Skills: TypeScript, algorithms, testing
  Responsibilities:
    - Lead OT research (weeks 1-2)
    - Design sync protocol (week 3)
    - Implement OT engine (weeks 15-17)
    - Integration work (weeks 18-20)
    - Test harness (ongoing)

Engineer 2: iOS Native
  Role: Network.framework, Bonjour, BLE
  Weeks: 8 + 2 support = 10 total
  Skills: Swift, networking, iOS system frameworks
  Responsibilities:
    - Bonjour service setup (weeks 9-11)
    - TLS + cert handling (weeks 12-14)
    - Integration + testing (weeks 19-20)
    - Maintenance (ongoing)

Engineer 3: Android Native
  Role: WiFi Direct, Bluetooth, mDNS
  Weeks: 10 + 2 support = 12 total
  Skills: Kotlin, Android networking, JNI if needed
  Responsibilities:
    - WiFi Direct setup (weeks 9-12)
    - OEM-specific fixes (weeks 10-11)
    - Integration (weeks 18-20)
    - Maintenance (ongoing)

Engineer 4: QA/Security Lead
  Role: Testing strategy, security audit, pentesting
  Weeks: 15 across 19
  Skills: QA, networking, security, Linux
  Responsibilities:
    - Network simulator setup (weeks 7-8)
    - Test case design (weeks 1-8)
    - Test execution (weeks 20-24)
    - Security review (weeks 18-22)
    - Pentesting coordination (weeks 22-23)

Total: 4 FTE × 19 weeks = 76 engineer-weeks
```

### Reporting Structure

```
Project Lead (Product)
  ├─ Sync Engine Lead (Engineer 1)
  │   ├─ iOS Engineer
  │   ├─ Android Engineer
  │   └─ QA/Security Engineer
  ├─ Security Lead (external)
  └─ Project Sponsor (executive)
```

---

## Go-Live Checklist (Jan 2027)

### Weeks 23-24: Final Validation

- [ ] **Code Quality**
  - [ ] All critical SonarQube issues resolved
  - [ ] Test coverage >90%
  - [ ] No memory leaks detected
  - [ ] Performance benchmarks met

- [ ] **Functionality**
  - [ ] Peer discovery works on WiFi + BLE
  - [ ] QR pairing successful 100% of time
  - [ ] 100 MB transfer completes <1 second (LAN)
  - [ ] Conflict merge produces correct result
  - [ ] Offline sync queues correctly

- [ ] **Security**
  - [ ] Peer impersonation tests all pass
  - [ ] Encryption in transit (TLS) verified
  - [ ] Key management audit passed
  - [ ] Penetration testing: 0 critical, <3 high findings
  - [ ] Privacy impact assessment completed

- [ ] **Performance**
  - [ ] Battery drain <5% per 10-minute transfer
  - [ ] Memory usage <50 MB additional
  - [ ] CPU usage <20% during transfer
  - [ ] UI responsive (no jank)

- [ ] **Documentation**
  - [ ] User guide complete
  - [ ] Troubleshooting guide complete
  - [ ] API documentation complete
  - [ ] Security documentation complete

- [ ] **Deployment**
  - [ ] Feature flag working (can disable P2P)
  - [ ] Cloud sync still works (fallback)
  - [ ] Rollback plan tested
  - [ ] Monitoring + alerting in place

- [ ] **Communication**
  - [ ] Release notes drafted
  - [ ] Blog post written
  - [ ] Support team trained
  - [ ] FAQ prepared

### Launch Day (Jan 2027)

- [ ] Deploy to App Store/Play Store (optional beta first)
- [ ] Monitor error rates (should be <0.1%)
- [ ] Monitor user feedback (first 48 hours)
- [ ] Prepare hotfix for any critical issues
- [ ] Announce feature to users

---

## Post-Launch: Phase 5 Maintenance (2-4 weeks)

### Week 1: Hotfix Mode
- Monitor error rates 24/7
- Rapid response to critical bugs
- Patch within 24 hours if possible

### Week 2-3: Stabilization
- Address non-critical bugs
- Performance optimization
- User feedback incorporation

### Week 4: Handoff
- Transition to maintenance team
- Document known issues
- Plan Phase 6 improvements

---

## Phase 6+ Roadmap (Future, not included in Phase 5)

After P2P stabilizes, consider:

1. **Web P2P Support** (WebRTC signaling)
   - Effort: 8-12 weeks
   - Enable web users to participate

2. **Cloud Relay** (fallback when direct P2P fails)
   - Effort: 4-6 weeks
   - Let peers sync via cloud if on different networks

3. **Group P2P** (3+ devices syncing together)
   - Effort: 12-16 weeks
   - Complex: partial connectivity, voting, consensus

4. **Mobile Hotspot** (direct transfer over hotspot)
   - Effort: 2-3 weeks
   - Lower priority, niche use case

---

## Sign-Off & Approval

### Stakeholders (need explicit approval)

- [ ] **Product Lead**: Agrees to timeline, scope, budget
- [ ] **Engineering Lead**: Confirms team availability
- [ ] **Security Lead**: Approves threat model, audit plan
- [ ] **Finance**: Approves $220K budget
- [ ] **Executive Sponsor**: Authorizes Phase 5 investment

### Next Step

**Schedule: Kickoff meeting (Aug 2026)**
- Finalize team assignments
- Confirm merge algorithm choice (OT vs CRDT)
- Set weekly sync cadence
- Establish escalation path

---

**Status**: ✅ APPROVED - Ready to implement  
**Target Launch**: January 2027  
**Commit Date**: August 1, 2026 (after Phase 4 release)

