/**
 * Pure medication-cycle logic — NO platform/AsyncStorage/Firebase imports.
 *
 * These functions hold the safety-critical invariants of the medication
 * reminder cycle ("never mutate dose", "only touch a single medIndex", legacy
 * note fallbacks). They are split out of notes.ts precisely so they can be unit
 * tested in plain Node without dragging in react-native via the firebase import
 * chain. The async wrappers in notes.ts (markMedicationTaken, snoozeMedication,
 * …) just persist whatever these return.
 *
 * The type-only imports below are erased at compile time, so this module has no
 * runtime dependency on notes.ts.
 */
import type {
  NoteItem,
  MedicationCycleEntry,
  WorkflowMetadata,
  WorkflowStatus,
} from './notes';

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

export function deriveNoteStatusFromMeds(meds: MedicationCycleEntry[]): WorkflowStatus {
  if (!meds.length) return 'active';
  const statuses = meds.map((m) => (m.status || 'active'));
  if (statuses.includes('active')) return 'active';
  if (statuses.every((s) => s === 'dismissed')) return 'dismissed';
  return 'snoozed';
}

export function syncMetadataFromMeds(metadata: WorkflowMetadata, meds: MedicationCycleEntry[]): WorkflowMetadata {
  const now = Date.now();
  // Focus = nearest active or snoozed med; fallback to first med
  const candidates = meds.filter((m) => (m.status || 'active') !== 'dismissed');
  const sorted = candidates
    .filter((m) => typeof m.nextSuggestedAt === 'number')
    .sort((a, b) => (a.nextSuggestedAt as number) - (b.nextSuggestedAt as number));
  const future = sorted.find((m) => (m.nextSuggestedAt as number) >= now - 60_000);
  const focus = future || sorted[0] || candidates[0] || meds[0];
  if (!focus) return { ...metadata, medications: meds };
  return {
    ...metadata,
    medications: meds,
    medicationName: focus.name || metadata.medicationName,
    doseText: focus.dose || metadata.doseText,
    followUpAt: typeof focus.nextSuggestedAt === 'number' ? focus.nextSuggestedAt : metadata.followUpAt,
    takenAt: typeof focus.takenAt === 'number' ? focus.takenAt : metadata.takenAt,
  };
}

export function clampMedIndex(meds: MedicationCycleEntry[], index: number): number {
  if (!Array.isArray(meds) || meds.length === 0) return 0;
  if (!Number.isFinite(index) || index < 0) return 0;
  if (index >= meds.length) return meds.length - 1;
  return index;
}

export function ensureMedicationsList(metadata?: WorkflowMetadata): MedicationCycleEntry[] {
  const raw = Array.isArray(metadata?.medications) ? metadata!.medications! : [];
  if (raw.length > 0) {
    // Normalize legacy field names (minIntervalHours → minimumIntervalHours).
    return raw.map((entry) => {
      const legacy = entry as MedicationCycleEntry & { minIntervalHours?: number };
      const minimumIntervalHours = typeof entry.minimumIntervalHours === 'number'
        ? entry.minimumIntervalHours
        : (typeof legacy.minIntervalHours === 'number' ? legacy.minIntervalHours : undefined);
      return {
        ...entry,
        minimumIntervalHours,
        lastTakenAt: typeof entry.lastTakenAt === 'number' ? entry.lastTakenAt : entry.takenAt,
      };
    });
  }
  // Backward compat: synthesize a single entry from top-level fields
  const name = safeText(metadata?.medicationName).trim();
  if (!name) return [];
  const takenAt = typeof metadata?.takenAt === 'number' ? metadata!.takenAt : undefined;
  return [{
    name,
    dose: safeText(metadata?.doseText).trim() || undefined,
    takenAt,
    lastTakenAt: takenAt,
    nextSuggestedAt: typeof metadata?.followUpAt === 'number' ? metadata!.followUpAt : undefined,
    status: 'active',
  }];
}

// ── Pure cycle mutations ────────────────────────────────────────────────────
// Each takes an explicit `now` (defaulting to Date.now()) for deterministic tests.

