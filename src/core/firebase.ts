import { Platform } from 'react-native';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  isSignInWithEmailLink,
  User,
} from 'firebase/auth';
import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Database, getDatabase } from 'firebase/database';

import { loadSettings } from './settings';

import { ScanRecord } from '../types';
import type { NoteItem, NoteTemplate } from './notes';
import { diag } from './diagnostics';
import { loadDeletedNoteKeys, noteStorageKey } from './noteDeletions';
import { loadDeletedHistoryKeys, markDeletedHistoryKey } from './historyDeletions';

const REQUIRED_FIREBASE_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

function normalizeScanType(type: string): string {
  return String(type || '').trim().toUpperCase();
}

function tsMillis(val: unknown): number {
  if (val && typeof (val as any).toMillis === 'function') return (val as any).toMillis();
  const n = Number(val);
  return Number.isFinite(n) && n > 0 ? n : Date.now();
}

const OPTIONAL_FIREBASE_ENV = [
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
  'EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION',
  'EXPO_PUBLIC_FIREBASE_DATABASE_URL',
] as const;

export type FirebaseRequiredEnvKey = (typeof REQUIRED_FIREBASE_ENV)[number];
export type FirebaseOptionalEnvKey = (typeof OPTIONAL_FIREBASE_ENV)[number];

export type AuthEmailSource = 'recoveryEmail' | 'internalUsername' | 'googleOAuth';

export interface UserPrivateProfile {
  username: string;
  authEmail: string;
  authEmailSource: AuthEmailSource;
  recoveryEmail?: string;
  phone?: string;
  providerIds?: string[];
  createdAt?: number;
  updatedAt: number;
}

export interface FirebaseRuntime {
  enabled: boolean;
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
  rtdb: Database | null;
  source: 'env' | 'none';
  missingRequiredEnv: FirebaseRequiredEnvKey[];
  missingOptionalEnv: FirebaseOptionalEnvKey[];
}

let runtime: FirebaseRuntime | null = null;

function env(name: string): string {
  const vars: Record<string, string | undefined> = {
    EXPO_PUBLIC_FIREBASE_API_KEY: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_APP_ID: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
    EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
    EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION: process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION,
    EXPO_PUBLIC_FIREBASE_DATABASE_URL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  };
  return String(vars[name] || '').trim();
}

function firebaseFunctionsRegion(): string {
  const r = env('EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION');
  return r || 'us-central1';
}

function resolveFirebaseConfig() {
  const apiKey = env('EXPO_PUBLIC_FIREBASE_API_KEY');
  const authDomain = env('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN');
  const projectId = env('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  const appId = env('EXPO_PUBLIC_FIREBASE_APP_ID');
  const storageBucket = env('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET');
  const messagingSenderId = env('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID');
  const measurementId = env('EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID');

  const missingRequiredEnv = REQUIRED_FIREBASE_ENV.filter((key) => !env(key));
  const missingOptionalEnv = OPTIONAL_FIREBASE_ENV.filter((key) => !env(key));

  if (missingRequiredEnv.length > 0) {
    return {
      config: null,
      missingRequiredEnv,
      missingOptionalEnv,
    };
  }

  const databaseURL = env('EXPO_PUBLIC_FIREBASE_DATABASE_URL');
  return {
    config: {
      apiKey,
      authDomain,
      projectId,
      appId,
      storageBucket: storageBucket || undefined,
      messagingSenderId: messagingSenderId || undefined,
      measurementId: measurementId || undefined,
      databaseURL: databaseURL || undefined,
    },
    missingRequiredEnv,
    missingOptionalEnv,
  };
}

function buildFirebaseDisabledErrorMessage(rt: FirebaseRuntime): string {
  if (!rt.missingRequiredEnv.length) {
    return 'Firebase is not available in this environment.';
  }

  return `Firebase not configured. Missing variables: ${rt.missingRequiredEnv.join(', ')}`;
}

function createAuthInstance(app: FirebaseApp): Auth {
  try {
    if (Platform.OS === 'web') {
      return getAuth(app);
    }

    // React Native: persist the auth state to AsyncStorage so the user stays
    // signed in across cold starts (otherwise every app launch requires a
    // fresh login, and the 15-day session window in authContext.tsx is a
    // no-op). `getReactNativePersistence` is exported from a sub-path that
    // is RN-only — guarded so the web bundle never reaches this branch.
    let rnPersistence: unknown;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const authPkg = require('firebase/auth') as { getReactNativePersistence?: (storage: unknown) => unknown };
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      if (typeof authPkg.getReactNativePersistence === 'function' && AsyncStorage) {
        rnPersistence = authPkg.getReactNativePersistence(AsyncStorage);
      }
    } catch {
      // Fall through to default if the helper or storage module is missing.
    }

    return rnPersistence
      ? initializeAuth(app, { persistence: rnPersistence } as Parameters<typeof initializeAuth>[1])
      : initializeAuth(app);
  } catch {
    return getAuth(app);
  }
}

export async function initFirebaseRuntime(): Promise<FirebaseRuntime> {
  if (runtime) return runtime;

  const { config, missingRequiredEnv, missingOptionalEnv } = resolveFirebaseConfig();

  if (!config) {
    runtime = {
      enabled: false,
      app: null,
      auth: null,
      db: null,
      rtdb: null,
      source: 'none',
      missingRequiredEnv,
      missingOptionalEnv,
    };
    await diag.info('firebase.init', {
      enabled: false,
      missingRequired: missingRequiredEnv.length,
      missingOptional: missingOptionalEnv.length,
    });

    return runtime;
  }

  const app = getApps().length ? getApp() : initializeApp(config);
  const auth = createAuthInstance(app);
  const db = getFirestore(app);
  let rtdb: Database | null = null;
  if (config.databaseURL) {
    try { rtdb = getDatabase(app); } catch { rtdb = null; }
  }

  runtime = {
    enabled: true,
    app,
    auth,
    db,
    rtdb,
    source: 'env',
    missingRequiredEnv,
    missingOptionalEnv,
  };
  await diag.info('firebase.init', {
    enabled: true,
    missingRequired: missingRequiredEnv.length,
    missingOptional: missingOptionalEnv.length,
  });

  return runtime;
}

