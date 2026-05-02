/**
 * NoteContentRenderer.tsx
 * Renders note content based on smartType and content analysis
 * Centralizes the rendering logic that was previously in NoteCard
 */
import React from 'react';
import { Text } from 'react-native';
import { SmartNoteModel } from '../core/smartNotes';
import { ShoppingListModel } from '../core/shoppingList';
import { ShoppingListBlock } from './ShoppingListBlock';
import { MedicationCard } from './MedicationCard';
import { NoteListBlock } from './NoteListBlock';

type Palette = {
  bg: string;
  accent: string;
  border: string;
  surface: string;
  surfaceAlt: string;
  textBody: string;
  textDim: string;
  textMuted: string;
  textPrimary: string;
  chipBorder: string;
};

type NoteColor = 'default' | 'amber' | 'mint' | 'sky' | 'rose';

type NoteItem = {
  id: string;
  title?: string;
  text: string;
  category: string;
  pinned: boolean;
  archived?: boolean;
  color?: NoteColor;
  attachments?: string[];
  versions?: { id: string; title?: string; text: string; createdAt: number }[];
  updatedAt: number;
  syncStatus?: 'pending' | 'synced';
  smartType?: 'none' | 'medication' | 'shopping' | 'reminder' | 'task';
  workflowStatus?: 'draft' | 'active' | 'snoozed' | 'completed' | 'dismissed';
  workflowMetadata?: {
    medicationName?: string;
    doseText?: string;
    takenAt?: number;
    takenAtText?: string;
    reason?: string;
    followUpAt?: number;
    followUpLabel?: string;
    medications?: Array<{
      name: string;
      dose?: string;
      takenAt?: number;
      lastTakenAt?: number;
      nextSuggestedAt?: number;
      snoozedUntil?: number;
      lastActionAt?: number;
      recommendedIntervalHours?: number;
      minimumIntervalHours?: number;
      followPrescription?: boolean;
      status?: 'active' | 'snoozed' | 'dismissed';
      safetyNote?: string;
    }>;
    checklistItems?: { id: string; text: string; completed: boolean }[];
  };
  groupId?: string;
};

interface NoteContentRendererProps {
  note: NoteItem;
  expanded: boolean;
  smartNoteModel: SmartNoteModel;
  shoppingModel: ShoppingListModel | null;
  preview: string;
  palette: Palette;
  onRawTextChange?: (text: string) => void;
  onPressOffice?: (office: string) => void;
  onCopyValue?: (value: string, label: 'IP' | 'Hostname') => void;
  onMedicationComplete?: () => void;
  onMedicationDismiss?: () => void;
  onMedicationTaken?: (medIndex: number) => void;
  onMedicationSnooze?: (medIndex: number, snoozeMs: number) => void;
  onMedicationDismissCycle?: (medIndex: number) => void;
}

/**
 * Render note content based on priority:
 * 1. smartType === 'medication' → MedicationCard
 * 2. smartType === 'shopping' OR isShoppingList → ShoppingListBlock
 * 3. isList → NoteListBlock
 * 4. Default → Plain text
 */
export function NoteContentRenderer({
  note,
  expanded,
  smartNoteModel,
  shoppingModel,
  preview,
  palette,
  onRawTextChange,
  onPressOffice,
  onCopyValue,
  onMedicationComplete,
  onMedicationDismiss,
  onMedicationTaken,
  onMedicationSnooze,
  onMedicationDismissCycle,
}: NoteContentRendererProps): React.ReactNode {
  // Priority 1: Medication notes
  if (note.smartType === 'medication') {
    return (
      <MedicationCard
        noteText={note.text}
        metadata={note.workflowMetadata}
        workflowStatus={note.workflowStatus}
        palette={palette}
        expanded={expanded}
        onComplete={onMedicationComplete || (() => {})}
        onDismiss={onMedicationDismiss || (() => {})}
        onTaken={onMedicationTaken}
        onSnooze={onMedicationSnooze}
        onDismissCycle={onMedicationDismissCycle}
      />
    );
  }

  // Priority 2: Shopping lists
  if ((note.smartType === 'shopping' || (shoppingModel?.isShoppingList)) && shoppingModel) {
    return (
      <ShoppingListBlock
        model={shoppingModel}
        palette={palette}
        expanded={expanded}
        onRawTextChange={onRawTextChange || (() => {})}
        isShared={Boolean(note.groupId)}
      />
    );
  }

  // Priority 3: List-like notes
  if (smartNoteModel.isList) {
    return (
      <NoteListBlock
        model={smartNoteModel}
        palette={palette}
        expanded={expanded}
      />
    );
  }

  // Priority 4: Default plain text
  return (
    <Text
      style={{ color: palette.textBody, fontSize: 14, lineHeight: 21 }}
      numberOfLines={expanded ? 0 : 3}
    >
      {preview}
    </Text>
  );
}