export function applyMarkTaken(
  item: NoteItem,
  medIndex: number = 0,
  takenAt: number = Date.now(),
  now: number = Date.now(),
): NoteItem | null {
  const meds = ensureMedicationsList(item.workflowMetadata);
  if (!meds.length) return null;
  const idx = clampMedIndex(meds, medIndex);
  const entry = meds[idx];
  const interval = Number(entry.recommendedIntervalHours);
  const hasInterval = Number.isFinite(interval) && interval > 0;
  const nextSuggestedAt = hasInterval ? takenAt + interval * 3_600_000 : undefined;
  // Reset cycle for THIS medication only. Never touch dose.
  const updatedEntry: MedicationCycleEntry = {
    ...entry,
    takenAt,
    lastTakenAt: takenAt,
    nextSuggestedAt,
    snoozedUntil: undefined,
    lastActionAt: now,
    followPrescription: !hasInterval,
    status: 'active',
  };
  const nextMeds = meds.map((m, i) => i === idx ? updatedEntry : m);
  const newMeta = syncMetadataFromMeds(item.workflowMetadata || {}, nextMeds);
  newMeta.takenAtText = new Date(takenAt).toLocaleString();
  return {
    ...item,
    workflowMetadata: newMeta,
    workflowStatus: deriveNoteStatusFromMeds(nextMeds),
    updatedAt: now,
    syncStatus: 'pending' as const,
  };
}

export function applySnooze(
  item: NoteItem,
  medIndex: number = 0,
  snoozeMs: number = 10 * 60_000,
  now: number = Date.now(),
): NoteItem | null {
  const meds = ensureMedicationsList(item.workflowMetadata);
  if (!meds.length) return null;
  const idx = clampMedIndex(meds, medIndex);
  const entry = meds[idx];
  const safeSnooze = Math.max(60_000, Number(snoozeMs) || 0);
  const snoozedUntil = now + safeSnooze;
  // Snooze affects ONLY this medication; takenAt is preserved.
  const updatedEntry: MedicationCycleEntry = {
    ...entry,
    nextSuggestedAt: snoozedUntil,
    snoozedUntil,
    lastActionAt: now,
    status: 'snoozed',
  };
  const nextMeds = meds.map((m, i) => i === idx ? updatedEntry : m);
  const newMeta = syncMetadataFromMeds(item.workflowMetadata || {}, nextMeds);
  return {
    ...item,
    workflowMetadata: newMeta,
    workflowStatus: deriveNoteStatusFromMeds(nextMeds),
    updatedAt: now,
    syncStatus: 'pending' as const,
  };
}

export function applyDismiss(
  item: NoteItem,
  medIndex: number = 0,
  now: number = Date.now(),
): NoteItem | null {
  const meds = ensureMedicationsList(item.workflowMetadata);
  if (!meds.length) {
    // Legacy note with no medications array — fall back to dismissing whole note.
    return {
      ...item,
      workflowStatus: 'dismissed',
      updatedAt: now,
      syncStatus: 'pending' as const,
    };
  }
  const idx = clampMedIndex(meds, medIndex);
  const entry = meds[idx];
  // Cancel the cycle for THIS medication only. Note is not deleted.
  const updatedEntry: MedicationCycleEntry = {
    ...entry,
    status: 'dismissed',
    nextSuggestedAt: undefined,
    snoozedUntil: undefined,
    lastActionAt: now,
  };
  const nextMeds = meds.map((m, i) => i === idx ? updatedEntry : m);
  const newMeta = syncMetadataFromMeds(item.workflowMetadata || {}, nextMeds);
  return {
    ...item,
    workflowMetadata: newMeta,
    workflowStatus: deriveNoteStatusFromMeds(nextMeds),
    updatedAt: now,
    syncStatus: 'pending' as const,
  };
}

export function applyReactivate(
  item: NoteItem,
  medIndex: number = 0,
  now: number = Date.now(),
): NoteItem | null {
  const meds = ensureMedicationsList(item.workflowMetadata);
  if (!meds.length) {
    // Legacy note with no medications array — reactivate whole note.
    return {
      ...item,
      workflowStatus: 'active',
      updatedAt: now,
      syncStatus: 'pending' as const,
    };
  }
  const idx = clampMedIndex(meds, medIndex);
  const entry = meds[idx];
  if (entry.status !== 'dismissed') {
    return item; // Not dismissed, no change needed.
  }
  // Restore to active status and recalculate next suggested time.
  let nextSuggestedAt: number | undefined;
  if (typeof entry.lastTakenAt === 'number' && typeof entry.recommendedIntervalHours === 'number') {
    nextSuggestedAt = entry.lastTakenAt + entry.recommendedIntervalHours * 3_600_000;
  }
  const updatedEntry: MedicationCycleEntry = {
    ...entry,
    status: 'active',
    nextSuggestedAt,
    lastActionAt: now,
  };
  const nextMeds = meds.map((m, i) => i === idx ? updatedEntry : m);
  const newMeta = syncMetadataFromMeds(item.workflowMetadata || {}, nextMeds);
  return {
    ...item,
    workflowMetadata: newMeta,
    workflowStatus: deriveNoteStatusFromMeds(nextMeds),
    updatedAt: now,
    syncStatus: 'pending' as const,
  };
}
