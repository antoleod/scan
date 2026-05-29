/**
 * Admin analytics reader — Firestore query layer for the Admin Dashboard.
 *
 * All functions require an admin or tester uid. They read from:
 *  - analyticsDaily/{yyyyMMdd}          global daily aggregates
 *  - analyticsDaily/{yyyyMMdd}/activeUsers  unique active user presence marks
 *  - userAnalytics/{uid}/daily/{yyyyMMdd}   per-user daily aggregates
 *  - users/{uid}/stats/summary              lifetime user stats
 *  - users/{uid}/private/profile            username + email (admin only)
 *  - userIndex/{uid}                        lightweight user registry
 *  - admins/{uid}                           role records
 *
 * Privacy rules enforced here (in addition to Firestore rules):
 *  - Never return note text, scan content, or OCR output.
 *  - Email is only returned for admin callers.
 */
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { getFirebaseRuntimeSnapshot } from './firebase';
import { getAdminRole, type AdminRole } from './adminRole';
import { todayKey } from './analyticsAggregator';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Generate an array of yyyyMMdd keys for the last N days (today inclusive). */
export function lastNDayKeys(n: number): string[] {
  const keys: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    keys.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`);
  }
  return keys;
}

function sumField(docs: Record<string, unknown>[], field: string): number {
  return docs.reduce((acc, d) => acc + (typeof d[field] === 'number' ? (d[field] as number) : 0), 0);
}

function mergeBreakdown(docs: Record<string, unknown>[], field: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of docs) {
    const map = d[field];
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
        if (typeof v === 'number') out[k] = (out[k] ?? 0) + v;
      }
    }
  }
  return out;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OverviewStats {
  periodDays: number;
  activeUsersToday: number;
  activeUsersWeek: number;
  activeUsersMonth: number;
  appOpens: number;
  loginCount: number;
  noteCreatedCount: number;
  noteUpdatedCount: number;
  noteDeletedCount: number;
  scanCount: number;
  scanFailedCount: number;
  transferCount: number;
  transferFailedCount: number;
  noteTypesBreakdown: Record<string, number>;
  topFeatures: Record<string, number>;
  errorsBreakdown: Record<string, number>;
}

export interface UserRow {
  uid: string;
  uidPrefix: string;
  username?: string;
  email?: string;
  role: AdminRole;
  platform?: string;
  appVersion?: string;
  lastSeenAt?: number;
  lastLoginAt?: number;
  lastActiveAt?: number;
  totalLogins?: number;
  totalAppOpens?: number;
  totalNotesCreated?: number;
  totalScans?: number;
  totalTransfers?: number;
}

export interface AdminDashboardData {
  overview: OverviewStats;
  users: UserRow[];
  loadedAt: number;
  periodDays: number;
}

// ── Overview ──────────────────────────────────────────────────────────────────

export async function loadOverviewStats(periodDays: 1 | 7 | 30 = 7): Promise<OverviewStats> {
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) return emptyOverview(periodDays);
  const db = rt.db;

  const keys = lastNDayKeys(periodDays);
  const keyToday = keys[0];
  const keysWeek = lastNDayKeys(7);

  // Fetch daily docs in parallel
  const dailyDocs = await Promise.all(
    keys.map((k) => getDoc(doc(db, `analyticsDaily/${k}`)).then((s) => s.data() ?? {}))
  );

  // Active users: count presence marks in subcollection (Firestore COUNT aggregate)
  const [countToday, countWeek, countMonth] = await Promise.all([
    getCountFromServer(collection(db, `analyticsDaily/${keyToday}/activeUsers`))
      .then((r) => r.data().count).catch(() => 0),
    Promise.all(keysWeek.map((k) =>
      getCountFromServer(collection(db, `analyticsDaily/${k}/activeUsers`))
        .then((r) => r.data().count).catch(() => 0)
    )).then((counts) => new Set(counts).size > 0 ? Math.max(...counts) : 0),
    // For month: sum unique active user count — approximate (some users may overlap)
    Promise.resolve(0), // filled below
  ]);

  // Month: query activeUsers across last 30 days via collectionGroup
  let activeUsersMonth = 0;
  try {
    const monthKeys = lastNDayKeys(30);
    const monthSnap = await getCountFromServer(
      query(
        collectionGroup(db, 'activeUsers'),
        where('date', '>=', monthKeys[monthKeys.length - 1]),
        where('date', '<=', monthKeys[0]),
      )
    );
    // This gives total presence marks (not unique users), approximate for MVP
    activeUsersMonth = monthSnap.data().count;
  } catch { activeUsersMonth = 0; }

  const data = dailyDocs as Record<string, unknown>[];

  return {
    periodDays,
    activeUsersToday: countToday,
    activeUsersWeek: countWeek,
    activeUsersMonth,
    appOpens: sumField(data, 'appOpens'),
    loginCount: sumField(data, 'loginCount'),
    noteCreatedCount: sumField(data, 'noteCreatedCount'),
    noteUpdatedCount: sumField(data, 'noteUpdatedCount'),
    noteDeletedCount: sumField(data, 'noteDeletedCount'),
    scanCount: sumField(data, 'scanCount'),
    scanFailedCount: sumField(data, 'scanFailedCount'),
    transferCount: sumField(data, 'transferCount'),
    transferFailedCount: sumField(data, 'transferFailedCount'),
    noteTypesBreakdown: mergeBreakdown(data, 'noteTypesBreakdown'),
    topFeatures: mergeBreakdown(data, 'topFeatures'),
    errorsBreakdown: mergeBreakdown(data, 'errorsBreakdown'),
  };
}

function emptyOverview(periodDays: number): OverviewStats {
  return {
    periodDays,
    activeUsersToday: 0, activeUsersWeek: 0, activeUsersMonth: 0,
    appOpens: 0, loginCount: 0,
    noteCreatedCount: 0, noteUpdatedCount: 0, noteDeletedCount: 0,
    scanCount: 0, scanFailedCount: 0,
    transferCount: 0, transferFailedCount: 0,
    noteTypesBreakdown: {}, topFeatures: {}, errorsBreakdown: {},
  };
}

// ── User list ─────────────────────────────────────────────────────────────────

/**
 * Load user list from userIndex + their stats + profiles (admin-only for email).
 * Capped at 200 rows for MVP.
 */
export async function loadUserList(callerUid: string): Promise<UserRow[]> {
  const rt = await getFirebaseRuntimeSnapshot();
  if (!rt.enabled || !rt.db) return [];
  const db = rt.db;
  const callerRole = await getAdminRole(callerUid);
  const canReadEmail = callerRole === 'admin';

  // Load userIndex — lightweight registry of seen users, sorted by lastSeenAt desc
  let indexSnap;
  try {
    indexSnap = await getDocs(
      query(collection(db, 'userIndex'), orderBy('lastSeenAt', 'desc'), limit(200))
    );
  } catch { return []; }

  const rows: UserRow[] = [];

  await Promise.all(
    indexSnap.docs.map(async (indexDoc) => {
      const idx = indexDoc.data() as Record<string, unknown>;
      const uid = String(idx.uid ?? indexDoc.id);

      // Load stats (lifetime totals)
      const statsSnap = await getDoc(doc(db, `users/${uid}/stats/summary`)).catch(() => null);
      const stats = statsSnap?.data() as Record<string, unknown> | undefined;

      // Load role
      const role = await getAdminRole(uid);

      // Load profile (email/username) — only for admins, best-effort
      let username: string | undefined;
      let email: string | undefined;
      if (canReadEmail) {
        const profileSnap = await getDoc(doc(db, `users/${uid}/private/profile`)).catch(() => null);
        if (profileSnap?.exists()) {
          const profile = profileSnap.data() as Record<string, unknown>;
          username = typeof profile.username === 'string' ? profile.username : undefined;
          // Return email only to admins (never to testers)
          email = typeof profile.authEmail === 'string' ? profile.authEmail : undefined;
        }
      }

      rows.push({
        uid,
        uidPrefix: uid.slice(0, 8),
        username,
        email,
        role,
        platform: typeof idx.platform === 'string' ? idx.platform : undefined,
        appVersion: typeof idx.appVersion === 'string' ? idx.appVersion : undefined,
        lastSeenAt: typeof idx.lastSeenAt === 'number' ? idx.lastSeenAt : undefined,
        lastLoginAt: typeof stats?.lastLoginAt === 'number' ? stats.lastLoginAt as number : undefined,
        lastActiveAt: typeof stats?.lastActiveAt === 'number' ? stats.lastActiveAt as number : undefined,
        totalLogins: typeof stats?.totalLogins === 'number' ? stats.totalLogins as number : undefined,
        totalAppOpens: typeof stats?.totalAppOpens === 'number' ? stats.totalAppOpens as number : undefined,
        totalNotesCreated: typeof stats?.totalNotesCreated === 'number' ? stats.totalNotesCreated as number : undefined,
        totalScans: typeof stats?.totalScans === 'number' ? stats.totalScans as number : undefined,
        totalTransfers: typeof stats?.totalTransfers === 'number' ? stats.totalTransfers as number : undefined,
      });
    })
  );

  // Sort by lastSeenAt desc
  rows.sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
  return rows;
}
