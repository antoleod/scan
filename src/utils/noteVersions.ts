import { NoteVersion, NoteVersionReason } from '../types/NoteVersion';

export interface NoteWithVersions {
  id: string;
  title?: string;
  text: string;
  category: string;
  pinned: boolean;
  archived?: boolean;
  color?: string;
  attachments?: string[];
  versions?: NoteVersion[];
  currentVersionNumber?: number;
  lastVersionAt?: string;
  updatedAt: number;
  createdAt?: number;
  [key: string]: unknown;
}

function makeVersionId(noteId: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9);
  return `v_${noteId}_${timestamp}_${random}`;
}

/**
 * Create the initial version (v1) when a note is first created
 */
export function createInitialNoteVersion(note: NoteWithVersions): NoteVersion {
  return {
    id: makeVersionId(note.id),
    noteId: note.id,
    versionNumber: 1,
    createdAt: new Date().toISOString(),
    reason: 'created',
    changeSummary: 'Note created',
    title: note.title,
    text: note.text,
    color: note.color || null,
    status: undefined,
    tags: undefined,
  };
}

/**
 * Create a snapshot of the current note state
 */
export function createNoteSnapshot(
  note: NoteWithVersions,
  reason: NoteVersionReason,
  changeSummary?: string,
): NoteVersion {
  const versionNumber = (note.currentVersionNumber || 0) + 1;
  return {
    id: makeVersionId(note.id),
    noteId: note.id,
    versionNumber,
    createdAt: new Date().toISOString(),
    reason,
    changeSummary,
    title: note.title,
    text: note.text,
    color: note.color || null,
    status: undefined,
    tags: undefined,
  };
}

/**
 * Determine if a change warrants creating a new version
 * Filters out updatedAt-only changes
 */
export function shouldCreateVersion(
  previousNote: NoteWithVersions,
  nextNote: NoteWithVersions,
  reason?: NoteVersionReason,
): boolean {
  if (!previousNote || !nextNote) return true;

  // If reason is specified, trust it
  if (reason) return true;

  // Check actual content changes (not just timestamps)
  if (previousNote.text !== nextNote.text) return true;
  if (previousNote.title !== nextNote.title) return true;
  if (previousNote.color !== nextNote.color) return true;
  if (previousNote.archived !== nextNote.archived) return true;
  if (previousNote.pinned !== nextNote.pinned) return true;

  return false;
}

/**
 * Determine change reason from before/after state
 */
export function determineChangeReason(
  previousNote: NoteWithVersions,
  nextNote: NoteWithVersions,
): NoteVersionReason {
  if (!previousNote.text && nextNote.text) return 'edited';
  if (previousNote.text !== nextNote.text) return 'edited';
  if (previousNote.color !== nextNote.color) return 'color_changed';
  if (previousNote.archived !== nextNote.archived) return 'edited';
  if (previousNote.pinned !== nextNote.pinned) return 'edited';
  return 'edited';
}

/**
 * Apply an update with automatic versioning
 * Snapshots the previous state before applying changes
 */
export function applyNoteUpdateWithVersion(
  previousNote: NoteWithVersions,
  patch: Partial<NoteWithVersions>,
  reason?: NoteVersionReason,
): NoteWithVersions {
  // Determine the reason if not provided
  const nextNote = { ...previousNote, ...patch };
  const actualReason = reason || determineChangeReason(previousNote, nextNote);

  // Check if we should create a version
  if (!shouldCreateVersion(previousNote, nextNote, actualReason)) {
    return nextNote;
  }

  // Create a snapshot of the previous state
  const snapshot = createNoteSnapshot(previousNote, actualReason);

  // Initialize versions array if needed
  if (!previousNote.versions) {
    const initialVersion = createInitialNoteVersion(previousNote);
    previousNote.versions = [initialVersion];
    previousNote.currentVersionNumber = 1;
  }

  // Add the snapshot to the versions array
  const versions = [...(previousNote.versions || []), snapshot];

  // Keep max 12 versions
  if (versions.length > 12) {
    versions.shift();
  }

  return {
    ...nextNote,
    versions,
    currentVersionNumber: snapshot.versionNumber + 1,
    lastVersionAt: snapshot.createdAt,
  };
}

