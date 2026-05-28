/**
 * NoteContentRenderer.tsx
 * Renders note content based on smartType and content analysis
 * Centralizes the rendering logic that was previously in NoteCard
 */
import React, { useMemo } from 'react';
import { Text } from 'react-native';
import { SmartNoteModel } from '../core/smartNotes';
import { ShoppingListModel } from '../core/shoppingList';
import { ShoppingListBlockV2 } from './ShoppingListBlockV2';
import { parseShoppingListV2 } from '../core/shoppingListV2';
import { MedicationCard } from './MedicationCard';
import { NoteListBlock } from './NoteListBlock';
import type { NoteItem } from '../core/notes';
import type { NotePalette as Palette } from '../theme/theme';
import type { ShoppingListLanguage } from '../types';

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
  onMedicationReactivate?: (medIndex: number) => void;
  /** Catalog language used to parse/categorize the shopping list. The item names
   *  the user typed are always preserved (see parseShoppingListV2); this only
   *  drives category labels and catalog matching. */
  shoppingLanguage?: ShoppingListLanguage;
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
  onMedicationReactivate,
  shoppingLanguage = 'en',
}: NoteContentRendererProps): React.ReactNode {
  // Memoize the V2 shopping parse so it only re-runs when note.text or the
  // selected catalog language changes, not on every render triggered by
  // unrelated state updates in the parent.
  const shoppingModelV2 = useMemo(
    () => parseShoppingListV2(note.text, shoppingLanguage),
    [note.text, shoppingLanguage],
  );

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
        onReactivate={onMedicationReactivate}
      />
    );
  }

  // Priority 2: Shopping lists
  if ((note.smartType === 'shopping' || (shoppingModel?.isShoppingList)) && shoppingModel) {
    return (
      <ShoppingListBlockV2
        model={shoppingModelV2}
        palette={palette}
        onRawTextChange={onRawTextChange || (() => {})}
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
      style={{ color: palette.textBody, fontSize: 14, lineHeight: 21, flexShrink: 1 }}
      numberOfLines={expanded ? 0 : 3}
      ellipsizeMode="tail"
    >
      {preview}
    </Text>
  );
}
