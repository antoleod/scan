# Implementation Plan: Phase 1 + Phase 2
## Notes System Improvements (Opción A)

**Scope**: Layout Fix + Version History Implementation  
**Estimated Time**: 4-5 hours  
**Status**: 🎯 Ready to Start  

---

## 🔍 Current State Analysis

### Component Structure Found
```
✓ src/components/NoteCard.tsx        — Main note card component (700+ lines)
✓ src/components/NoteDetailModal.tsx — Note details modal
✗ src/components/NoteVersionsModal.tsx — DOES NOT EXIST (needs creation)
✓ src/types.ts                       — Global types (no NoteVersion types yet)
```

### Current NoteItem Type (Line 35-46 in NoteCard.tsx)
```typescript
type NoteItem = {
  id: string;
  title?: string;
  text: string;
  category: NoteCategory;
  pinned: boolean;
  archived?: boolean;
  color?: NoteColor;
  attachments?: string[];
  versions?: { id: string; title?: string; text: string; createdAt: number }[];
  updatedAt: number;
};
```

**Issue**: versions structure is too simple (no reason, no snapshots of color/status/etc)

### Current Layout Issue
**NoteCard.tsx, Lines 612-650**: ActionRow
```typescript
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
  // Action pills here
  // ❌ NO flexWrap: "wrap"
  // ❌ Could overflow on narrow screens
</View>
```

---

## 📋 Phase 1: Fix Layout Overlap (1 hour)

### Step 1.1: Understand Current Footer Structure
- ActionRow is inside editing state check (line 612)
- Uses ActionPill components (lines 71-100)
- Chevron toggle at end (lines 627-648)
- No separate badge row currently visible

### Step 1.2: Modify NoteCard.tsx
**Target**: Lines 612-650

**Changes**:
1. Add `flexWrap: 'wrap'` to ActionRow container
2. Ensure consistent `minHeight: 44` on all tap targets
3. Adjust gap spacing for wrapped items

**Code to apply**:
```typescript
// BEFORE (line 613)
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>

// AFTER
<View style={{
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',        // ← ADD THIS
  rowGap: 6,                // ← ADD THIS (for wrapped rows)
}}>
```

3. Verify ActionPill has `minHeight: 44` (update if needed, lines 86-94)

4. Update styling for all action buttons to ensure tap targets

### Step 1.3: Test Layout
```
Widths to test:
- 320px (iPhone SE)
- 375px (iPhone 12)
- 480px (Pixel 4)
```

**Acceptance**: No overlap, buttons wrap naturally, all >= 44px

---

## 🔄 Phase 2: Implement Version History (3-4 hours)

### Step 2.1: Create NoteVersion Types
**File**: `src/types/NoteVersion.ts` (NEW FILE)

Copy from improved prompt, complete file:
```typescript
export type NoteVersionReason =
  | "created"
  | "edited"
  | "color_changed"
  | "duplicated"
  | "renewed"
  | "merged"
  | "branched"
  | "workflow_converted"
  | "restored";

export type NoteVersion = {
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
};
```

### Step 2.2: Create Versioning Utility
**File**: `src/utils/noteVersions.ts` (NEW FILE)

Functions to implement:
```typescript
1. createInitialNoteVersion(note: Note): NoteVersion
2. createNoteSnapshot(note: Note, reason: NoteVersionReason, changeSummary?: string): NoteVersion
3. shouldCreateVersion(previousNote: Note, nextNote: Note, reason?: NoteVersionReason): boolean
4. applyNoteUpdateWithVersion(previousNote: Note, patch: Partial<Note>, reason?: NoteVersionReason): Note
5. restoreNoteVersion(note: Note, versionId: string): Note
6. branchNoteFromVersion(note: Note, versionId: string): Note
7. mergeNoteVersions(targetNote: Note, sourceNote: Note): Note
8. initializeVersionHistoryIfNeeded(note: Note): Note
```

**From improved prompt**: Copy entire implementation (about 500 LOC)

### Step 2.3: Extend Note Type
**File**: `src/types.ts`

Add to global Note/NoteItem type:
```typescript
export type Note = {
  // ... existing fields ...
  
  // Version tracking (NEW)
  versions?: NoteVersion[];
  currentVersionNumber?: number;
  lastVersionAt?: string;
  
  // ... other fields ...
};
```

### Step 2.4: Create NoteVersionsModal Component
**File**: `src/components/NoteVersionsModal.tsx` (NEW FILE)

Structure:
```typescript
export function NoteVersionsModal({
  note,
  isOpen,
  onClose,
  onRestore,
  onBranch,
  onPreview,
}: Props)

Key sections:
1. Current version display (last version in array)
2. Previous versions list (all except last)
3. Version card component (shows v#, reason, date, preview, text)
4. Action buttons (Branch, Preview, Restore for older versions)
5. Confirmation dialog for Restore
```

### Step 2.5: Integrate Into Edit Flow
**File**: Locate where notes are saved (likely in NotesTab.tsx)

**Changes**:
1. Import `applyNoteUpdateWithVersion` from utils
2. Before saving edited note:
   ```typescript
   const reason = determineChangeReason(oldNote, newNote);
   const noteWithVersion = applyNoteUpdateWithVersion(oldNote, newNote, reason);
   await saveNote(noteWithVersion);
   ```

3. Create `determineChangeReason()` helper:
   ```typescript
   function determineChangeReason(prev: Note, patch: Partial<Note>): NoteVersionReason {
     if (patch.color && prev.color !== patch.color) return "color_changed";
     if (patch.text && prev.text !== patch.text) return "edited";
     return "edited"; // default
   }
   ```

