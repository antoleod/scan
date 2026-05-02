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
): Promise<void> {
  const current = await loadReminders();
  const filtered = current.filter((r) => !(r.noteId === noteId && r.medIndex === medIndex));
  const next = [
    ...filtered,
    { noteId, medIndex, followUpAt, medicationName, dismissed: false },
  ];
  await saveReminders(next);
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
