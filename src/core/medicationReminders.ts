/**
 * In-app medication reminder system
 * Uses AsyncStorage to track follow-ups, no native notifications required
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const REMINDERS_KEY = '@mykit_med_reminders_v1';

export interface MedicationReminder {
  noteId: string;
  medIndex: number; // Per-medication index in medications[] array
  followUpAt: number; // Unix ms
  medicationName: string;
  dismissed: boolean;
}

export async function loadReminders(): Promise<MedicationReminder[]> {
  try {
    const stored = await AsyncStorage.getItem(REMINDERS_KEY);
    if (!stored) return [];
    return JSON.parse(stored) as MedicationReminder[];
  } catch {
    return [];
  }
}

export async function saveReminders(reminders: MedicationReminder[]): Promise<void> {
  try {
    await AsyncStorage.setItem(REMINDERS_KEY, JSON.stringify(reminders));
  } catch {
    // silent fail
  }
}

export async function scheduleReminder(
  noteId: string,
  medIndex: number,
  followUpAt: number,
  medicationName: string,
  title = 'Medication reminder',
): Promise<void> {
  const current = await loadReminders();
  const filtered = current.filter((r) => !(r.noteId === noteId && r.medIndex === medIndex));
  const next = [
    ...filtered,
    { noteId, medIndex, followUpAt, medicationName, dismissed: false },
  ];
  await saveReminders(next);
  const { scheduleLocalNotification } = await import('./notifications');
  await scheduleLocalNotification({
    title,
    body: medicationName,
    at: followUpAt,
    data: { noteId, medIndex, kind: 'medication' },
  });
}

/**
 * Re-arm OS notifications for every active medication with a future
 * `nextSuggestedAt`. Native local notifications are dropped when the app is
 * killed and web `setTimeout` notifications die with the tab, so this is called
 * on app open to make reminders actually fire. Cancels any previously scheduled
 * native notifications first to avoid stacking duplicates across launches.
 *
 * `notes` is typed loosely to avoid a circular import with notes.ts.
 */
export async function rescheduleAllMedicationReminders(
  notes: Array<{ id: string; deletedAt?: number; workflowMetadata?: { medications?: Array<{ name?: string; nextSuggestedAt?: number; status?: string }> } }>,
  title = 'Medication reminder',
): Promise<number> {
  // Cancel previously scheduled native notifications (best-effort, native only).
  try {
    const { Platform } = await import('react-native');
    if (Platform.OS !== 'web') {
      const Notifications = await import('expo-notifications');
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  } catch {
    // Non-critical — re-scheduling below still runs.
  }

  const now = Date.now();
  let scheduled = 0;
  for (const note of notes) {
    if (!note || note.deletedAt) continue;
    const meds = note.workflowMetadata?.medications;
    if (!Array.isArray(meds)) continue;
    for (let i = 0; i < meds.length; i += 1) {
      const med = meds[i];
      const at = med?.nextSuggestedAt;
      if (med?.status === 'dismissed') continue;
      if (typeof at !== 'number' || !Number.isFinite(at) || at <= now) continue;
      await scheduleReminder(note.id, i, at, med?.name || 'Medication', title);
      scheduled += 1;
    }
  }
  return scheduled;
}

export async function dismissReminder(noteId: string, medIndex: number): Promise<void> {
  const current = await loadReminders();
  const next = current.map((r) =>
    r.noteId === noteId && r.medIndex === medIndex ? { ...r, dismissed: true } : r,
  );
  await saveReminders(next);
}

export async function snoozeReminder(
  noteId: string,
  medIndex: number,
  snoozeMs: number,
): Promise<void> {
  const current = await loadReminders();
  const next = current.map((r) =>
    r.noteId === noteId && r.medIndex === medIndex
      ? { ...r, followUpAt: Date.now() + snoozeMs, dismissed: false }
      : r,
  );
  await saveReminders(next);
}

export async function checkDueReminders(): Promise<MedicationReminder[]> {
  const current = await loadReminders();
  const now = Date.now();
  return current.filter(
    (r) => !r.dismissed && r.followUpAt <= now + 60_000,
  );
}