### Step 2.6: Add Storage Migration
**File**: Where notes are initialized (likely NotesTab.tsx or a hooks file)

On app load:
```typescript
async function initializeNotesWithVersions() {
  let notes = await loadNotesFromStorage();
  
  // Migrate old notes
  notes = notes.map(note => initializeVersionHistoryIfNeeded(note));
  
  // Save back
  await saveNotesToStorage(notes);
  
  return notes;
}
```

### Step 2.7: Wire Up Modal in NotesTab
Add state:
```typescript
const [versionNoteId, setVersionNoteId] = useState<string | null>(null);
```

Add component:
```typescript
<NoteVersionsModal
  note={notes.find(n => n.id === versionNoteId) || null}
  isOpen={versionNoteId !== null}
  onClose={() => setVersionNoteId(null)}
  onRestore={(versionId) => handleRestoreVersion(versionNoteId, versionId)}
  onBranch={(versionId) => handleBranchVersion(versionNoteId, versionId)}
  onPreview={(version) => handlePreviewVersion(version)}
/>
```

---

## ✅ Phase 1 Acceptance Criteria

- [ ] Action row has `flexWrap: 'wrap'`
- [ ] No overlap between buttons on 320px-480px screens
- [ ] All buttons maintain 44px+ tap target
- [ ] Text wraps cleanly when needed
- [ ] Copy, Share, Edit, Dupe buttons still work

## ✅ Phase 2 Acceptance Criteria

- [ ] NoteVersion.ts created with all types
- [ ] noteVersions.ts created with all 8 functions
- [ ] Note type extended with versions, currentVersionNumber, lastVersionAt
- [ ] Creating a note creates v1
- [ ] Editing a note creates v2
- [ ] Color change creates "color_changed" version
- [ ] NoteVersionsModal shows v1, v2, v3... in list
- [ ] Restore shows confirmation, saves current as new version
- [ ] Branch creates independent note
- [ ] Old notes auto-migrate on first load
- [ ] Versions persist after app restart
- [ ] Copy/Share/Edit/Dupe still work (no regression)

---

## 📊 File Checklist

### Files to CREATE:
- [ ] `src/types/NoteVersion.ts` — Types (copy from improved prompt)
- [ ] `src/utils/noteVersions.ts` — Versioning logic (copy from improved prompt)
- [ ] `src/components/NoteVersionsModal.tsx` — UI component (create from improved prompt)

### Files to MODIFY:
- [ ] `src/components/NoteCard.tsx` — Add flexWrap and test layout
- [ ] `src/types.ts` — Add Note type with version fields (if type exists elsewhere, update that)
- [ ] `src/components/mainApp/tabs/NotesTab.tsx` — Integrate edit flow + migration + modal

---

## 🧪 Testing Checklist

### Phase 1 Testing
```
□ Create a note on 320px screen
□ Verify all buttons visible, not overlapping
□ Try on 375px and 480px
□ Long-press to edit, then cancel — layout unchanged
□ Share, Copy, Edit actions still work
```

### Phase 2 Testing
```
□ Create note → Open versions modal → Shows v1 Created
□ Edit note → Save → Open versions modal → Shows v2 Edited
□ Edit color → Save → Shows v3 color_changed
□ Edit text AND color → Shows "Text and color changed"
□ Restore v1 → Confirmation appears → Current saved as v4 Restored
□ Branch from v1 → New note created → Has independent history
□ Force quit app → Reopen → Versions still present
□ Load old notes → Auto-migrate to v1 Created
□ Copy/Share/Edit/Dupe still work (no regression)
```

---

## ⏱️ Time Estimate Breakdown

| Phase | Task | Time |
|-------|------|------|
| 1 | Update NoteCard layout | 45 min |
| 1 | Test on multiple widths | 15 min |
| 2 | Create types file | 10 min |
| 2 | Create versioning utility | 45 min |
| 2 | Extend Note type | 10 min |
| 2 | Create versioning modal | 45 min |
| 2 | Integrate edit flow | 30 min |
| 2 | Add migration | 20 min |
| 2 | Testing & debugging | 60 min |
| **TOTAL** | | **4.5 hours** |

---

## 🚀 Next Steps

1. **Read improved_notes_prompt.md** in help/ folder for complete code examples
2. **Start with Phase 1** → Test layout changes
3. **Then Phase 2** → Copy code files and integrate
4. **Test manually** → Create → Edit → View versions → Restore
5. **Regression test** → Verify all existing features still work

---

## 📎 Reference Files from help/ folder

| File | Purpose |
|------|---------|
| `improved_notes_prompt.md` | Complete specification with code examples |
| `improvement_analysis.md` | Why it was improved (best practices) |
| `quick_reference.md` | Quick checklists and test cases |

---

## ✨ Success Looks Like

```
✅ Action row wraps correctly on mobile
✅ No UI overlap issues
✅ Create note → v1 Created shown in modal
✅ Edit note → v2 Edited shown in modal
✅ Edit color → v3 color_changed shown in modal
✅ Restore v1 → v4 Restored with content from v1
✅ Branch from v1 → New note created in list
✅ Old notes migrate → v1 auto-created
✅ App restart → Versions persist
✅ All existing features work (no regression)
```

Ready to start! 🎯

---

Generated: 2026-05-01  
Phase: Implementation Ready
