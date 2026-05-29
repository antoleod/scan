/**
 * Analytics aggregator — writes batched events to Firestore counters.
 *
 * Collections written:
 *  - analyticsDaily/{yyyyMMdd}                      global daily totals
 *  - analyticsDaily/{yyyyMMdd}/activeUsers/{uid}     presence mark (for unique-user count)
 *  - userAnalytics/{uid}/daily/{yyyyMMdd}            per-user daily totals
 *  - users/{uid}/stats/summary                       lifetime user totals
 *
 * All writes use increment() for atomic counter updates.
 * WriteBatch keeps the round-trips to 1 per flush.
 */
import {
  doc,
  increment,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import { getFirebaseRuntimeSnapshot } from './firebase';
import { diag } from './diagnostics';
import type { AnalyticsEvent, AnalyticsEventName } from './analyticsService';

// ── Date key ──────────────────────────────────────────────────────────────────

export function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// ── Counter maps ──────────────────────────────────────────────────────────────

/** Map event name → global daily counter field name. */
const GLOBAL_COUNTER: Partial<Record<AnalyticsEventName, string>> = {
  app_open:            'appOpens',
  login_success:       'loginCount',
  note_created:        'noteCreatedCount',
  note_updated:        'noteUpdatedCount',
  note_deleted:        'noteDeletedCount',
  scan_started:        'scanCount',
  scan_failed:         'scanFailedCount',
  transfer_started:    'transferCount',
  transfer_failed:     'transferFailedCount',
};

/** Map event name → user daily counter field name. */
const USER_COUNTER: Partial<Record<AnalyticsEventName, string>> = {
  app_open:            'appOpens',
  login_success:       'loginCount',
  note_created:        'notesCreated',
  note_updated:        'notesUpdated',
  note_deleted:        'notesDeleted',
  scan_started:        'scansStarted',
  scan_success:        'scansSucceeded',
  scan_failed:         'scansFailed',
  transfer_started:    'transfersStarted',
  transfer_completed:  'transfersCompleted',
};

/** Map event name → user lifetime stats counter field. */
const STATS_COUNTER: Partial<Record<AnalyticsEventName, string>> = {
  app_open:            'totalAppOpens',
  login_success:       'totalLogins',
  note_created:        'totalNotesCreated',
  note_updated:        'totalNotesUpdated',
  note_deleted:        'totalNotesDeleted',
  scan_started:        'totalScans',
  scan_failed:         'totalScanFailures',
  transfer_started:    'totalTransfers',
};

// ── Batch flush ───────────────────────────────────────────────────────────────

/**
 * Takes a batch of AnalyticsEvent objects and writes aggregated increments
 * to Firestore in a single WriteBatch. Silently swallows errors — analytics
 * must never crash the app.
 */
export async function flushAnalyticsBatch(events: AnalyticsEvent[]): Promise<void> {
  if (events.length === 0) return;
  try {
    const rt = await getFirebaseRuntimeSnapshot();
    if (!rt.enabled || !rt.db) return;
    const db = rt.db;

    // Accumulate increments per uid+date to minimise document writes.
    const dateKey = todayKey();

    // { docPath → { field → delta } }
    const increments: Map<string, Map<string, number>> = new Map();
    // Active-user presence marks: uid set
    const activeUids = new Set<string>();
    // Platforms and app versions for stats
    const statsMeta: Map<string, { platform: string; appVersion: string; ts: number }> = new Map();

    const touch = (path: string, field: string, delta = 1) => {
      if (!increments.has(path)) increments.set(path, new Map());
      const m = increments.get(path)!;
      m.set(field, (m.get(field) ?? 0) + delta);
    };

    for (const ev of events) {
      const { uid, event, payload, platform, appVersion, ts } = ev;
      const globalPath = `analyticsDaily/${dateKey}`;
      const userPath = `userAnalytics/${uid}/daily/${dateKey}`;
      const statsPath = `users/${uid}/stats/summary`;

      // Global counters
      const gField = GLOBAL_COUNTER[event];
      if (gField) touch(globalPath, gField);

      // Note type breakdown (global)
      if (payload.noteType && typeof payload.noteType === 'string') {
        touch(globalPath, `noteTypesBreakdown.${payload.noteType}`);
        touch(userPath, `noteTypesBreakdown.${payload.noteType}`);
      }

      // Feature usage (global + user)
      if (payload.feature && typeof payload.feature === 'string') {
        touch(globalPath, `topFeatures.${payload.feature}`);
        touch(userPath, `featuresUsed.${payload.feature}`);
      }

      // Error code breakdown (global)
      if (payload.errorCode && typeof payload.errorCode === 'string') {
        touch(globalPath, `errorsBreakdown.${payload.errorCode}`);
      }

      // User daily counters
      const uField = USER_COUNTER[event];
      if (uField) touch(userPath, uField);

      // User lifetime stats
      const sField = STATS_COUNTER[event];
      if (sField) touch(statsPath, sField);

      // Active users mark
      activeUids.add(uid);

      // Stats meta (keep latest per uid)
      if (!statsMeta.has(uid) || (statsMeta.get(uid)!.ts < ts)) {
        statsMeta.set(uid, { platform, appVersion, ts });
      }
    }

    // Firestore WriteBatch (max 500 ops; a single flush batch << 20 events → safe)
    const batch = writeBatch(db);

    // Write increments
    for (const [path, fields] of increments) {
      const docRef = doc(db, path);
      const update: Record<string, unknown> = {};
      for (const [field, delta] of fields) {
        // Dot-notation fields (e.g. noteTypesBreakdown.medication) need to be
        // passed as nested objects because WriteBatch.set with merge handles them.
        update[field] = increment(delta);
      }
      batch.set(docRef, update, { merge: true });
    }

    // Active users subcollection — write {ts} per uid (cheap presence mark)
    for (const uid of activeUids) {
      const ref = doc(db, `analyticsDaily/${dateKey}/activeUsers/${uid}`);
      batch.set(ref, { ts: Date.now(), date: dateKey }, { merge: true });
    }

    // userIndex/{uid} — lightweight user registry (for admin user list)
    // Contains only non-private metadata: uid, platform, appVersion, lastSeenAt.
    for (const [uid, meta] of statsMeta) {
      const ref = doc(db, `userIndex/${uid}`);
      batch.set(ref, {
        uid,
        platform: meta.platform,
        appVersion: meta.appVersion,
        lastSeenAt: meta.ts,
      }, { merge: true });
    }

    // Stats metadata (platform, appVersion, lastActiveAt)
    for (const [uid, meta] of statsMeta) {
      const ref = doc(db, `users/${uid}/stats/summary`);
      batch.set(ref, {
        platformLastUsed: meta.platform,
        appVersionLastUsed: meta.appVersion,
        lastActiveAt: meta.ts,
      }, { merge: true });
    }

    // User daily lastActiveAt
    for (const uid of activeUids) {
      const ref = doc(db, `userAnalytics/${uid}/daily/${dateKey}`);
      batch.set(ref, { lastActiveAt: Date.now(), date: dateKey }, { merge: true });
    }

    await batch.commit();
    void diag.info('analytics.flush', { events: events.length, uids: activeUids.size });
  } catch (e) {
    void diag.warn('analytics.flush_failed', { error: String(e), events: events.length });
  }
}
