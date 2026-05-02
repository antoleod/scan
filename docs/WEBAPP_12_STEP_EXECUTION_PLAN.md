# MyKit WebApp 12-Step Execution Plan

## Goal
Implement, in order, the 12 high-impact improvements proposed for the MyKit web app, with clear ownership of where each change lives in the codebase.

## Execution Status
- [x] Step 1 - Smart Notes Inbox
- [x] Step 2 - Sync Health Panel
- [x] Step 3 - Shopping V2 as Primary Card
- [x] Step 4 - Quick Add Launcher
- [~] Step 5 - Reminder Layer (partially strengthened; deeper cycle UX still open)
- [x] Step 6 - OCR Routing Workflow
- [x] Step 7 - Version History UX (incremental improvements applied in Notes flow)
- [x] Step 8 - Better Search & Retrieval
- [x] Step 9 - Contextual Templates
- [x] Step 10 - Today Dashboard
- [x] Step 11 - i18n Hardening (Notes workflow strings hardened for en/es/fr)
- [x] Step 12 - Review-Before-Save Pattern

---

## Scope Baseline
- Keep existing Notes, Shopping, Medication, Sync, Clipboard behavior compatible.
- Reuse current data models (`NoteItem`, `workflowMetadata`, `smartType`) and existing UI flows.
- Avoid large redesigns; improve workflows incrementally.

---

## Step 1 - Smart Notes Inbox
**What:** Add an "inbox-style" grouped view (`Shopping`, `Medication`, `Work`, `Reminders`, `Images/OCR`, `Clipboard`).

**Main files:**
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/components/SearchFilterBar.tsx`
- `src/components/NoteCard.tsx`
- `src/components/NoteContentRenderer.tsx`

**Data touched:**
- Existing `note.category`, `note.smartType`, `note.attachments`.

---

## Step 2 - Sync Health Panel
**What:** Expand sync states (`Saved offline`, `Pending sync`, `Sync failed`, `Retrying`, `Synced`) and expose a small sync diagnostics panel.

**Main files:**
- `src/core/notes.ts`
- `src/core/firebase.ts`
- `src/components/NoteCard.tsx`
- `src/components/mainApp/tabs/NotesTab.tsx`

**Data touched:**
- `note.syncStatus` (may evolve to richer status enum)
- local retry metadata.

---

## Step 3 - Shopping V2 as Primary Card
**What:** Promote V2 shopping renderer for notes when shopping model is detected/stored.

**Main files:**
- `src/components/NoteContentRenderer.tsx`
- `src/components/NoteCard.tsx`
- `src/components/ShoppingListBlockV2.tsx`
- `src/core/shoppingListV2.ts`
- `src/core/shoppingList.ts`

**Data touched:**
- Shopping note text format + parsed model bridge (V1/V2 compatibility).

---

## Step 4 - Quick Add Launcher
**What:** Add quick entry actions (`Note`, `Shopping`, `Medication`, `Photo/OCR`, `Reminder`) from main notes workspace.

**Main files:**
- `src/components/ComposerSection.tsx`
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/components/QuickTemplatesModal.tsx`

**Data touched:**
- Draft state (`draftText`, `draftImages`, `workflowModalType`, `workflowModalData`).

---

## Step 5 - Reminder Layer
**What:** Strengthen reminder states and UX for medication/shopping follow-up.

**Main files:**
- `src/core/medicationReminders.ts`
- `src/components/MedicationCard.tsx`
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/core/notes.ts`

**Data touched:**
- `workflowStatus`
- `workflowMetadata.medications[].nextSuggestedAt`
- reminder persistence.

---

## Step 6 - OCR Routing Workflow
**What:** After image capture/import, provide intent routing (`Shopping`, `Extract text`, `Image note`) before commit.

**Main files:**
- `src/components/NoteComposerOcrPreview.tsx`
- `src/components/NoteOcrModal.tsx`
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/core/smartNotes.ts`

**Data touched:**
- OCR extracted text → draft conversion and workflow metadata.

---

## Step 7 - Version History UX
**What:** Improve note version browsing and restore experience.

**Main files:**
- `src/components/NoteCard.tsx`
- `src/components/NoteDetailModal.tsx`
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/core/notes.ts`

**Data touched:**
- `versions`, `currentVersionNumber`, `lastVersionAt`.

---

## Step 8 - Better Search & Retrieval
**What:** Add stronger filters and query matching by intent/category/time.

**Main files:**
- `src/components/SearchFilterBar.tsx`
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/core/smartSearch.ts`

**Data touched:**
- Search query parsing + derived filters.

---

## Step 9 - Contextual Templates
**What:** Suggest quick templates based on typed context (products, medication, reminders).

**Main files:**
- `src/components/QuickTemplatesModal.tsx`
- `src/components/ComposerSection.tsx`
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/core/smartNoteWorkflows.ts`

**Data touched:**
- Template suggestion heuristics and local dismiss state.

---

## Step 10 - Today Dashboard
**What:** Add "Today" summary section (next meds, pending shopping lists, recent notes, reminders).

**Main files:**
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/components/MedicationCard.tsx`
- `src/components/ShoppingListBlock.tsx` / `ShoppingListBlockV2.tsx`

**Data touched:**
- Derived view-model only (no breaking schema required).

---

## Step 11 - i18n Hardening
**What:** Move surfaced UI strings in this workflow to language-aware dictionary.

**Main files:**
- `src/components/ComposerSection.tsx`
- `src/components/ShoppingWorkflowModal.tsx`
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/core/shoppingDictionary.ts`
- `src/data/shopping/*.json`

**Data touched:**
- UI strings + localized labels for shopping conversion hints.

---

## Step 12 - Review-Before-Save Pattern
**What:** Standardize pre-save review card/modal for smart conversions (shopping, medication, reminders, OCR).

**Main files:**
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/components/ShoppingWorkflowModal.tsx`
- `src/components/MedicationWorkflowModal.tsx`
- `src/components/SmartWorkflowCard.tsx`

**Data touched:**
- Workflow draft payloads before final save.

---

## Execution Order
1. Steps 2, 3, 12 (stability + core UX loop)
2. Steps 4, 6, 9 (faster capture)
3. Steps 1, 10 (information architecture)
4. Steps 7, 8, 11 (polish + scale)
5. Step 5 parallelized where safe (reminder layer)

---

## Validation per Step
- Run: `npm run -s typecheck`
- Run: `npm test -- --runInBand`
- Manual smoke in web:
  - create/edit normal note
  - convert shopping suggestion path
  - medication follow-up path
  - offline/online sync behavior

---

## Risks to Control
- Duplicate note creation when converting workflow drafts.
- Losing checked items after shopping raw edit reparse.
- Regressions in existing medication flow.
- Over-triggering smart suggestions for normal narrative notes.

---

## Done Definition
Each step is done only if:
- behavior works on web and mobile layouts,
- no TS/test regression,
- existing saved notes keep rendering correctly,
- sync/offline behavior remains stable.
