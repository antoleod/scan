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

function requireSignedIn(request) {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  return request.auth.uid;
}

function limitString(value, max) {
  return String(value || "").trim().slice(0, max);
}

exports.generateAiNote = onCall({ region: REGION, timeoutSeconds: 60 }, async (request) => {
  const uid = requireSignedIn(request);
  if (!(await allowPersistent("ai-note", uid, 20, 60_000))) {
    throw new HttpsError("resource-exhausted", "Too many AI requests. Wait a minute.");
  }

  const apiKey = process.env.OPENAI_API_KEY || "";
  const model = process.env.OPENAI_MODEL || "";
  if (!apiKey || !model) {
    throw new HttpsError("failed-precondition", "AI integration is not configured.");
  }

  const prompt = limitString(request.data?.prompt, 4000);
  if (prompt.length < 2) {
    throw new HttpsError("invalid-argument", "Prompt is required.");
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: "Return concise, structured text for a private productivity/scanning app. Do not invent facts.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn("openai request failed", { status: res.status, body: JSON.stringify(json).slice(0, 500) });
    throw new HttpsError("unavailable", "AI generation failed.");
  }

  const text = Array.isArray(json.output)
    ? json.output
        .flatMap((item) => Array.isArray(item.content) ? item.content : [])
        .map((part) => part.text || "")
        .join("\n")
        .trim()
    : String(json.output_text || "").trim();
  return { text };
});

exports.sendProductEmail = onCall({ region: REGION }, async (request) => {
  const uid = requireSignedIn(request);
  if (!(await allowPersistent("email", uid, 20, 60_000))) {
    throw new HttpsError("resource-exhausted", "Too many email requests. Wait a minute.");
  }

  const apiKey = process.env.SENDGRID_API_KEY || "";
  const from = process.env.INTEGRATION_EMAIL_FROM || "";
  if (!apiKey || !from) {
    throw new HttpsError("failed-precondition", "Email integration is not configured.");
  }

  const to = limitString(request.data?.to, 320);
  const subject = limitString(request.data?.subject, 200);
  const text = limitString(request.data?.text, 20_000);
  const html = request.data?.html ? limitString(request.data.html, 40_000) : undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) || !subject || !text) {
    throw new HttpsError("invalid-argument", "Valid to, subject, and text are required.");
  }

  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: from },
      subject,
      content: [
        { type: "text/plain", value: text },
        ...(html ? [{ type: "text/html", value: html }] : []),
      ],
    }),
  });
  if (!res.ok) {
    logger.warn("sendgrid request failed", { status: res.status, body: (await res.text()).slice(0, 500) });
    throw new HttpsError("unavailable", "Email delivery failed.");
  }
  return { ok: true };
});

exports.serviceNowProxy = onCall({ region: REGION, timeoutSeconds: 30 }, async (request) => {
  const uid = requireSignedIn(request);
  if (!(await allowPersistent("servicenow", uid, 60, 60_000))) {
    throw new HttpsError("resource-exhausted", "Too many ServiceNow requests. Wait a minute.");
  }

  const baseUrl = String(process.env.SERVICENOW_BASE_URL || "").replace(/\/+$/, "");
  const token = process.env.SERVICENOW_TOKEN || "";
  const user = process.env.SERVICENOW_USER || "";
  const password = process.env.SERVICENOW_PASSWORD || "";
  if (!baseUrl || (!token && (!user || !password))) {
    throw new HttpsError("failed-precondition", "ServiceNow integration is not configured.");
  }

  const path = limitString(request.data?.path, 500);
  const method = ["GET", "POST", "PATCH"].includes(request.data?.method) ? request.data.method : "GET";
  if (!path.startsWith("/api/")) {
    throw new HttpsError("invalid-argument", "Only ServiceNow API paths are allowed.");
  }

  const headers = { "Accept": "application/json", "Content-Type": "application/json" };
  headers.Authorization = token
    ? `Bearer ${token}`
    : `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(request.data?.body || {}),
  });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await res.json().catch(() => null)
    : await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, data };
});
