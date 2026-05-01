export type NoteVersionReason =
  | 'created'
  | 'edited'
  | 'color_changed'
  | 'duplicated'
  | 'renewed'
  | 'merged'
  | 'branched'
  | 'workflow_converted'
  | 'restored';

export interface NoteVersion {
  // Identity
  id: string;
  noteId: string;
  versionNumber: number;

  // Metadata
  createdAt: string;
  reason: NoteVersionReason;
  changeSummary?: string;

  // Snapshot content
  title?: string;
  text: string;
  color?: string | null;
  workflowType?: string;
  reminderAt?: string | null;
  status?: string;
  tags?: string[];

  // Optional metadata
  metadata?: {
    originalNoteId?: string;
    sourceNoteId?: string;
    sourceVersionId?: string;
    renewCount?: number;
    mergedFromVersionIds?: string[];
    [key: string]: unknown;
  };
}