export async function recheckFirebaseRuntime(): Promise<FirebaseRuntime> {
  runtime = null;
  return initFirebaseRuntime();
}

export async function getFirebaseRuntimeSnapshot(): Promise<FirebaseRuntime> {
  return initFirebaseRuntime();
}

export function getFirebaseRuntime(): FirebaseRuntime | null {
  return runtime;
}

export async function onFirebaseAuthState(cb: (user: User | null) => void) {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) {
    cb(null);
    return () => {};
  }

  return onAuthStateChanged(rt.auth, cb);
}

export async function loginWithEmail(
  email: string,
  password: string,
  options?: { persistSession?: boolean },
): Promise<User> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  const persistSession = options?.persistSession ?? true;
  if (Platform.OS === 'web') {
    await setPersistence(
      rt.auth,
      persistSession ? browserLocalPersistence : browserSessionPersistence,
    );
  }

  const res = await signInWithEmailAndPassword(rt.auth, email.trim(), password);
  return res.user;
}

export async function registerWithEmail(email: string, password: string): Promise<User> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  const res = await createUserWithEmailAndPassword(rt.auth, email.trim(), password);
  return res.user;
}

export async function sendResetPasswordEmail(email: string): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  await sendPasswordResetEmail(rt.auth, email.trim());
}

export async function logoutFirebase(): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) return;

  await signOut(rt.auth);
}

export async function upsertUserPrivateProfile(
  uid: string,
  profile: Partial<UserPrivateProfile>,
): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.db) return;
  await setDoc(
    doc(rt.db, 'users', uid, 'private', 'profile'),
    { ...profile, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

// The synthetic auth-email domain used when a user registers with only a
// username (no real email). Kept in sync with RegisterForm.tsx + core/auth.ts.
const SYNTHETIC_EMAIL_DOMAIN = 'MyKit.tech';

export async function upsertUsernameIndex(
  username: string,
  uid: string,
  authEmail: string,
  authEmailSource: AuthEmailSource,
): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.db) return;
  const lower = username.toLowerCase().trim();

  // Public `/usernames/{name}` doc — readable by unauthenticated callers for
  // login resolution. It MUST NOT contain PII (real email, recovery email,
  // phone, etc.). For synthetic-email accounts the client re-derives the
  // address from the username; recovery-email accounts must enter their
  // recovery address directly at sign-in / password-reset.
  await setDoc(
    doc(rt.db, 'usernames', lower),
    { username: lower, uid, authEmailSource, updatedAt: serverTimestamp() },
    { merge: true },
  );

  // Private mirror under /users/{uid}/private/profile holds the actual
  // authEmail. Readable only by the owning user.
  await setDoc(
    doc(rt.db, 'users', uid, 'private', 'profile'),
    { username: lower, authEmail, authEmailSource, updatedAt: serverTimestamp() },
    { merge: true },
  ).catch(() => undefined);
}

export async function resolveUsernameToAuthEmail(
  username: string,
): Promise<{ authEmail: string; authEmailSource: AuthEmailSource } | null> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.db) return null;
  const lower = username.toLowerCase().trim();
  const snap = await getDoc(doc(rt.db, 'usernames', lower));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  const source: AuthEmailSource =
    data.authEmailSource === 'recoveryEmail' ? 'recoveryEmail'
    : data.authEmailSource === 'googleOAuth' ? 'googleOAuth'
    : 'internalUsername';

  // Only the synthetic-email path can safely be resolved without a private
  // lookup, because the address is fully derived from the (public) username.
  // For real-email accounts we return only the source so the UI can prompt
  // the user to enter their recovery email directly.
  if (source === 'internalUsername') {
    return { authEmail: `${lower}@${SYNTHETIC_EMAIL_DOMAIN}`, authEmailSource: source };
  }
  return { authEmail: '', authEmailSource: source };
}

// ─── Google OAuth ──────────────────────────────────────────────────

export async function loginWithGoogleWeb(): Promise<User> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(rt.auth, provider);
  return result.user;
}

export async function loginWithGoogleCredential(idToken: string): Promise<User> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(rt.auth, credential);
  return result.user;
}

// ─── Magic Links (Passwordless) ────────────────────────────────────

export async function sendMagicLinkEmail(email: string, redirectUrl: string): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  await sendSignInLinkToEmail(rt.auth, email.trim().toLowerCase(), {
    url: redirectUrl,
    handleCodeInApp: true,
  });
}

export async function verifyMagicLink(email: string, url: string): Promise<User> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  const result = await signInWithEmailLink(rt.auth, email.trim().toLowerCase(), url);
  return result.user;
}

export async function isMagicLinkUrl(url: string): Promise<boolean> {
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.auth) {
    return false;
  }
  return isSignInWithEmailLink(rt.auth, url);
}