/**
 * Restore a note to a previous version
 * Creates a new version marking the restoration
 */
export function restoreNoteVersion(
  note: NoteWithVersions,
  versionId: string,
): NoteWithVersions {
  if (!note.versions) return note;

  const targetVersion = note.versions.find((v) => v.id === versionId);
  if (!targetVersion) return note;

  // Create a snapshot of current state before restoring
  const currentSnapshot = createNoteSnapshot(note, 'restored', `Restored from v${targetVersion.versionNumber}`);

  const restored = {
    ...note,
    title: targetVersion.title,
    text: targetVersion.text,
    color: targetVersion.color ?? undefined,
  };

  // Add the restoration snapshot to versions
  const versions = [...(note.versions || []), currentSnapshot];
  if (versions.length > 12) {
    versions.shift();
  }

  return {
    ...restored,
    versions,
    currentVersionNumber: currentSnapshot.versionNumber + 1,
    lastVersionAt: currentSnapshot.createdAt,
  };
}

/**
 * Create an independent note from a specific version
 */
export function branchNoteFromVersion(
  note: NoteWithVersions,
  versionId?: string,
): NoteWithVersions {
  const sourceVersion = versionId && note.versions
    ? note.versions.find((v) => v.id === versionId)
    : null;

  const branchId = `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const branchedNote: NoteWithVersions = {
    id: branchId,
    title: sourceVersion?.title || note.title,
    text: sourceVersion?.text || note.text,
    category: note.category || 'general',
    pinned: false,
    color: sourceVersion?.color || note.color,
    archived: false,
    updatedAt: Date.now(),
    createdAt: Date.now(),
  };

  // Create v1 for the branched note
  const initialVersion = createInitialNoteVersion(branchedNote);

  return {
    ...branchedNote,
    versions: [initialVersion],
    currentVersionNumber: 1,
    lastVersionAt: initialVersion.createdAt,
    metadata: {
      originalNoteId: note.id,
      sourceVersionId: versionId,
    },
  };
}

/**
 * Merge another note's content into this note
 */
export function mergeNoteVersions(
  targetNote: NoteWithVersions,
  sourceNote: NoteWithVersions,
): NoteWithVersions {
  // Create a snapshot of target before merging
  const snapshot = createNoteSnapshot(
    targetNote,
    'merged',
    `Merged from ${sourceNote.title || sourceNote.id}`,
  );

  // Append source content to target
  const mergedText = `${targetNote.text}\n\n---\n${sourceNote.text}`;

  const versions = [...(targetNote.versions || []), snapshot];
  if (versions.length > 12) {
    versions.shift();
  }

  return {
    ...targetNote,
    text: mergedText,
    versions,
    currentVersionNumber: snapshot.versionNumber + 1,
    lastVersionAt: snapshot.createdAt,
    metadata: {
      mergedFromVersionIds: sourceNote.versions?.map((v) => v.id) || [],
    },
  };
}

/**
 * Initialize version history for old notes (idempotent)
 * If a note already has versions, do nothing
 */
export function initializeVersionHistoryIfNeeded(note: NoteWithVersions): NoteWithVersions {
  // Already has versions
  if (note.versions && note.versions.length > 0) {
    return note;
  }

  // Initialize v1
  const initialVersion = createInitialNoteVersion(note);

  return {
    ...note,
    versions: [initialVersion],
    currentVersionNumber: 1,
    lastVersionAt: initialVersion.createdAt,
  };
}

/**
 * Get the current version of a note
 */
export function getCurrentVersion(note: NoteWithVersions): NoteVersion | null {
  if (!note.versions || note.versions.length === 0) return null;
  return note.versions[note.versions.length - 1];
}

/**
 * Get version by number
 */
export function getVersionByNumber(
  note: NoteWithVersions,
  versionNumber: number,
): NoteVersion | null {
  if (!note.versions) return null;
  return note.versions.find((v) => v.versionNumber === versionNumber) || null;
}

/**
 * Get all versions sorted by version number
 */
export function getAllVersionsSorted(note: NoteWithVersions): NoteVersion[] {
  if (!note.versions) return [];
  return [...note.versions].sort((a, b) => a.versionNumber - b.versionNumber);
}
