export {
  addClipboardEntryUnique,
  addClipboardImageUnique,
  captureClipboardNow,
  clearClipboardEntries,
  compressImage,
  classify,
  getClipboardEngineSnapshot,
  getClipboardPermission,
  importClipboardScreenshot,
  importClipboardScreenshotFromManual,
  isDuplicate,
  loadClipboardEntries,
  normalizeText,
  removeClipboardEntriesByDay,
  removeClipboardEntriesByIds,
  saveClipboardEntries,
  signature,
  startClipboardEngine,
  stopClipboardEngine,
  subscribeClipboardEntries,
  updateClipboardEntryCategory,
  blobToDataUrl,
  captureClipboardPasteText,
  reinitClipboardFirebaseSync,
} from '../clipboard/ClipboardEngine';

export {
  clearClipboardInFirebase,
  deleteClipboardEntryInFirebase,
  fetchClipboardFromFirebase,
  subscribeToClipboard,
  syncClipboardWithFirebase,
  upsertClipboardEntryInFirebase,
} from './firebase';

export type {
  ClipCategory as ClipboardCategory,
  ClipEntry as ClipboardEntry,
  ClipKind as ClipboardKind,
  ClipSource as ClipboardSource,
  PermState,
} from './clipboard.types';