export async function syncScansWithFirebase(local: ScanRecord[]) {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  const user = rt.auth.currentUser ?? await new Promise<User | null>((resolve) => {
    const unsub = onAuthStateChanged(rt.auth!, (u) => { unsub(); resolve(u); });
  });
  if (!user) throw new Error('No authenticated session to sync.');

  const uid = user.uid;
  const scansRef = collection(rt.db, 'users', uid, 'scans');
  const deletedKeys = await loadDeletedHistoryKeys();

  let pushed = 0;
  for (const scan of local.filter((x) => x.status === 'pending')) {
    if (deletedKeys.has(`${String(scan.codeValue || scan.codeNormalized || '').trim()}::${normalizeScanType(scan.type)}`)) {
      continue;
    }
    const docId = `${scan.profileId}_${scan.codeNormalized}_${new Date(scan.date).getTime()}`.replace(/[^A-Za-z0-9_-]/g, '_');
    await setDoc(doc(scansRef, docId), { ...scan, uid, updatedAt: serverTimestamp() }, { merge: true });
    pushed += 1;
  }

  const snap = await getDocs(query(scansRef));
  const server: ScanRecord[] = [];
  snap.forEach((d) => {
    const x = d.data() as ScanRecord;
    const key = `${String(x.codeValue || x.codeNormalized || '').trim()}::${normalizeScanType(x.type)}`;
    if (x.deletedAt || deletedKeys.has(key)) return;
    if (!x.id) x.id = d.id;
    server.push(x);
  });

  return { pushed, server };
}

export async function deleteScanFromFirebase(scan: ScanRecord): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  const user = rt.auth.currentUser;
  if (!user) throw new Error('No authenticated session to delete scan.');

  const scansRef = collection(rt.db, 'users', user.uid, 'scans');
  const snap = await getDocs(query(scansRef));
  const targetKey = `${String(scan.codeValue || scan.codeNormalized || '').trim()}::${normalizeScanType(scan.type)}`;
  await markDeletedHistoryKey(targetKey);
  const deletions: Promise<unknown>[] = [];

  snap.forEach((d) => {
    const data = d.data() as ScanRecord;
    const rowKey = `${String(data.codeValue || data.codeNormalized || '').trim()}::${normalizeScanType(data.type)}`;
    if (d.id === scan.id || String(data.id || '') === scan.id || rowKey === targetKey) {
      deletions.push(setDoc(doc(scansRef, d.id), {
        id: data.id || d.id,
        deletedAt: Date.now(),
        uid: user.uid,
        updatedAt: serverTimestamp(),
      }, { merge: true }));
    }
  });

  await Promise.all(deletions);
}

// Real-time listener for scan changes (cross-device sync).
export async function subscribeToScans(
  callback: (scans: ScanRecord[]) => void
): Promise<() => void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return () => {};

  const db = rt.db;
  let firestoreUnsub: (() => void) | null = null;

  const authUnsub = onAuthStateChanged(rt.auth, (user) => {
    if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
    if (!user) return;

    const scansRef = collection(db, 'users', user.uid, 'scans');
    firestoreUnsub = onSnapshot(
      query(scansRef),
      (snap) => {
        const scans: ScanRecord[] = [];
        snap.forEach((d) => {
          const x = d.data() as ScanRecord;
          if (x.deletedAt) return;
          scans.push({ ...x, id: x.id || d.id });
        });
        callback(scans);
      },
      async (error) => {
        await diag.warn('scans.subscribe.error', { message: String(error) });
      }
    );
  });

  return () => {
    if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
    authUnsub();
  };
}

// Real-time listener for notes + templates changes (cross-device sync).
export async function subscribeToNotes(
  callback: (data: { notes: NoteItem[]; templates: NoteTemplate[] }) => void
): Promise<() => void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return () => {};

  const db = rt.db;
  let notesUnsub: (() => void) | null = null;
  let templatesUnsub: (() => void) | null = null;

  function teardownFirestore() {
    notesUnsub?.(); notesUnsub = null;
    templatesUnsub?.(); templatesUnsub = null;
  }

  const authUnsub = onAuthStateChanged(rt.auth, (user) => {
    teardownFirestore();
    if (!user) return;

    let latestNotes: NoteItem[] = [];
    let latestTemplates: NoteTemplate[] = [];
    // Guard: only call the callback once both listeners have delivered their first
    // snapshot. Without this, the notes listener fires first with latestTemplates=[]
    // and the callback would wipe existing templates for one render cycle (and vice versa).
    let notesReady = false;
    let templatesReady = false;

    const notesRef     = collection(db, 'users', user.uid, 'notes');
    const templatesRef = collection(db, 'users', user.uid, 'noteTemplates');

    notesUnsub = onSnapshot(
      query(notesRef),
      (snap) => {
        latestNotes = snap.docs.map((d) => {
          const data = d.data() as NoteItem;
          // Handle workflowMetadata stored as JSON string (legacy) or object (new)
          if (typeof data.workflowMetadata === 'string') {
            try {
              data.workflowMetadata = JSON.parse(data.workflowMetadata);
            } catch {
              data.workflowMetadata = undefined;
            }
          }
          return { ...data, id: d.id };
        });
        notesReady = true;
        if (notesReady && templatesReady) callback({ notes: latestNotes, templates: latestTemplates });
      },
      async (error) => {
        await diag.warn('notes.subscribe.notes.error', { message: String(error) });
      }
    );

    templatesUnsub = onSnapshot(
      query(templatesRef),
      (snap) => {
        latestTemplates = snap.docs.map((d) => ({ ...(d.data() as NoteTemplate), id: d.id }));
        templatesReady = true;
        if (notesReady && templatesReady) callback({ notes: latestNotes, templates: latestTemplates });
      },
      async (error) => {
        await diag.warn('notes.subscribe.templates.error', { message: String(error) });
      }
    );
  });

  return () => { teardownFirestore(); authUnsub(); };
}

