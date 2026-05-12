/**
 * Callable endpoints with basic per-UID / per-IP rate limiting.
 * Set FIREBASE_WEB_API_KEY in the Functions runtime (Secret Manager or env) for pinSession.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const FAKE_DOMAIN = "@barrascanner.local";
const REGION = process.env.FUNCTIONS_REGION || "us-central1";

/** @type {Map<string, number[]>} */
const rateBuckets = new Map();

function prune(key, windowMs) {
  const now = Date.now();
  const arr = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  rateBuckets.set(key, arr);
  return arr;
}

function allow(key, max, windowMs) {
  const arr = prune(key, windowMs);
  if (arr.length >= max) return false;
  arr.push(Date.now());
  rateBuckets.set(key, arr);
  return true;
}

function normalizeInviteCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
}

exports.joinSharedNoteGroupByInvite = onCall({ region: REGION }, async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }
    const uid = request.auth.uid;
    if (!allow(`join:${uid}`, 45, 60_000)) {
      throw new HttpsError("resource-exhausted", "Too many attempts. Wait a minute.");
    }

    const inviteCode = normalizeInviteCode(request.data?.inviteCode);
    if (!inviteCode) {
      throw new HttpsError("invalid-argument", "Invalid invite code.");
    }

    const snap = await db
      .collection("noteGroups")
      .where("inviteCode", "==", inviteCode)
      .limit(1)
      .get();

    if (snap.empty) {
      return { ok: false };
    }

    const docRef = snap.docs[0].ref;
    const doc = snap.docs[0];
    const data = doc.data();
    const members = Array.isArray(data.members) ? data.members : [];

    if (members.includes(uid)) {
      return {
        ok: true,
        group: {
          id: doc.id,
          name: data.name,
          ownerUid: data.ownerUid,
          members,
          inviteCode: data.inviteCode,
        },
      };
    }

    await docRef.update({
      members: admin.firestore.FieldValue.arrayUnion(uid),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    const nextMembers = Array.from(new Set([...members, uid]));
    return {
      ok: true,
      group: {
        id: doc.id,
        name: data.name,
        ownerUid: data.ownerUid,
        members: nextMembers,
        inviteCode: data.inviteCode,
      },
    };
});

// Persistent rate limiter keyed on (uid OR ip) backed by Firestore so it
// applies across Cloud Function instances. Falls back open only on internal
// errors; never on absence of a record.
async function allowPersistent(bucket, key, max, windowMs) {
  const now = Date.now();
  const docRef = db.collection("authAttempts").doc(`${bucket}__${key}`);
  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(docRef);
      const data = snap.exists ? snap.data() : { hits: [] };
      const hits = (Array.isArray(data.hits) ? data.hits : []).filter(
        (t) => typeof t === "number" && now - t < windowMs,
      );
      if (hits.length >= max) {
        tx.set(docRef, { hits, updatedAt: now }, { merge: true });
        return false;
      }
      hits.push(now);
      tx.set(docRef, { hits, updatedAt: now }, { merge: true });
      return true;
    });
  } catch (err) {
    logger.warn("rate-limit transaction failed", { err: String(err) });
    return false; // fail closed
  }
}

exports.pinSession = onCall({ region: REGION }, async (request) => {
    // Require an authenticated caller. The PIN flow is only used by a signed-in
    // session to re-authenticate (e.g., after a biometric lock); brand-new
    // sign-in must use the standard Firebase auth flow.
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication unavailable.");
    }

    const callerUid = request.auth.uid;
    const ip = request.rawRequest?.ip || "ip-unknown";

    if (!(await allowPersistent("pin-uid", callerUid, 5, 60_000))) {
      throw new HttpsError("resource-exhausted", "Authentication unavailable.");
    }
    if (!(await allowPersistent("pin-ip", ip, 25, 60_000))) {
      throw new HttpsError("resource-exhausted", "Authentication unavailable.");
    }

    const username = String(request.data?.username || "").trim().toLowerCase();
    const rawPin = request.data?.pin;
    const sanitizedUsername = username.replace(/[^a-z0-9]/g, "");
    const pin = typeof rawPin === "string" ? rawPin : String(rawPin ?? "");
    // Enforce a real password length; never pad/zero-fill. Firebase auth
    // already requires >= 6 chars on registration, so this matches the floor.
    if (!sanitizedUsername || !/^[A-Za-z0-9]{6,}$/.test(pin)) {
      throw new HttpsError("permission-denied", "Authentication unavailable.");
    }

    const email = `${sanitizedUsername}${FAKE_DOMAIN}`;

    const apiKey = process.env.FIREBASE_WEB_API_KEY || "";
    if (!apiKey) {
      logger.error("pinSession missing FIREBASE_WEB_API_KEY env");
      throw new HttpsError("unavailable", "Authentication unavailable.");
    }

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: pin,
        returnSecureToken: true,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.localId) {
      throw new HttpsError("permission-denied", "Authentication unavailable.");
    }

    // The PIN flow only mints a custom token for the *currently signed-in*
    // user. This blocks the brute-force-then-takeover path where a different
    // username's credentials could be guessed and used to swap identity.
    if (json.localId !== callerUid) {
      throw new HttpsError("permission-denied", "Authentication unavailable.");
    }

    const customToken = await admin.auth().createCustomToken(json.localId);
    return { customToken };
});
