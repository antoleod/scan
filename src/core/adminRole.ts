/**
 * Admin role service.
 *
 * Uses a Firestore `/admins/{uid}` allowlist as an MVP (no Firebase custom
 * claims required). The first admin must be bootstrapped manually via the
 * Firebase console — write a document at `/admins/{yourUid}` with:
 *   { uid: "...", role: "admin", addedAt: <epoch ms>, addedBy: "bootstrap" }
 *
 * Limitation: role is not embedded in the JWT — every role check hits
 * Firestore once per session and is cached in memory. Migrate to Firebase
 * custom claims when traffic warrants it.
 */
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseRuntimeSnapshot } from './firebase';
import { diag } from './diagnostics';

// ── Types ─────────────────────────────────────────────────────────────────────

export type AdminRole = 'user' | 'tester' | 'admin';

export interface AdminRecord {
  uid: string;
  role: 'admin' | 'tester';
  addedAt: number;
  addedBy: string;
  email?: string;
  displayName?: string;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

// uid → AdminRole, expires after 5 minutes
const roleCache = new Map<string, { role: AdminRole; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function setCached(uid: string, role: AdminRole): void {
  roleCache.set(uid, { role, expiresAt: Date.now() + CACHE_TTL_MS });
}

function getCached(uid: string): AdminRole | null {
  const entry = roleCache.get(uid);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { roleCache.delete(uid); return null; }
  return entry.role;
}

export function invalidateRoleCache(uid?: string): void {
  if (uid) roleCache.delete(uid);
  else roleCache.clear();
}

// ── Core lookup ───────────────────────────────────────────────────────────────

/**
 * Fetch the role for a uid from Firestore `/admins/{uid}`.
 * Returns 'user' when no record exists or Firebase is unavailable.
 */
export async function getAdminRole(uid: string): Promise<AdminRole> {
  const cached = getCached(uid);
  if (cached) return cached;

  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) { setCached(uid, 'user'); return 'user'; }

    const snap = await getDoc(doc(rt.db, 'admins', uid));
    const role: AdminRole = snap.exists()
      ? ((snap.data() as AdminRecord).role ?? 'user')
      : 'user';
    setCached(uid, role);
    return role;
  } catch (e) {
    void diag.warn('adminRole.fetch_failed', { uid, error: String(e) });
    return 'user';
  }
}

export async function isAdmin(uid: string): Promise<boolean> {
  return (await getAdminRole(uid)) === 'admin';
}

export async function isTester(uid: string): Promise<boolean> {
  const role = await getAdminRole(uid);
  return role === 'tester' || role === 'admin';
}

// ── Admin mutations (admin-only) ──────────────────────────────────────────────

/**
 * Grant or update a role for targetUid. Only callable by an admin.
 */
export async function setAdminRole(
  targetUid: string,
  role: 'admin' | 'tester',
  callerUid: string,
  displayName?: string,
  email?: string,
): Promise<void> {
  if (!(await isAdmin(callerUid))) {
    throw new Error('PERMISSION_DENIED: only admins can grant roles');
  }
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) throw new Error('Firebase unavailable');

  const record: Omit<AdminRecord, 'addedAt'> & { addedAt: unknown } = {
    uid: targetUid,
    role,
    addedAt: serverTimestamp(),
    addedBy: callerUid,
    ...(email ? { email } : {}),
    ...(displayName ? { displayName } : {}),
  };
  await setDoc(doc(rt.db, 'admins', targetUid), record);
  invalidateRoleCache(targetUid);
  void diag.info('adminRole.role_granted', { targetUid, role, callerUid });
}

/**
 * Revoke admin/tester access for targetUid. Only callable by an admin.
 */
export async function revokeAdminRole(targetUid: string, callerUid: string): Promise<void> {
  if (!(await isAdmin(callerUid))) {
    throw new Error('PERMISSION_DENIED: only admins can revoke roles');
  }
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) throw new Error('Firebase unavailable');

  await deleteDoc(doc(rt.db, 'admins', targetUid));
  invalidateRoleCache(targetUid);
  void diag.info('adminRole.role_revoked', { targetUid, callerUid });
}

/**
 * List all admin/tester records. Only callable by an admin.
 */
export async function listAdminRecords(callerUid: string): Promise<AdminRecord[]> {
  if (!(await isAdmin(callerUid))) {
    throw new Error('PERMISSION_DENIED: only admins can list admin records');
  }
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) return [];

  const q = query(collection(rt.db, 'admins'), orderBy('addedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as AdminRecord);
}