// Strip base64 blobs from a note before writing to Firestore.
// Firestore documents are limited to 1MB — a single photo exceeds this easily.
// We store a hasLocalImage flag so the record knows the image lives on-device.
function sanitizeNoteForFirestore(note: NoteItem): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    id: note.id,
    kind: note.kind,
    category: note.category,
    text: note.text,
    pinned: Boolean(note.pinned),
    createdAt: Number(note.createdAt || Date.now()),
    updatedAt: Number(note.updatedAt || Date.now()),
  };
  if (note.deletedAt !== undefined) payload.deletedAt = Number(note.deletedAt);
  if (note.groupId !== undefined) payload.groupId = note.groupId;
  if (note.color !== undefined) payload.color = note.color;
  if (note.archived !== undefined) payload.archived = note.archived;
  // imageBase64 is too large for Firestore (1MB limit). Mark presence instead.
  if (note.imageBase64) {
    payload.hasLocalImage = true;
    if (note.imageMimeType !== undefined) payload.imageMimeType = note.imageMimeType;
  }
  // Only sync http(s) URLs. An allowlist is safer than the old `data:`
  // blocklist, which still let `javascript:`, `file:`, and other unexpected
  // schemes propagate through Firestore to other devices, where a future
  // renderer might dereference them.
  const safeAttachments = (note.attachments || []).filter(
    (a) => typeof a === 'string' && /^https?:\/\//i.test(a.trim()),
  );
  if (safeAttachments.length > 0) payload.attachments = safeAttachments;
  if (safeAttachments.length === 0 && (note.attachments?.length ?? 0) > 0) {
    payload.hasLocalAttachments = true;
  }
  if (note.imageRtdbPaths?.length) payload.imageRtdbPaths = note.imageRtdbPaths;
  if (note.versions && note.versions.length > 0) {
    payload.versions = note.versions.slice(0, 12).map((v) => ({
      id: v.id,
      title: v.title,
      text: typeof v.text === 'string' ? v.text.slice(0, 4000) : '',
      createdAt: Number(v.createdAt || 0),
    }));
  }
  if (note.title !== undefined) payload.title = note.title;
  if (note.smartType) payload.smartType = note.smartType;
  if (note.workflowStatus) payload.workflowStatus = note.workflowStatus;
  if (note.workflowMetadata) payload.workflowMetadata = note.workflowMetadata;
  if (note.isSecret !== undefined) payload.isSecret = note.isSecret;
  if (note.draft !== undefined) payload.draft = note.draft;
  // syncStatus is intentionally excluded — it is local UI state, not server data.
  // Writing it to Firestore would conflict with the server-side merge logic.
  return payload;
}

export async function upsertNoteInFirebase(note: NoteItem): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }
  const user = rt.auth.currentUser;
  if (!user) throw new Error('No authenticated session to save note.');

  const payload = sanitizeNoteForFirestore(note);

  // Upload data-URI attachments to RTDB so other devices can download them.
  // Only runs if RTDB is configured (DATABASE_URL set).
  if (rt.rtdb && note.attachments?.length) {
    const { uploadImageToRTDB } = await import('./imageSync');
    const dataUriAttachments = (note.attachments || []).filter(
      (a) => typeof a === 'string' && a.startsWith('data:'),
    );
    if (dataUriAttachments.length > 0) {
      const rtdbPaths: string[] = [];
      for (let i = 0; i < dataUriAttachments.length; i++) {
        const path = await uploadImageToRTDB(
          dataUriAttachments[i],
          `${note.id}_${i}`,
        ).catch(() => null);
        if (path) rtdbPaths.push(path);
      }
      if (rtdbPaths.length > 0) payload.imageRtdbPaths = rtdbPaths;
    }
  }

  await setDoc(
    doc(rt.db, 'users', user.uid, 'notes', note.id),
    { ...payload, uid: user.uid, updatedAtServer: serverTimestamp() },
    { merge: true },
  );
}

export async function upsertTemplateInFirebase(template: NoteTemplate): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }
  const user = rt.auth.currentUser;
  if (!user) throw new Error('No authenticated session to save template.');
  const payload = {
    id: template.id,
    name: template.name,
    kind: template.kind,
    subject: template.subject,
    body: template.body,
    location: template.location || '',
    durationMinutes: Number(template.durationMinutes || 30),
    createdAt: Number(template.createdAt || Date.now()),
    updatedAt: Number(template.updatedAt || Date.now()),
    uid: user.uid,
    updatedAtServer: serverTimestamp(),
  };
  await setDoc(
    doc(rt.db, 'users', user.uid, 'noteTemplates', template.id),
    payload,
    { merge: true }
  );
}

