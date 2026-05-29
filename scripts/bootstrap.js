#!/usr/bin/env node
/**
 * Bootstrap script — first-time setup for MyKit Admin + Cloud Relay.
 *
 * What it does:
 *  1. Signs in with your Firebase email + password
 *  2. Writes /admins/{uid} with role 'admin'
 *  3. Creates cloudRelay/globalState with relay ENABLED and safe defaults
 *
 * Requirements:
 *  - Firestore rules deployed (firebase deploy --only firestore:rules)
 *  - Node 20+ (uses built-in fetch)
 *
 * Usage:
 *   node scripts/bootstrap.js <email> <password>
 *
 * Example:
 *   node scripts/bootstrap.js lionel.jolles@gmail.com yourpassword
 */

"use strict";

// ── Config from env ────────────────────────────────────────────────────────

const API_KEY    = "AIzaSyBIwE2kuScBVJBK1aTSFo8IlM2HyjVasLc";
const PROJECT_ID = "lectorqr-45291";

// ── Limits (must match cloudRelayConfig.ts) ────────────────────────────────

const MB = 1024 * 1024;
const GB = 1024 * MB;

// ── REST helpers ───────────────────────────────────────────────────────────

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? JSON.stringify(json));
  return json;
}

async function firestoreWrite(idToken, path, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ fields }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? JSON.stringify(json));
  return json;
}

// Firestore REST field type helpers
const str  = (v) => ({ stringValue: v });
const num  = (v) => ({ integerValue: String(v) });
const bool = (v) => ({ booleanValue: v });
const nul  = ()  => ({ nullValue: null });

// ── Period key ─────────────────────────────────────────────────────────────

function monthlyKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const [,, email, password] = process.argv;

  if (!email || !password) {
    console.error("Usage: node scripts/bootstrap.js <email> <password>");
    process.exit(1);
  }

  console.log("\n🚀 MyKit Bootstrap\n");

  // ── Step 1: Sign in ──────────────────────────────────────────────────────
  console.log("1. Signing in…");
  let idToken, uid;
  try {
    const auth = await post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`,
      { email, password, returnSecureToken: true }
    );
    idToken = auth.idToken;
    uid = auth.localId;
    console.log(`   ✅ Signed in — uid: ${uid}`);
  } catch (e) {
    console.error(`   ❌ Sign-in failed: ${e.message}`);
    process.exit(1);
  }

  // ── Step 2: Write admin record ───────────────────────────────────────────
  console.log("\n2. Writing /admins/" + uid + " (role: admin)…");
  try {
    await firestoreWrite(idToken, `admins/${uid}`, {
      uid:       str(uid),
      role:      str("admin"),
      addedAt:   num(Date.now()),
      addedBy:   str("bootstrap"),
      email:     str(email),
    });
    console.log("   ✅ Admin record created");
  } catch (e) {
    console.error(`   ❌ Failed: ${e.message}`);
    console.error("   → Make sure Firestore rules are deployed (firebase deploy --only firestore:rules)");
    process.exit(1);
  }

  // ── Step 3: Initialize cloud relay state ─────────────────────────────────
  console.log("\n3. Creating cloudRelay/globalState (enabled: true)…");
  try {
    const now = Date.now();
    await firestoreWrite(idToken, `cloudRelay/globalState`, {
      enabled:                  bool(true),
      emergencyStop:            bool(false),
      quotaPeriod:              str("monthly"),
      currentPeriodKey:         str(monthlyKey()),
      globalUsedBytes:          num(0),
      globalReservedBytes:      num(0),
      globalLimitBytes:         num(5 * GB),
      activeTransfersCount:     num(0),
      lastUpdatedAt:            num(now),
      disabledReason:           nul(),
      disabledAt:               nul(),
      disabledBy:               nul(),
      maxFileSizeBytesUser:     num(50 * MB),
      maxFileSizeBytesTester:   num(300 * MB),
      maxUserBytesPerPeriod:    num(500 * MB),
      maxActiveTransfersPerUser: num(1),
      transferExpiryMinutes:    num(30),
      deleteAfterDownload:      bool(true),
    });
    console.log("   ✅ Cloud relay initialized and ENABLED");
  } catch (e) {
    console.error(`   ❌ Failed: ${e.message}`);
    console.error("   → You are now admin. Retry or enable via Admin Center in the app.");
    process.exit(1);
  }

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log(`
✅ Bootstrap complete!

   UID:   ${uid}
   Role:  admin
   Relay: ENABLED (50 MB / user, 5 GB global)

Next steps:
  1. Open the app → Settings → Admin Analytics Center
  2. Controls tab → verify relay is enabled
  3. Test an Internet Transfer (AirDrop → Internet Transfer)

Limits (adjustable via Admin Center):
  Normal user max file:   50 MB
  Admin/tester max file: 300 MB
  Per-user monthly quota: 500 MB
  Global monthly quota:     5 GB
`);
}

main().catch((e) => {
  console.error("Fatal error:", e.message);
  process.exit(1);
});
