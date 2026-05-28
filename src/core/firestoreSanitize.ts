/**
 * firestoreSanitize.ts
 * Pure helpers for making payloads safe to write to Firestore.
 *
 * Kept dependency-free (no Firebase SDK import) so it can be unit-tested in the
 * Node test runner, which never loads firebase.ts.
 */

/**
 * Recursively remove `undefined` from objects and arrays.
 *
 * Firestore rejects any `undefined` value — top-level OR nested — with
 * "Unsupported field value: undefined". Optional metadata such as
 * `workflowMetadata.doseText` or the medication `medications[]` cycle entries
 * routinely carry undefined fields, which is what broke note sync in production
 * (see `notes.push.note.error` in the exported logs).
 *
 * `null` is preserved (Firestore accepts it). `serverTimestamp()` sentinels are
 * added by callers *after* sanitizing, so they are never passed through here.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((entry) => entry !== undefined)
      .map((entry) => stripUndefinedDeep(entry)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue;
      out[key] = stripUndefinedDeep(entry);
    }
    return out as T;
  }
  return value;
}