export async function syncNotesWithFirebase(localNotes: NoteItem[], localTemplates: NoteTemplate[]) {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }
  const user = rt.auth.currentUser;
  if (!user) throw new Error('No authenticated session to sync notes.');

  const uid = user.uid;
  const notesRef = collection(rt.db, 'users', uid, 'notes');
  const templatesRef = collection(rt.db, 'users', uid, 'noteTemplates');
  const deletedKeys = await loadDeletedNoteKeys();

  // Read server state first so we can merge (newest updatedAt wins).
  const notesSnapBefore = await getDocs(query(notesRef));
  const serverNotesMap = new Map<string, NoteItem>();
  notesSnapBefore.forEach((d) => {
    const x = d.data() as NoteItem;
    // Handle workflowMetadata stored as JSON string (legacy) or object (new)
    if (typeof x.workflowMetadata === 'string') {
      try { x.workflowMetadata = JSON.parse(x.workflowMetadata); } catch { x.workflowMetadata = undefined; }
    }
    serverNotesMap.set(d.id, { ...x, id: d.id });
  });

  const templatesSnapBefore = await getDocs(query(templatesRef));
  const serverTemplatesMap = new Map<string, NoteTemplate>();
  templatesSnapBefore.forEach((d) => {
    const x = d.data() as NoteTemplate;
    serverTemplatesMap.set(d.id, { ...x, id: d.id });
  });

  // Push local notes that are newer than (or absent from) the server.
  const localNotesLimited = localNotes.slice(0, 3000);
  let pushedNotes = 0;

  // --- Build write arrays before touching Firestore ---

  // Notes to push
  type NoteWriteOp = { noteId: string; payload: Record<string, unknown> };
  const noteWrites: NoteWriteOp[] = [];
  for (const note of localNotesLimited) {
    const key = noteStorageKey(note.id, note.groupId ? 'group' : 'personal', note.groupId);
    if (deletedKeys.has(key) || note.deletedAt) continue;
    const serverNote = serverNotesMap.get(note.id);
    // Never overwrite a server-side tombstone with a local copy, even if local is newer.
    if (serverNote?.deletedAt) continue;
    if (!serverNote || tsMillis(note.updatedAt) > tsMillis(serverNote.updatedAt)) {
      noteWrites.push({
        noteId: note.id,
        payload: { ...sanitizeNoteForFirestore(note), uid, updatedAtServer: serverTimestamp() },
      });
      serverNotesMap.set(note.id, note); // keep in-memory map current
      pushedNotes += 1;
    }
  }

  // Tombstones to re-apply so deleted notes are not resurrected by stale clients.
  type TombstoneWriteOp = { noteId: string; payload: Record<string, unknown> };
  const tombstoneWrites: TombstoneWriteOp[] = [];
  for (const [noteId, serverNote] of serverNotesMap.entries()) {
    const key = noteStorageKey(noteId, serverNote.groupId ? 'group' : 'personal', serverNote.groupId);
    if (!deletedKeys.has(key)) continue;
    if (serverNote.deletedAt) continue;
    tombstoneWrites.push({
      noteId,
      payload: { id: noteId, deletedAt: Date.now(), uid, updatedAtServer: serverTimestamp() },
    });
  }

  // Templates to push
  const localTemplatesLimited = localTemplates.slice(0, 300);
  let pushedTemplates = 0;
  type TemplateWriteOp = { templateId: string; payload: Record<string, unknown> };
  const templateWrites: TemplateWriteOp[] = [];
  for (const template of localTemplatesLimited) {
    const serverTemplate = serverTemplatesMap.get(template.id);
    if (!serverTemplate || tsMillis(template.updatedAt) >= tsMillis(serverTemplate.updatedAt)) {
      templateWrites.push({
        templateId: template.id,
        payload: { ...template, uid, updatedAtServer: serverTimestamp() },
      });
      pushedTemplates += 1;
    }
  }

  // --- Commit all writes in batches (max 499 ops per commit) ---
  const BATCH_LIMIT = 499;
  let batch = writeBatch(rt.db);
  let opCount = 0;

  for (const { noteId, payload } of noteWrites) {
    batch.set(doc(notesRef, noteId), payload, { merge: true });
    opCount++;
    if (opCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(rt.db);
      opCount = 0;
    }
  }

  for (const { noteId, payload } of tombstoneWrites) {
    batch.set(doc(notesRef, noteId), payload, { merge: true });
    opCount++;
    if (opCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(rt.db);
      opCount = 0;
    }
  }

  for (const { templateId, payload } of templateWrites) {
    batch.set(doc(templatesRef, templateId), payload, { merge: true });
    opCount++;
    if (opCount >= BATCH_LIMIT) {
      await batch.commit();
      batch = writeBatch(rt.db);
      opCount = 0;
    }
  }

  if (opCount > 0) await batch.commit();

  // Build merged result from in-memory data — avoids a second full getDocs read.
  // serverNotesMap already contains all server notes from the first read above.
  // We pushed local-newer notes above, so the source of truth is: local wins if newer, server wins otherwise.
  const mergedNotesMap = new Map<string, NoteItem>();
  for (const note of localNotesLimited) {
    const key = noteStorageKey(note.id, note.groupId ? 'group' : 'personal', note.groupId);
    if (note.deletedAt || deletedKeys.has(key)) continue;
    mergedNotesMap.set(note.id, note);
  }
  for (const [id, serverNote] of serverNotesMap.entries()) {
    const key = noteStorageKey(id, serverNote.groupId ? 'group' : 'personal', serverNote.groupId);
    if (serverNote.deletedAt || deletedKeys.has(key)) {
      mergedNotesMap.delete(id);
      continue;
    }
    // Handle workflowMetadata stored as JSON string (legacy)
    if (typeof serverNote.workflowMetadata === 'string') {
      try { serverNote.workflowMetadata = JSON.parse(serverNote.workflowMetadata); } catch { serverNote.workflowMetadata = undefined; }
    }
    const existing = mergedNotesMap.get(id);
    if (!existing || tsMillis(serverNote.updatedAt) >= tsMillis(existing.updatedAt)) {
      mergedNotesMap.set(id, serverNote);
    }
  }
  const serverNotes = Array.from(mergedNotesMap.values());

  // N-2: build the merged templates result from serverTemplatesMap (already in memory
  // from the first read above) instead of doing a second getDocs — avoids double read.
  const mergedTemplatesMap = new Map<string, NoteTemplate>();
  for (const t of localTemplatesLimited) mergedTemplatesMap.set(t.id, t);
  for (const [tid, serverTemplate] of serverTemplatesMap.entries()) {
    const existing = mergedTemplatesMap.get(tid);
    if (!existing || tsMillis(serverTemplate.updatedAt) >= tsMillis(existing.updatedAt)) {
      mergedTemplatesMap.set(tid, serverTemplate);
    }
  }
  const serverTemplates = Array.from(mergedTemplatesMap.values());

  return { pushedNotes, pushedTemplates, serverNotes, serverTemplates };
}

