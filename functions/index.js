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

exports.pinSession = onCall({ region: REGION }, async (request) => {
    const key = request.rawRequest?.ip || request.auth?.uid || "anon";
    if (!allow(`pin:${key}`, 25, 60_000)) {
      throw new HttpsError("resource-exhausted", "Too many attempts. Try again later.");
    }

    const username = String(request.data?.username || "").trim().toLowerCase();
    const pin = request.data?.pin;
    const sanitizedUsername = username.replace(/[^a-z0-9]/g, "");
    if (!sanitizedUsername || pin === undefined || pin === null) {
      throw new HttpsError("invalid-argument", "Invalid username or PIN.");
    }

    const email = `${sanitizedUsername}${FAKE_DOMAIN}`;
    const password = String(pin).padEnd(6, "0");

    const apiKey = process.env.FIREBASE_WEB_API_KEY || "";
    if (!apiKey) {
      logger.error("pinSession missing FIREBASE_WEB_API_KEY env");
      throw new HttpsError("failed-precondition", "Server configuration error.");
    }

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.localId) {
      throw new HttpsError(
        "permission-denied",
        "Invalid credentials.",
      );
    }

    const customToken = await admin.auth().createCustomToken(json.localId);
    return { customToken };
});
