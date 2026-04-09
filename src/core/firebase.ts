import { Platform } from 'react-native';
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  createUserWithEmailAndPassword,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth';
import {
  arrayUnion,
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
  updateDoc,
  where,
} from 'firebase/firestore';

import { ScanRecord } from '../types';
import type { NoteItem, NoteTemplate } from './notes';
import { diag } from './diagnostics';

const REQUIRED_FIREBASE_ENV = [
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_APP_ID',
] as const;

const OPTIONAL_FIREBASE_ENV = [
  'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
  'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
  'EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID',
] as const;

export type FirebaseRequiredEnvKey = (typeof REQUIRED_FIREBASE_ENV)[number];
export type FirebaseOptionalEnvKey = (typeof OPTIONAL_FIREBASE_ENV)[number];

export interface FirebaseRuntime {
  enabled: boolean;
  app: FirebaseApp | null;
  auth: Auth | null;
  db: Firestore | null;
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
  };
  return String(vars[name] || '').trim();
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

  return {
    config: {
      apiKey,
      authDomain,
      projectId,
      appId,
      storageBucket: storageBucket || undefined,
      messagingSenderId: messagingSenderId || undefined,
      measurementId: measurementId || undefined,
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

    // RN uses platform defaults through initializeAuth when available.
    return initializeAuth(app);
  } catch {
    // Auth ya inicializado en hot-reload o entorno mixto.
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

  runtime = {
    enabled: true,
    app,
    auth,
    db,
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

export async function onFirebaseAuthState(cb: (user: User | null) => void) {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) {
    cb(null);
    return () => {};
  }

  return onAuthStateChanged(rt.auth, cb);
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
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

export async function syncScansWithFirebase(local: ScanRecord[]) {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) {
    throw new Error(buildFirebaseDisabledErrorMessage(rt));
  }

  const user = rt.auth.currentUser;
  if (!user) throw new Error('No authenticated session to sync.');

  const uid = user.uid;
  const scansRef = collection(rt.db, 'users', uid, 'scans');

  let pushed = 0;
  for (const scan of local.filter((x) => x.status === 'pending')) {
    const docId = `${scan.profileId}_${scan.codeNormalized}_${new Date(scan.date).getTime()}`.replace(/[^A-Za-z0-9_-]/g, '_');
    await setDoc(doc(scansRef, docId), { ...scan, uid, updatedAt: serverTimestamp() }, { merge: true });
    pushed += 1;
  }

  const snap = await getDocs(query(scansRef));
  const server: ScanRecord[] = [];
  snap.forEach((d) => {
    const x = d.data() as ScanRecord;
    if (!x.id) x.id = d.id;
    server.push(x);
  });

  return { pushed, server };
}

// Real-time listener for scan changes (cross-device sync).
export async function subscribeToScans(
  callback: (scans: ScanRecord[]) => void
): Promise<() => void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return () => {};
  const user = rt.auth.currentUser;
  if (!user) return () => {};
  const scansRef = collection(rt.db, 'users', user.uid, 'scans');
  return onSnapshot(query(scansRef), (snap) => {
    const scans: ScanRecord[] = [];
    snap.forEach((d) => {
      const x = d.data() as ScanRecord;
      scans.push({ ...x, id: x.id || d.id });
    });
    callback(scans);
  });
}

// Real-time listener for notes + templates changes (cross-device sync).
export async function subscribeToNotes(
  callback: (data: { notes: NoteItem[]; templates: NoteTemplate[] }) => void
): Promise<() => void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return () => {};
  const user = rt.auth.currentUser;
  if (!user) return () => {};
  const notesRef = collection(rt.db, 'users', user.uid, 'notes');
  const templatesRef = collection(rt.db, 'users', user.uid, 'noteTemplates');

  let latestNotes: NoteItem[] = [];
  let latestTemplates: NoteTemplate[] = [];

  const notesUnsub = onSnapshot(query(notesRef), (snap) => {
    latestNotes = snap.docs.map((d) => ({ ...(d.data() as NoteItem), id: d.id }));
    callback({ notes: latestNotes, templates: latestTemplates });
  });

  const templatesUnsub = onSnapshot(query(templatesRef), (snap) => {
    latestTemplates = snap.docs.map((d) => ({ ...(d.data() as NoteTemplate), id: d.id }));
    callback({ notes: latestNotes, templates: latestTemplates });
  });

  return () => { notesUnsub(); templatesUnsub(); };
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

  // Read server state first so we can merge (newest updatedAt wins).
  const notesSnapBefore = await getDocs(query(notesRef));
  const serverNotesMap = new Map<string, NoteItem>();
  notesSnapBefore.forEach((d) => {
    const x = d.data() as NoteItem;
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
  for (const note of localNotesLimited) {
    const serverNote = serverNotesMap.get(note.id);
    if (!serverNote || note.updatedAt >= serverNote.updatedAt) {
      await setDoc(doc(notesRef, note.id), { ...note, uid, updatedAtServer: serverTimestamp() }, { merge: true });
      pushedNotes += 1;
    }
  }

  // Push local templates that are newer than (or absent from) the server.
  const localTemplatesLimited = localTemplates.slice(0, 300);
  let pushedTemplates = 0;
  for (const template of localTemplatesLimited) {
    const serverTemplate = serverTemplatesMap.get(template.id);
    if (!serverTemplate || template.updatedAt >= serverTemplate.updatedAt) {
      await setDoc(doc(templatesRef, template.id), { ...template, uid, updatedAtServer: serverTimestamp() }, { merge: true });
      pushedTemplates += 1;
    }
  }

  // Read final server state and merge with local (server may have items from other devices).
  const notesSnap = await getDocs(query(notesRef));
  const mergedNotesMap = new Map<string, NoteItem>();
  for (const note of localNotesLimited) mergedNotesMap.set(note.id, note);
  notesSnap.forEach((d) => {
    const x = { ...(d.data() as NoteItem), id: d.id };
    const existing = mergedNotesMap.get(x.id);
    if (!existing || x.updatedAt >= existing.updatedAt) mergedNotesMap.set(x.id, x);
  });
  const serverNotes = Array.from(mergedNotesMap.values());

  const templatesSnap = await getDocs(query(templatesRef));
  const mergedTemplatesMap = new Map<string, NoteTemplate>();
  for (const t of localTemplatesLimited) mergedTemplatesMap.set(t.id, t);
  templatesSnap.forEach((d) => {
    const x = { ...(d.data() as NoteTemplate), id: d.id };
    const existing = mergedTemplatesMap.get(x.id);
    if (!existing || x.updatedAt >= existing.updatedAt) mergedTemplatesMap.set(x.id, x);
  });
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

  const notesSnap = await getDocs(query(notesRef));
  const serverNotes: NoteItem[] = [];
  notesSnap.forEach((d) => {
    const x = d.data() as NoteItem;
    serverNotes.push({ ...x, id: x.id || d.id });
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
  await deleteDoc(doc(rt.db, 'users', user.uid, 'notes', noteId));
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
  if (!rt.enabled || !rt.auth || !rt.db) throw new Error(buildFirebaseDisabledErrorMessage(rt));
  const user = rt.auth.currentUser;
  if (!user) throw new Error('No authenticated session to join a group.');
  const inviteCode = normalizeInviteCode(inviteCodeInput);
  if (!inviteCode) return null;

  const groupsRef = collection(rt.db, 'noteGroups');
  const snap = await getDocs(query(groupsRef, where('inviteCode', '==', inviteCode)));
  if (snap.empty) return null;
  const first = snap.docs[0];
  const base = first.data() as SharedNoteGroup;
  const nextMembers = Array.from(new Set([...(base.members || []), user.uid]));
  await updateDoc(doc(rt.db, 'noteGroups', first.id), { members: arrayUnion(user.uid), updatedAt: serverTimestamp() });
  return { ...base, id: first.id, members: nextMembers };
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

export async function upsertSharedGroupNote(groupId: string, note: NoteItem): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  const user = rt.auth.currentUser;
  if (!user || !groupId) return;
  const groupRef = doc(rt.db, 'noteGroups', groupId);
  const groupSnap = await getDoc(groupRef);
  if (!groupSnap.exists()) return;
  await setDoc(doc(rt.db, 'noteGroups', groupId, 'notes', note.id), { ...note, groupId, updatedAtServer: serverTimestamp() }, { merge: true });
}

export async function deleteSharedGroupNote(groupId: string, noteId: string): Promise<void> {
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.auth || !rt.db) return;
  if (!groupId || !noteId) return;
  await deleteDoc(doc(rt.db, 'noteGroups', groupId, 'notes', noteId));
}

export async function fetchSharedGroupNotesForCurrentUser(): Promise<NoteItem[]> {
  const groups = await fetchSharedGroupsForCurrentUser();
  const rt = await initFirebaseRuntime();
  if (!rt.enabled || !rt.db) return [];
  const notes: NoteItem[] = [];
  for (const group of groups) {
    const snap = await getDocs(query(collection(rt.db, 'noteGroups', group.id, 'notes')));
    snap.forEach((d) => {
      const note = d.data() as NoteItem;
      notes.push({ ...note, id: note.id || d.id, groupId: group.id });
    });
  }
  return notes;
}