export async function fetchNotesFromFirebase() {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  const user = rt.auth.currentUser;
  if (!user) throw new Error('No authenticated session to fetch notes.');

  const uid = user.uid;
  const notesRef = collection(rt.db, 'users', uid, 'notes');
  const templatesRef = collection(rt.db, 'users', uid, 'noteTemplates');
  const deletedKeys = await loadDeletedNoteKeys();

  const notesSnap = await getDocs(query(notesRef));
  const serverNotes: NoteItem[] = [];
  notesSnap.forEach((d) => {
    const x = d.data() as NoteItem;
    const key = noteStorageKey(x.id || d.id, x.groupId ? 'group' : 'personal', x.groupId);
    if (!x.deletedAt && !deletedKeys.has(key)) {
      serverNotes.push({ ...x, id: x.id || d.id });
    }
  });

  const templatesSnap = await getDocs(query(templatesRef));
  const serverTemplates: NoteTemplate[] = [];
  templatesSnap.forEach((d) => {
    const x = d.data() as NoteTemplate;
    serverTemplates.push({ ...x, id: x.id || d.id });
  });

  return { serverNotes, serverTemplates };
}

export async function deleteNoteFromFirebase(noteId: string): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  const user = rt.auth.currentUser;
  if (!user) return;
  await setDoc(doc(rt.db, 'users', user.uid, 'notes', noteId), {
    id: noteId,
    deletedAt: Date.now(),
    uid: user.uid,
    updatedAtServer: serverTimestamp(),
  }, { merge: true });
}

export async function deleteTemplateFromFirebase(templateId: string): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  const user = rt.auth.currentUser;
  if (!user) return;
  await deleteDoc(doc(rt.db, 'users', user.uid, 'noteTemplates', templateId));
}

export async function clearScansInFirebase(): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  const user = rt.auth.currentUser;
  if (!user) return;
  const scansRef = collection(rt.db, 'users', user.uid, 'scans');
  const snap = await getDocs(query(scansRef));
  for (const item of snap.docs) {
    await deleteDoc(doc(scansRef, item.id));
  }
}

export async function clearNotesInFirebase(): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  const user = rt.auth.currentUser;
  if (!user) return;
  const notesRef = collection(rt.db, 'users', user.uid, 'notes');
  const snap = await getDocs(query(notesRef));
  for (const item of snap.docs) {
    await deleteDoc(doc(notesRef, item.id));
  }
}

export async function clearTemplatesInFirebase(): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  const user = rt.auth.currentUser;
  if (!user) return;
  const templatesRef = collection(rt.db, 'users', user.uid, 'noteTemplates');
  const snap = await getDocs(query(templatesRef));
  for (const item of snap.docs) {
    await deleteDoc(doc(templatesRef, item.id));
  }
}

export type SharedNoteGroup = {
  id: string;
  name: string;
  ownerUid: string;
  members: string[];
  inviteCode: string;
  updatedAt?: unknown;
};

function normalizeInviteCode(value: string): string {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
}

export async function createSharedNoteGroup(name: string): Promise<SharedNoteGroup> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) throw new Error(buildFirebaseDisabledErrorMessage(rt));
  const user = rt.auth.currentUser;
  if (!user) throw new Error('No authenticated session to create a group.');

  const cleanName = String(name || '').trim() || 'Shared Notes';
  const groupId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const inviteCode = normalizeInviteCode(`${cleanName.slice(0, 4)}${Math.random().toString(36).slice(2, 8)}`);
  const payload: SharedNoteGroup = {
    id: groupId,
    name: cleanName,
    ownerUid: user.uid,
    members: [user.uid],
    inviteCode,
  };
  await setDoc(doc(rt.db, 'noteGroups', groupId), { ...payload, updatedAt: serverTimestamp() }, { merge: true });
  return payload;
}

export async function joinSharedNoteGroup(inviteCodeInput: string): Promise<SharedNoteGroup | null> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.app) throw new Error(buildFirebaseDisabledErrorMessage(rt));
  const user = rt.auth.currentUser;
  if (!user) throw new Error('No authenticated session to join a group.');
  const inviteCode = normalizeInviteCode(inviteCodeInput);
  if (!inviteCode) return null;

  try {
    const functions = getFunctions(rt.app, firebaseFunctionsRegion());
    const joinFn = httpsCallable(functions, 'joinSharedNoteGroupByInvite');
    const result = await joinFn({ inviteCode });
    const data = result.data as { ok?: boolean; group?: SharedNoteGroup };
    if (!data?.ok || !data.group) return null;
    return data.group;
  } catch {
    return null;
  }
}

export async function fetchSharedGroupsForCurrentUser(): Promise<SharedNoteGroup[]> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return [];
  const user = rt.auth.currentUser;
  if (!user) return [];
  const groupsRef = collection(rt.db, 'noteGroups');
  const snap = await getDocs(query(groupsRef, where('members', 'array-contains', user.uid)));
  const groups: SharedNoteGroup[] = [];
  snap.forEach((d) => {
    groups.push({ ...(d.data() as SharedNoteGroup), id: d.id });
  });
  return groups;
}

export async function subscribeToSharedGroups(
  callback: (groups: SharedNoteGroup[]) => void
): Promise<() => void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return () => {};
  const user = rt.auth.currentUser;
  if (!user) return () => {};
  const groupsRef = collection(rt.db, 'noteGroups');
  return onSnapshot(query(groupsRef, where('members', 'array-contains', user.uid)), (snap) => {
    const groups: SharedNoteGroup[] = [];
    snap.forEach((d) => groups.push({ ...(d.data() as SharedNoteGroup), id: d.id }));
    callback(groups);
  });
}

export async function subscribeToSharedGroupNotes(
  callback: (notes: NoteItem[]) => void
): Promise<() => void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return () => {};

  const db = rt.db;
  const perGroupUnsub = new Map<string, () => void>();
  const latestByGroup = new Map<string, NoteItem[]>();
  let groupsUnsub: (() => void) | null = null;

  const emit = () => {
    const all: NoteItem[] = [];
    latestByGroup.forEach((items) => all.push(...items));
    callback(all);
  };

  function teardownInner() {
    groupsUnsub?.();
    groupsUnsub = null;
    perGroupUnsub.forEach((u) => u());
    perGroupUnsub.clear();
    latestByGroup.clear();
  }

  const authUnsub = onAuthStateChanged(rt.auth, (user) => {
    teardownInner();
    if (!user) return;

    const groupsRef = collection(db, 'noteGroups');
    groupsUnsub = onSnapshot(query(groupsRef, where('members', 'array-contains', user.uid)), (groupsSnap) => {
      const seen = new Set<string>();
      groupsSnap.forEach((d) => {
        const groupId = d.id;
        seen.add(groupId);
        if (perGroupUnsub.has(groupId)) return;

        const notesRef = collection(db, 'noteGroups', groupId, 'notes');
        const unsub = onSnapshot(query(notesRef), (notesSnap) => {
          const items = notesSnap.docs
            .map((docSnap) => {
              const raw = docSnap.data() as NoteItem;
              return { ...raw, id: raw.id || docSnap.id, groupId };
            })
            .filter((n) => !n.deletedAt);
          latestByGroup.set(groupId, items);
          emit();
        });
        perGroupUnsub.set(groupId, unsub);
      });

      // Cleanup listeners for groups no longer present.
      Array.from(perGroupUnsub.keys()).forEach((groupId) => {
        if (seen.has(groupId)) return;
        perGroupUnsub.get(groupId)?.();
        perGroupUnsub.delete(groupId);
        latestByGroup.delete(groupId);
      });

      emit();
    });
  });

  return () => {
    teardownInner();
    authUnsub();
  };
}

export async function upsertSharedGroupNote(groupId: string, note: NoteItem): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  const user = rt.auth.currentUser;
  if (!user || !groupId) return;
  const groupRef = doc(rt.db, 'noteGroups', groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) return;
  // N-4: sanitize before writing to strip imageBase64 and avoid exceeding Firestore's
  // 1MB document limit. Matches what upsertNoteInFirebase does.
  const payload = sanitizeNoteForFirestore({ ...note, groupId });
  await setDoc(
    doc(rt.db, 'noteGroups', groupId, 'notes', note.id),
    { ...payload, groupId, uid: user.uid, updatedAtServer: serverTimestamp() },
    { merge: true },
  );
}

export async function deleteSharedGroupNote(groupId: string, noteId: string): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  if (!groupId || !noteId) return;
  await setDoc(doc(rt.db, 'noteGroups', groupId, 'notes', noteId), {
    id: noteId,
    groupId,
    deletedAt: Date.now(),
    updatedAtServer: serverTimestamp(),
  }, { merge: true });
}

export async function fetchSharedGroupNotesForCurrentUser(): Promise<NoteItem[]> {
  const groups = await fetchSharedGroupsForCurrentUser();
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.db) return [];
  const deletedKeys = await loadDeletedNoteKeys();
  const notes: NoteItem[] = [];
  for (const group of groups) {
    const snap = await getDocs(query(collection(rt.db, 'noteGroups', group.id, 'notes')));
    snap.forEach((d) => {
      const note = d.data() as NoteItem;
      const key = noteStorageKey(note.id || d.id, 'group', group.id);
      if (!note.deletedAt && !deletedKeys.has(key)) {
        notes.push({ ...note, id: note.id || d.id, groupId: group.id });
      }
    });
  }
  return notes;
}

// ─── Clipboard Firebase sync (text entries only — images too large for Firestore) ─

import type { ClipEntry } from './clipboard.types';

const CLIPBOARD_SYNC_LIMIT = 300; // max text entries to push to Firestore

let clipboardCloudSyncResolved: boolean | null = null;

async function isClipboardCloudSyncEnabled(): Promise<boolean> {
  if (clipboardCloudSyncResolved !== null) return clipboardCloudSyncResolved;
  try {
    const s = await loadSettings();
    clipboardCloudSyncResolved = s.clipboardCloudSync === true;
  } catch {
    clipboardCloudSyncResolved = false;
  }
  return clipboardCloudSyncResolved;
}

/** Call after changing settings at runtime so the next sync respects the new flag. */
export function resetClipboardCloudSyncCache(): void {
  clipboardCloudSyncResolved = null;
}

export async function subscribeToClipboard(
  callback: (entries: ClipEntry[]) => void,
): Promise<() => void> {
  if (!(await isClipboardCloudSyncEnabled())) return () => {};
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return () => {};

  // Use onAuthStateChanged so the Firestore listener is (re-)established even
  // when this function is called before Firebase has resolved the auth state.
  // `currentUser` is null on the first tick after initializeApp, but
  // onAuthStateChanged fires synchronously if the user is already signed in
  // (persisted session) and asynchronously after the token is refreshed.
  let firestoreUnsub: (() => void) | null = null;
  const db = rt.db;

  const authUnsub = onAuthStateChanged(rt.auth, (user) => {
    // Tear down previous subscription (user changed or signed out)
    if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
    if (!user) return;

    const ref = collection(db, 'users', user.uid, 'clipboard');
    firestoreUnsub = onSnapshot(
      query(ref),
      (snap) => {
        const entries = snap.docs
          .map((d) => ({ ...(d.data() as ClipEntry), id: d.id }))
          .filter((e) => e.kind === 'text' && e.content && e.id);
        callback(entries);
      },
      (err) => { diag.warn('clipboard.subscribe.error', { message: String(err) }); },
    );
  });

  return () => {
    if (firestoreUnsub) { firestoreUnsub(); firestoreUnsub = null; }
    authUnsub();
  };
}

export async function fetchClipboardFromFirebase(): Promise<ClipEntry[]> {
  if (!(await isClipboardCloudSyncEnabled())) return [];
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return [];
  const user = rt.auth.currentUser;
  if (!user) return [];
  try {
    const ref = collection(rt.db, 'users', user.uid, 'clipboard');
    const snap = await getDocs(query(ref));
    return snap.docs
      .map((d) => ({ ...(d.data() as ClipEntry), id: d.id }))
      .filter((e) => e.kind === 'text' && e.content && e.id);
  } catch {
    return [];
  }
}

/**
 * Heuristic: does this clipboard content look like a credential or other
 * secret that must never be persisted to the cloud? When this returns true,
 * the entry stays local-only.
 *
 * The clipboard is one of the most sensitive surfaces in the app — users
 * routinely paste passwords, MFA codes, API tokens, JWTs, and card numbers
 * into it. An account takeover would otherwise expose the entire history.
 */
export function clipboardContentLooksSensitive(text: string): boolean {
  if (typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // OTP / 2FA / backup codes (4-10 pure digits)
  if (/^\d{4,10}$/.test(trimmed)) return true;
  // Backup-code style: groups of digits separated by space or dash
  if (/^[\d -]{8,}$/.test(trimmed) && /\d{4,}/.test(trimmed)) {
    const onlyDigits = trimmed.replace(/[^0-9]/g, '');
    if (onlyDigits.length >= 13 && onlyDigits.length <= 19) return true; // card-like
  }

  // JSON Web Token: three dot-separated base64url segments, first starts with "ey"
  if (/^ey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/.test(trimmed)) return true;

  // Common API-token prefixes (GitHub, Slack, OpenAI/Anthropic-shaped, AWS, Stripe, ...)
  if (/^(?:gh[pousr]_|github_pat_|sk-[A-Za-z0-9-]{16,}|sk_live_|sk_test_|pk_live_|pk_test_|xox[bpaors]-|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|ya29\.)/.test(trimmed)) {
    return true;
  }

  // High-entropy short single-token string (looks like a password / API key).
  // 12-128 chars, no whitespace, contains at least one each of lower / upper /
  // digit, plus optional symbol. This catches manually-typed strong passwords.
  if (trimmed.length >= 12 && trimmed.length <= 128 && !/\s/.test(trimmed)
      && /[a-z]/.test(trimmed) && /[A-Z]/.test(trimmed) && /\d/.test(trimmed)) {
    return true;
  }

  return false;
}

export async function upsertClipboardEntryInFirebase(entry: ClipEntry): Promise<void> {
  if (entry.kind !== 'text') return; // never sync images to Firestore
  if (!(await isClipboardCloudSyncEnabled())) return;
  // Privacy: keep credentials local-only.
  if (clipboardContentLooksSensitive(entry.content)) {
    await diag.info('clipboard.skipSync.sensitive', { len: entry.content.length });
    return;
  }
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  const user = rt.auth.currentUser;
  if (!user) return;
  await setDoc(
    doc(rt.db, 'users', user.uid, 'clipboard', entry.id),
    {
      id: entry.id,
      kind: 'text',
      content: entry.content,
      category: entry.category,
      source: entry.source,
      capturedAt: entry.capturedAt,
      sig: entry.sig,
      uid: user.uid,
      updatedAtServer: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function syncClipboardWithFirebase(localTextEntries: ClipEntry[]): Promise<ClipEntry[]> {
  if (!(await isClipboardCloudSyncEnabled())) return localTextEntries;
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return localTextEntries;
  const user = rt.auth.currentUser ?? await new Promise<import('firebase/auth').User | null>((resolve) => {
    const unsub = onAuthStateChanged(rt.auth!, (u) => { unsub(); resolve(u); });
  });
  if (!user) return localTextEntries;

  const ref = collection(rt.db, 'users', user.uid, 'clipboard');

  // Fetch remote state
  const snap = await getDocs(query(ref));
  const remoteMap = new Map<string, ClipEntry>();
  snap.forEach((d) => {
    const e = { ...(d.data() as ClipEntry), id: d.id };
    if (e.kind === 'text' && e.content) remoteMap.set(e.id, e);
  });

  // Push local entries that are newer or missing on remote
  const toWrite = localTextEntries.slice(0, CLIPBOARD_SYNC_LIMIT);
  for (const entry of toWrite) {
    // Privacy: skip credentials / OTPs / API tokens so they stay local-only.
    if (clipboardContentLooksSensitive(entry.content)) {
      remoteMap.delete(entry.id);
      continue;
    }
    const remote = remoteMap.get(entry.id);
    if (!remote || remote.capturedAt < entry.capturedAt) {
      await setDoc(
        doc(ref, entry.id),
        {
          id: entry.id,
          kind: 'text',
          content: entry.content,
          category: entry.category,
          source: entry.source,
          capturedAt: entry.capturedAt,
          sig: entry.sig,
          uid: user.uid,
          updatedAtServer: serverTimestamp(),
        },
        { merge: true },
      );
    }
    remoteMap.delete(entry.id);
  }

  // Return remote-only entries so caller can merge them locally
  return Array.from(remoteMap.values());
}

export async function deleteClipboardEntryInFirebase(entryId: string): Promise<void> {
  if (!(await isClipboardCloudSyncEnabled())) return;
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  const user = rt.auth.currentUser;
  if (!user) return;
  try {
    await deleteDoc(doc(rt.db, 'users', user.uid, 'clipboard', entryId));
  } catch { /* ignore */ }
}

export async function clearClipboardInFirebase(): Promise<void> {
  if (!(await isClipboardCloudSyncEnabled())) return;
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  const user = rt.auth.currentUser;
  if (!user) return;
  const ref = collection(rt.db, 'users', user.uid, 'clipboard');
  const snap = await getDocs(query(ref));
  for (const item of snap.docs) {
    await deleteDoc(doc(ref, item.id));
  }
}
