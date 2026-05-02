import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import {
  subscribeToNotes,
  subscribeToSharedGroups,
  subscribeToSharedGroupNotes,
  syncNotesWithFirebase,
  upsertSharedGroupNote,
  type SharedNoteGroup,
} from '../../../core/firebase';
import { useAuth } from '../../../auth/useAuth';
import {
  NoteCategory,
  NoteItem,
  NoteTemplate,
  addRichNoteUnique,
  addTemplate,
  clearDraftFlag,
  createBranchFromNoteVersion,
  mergeNoteVersion,
  updateTemplate,
  ensureWorkNotesAndEmailTemplates,
  removeNote,
  removeTemplate,
  setNoteColor,
  togglePinned,
  toggleArchived,
  updateNoteText,
  updateNoteTitle,
  buildAppointmentIcs,
  updateWorkflowStatus,
  updateNoteSmartType,
  markNotesSynced,
  markMedicationTaken,
  snoozeMedication,
  dismissMedication,
  reactivateMedication,
  type WorkflowStatus,
  type MedicationCycleEntry,
} from '../../../core/notes';
import { detectSmartWorkflow, type SmartWorkflowDetection, type SmartWorkflowType } from '../../../core/smartNoteWorkflows';
import { findMedication } from '../../../core/euMedicationDatabase';
import { checkDueReminders, dismissReminder, snoozeReminder, scheduleReminder, type MedicationReminder } from '../../../core/medicationReminders';
import { flushQueue } from '../../../core/offlineQueue';
import { analyzeShoppingListCandidate, parseShoppingList, shoppingListToText, type ShoppingListCandidateAnalysis } from '../../../core/shoppingList';
import { safeText } from '../../../utils/groceryDetection';
import { ClipboardEntry } from '../../../core/clipboard.types';
import { loadDeletedNoteKeys, markDeletedNoteKey, noteStorageKey } from '../../../core/noteDeletions';
import { WorkflowMetadata } from '../../../core/notes';
import { ClipboardScreen } from '../../../screens/ClipboardScreen';
import { mainAppStyles } from '../styles';
import { TabBar } from '../../TabBar';
import { ComposerSection } from '../../ComposerSection';
import { SearchFilterBar } from '../../SearchFilterBar';
import { NoteCard } from '../../NoteCard';
import { SmartNoteGeneratorModal } from '../../SmartNoteGeneratorModal';
import { SmartWorkflowCard } from '../../SmartWorkflowCard';
import { MedicationWorkflowModal } from '../../MedicationWorkflowModal';
import { ShoppingWorkflowModal } from '../../ShoppingWorkflowModal';
import { NoteOcrModal } from '../../NoteOcrModal';
import { NoteDetailModal } from '../../NoteDetailModal';
import { Toast, useToast } from '../../Toast';
import { AppSettings } from '../../../types';

type Palette = { bg: string; fg: string; accent: string; muted: string; card: string; border: string };
type WorkspaceTab = 'notes' | 'templates' | 'clipboard';
type NoteFilter = 'all' | 'work' | 'pinned' | 'draft' | 'archived';
type InboxView = 'all' | 'shopping' | 'medication' | 'work' | 'reminder' | 'image';

const DRAFT_KEY = '@MyKit_notes_draft_v2';

function detectAutoCategory(text: string): NoteCategory {
  const value = String(text || '').toUpperCase();
  if (/\b(RITM\d+|INC\d+|REQ\d+|SCTASK\d+)\b/.test(value)) return 'work';
  if (/\b(USER|WORK|REQUEST|OFFICE|CALL|FOLLOW)\b/.test(value)) return 'work';
  return 'general';
}

type DiffLine = { type: 'same' | 'add' | 'remove'; line: string };
function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText ? oldText.split('\n') : [];
  const b = newText ? newText.split('\n') : [];
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const result: DiffLine[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { result.unshift({ type: 'same', line: a[i - 1] }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { result.unshift({ type: 'add', line: b[j - 1] }); j--; }
    else { result.unshift({ type: 'remove', line: a[i - 1] }); i--; }
  }
  return result;
}

function chunk<T>(items: T[], columns: number): T[][] {
  if (columns <= 1) return items.map((item) => [item]);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return rows;
}

function noteKey(note: Pick<NoteItem, 'id' | 'groupId'>): string {
  return noteStorageKey(note.id, note.groupId ? 'group' : 'personal', note.groupId);
}

function sortNotes(items: NoteItem[]): NoteItem[] {
  return [...items].sort((a, b) => (a.pinned === b.pinned ? b.updatedAt - a.updatedAt : a.pinned ? -1 : 1));
}

function mergeNotesByNewest(localNotes: NoteItem[], serverNotes: NoteItem[], sharedNotes: NoteItem[], deletedKeys: Set<string>): NoteItem[] {
  const map = new Map<string, NoteItem>();
  for (const item of [...localNotes, ...serverNotes, ...sharedNotes]) {
    const key = noteKey(item);
    if (item.deletedAt || deletedKeys.has(key)) {
      map.delete(key);
      continue;
    }
    const prev = map.get(key);
    if (!prev || Number(item.updatedAt || 0) >= Number(prev.updatedAt || 0)) {
      map.set(key, item);
    }
  }
  return sortNotes(Array.from(map.values()));
}

function mergeTemplatesByNewest(local: NoteTemplate[], incoming: NoteTemplate[]): NoteTemplate[] {
  const map = new Map<string, NoteTemplate>();
  for (const item of local) map.set(item.id, item);
  for (const item of incoming) {
    const prev = map.get(item.id);
    if (!prev || item.updatedAt >= prev.updatedAt) map.set(item.id, item);
  }
  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function NotesTab({ palette, settings }: { palette: Palette; settings: AppSettings }) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const desktopColumns = width >= 1600 ? 3 : width >= 1200 ? 2 : 1;

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('notes');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);

  const [draftText, setDraftText] = useState('');
  const draftTextValue = String(draftText || '');
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [manualCategory, setManualCategory] = useState<NoteCategory | null>(null);
  const [detectedWorkflow, setDetectedWorkflow] = useState<SmartWorkflowDetection | null>(null);
  const [dueReminders, setDueReminders] = useState<MedicationReminder[]>([]);
  const [filter, setFilter] = useState<NoteFilter>('all');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const [templateName, setTemplateName] = useState('');
  const [templateTo, setTemplateTo] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateSearch, setTemplateSearch] = useState('');
  const [groups, setGroups] = useState<SharedNoteGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string>('personal');
  const [previewEntry, setPreviewEntry] = useState<ClipboardEntry | null>(null);
  const [previewNoteImageUri, setPreviewNoteImageUri] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<NoteItem | null>(null);
  const [generatorVisible, setGeneratorVisible] = useState(false);
  const [ocrVisible, setOcrVisible] = useState(false);
  const [detailNote, setDetailNote] = useState<NoteItem | null>(null);
  const [versionNoteId, setVersionNoteId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [workflowModalType, setWorkflowModalType] = useState<SmartWorkflowType | null>(null);
  const [workflowModalData, setWorkflowModalData] = useState<Record<string, unknown>>({});
  const [draftAutoSaveStatus, setDraftAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const { toast, show: showToast, hide: hideToast } = useToast();

  const draftAutoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftAutoSaveClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchText, setSearchText] = useState('');
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [officeEntityFilter, setOfficeEntityFilter] = useState<string | null>(null);
  const [inboxView, setInboxView] = useState<InboxView>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [notesPage, setNotesPage] = useState(1);
  const draftInputRef = useRef<React.ElementRef<typeof TextInput> | null>(null);
  const templateInputRef = useRef<React.ElementRef<typeof TextInput> | null>(null);

  // Ref to avoid auto-pushing notes back to Firebase when they just arrived from the server.
  const serverUpdateRef = useRef(false);
  const notesSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletedNoteKeysRef = useRef<Set<string>>(new Set());
  const serverNotesRef = useRef<NoteItem[]>([]);
  const sharedNotesRef = useRef<NoteItem[]>([]);

  const autoCategory = useMemo(() => detectAutoCategory(draftTextValue), [draftTextValue]);
  const activeCategory = manualCategory || autoCategory;

  function handleDraftTextChange(value: unknown) {
    if (typeof value === 'string') {
      setDraftText(value);
      return;
    }
    const nativeText = (value as { nativeEvent?: { text?: unknown } })?.nativeEvent?.text;
    setDraftText(typeof nativeText === 'string' ? nativeText : String(value || ''));
  }

  async function handleRemoveNote(id: string): Promise<NoteItem[]> {
    const existing = notes.find((item) => item.id === id);
    const key = noteKey(existing ?? { id, groupId: undefined });
    deletedNoteKeysRef.current.add(key);
    await markDeletedNoteKey(key);
    return removeNote(id);
  }

  useEffect(() => {
    ensureWorkNotesAndEmailTemplates().then(({ notes: n, templates: t }) => {
      setNotes(n);
      setTemplates(t);
    }).catch(() => undefined);
    loadDeletedNoteKeys().then((keys) => {
      deletedNoteKeysRef.current = new Set([...deletedNoteKeysRef.current, ...keys]);
    }).catch(() => undefined);
  }, []);

  // Real-time cross-device sync via Firestore onSnapshot.
  useEffect(() => {
    if (!user) return;
    let unsub: (() => void) | null = null;
  subscribeToNotes(({ notes: serverNotes, templates: serverTemplates }) => {
      serverUpdateRef.current = true;
      serverNotesRef.current = serverNotes;
      setNotes((current) => {
        return mergeNotesByNewest(current, serverNotesRef.current, sharedNotesRef.current, deletedNoteKeysRef.current);
      });
      setTemplates((current) => {
        return mergeTemplatesByNewest(current, serverTemplates);
      });
    }).then((u) => { unsub = u; }).catch(() => undefined);
    return () => { unsub?.(); };
  }, [user?.uid]);

  // Auto-push notes to Firebase when they change locally (debounced, skips server-initiated updates).
  useEffect(() => {
    if (!user) return;
    const hasPendingLocalNotes = notes.some((item) => item.syncStatus === 'pending' || item.syncStatus === 'retrying' || item.syncStatus === 'offline');
    if (serverUpdateRef.current && !hasPendingLocalNotes) {
      serverUpdateRef.current = false;
      return;
    }
    serverUpdateRef.current = false;
    if (notesSyncTimerRef.current) clearTimeout(notesSyncTimerRef.current);
    notesSyncTimerRef.current = setTimeout(async () => {
      const pendingIds = new Set(
        notes.filter((n) => n.syncStatus === 'pending' || n.syncStatus === 'retrying' || n.syncStatus === 'offline').map((n) => n.id),
      );
      try {
        setNotes((current) => current.map((item) =>
          pendingIds.has(item.id) ? { ...item, syncStatus: 'retrying' as const } : item,
        ));
        await syncNotesWithFirebase(notes, templates);
        if (pendingIds.size > 0) {
          const updated = await markNotesSynced(pendingIds);
          serverUpdateRef.current = true;   // prevents re-sync loop
          setNotes(updated);
        }
      } catch {
        setNotes((current) => current.map((item) => {
          if (!pendingIds.has(item.id)) return item;
          return {
            ...item,
            syncStatus: (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' as const : 'failed' as const,
          };
        }));
      }
    }, 1500);
    return () => {
      if (notesSyncTimerRef.current) clearTimeout(notesSyncTimerRef.current);
    };
  }, [notes, templates, user?.uid]);

  useEffect(() => {
    if (!user || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const retryPendingSync = async () => {
      const pendingIds = new Set(
        notes.filter((n) => n.syncStatus === 'pending' || n.syncStatus === 'retrying' || n.syncStatus === 'offline' || n.syncStatus === 'failed').map((n) => n.id),
      );
      if (pendingIds.size === 0) return;
      try {
        await syncNotesWithFirebase(notes, templates);
        const updated = await markNotesSynced(pendingIds);
        serverUpdateRef.current = true;
        setNotes(updated);
      } catch {
        // network failure or auth issue
      }
    };
    window.addEventListener('online', retryPendingSync);
    return () => window.removeEventListener('online', retryPendingSync);
  }, [notes, templates, user?.uid]);

  // Live shared groups + their notes (cross-device / multi-user).
  useEffect(() => {
    if (!user) return;
    let groupsUnsub: (() => void) | null = null;
    let notesUnsub: (() => void) | null = null;
    subscribeToSharedGroups(setGroups).then((u) => { groupsUnsub = u; }).catch(() => undefined);
    subscribeToSharedGroupNotes((sharedNotes) => {
      serverUpdateRef.current = true;
      sharedNotesRef.current = sharedNotes;
      setNotes((current) => {
        return mergeNotesByNewest(current, serverNotesRef.current, sharedNotesRef.current, deletedNoteKeysRef.current);
      });
    }).then((u) => { notesUnsub = u; }).catch(() => undefined);
    return () => { groupsUnsub?.(); notesUnsub?.(); };
  }, [user?.uid]);

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.text === 'string') setDraftText(parsed.text);
      if (Array.isArray(parsed?.images)) setDraftImages(parsed.images.map((v: unknown) => String(v || '')).filter(Boolean));
      if (parsed?.category === 'general' || parsed?.category === 'work') setManualCategory(parsed.category);
    }).catch(() => undefined);
  }, []);

  // Auto-save draft after 10 seconds of inactivity
  useEffect(() => {
    // Only auto-save when in notes tab with non-empty content
    const hasContent = draftTextValue.trim().length > 0;
    if (workspaceTab !== 'notes' || (!hasContent && draftImages.length === 0)) {
      if (draftAutoSaveTimerRef.current) {
        clearTimeout(draftAutoSaveTimerRef.current);
        draftAutoSaveTimerRef.current = null;
      }
      return;
    }

    // Cancel previous timer (user is still typing)
    if (draftAutoSaveTimerRef.current) {
      clearTimeout(draftAutoSaveTimerRef.current);
      draftAutoSaveTimerRef.current = null;
    }

    if (draftAutoSaveClearTimerRef.current) {
      clearTimeout(draftAutoSaveClearTimerRef.current);
      draftAutoSaveClearTimerRef.current = null;
    }

    // Set new timer (save after 10 seconds of inactivity)
    draftAutoSaveTimerRef.current = setTimeout(async () => {
      setDraftAutoSaveStatus('saving');
      try {
        await AsyncStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ text: draftTextValue, images: draftImages, category: manualCategory, updatedAt: Date.now() })
        );
        setDraftAutoSaveStatus('saved');

        // Clear "saved" status after 2 seconds
        draftAutoSaveClearTimerRef.current = setTimeout(() => {
          setDraftAutoSaveStatus('idle');
        }, 2000);
      } catch {
        setDraftAutoSaveStatus('idle');
      }
    }, 10000); // 10 seconds

    return () => {
      if (draftAutoSaveTimerRef.current) {
        clearTimeout(draftAutoSaveTimerRef.current);
        draftAutoSaveTimerRef.current = null;
      }
    };
  }, [draftTextValue, draftImages, manualCategory, workspaceTab]);

  // Real-time workflow detection while typing
  useEffect(() => {
    if (!draftTextValue.trim()) {
      setDetectedWorkflow(null);
      return;
    }

    // Allow short text if it contains a known medication
    const hasMedication = findMedication(draftTextValue) !== null;
    if (draftTextValue.length < 3 && !hasMedication) {
      setDetectedWorkflow(null);
      return;
    }

    const detection = detectSmartWorkflow(draftTextValue);
    if (detection.type !== 'none' && detection.type !== 'shopping' && detection.confidence >= 0.65) {
      setDetectedWorkflow(detection);
    } else {
      setDetectedWorkflow(null);
    }
  }, [draftTextValue]);

  // Poll for due medication reminders every 60 seconds
  useEffect(() => {
    const poll = async () => {
      const due = await checkDueReminders();
      setDueReminders(due);
    };
    void poll();
    const interval = setInterval(() => void poll(), 60_000);
    return () => clearInterval(interval);
  }, []);

  // Flush offline queue every 5 minutes
  useEffect(() => {
    void flushQueue();
    const interval = setInterval(() => void flushQueue(), 5 * 60_000);
    return () => clearInterval(interval);
  }, []);

  // Flush offline queue on web focus
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const handleFocus = () => {
      void flushQueue();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Reset pagination when filters change
  useEffect(() => {
    setNotesPage(1);
  }, [searchText, filter, activeGroupId, dateFilter, officeEntityFilter, inboxView]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const result = await ensureWorkNotesAndEmailTemplates();
      setNotes(result.notes);
      setTemplates(result.templates);
    } finally {
      setRefreshing(false);
    }
  };

  const filteredNotes = useMemo(() => {
    const q = String(searchText || '').trim().toLowerCase();
    let next = q ? notes.filter((n) => `${String(n.text || '')} ${(n.attachments || []).join(' ')} ${n.category}`.toLowerCase().includes(q)) : notes;
    if (activeGroupId === 'personal') {
      next = next.filter((n) => !n.groupId);
    } else {
      next = next.filter((n) => n.groupId === activeGroupId);
    }
    if (filter === 'work') next = next.filter((n) => n.category === 'work');
    if (filter === 'pinned') next = next.filter((n) => n.pinned);
    if (filter === 'draft') next = next.filter((n) => n.draft);
    if (filter === 'archived') next = next.filter((n) => n.archived);
    if (filter !== 'archived') next = next.filter((n) => !n.archived);
    if (dateFilter) {
      next = next.filter((n) => {
        const d = new Date(n.updatedAt);
        return d.toISOString().slice(0, 10) === dateFilter;
      });
    }
    if (officeEntityFilter) {
      const officeNeedle = officeEntityFilter.toLowerCase();
      next = next.filter((n) => String(n.text || '').toLowerCase().includes(officeNeedle));
    }
    if (inboxView !== 'all') {
      next = next.filter((n) => {
        if (inboxView === 'shopping') return n.smartType === 'shopping' || n.category === 'shopping';
        if (inboxView === 'medication') return n.smartType === 'medication';
        if (inboxView === 'work') return n.category === 'work';
        if (inboxView === 'reminder') return n.smartType === 'reminder';
        if (inboxView === 'image') return n.kind === 'image' || (n.attachments?.length || 0) > 0;
        return true;
      });
    }
    return next;
  }, [notes, searchText, filter, activeGroupId, dateFilter, officeEntityFilter, inboxView]);

  const filteredTemplates = useMemo(() => {
    const q = String(templateSearch || '').trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => `${t.name} ${t.to || ''} ${t.subject} ${t.body}`.toLowerCase().includes(q));
  }, [templates, templateSearch]);

  const PAGE_SIZE_NOTES = 25;
  const pagedFilteredNotes = useMemo(() => filteredNotes.slice(0, notesPage * PAGE_SIZE_NOTES), [filteredNotes, notesPage]);
  const notesHasMore = pagedFilteredNotes.length < filteredNotes.length;

  const noteRows = useMemo(() => chunk(pagedFilteredNotes, isDesktop ? desktopColumns : 1), [pagedFilteredNotes, isDesktop, desktopColumns]);
  const pendingSyncCount = useMemo(() => notes.filter((n) => n.syncStatus === 'pending' || n.syncStatus === 'retrying' || n.syncStatus === 'offline').length, [notes]);
  const failedSyncCount = useMemo(() => notes.filter((n) => n.syncStatus === 'failed').length, [notes]);
  const syncedCount = useMemo(() => notes.filter((n) => n.syncStatus === 'synced').length, [notes]);
  const shoppingPending = useMemo(
    () => notes.filter((n) => !n.archived && (n.smartType === 'shopping' || n.category === 'shopping')).length,
    [notes],
  );
  const medicationActive = useMemo(
    () => notes.filter((n) => !n.archived && n.smartType === 'medication' && n.workflowStatus !== 'completed' && n.workflowStatus !== 'dismissed').length,
    [notes],
  );
  const remindersActive = dueReminders.length;
  const recentCount = useMemo(() => notes.filter((n) => Date.now() - n.updatedAt < 24 * 60 * 60 * 1000).length, [notes]);
  const inboxCounts = useMemo(() => ({
    shopping: notes.filter((n) => n.smartType === 'shopping' || n.category === 'shopping').length,
    medication: notes.filter((n) => n.smartType === 'medication').length,
    work: notes.filter((n) => n.category === 'work').length,
    reminder: notes.filter((n) => n.smartType === 'reminder').length,
    image: notes.filter((n) => n.kind === 'image' || (n.attachments?.length || 0) > 0).length,
  }), [notes]);
  const todaySummary = useMemo(() => ([
    { key: 'medication' as const, label: `Medications: ${medicationActive}`, color: '#4DA3FF' },
    { key: 'shopping' as const, label: `Shopping pending: ${shoppingPending}`, color: '#22c55e' },
    { key: 'reminder' as const, label: `Reminders due: ${remindersActive}`, color: '#f59e0b' },
    { key: 'all' as const, label: `Recent (24h): ${recentCount}`, color: palette.muted },
  ]), [medicationActive, shoppingPending, remindersActive, recentCount, palette.muted]);

  async function addImageToDraft() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, base64: false });
    if (picked.canceled || !picked.assets?.length) return;
    const uri = picked.assets[0].uri;
    setDraftImages((current) => Array.from(new Set([uri, ...current])).slice(0, 6));
  }

  async function takePhotoToDraft() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') return;
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.72,
      base64: false,
      exif: false,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const uri = picked.assets[0].uri;
    setDraftImages((current) => Array.from(new Set([uri, ...current])).slice(0, 6));
  }

  async function pasteImageFromClipboardToDraft() {
    // Web: prefer native Clipboard API which preserves mime type and avoids black-JPEG issue
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.read) {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find((t) => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            if (blob.size === 0) continue;
            await new Promise<void>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUri = String(reader.result || '');
                if (dataUri) setDraftImages((current) => Array.from(new Set([dataUri, ...current])).slice(0, 6));
                resolve();
              };
              reader.onerror = () => resolve();
              reader.readAsDataURL(blob);
            });
            return;
          }
        }
      } catch {
        // fallthrough to expo-clipboard
      }
    }
    // Native / fallback: expo-clipboard
    const getImageAsync = (Clipboard as unknown as { getImageAsync?: () => Promise<{ data: string } | null> }).getImageAsync;
    if (!getImageAsync) return;
    const image = await getImageAsync();
    if (!image?.data) return;
    // expo-clipboard returns raw PNG base64 bytes
    const dataUri = `data:image/png;base64,${image.data}`;
    setDraftImages((current) => Array.from(new Set([dataUri, ...current])).slice(0, 6));
  }

  async function saveDraftAsNote() {
    const groupId = activeGroupId === 'personal' ? undefined : activeGroupId;
    const result = await addRichNoteUnique(draftTextValue, activeCategory, draftImages, groupId, true, false);
    setNotes(result.notes);
    if (result.inserted) {
      showToast('Note saved');
      setFilter('all');

      // Detect smart workflows (medication, shopping, reminder, task)
      if (draftTextValue.trim().length > 0) {
        const detection = detectSmartWorkflow(draftTextValue);
        if (detection.type !== 'none' && detection.type !== 'shopping' && detection.confidence >= 0.65) {
          setDetectedWorkflow(detection);
        }
      }

      // Cancel any pending auto-save timer
      if (draftAutoSaveTimerRef.current) {
        clearTimeout(draftAutoSaveTimerRef.current);
        draftAutoSaveTimerRef.current = null;
      }

      // Clear draft from AsyncStorage after successful save
      await AsyncStorage.removeItem(DRAFT_KEY);

      setDraftText('');
      setDraftImages([]);
      setManualCategory(null);
      setDraftAutoSaveStatus('idle');
    }
  }

  function openShoppingWorkflowFromDraft(analysis?: ShoppingListCandidateAnalysis) {
    const model = analysis?.parsedItems?.length
      ? { items: analysis.parsedItems }
      : parseShoppingList(draftTextValue);
    const items = model.items.filter((item) => String(item.label || '').trim());
    if (items.length < 3) {
      showToast('Add at least 3 items');
      return;
    }
    setWorkflowModalData({
      items: shoppingListToText(items).split('\n').filter(Boolean),
      sourceText: draftTextValue,
    });
    setWorkflowModalType('shopping');
  }

  async function createMedicationFollowUpNote(metadata: WorkflowMetadata) {
    // Validate medication name is provided
    const medicationName = String(metadata.medicationName || '').trim();
    if (!medicationName) {
      showToast('Medication name is required');
      return;
    }

    // Validate follow-up time is in the future if provided
    if (metadata.followUpAt && metadata.followUpAt <= Date.now()) {
      showToast('Follow-up time must be in the future');
      return;
    }

    const groupId = activeGroupId === 'personal' ? undefined : activeGroupId;
    type IncomingMed = {
      name?: string;
      dose?: string;
      takenAt?: number | string;
      lastTakenAt?: number | string;
      lastActionAt?: number | string;
      nextSuggestedAt?: number | string;
      snoozedUntil?: number | string;
      recommendedIntervalHours?: number;
      minIntervalHours?: number;
      minimumIntervalHours?: number;
      followPrescription?: boolean;
      safetyNote?: string;
      status?: 'active' | 'snoozed' | 'dismissed';
    };
    const incomingMeds: IncomingMed[] = Array.isArray((metadata as WorkflowMetadata & { medications?: IncomingMed[] }).medications)
      ? ((metadata as WorkflowMetadata & { medications?: IncomingMed[] }).medications || [])
      : [];

    const toMs = (v: unknown): number | undefined => {
      if (typeof v === 'number' && Number.isFinite(v)) return v;
      if (typeof v === 'string' && v.trim()) {
        const t = new Date(v).getTime();
        return Number.isFinite(t) ? t : undefined;
      }
      return undefined;
    };

    const cycleMeds: MedicationCycleEntry[] = (incomingMeds.length
      ? incomingMeds
      : [{ name: medicationName, dose: String(metadata.doseText || '').trim() || undefined } as IncomingMed]
    )
      .map((entry): MedicationCycleEntry | null => {
        const name = String(entry.name || '').trim();
        if (!name) return null;
        const takenAtMs = toMs(entry.takenAt) ?? toMs(metadata.takenAt);
        return {
          name,
          dose: String(entry.dose || '').trim() || undefined,
          takenAt: takenAtMs,
          lastTakenAt: toMs(entry.lastTakenAt) ?? takenAtMs,
          lastActionAt: toMs(entry.lastActionAt) ?? takenAtMs,
          nextSuggestedAt: toMs(entry.nextSuggestedAt),
          snoozedUntil: toMs(entry.snoozedUntil),
          recommendedIntervalHours: typeof entry.recommendedIntervalHours === 'number' ? entry.recommendedIntervalHours : undefined,
          minimumIntervalHours: typeof entry.minimumIntervalHours === 'number'
            ? entry.minimumIntervalHours
            : (typeof entry.minIntervalHours === 'number' ? entry.minIntervalHours : undefined),
          followPrescription: Boolean(entry.followPrescription) || !entry.nextSuggestedAt,
          safetyNote: typeof entry.safetyNote === 'string' ? entry.safetyNote : undefined,
          status: entry.status || 'active',
        };
      })
      .filter((m): m is MedicationCycleEntry => m !== null);

    if (!cycleMeds.length) return;

    const reason = String(metadata.reason || '').trim();
    const takenAtText = String(metadata.takenAtText || '').trim();
    const medLines = cycleMeds.map((entry) => {
      const dose = entry.dose ? ` · ${entry.dose}` : '';
      const next = typeof entry.nextSuggestedAt === 'number'
        ? ` · Next suggested ${new Date(entry.nextSuggestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : ' · Follow prescription';
      return `${entry.name}${dose}${next}`;
    });

    const header = cycleMeds.length > 1 ? `Medication Follow-up · ${cycleMeds.length} meds` : 'Medication Follow-up';
    const lines = [
      header,
      ...medLines,
      takenAtText ? `Taken ${takenAtText}` : '',
      reason ? `Reason: ${reason}` : '',
      'Verify with leaflet, prescription, doctor or pharmacist.',
    ].filter(Boolean);
    const noteText = lines.join('\n');
    const result = await addRichNoteUnique(noteText, 'health', [], groupId);
    setNotes(result.notes);
    if (result.inserted) {
      setFilter('all');
      const createdNote = result.notes[0];

      const focus = cycleMeds[0];
      const workflowMeta: WorkflowMetadata = {
        medicationName: focus.name,
        doseText: focus.dose,
        takenAt: focus.takenAt,
        takenAtText: takenAtText || undefined,
        reason: reason || undefined,
        followUpAt: focus.nextSuggestedAt,
        followUpLabel: metadata.followUpLabel || undefined,
        medications: cycleMeds,
      };
      const updatedNotes = await updateNoteSmartType(
        createdNote.id,
        'medication',
        'active',
        workflowMeta,
      );
      setNotes(updatedNotes);

      if (typeof focus.nextSuggestedAt === 'number' && focus.nextSuggestedAt > Date.now()) {
        await scheduleReminder(
          createdNote.id,
          0,
          focus.nextSuggestedAt,
          focus.name,
        ).catch(() => undefined);
      }
    }
  }

  async function handleMedicationTaken(noteId: string, medIndex: number) {
    const updated = await markMedicationTaken(noteId, medIndex, Date.now());
    setNotes(updated);
    const note = updated.find((n) => n.id === noteId);
    const focus = note?.workflowMetadata?.medications?.[medIndex];
    if (focus && typeof focus.nextSuggestedAt === 'number' && focus.nextSuggestedAt > Date.now()) {
      await scheduleReminder(noteId, medIndex, focus.nextSuggestedAt, focus.name).catch(() => undefined);
      showToast(`Cycle reset · next ${new Date(focus.nextSuggestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
    } else {
      showToast('Marked taken · follow prescription');
    }
  }

  async function handleMedicationSnooze(noteId: string, medIndex: number, snoozeMs: number) {
    const updated = await snoozeMedication(noteId, medIndex, snoozeMs);
    setNotes(updated);
    const note = updated.find((n) => n.id === noteId);
    const focus = note?.workflowMetadata?.medications?.[medIndex];
    if (focus && typeof focus.nextSuggestedAt === 'number') {
      await scheduleReminder(noteId, medIndex, focus.nextSuggestedAt, focus.name).catch(() => undefined);
    } else {
      await snoozeReminder(noteId, medIndex, snoozeMs).catch(() => undefined);
    }
    showToast('Snoozed');
  }

  async function handleMedicationDismissCycle(noteId: string, medIndex: number) {
    const updated = await dismissMedication(noteId, medIndex);
    setNotes(updated);
    await dismissReminder(noteId, medIndex).catch(() => undefined);
    showToast('Reminder dismissed');
  }

  async function handleMedicationReactivate(noteId: string, medIndex: number) {
    const updated = await reactivateMedication(noteId, medIndex);
    setNotes(updated);
    const note = updated.find((n) => n.id === noteId);
    const focus = note?.workflowMetadata?.medications?.[medIndex];
    if (focus && typeof focus.nextSuggestedAt === 'number' && focus.nextSuggestedAt > Date.now()) {
      await scheduleReminder(noteId, medIndex, focus.nextSuggestedAt, focus.name).catch(() => undefined);
    }
    showToast('Reminder reactivated');
  }

  function handleRemoveImage(index: number) {
    setDraftImages((current) => current.filter((_, i) => i !== index));
  }

  async function handleOcrAppendText(ocrText: string) {
    const updatedText = draftTextValue.trim()
      ? `${draftTextValue}\n\n--- Extracted text ---\n${ocrText}`
      : ocrText;
    setDraftText(updatedText);
    const shoppingAnalysis = analyzeShoppingListCandidate(ocrText);
    if (shoppingAnalysis.isCandidate && shoppingAnalysis.parsedItems.length >= 3) {
      openShoppingWorkflowFromDraft(shoppingAnalysis);
      showToast('OCR routed to shopping review');
    }
  }

  async function handleOcrReplaceText(ocrText: string) {
    setDraftText(ocrText);
    const shoppingAnalysis = analyzeShoppingListCandidate(ocrText);
    if (shoppingAnalysis.isCandidate && shoppingAnalysis.parsedItems.length >= 3) {
      openShoppingWorkflowFromDraft(shoppingAnalysis);
      showToast('OCR routed to shopping review');
    }
  }

  async function duplicateNote(note: NoteItem) {
    const noteText = String(note.text || '');
    const dupText = noteText + (noteText.trim() ? ' (copy)' : '(copy)');
    const groupId = note.groupId || (activeGroupId === 'personal' ? undefined : activeGroupId);
    const result = await addRichNoteUnique(dupText, note.category, note.attachments ?? [], groupId);
    setNotes(result.notes);
    showToast('Note duplicated');
  }

  async function sendClipboardToNote(entry: ClipboardEntry) {
    setWorkspaceTab('notes');
    if (entry.kind === 'image' && entry.imageDataUri) {
      setDraftImages((current) => Array.from(new Set([entry.imageDataUri as string, ...current])).slice(0, 6));
      return;
    }
    setDraftText((current) => current ? `${current}\n${entry.content}` : entry.content);
  }

  async function createNoteFromPreview() {
    if (!previewEntry) return;
    const category = detectAutoCategory(previewEntry.content || '');
    const attachments = previewEntry.kind === 'image' && previewEntry.imageDataUri ? [previewEntry.imageDataUri] : [];
    const text = previewEntry.kind === 'image' ? (previewEntry.content || 'Clipboard image') : previewEntry.content;
    const groupId = activeGroupId === 'personal' ? undefined : activeGroupId;
    const result = await addRichNoteUnique(text, category, attachments, groupId);
    setNotes(result.notes);
    setWorkspaceTab('notes');
    setPreviewEntry(null);
  }

  function sendClipboardToTemplate(entry: ClipboardEntry) {
    setWorkspaceTab('templates');
    setTemplateBody((current) => current ? `${current}\n${entry.content}` : entry.content);
  }

  function buildTemplateShareText(template: NoteTemplate) {
    const lines = [
      `Template: ${template.name}`,
      template.to ? `To: ${template.to}` : '',
      template.subject ? `Subject: ${template.subject}` : '',
      '',
      template.body || '',
    ].filter(Boolean);
    return lines.join('\n');
  }

  function startEditingTemplate(template: NoteTemplate) {
    setWorkspaceTab('templates');
    setEditingTemplateId(template.id);
    setTemplateName(template.name || '');
    setTemplateTo(template.to || '');
    setTemplateSubject(template.subject || '');
    setTemplateBody(template.body || '');
  }

  function resetTemplateEditor() {
    setEditingTemplateId(null);
    setTemplateName('');
    setTemplateTo('');
    setTemplateSubject('');
    setTemplateBody('');
  }

  function createTemplateFromSuggestion(text: string, category: NoteCategory) {
    setWorkspaceTab('templates');
    setEditingTemplateId(null);
    setTemplateName(text.slice(0, 40) || 'Generated template');
    setTemplateTo('');
    setTemplateSubject(category === 'work' ? 'Work update' : 'General note');
    setTemplateBody(text);
  }

  async function createQuickReminderFromNote(note: NoteItem) {
    const start = new Date(Date.now() + 60 * 60 * 1000);
    const noteText = String(note.text || '');
    const title = noteText.trim().slice(0, 48) || 'Note reminder';
    const body = noteText.trim() || 'Reminder generated from note';
    const ics = buildAppointmentIcs(title, body, '', start, 30);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `note-reminder-${Date.now()}.ics`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    const path = `${FileSystem.cacheDirectory}note_reminder_${Date.now()}.ics`;
    await FileSystem.writeAsStringAsync(path, ics, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/calendar' });
    }
  }

  async function saveNoteToDevice(note: NoteItem) {
    const timestamp = new Date(note.updatedAt);
    const content = [
      timestamp.toLocaleString(),
      '',
      note.category.toUpperCase(),
      '',
      String(note.text || '').trim(),
      '',
      ...(note.attachments || []).map((attachment, index) => `Attachment ${index + 1}: ${attachment}`),
    ].join('\n');

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `note-${note.id}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    const path = `${FileSystem.cacheDirectory}note_${note.id}_${Date.now()}.txt`;
    await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/plain' });
    } else {
      await Clipboard.setStringAsync(content);
    }
  }

  async function forceCopyToClipboard(text: string) {
    const value = String(text || '');
    if (!value) return;

    try {
      await Clipboard.setStringAsync(value);
    } catch {
      // continue with web fallbacks
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          return;
        }
      } catch {
        // continue with execCommand fallback
      }

      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.setAttribute('readonly', 'true');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        // final fallback already attempted
      }
    }
  }

  function toggleNoteSelection(id: string) {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function enterSelectionMode(id: string) {
    setSelectedNoteIds(new Set([id]));
  }

  async function deleteSelectedNotes() {
    const count = selectedNoteIds.size;
    Alert.alert(
      'Delete notes',
      `Delete ${count} note${count > 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            let current = notes;
            for (const id of selectedNoteIds) {
              current = await handleRemoveNote(id);
            }
            setNotes(current);
            setSelectedNoteIds(new Set());
          },
        },
      ],
    );
  }

  const notesEmptyTitle = notes.length === 0 ? 'Create your first note' : 'No results';
  const notesEmptyText = notes.length === 0
    ? 'Write something in the editor, then save it to get started.'
    : 'Clear the search or change the filter to see notes.';
  const templatesEmptyTitle = templates.length === 0 ? 'Create your first template' : 'No results';
  const templatesEmptyText = templates.length === 0
    ? 'Save your first template to reuse common messages.'
    : 'Refine your search to find templates.';

  const uiPalette = {
    bg: palette.bg,
    accent: palette.accent,
    border: palette.border,
    surface: palette.card,
    surfaceAlt: palette.card,
    textBody: palette.fg,
    textDim: palette.muted,
    textMuted: palette.muted,
    textPrimary: palette.fg,
    chipBorder: palette.border,
  };

  return (
    <View style={{ flex: 1 }}>
      {/* ── Tab bar fijo ── */}
      <TabBar
        activeTab={workspaceTab}
        palette={uiPalette}
        onChangeTab={(tab) => { setWorkspaceTab(tab); setSelectedNoteIds(new Set()); }}
        tabs={[
          { key: 'notes', label: 'Notes' },
          { key: 'templates', label: 'Templates' },
          { key: 'clipboard', label: 'Clipboard' },
        ]}
      />

      <ScrollView
        style={[mainAppStyles.screen, Platform.OS === 'web' ? ({ scrollbarWidth: 'none', msOverflowStyle: 'none' } as any) : null]}
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { alignItems: 'stretch' }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={palette.accent}
            colors={[palette.accent]}
          />
        }
      >
      <View style={[styles.workspace, { width: '100%', minWidth: 0, alignSelf: 'stretch' }]}>

        {workspaceTab === 'notes' ? (
          <>
            <View style={{ width: '100%', gap: 10, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 50, alignSelf: 'stretch', minWidth: 0 }}>
              <ComposerSection
                ref={draftInputRef}
                palette={uiPalette}
                activeGroupId={activeGroupId}
                groups={groups}
                draftText={draftTextValue}
                draftImages={draftImages}
                activeCategory={activeCategory}
                onChangeGroup={setActiveGroupId}
                onChangeText={handleDraftTextChange}
                onGenerate={() => setGeneratorVisible(true)}
                onOcr={() => setOcrVisible(true)}
                onAddImage={() => addImageToDraft().catch(() => undefined)}
                onTakePhoto={() => takePhotoToDraft().catch(() => undefined)}
                onPasteImage={() => pasteImageFromClipboardToDraft().catch(() => undefined)}
                onSave={() => saveDraftAsNote().catch(() => undefined)}
                onSetCategory={setManualCategory}
                onQuickTemplateMedication={(medicationText) => {
                  const medicationTemplateText = String(medicationText || '');
                  const meds = medicationTemplateText
                    .split(',')
                    .map((entry) => String(entry || '').trim())
                    .filter(Boolean);
                  if (meds.length === 0) return;
                  const primaryMedication = meds[0];
                  setWorkflowModalData({
                    medicationName: primaryMedication,
                    medicationNames: meds,
                    reason: 'Quick template',
                  });
                  setWorkflowModalType('medication');
                }}
                onQuickTemplateShopping={(itemsText) => {
                  const shoppingTemplateText = safeText(itemsText);
                  if (!shoppingTemplateText) return;
                  setDraftText(shoppingTemplateText);
                  setManualCategory('shopping');
                  showToast('Shopping item added');
                }}
                onConvertShoppingCandidate={(analysis) => {
                  openShoppingWorkflowFromDraft(analysis);
                }}
                onRemoveImage={handleRemoveImage}
                onOcrAppendText={handleOcrAppendText}
                onOcrReplaceText={handleOcrReplaceText}
                generating={false}
              />

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Pressable
                  onPress={() => {
                    setDraftText('');
                    setManualCategory('general');
                    draftInputRef.current?.focus();
                  }}
                  style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: palette.border, backgroundColor: pressed ? `${palette.muted}14` : 'transparent' })}
                >
                  <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '600' }}>Quick Add: Note</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setWorkflowModalData({ items: [] });
                    setWorkflowModalType('shopping');
                  }}
                  style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#22c55e77', backgroundColor: pressed ? '#22c55e22' : '#22c55e12' })}
                >
                  <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '700' }}>Quick Add: Shopping</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setWorkflowModalData({});
                    setWorkflowModalType('medication');
                  }}
                  style={({ pressed }) => ({ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#4DA3FF66', backgroundColor: pressed ? '#4DA3FF22' : '#4DA3FF12' })}
                >
                  <Text style={{ color: '#4DA3FF', fontSize: 12, fontWeight: '700' }}>Quick Add: Medication</Text>
                </Pressable>
              </View>

              <View style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.card, padding: 10, gap: 6 }}>
                <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Sync health</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Text style={{ color: pendingSyncCount > 0 ? '#f59e0b' : '#22c55e', fontSize: 12, fontWeight: '600' }}>
                    {pendingSyncCount > 0 ? `Pending sync: ${pendingSyncCount}` : 'Synced'}
                  </Text>
                  {failedSyncCount > 0 ? (
                    <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>
                      Sync failed: {failedSyncCount}
                    </Text>
                  ) : null}
                  <Text style={{ color: palette.muted, fontSize: 12 }}>
                    Synced notes: {syncedCount}
                  </Text>
                  {Platform.OS === 'web' && typeof navigator !== 'undefined' ? (
                    <Text style={{ color: navigator.onLine ? '#22c55e' : '#f59e0b', fontSize: 12, fontWeight: '600' }}>
                      {navigator.onLine ? 'Online' : 'Saved offline'}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.card, padding: 10, gap: 8 }}>
                <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Today</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {todaySummary.map((chip) => (
                    <Pressable
                      key={chip.label}
                      onPress={() => setInboxView(chip.key)}
                      style={({ pressed }) => ({
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: `${chip.color}77`,
                        backgroundColor: inboxView === chip.key ? `${chip.color}28` : (pressed ? `${chip.color}20` : `${chip.color}14`),
                      })}
                    >
                      <Text style={{ color: chip.color, fontSize: 12, fontWeight: '600' }}>{chip.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 10, backgroundColor: palette.card, padding: 10, gap: 8 }}>
                <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Inbox</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {([
                    { key: 'all', label: `All (${notes.length})`, color: palette.fg },
                    { key: 'shopping', label: `Shopping (${inboxCounts.shopping})`, color: '#22c55e' },
                    { key: 'medication', label: `Medication (${inboxCounts.medication})`, color: '#4DA3FF' },
                    { key: 'work', label: `Work (${inboxCounts.work})`, color: '#f59e0b' },
                    { key: 'reminder', label: `Reminders (${inboxCounts.reminder})`, color: '#f59e0b' },
                    { key: 'image', label: `Images/OCR (${inboxCounts.image})`, color: '#A970FF' },
                  ] as const).map((chip) => (
                    <Pressable
                      key={chip.key}
                      onPress={() => {
                        setInboxView(chip.key);
                        setSearchText('');
                        if (chip.key === 'work') setFilter('work'); else setFilter('all');
                      }}
                      style={({ pressed }) => ({
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: `${chip.color}77`,
                        backgroundColor: inboxView === chip.key ? `${chip.color}28` : (pressed ? `${chip.color}22` : `${chip.color}14`),
                      })}
                    >
                      <Text style={{ color: chip.color, fontSize: 11, fontWeight: '700' }}>{chip.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* ── Auto-save status indicator ── */}
              {draftAutoSaveStatus !== 'idle' && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    backgroundColor: draftAutoSaveStatus === 'saving' ? palette.accent : `${palette.accent}40`,
                    opacity: draftAutoSaveStatus === 'saving' ? 0.7 : 1,
                  }}
                >
                  {draftAutoSaveStatus === 'saving' ? (
                    <>
                      <ActivityIndicator size="small" color={palette.fg} />
                      <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '500' }}>Saving draft...</Text>
                    </>
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={14} color={palette.fg} />
                      <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '500' }}>Draft saved</Text>
                    </>
                  )}
                </View>
              )}

              {dueReminders.length > 0 && (
                <View
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#4DA3FF44',
                    backgroundColor: '#0F1A2E',
                    padding: 12,
                    marginBottom: 8,
                    gap: 10,
                  }}
                >
                  {dueReminders.map((reminder) => (
                    <View key={`${reminder.noteId}:${reminder.medIndex}`} style={{ gap: 6 }}>
                      <Text style={{ color: '#4DA3FF', fontSize: 13, fontWeight: '700' }}>
                        💊 Check in: {reminder.medicationName}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                        <Pressable
                          onPress={() =>
                            dismissReminder(reminder.noteId, reminder.medIndex)
                              .then(() => checkDueReminders())
                              .then(setDueReminders)
                          }
                          style={({ pressed }) => ({
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 6,
                            backgroundColor: pressed ? '#22c55ecc' : '#22c55e',
                            opacity: pressed ? 0.9 : 1,
                          })}
                        >
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                            Feeling better
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            dismissReminder(reminder.noteId, reminder.medIndex)
                              .then(() => checkDueReminders())
                              .then(setDueReminders)
                          }
                          style={({ pressed }) => ({
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 6,
                            backgroundColor: pressed ? '#f59e0bcc' : '#f59e0b',
                            opacity: pressed ? 0.9 : 1,
                          })}
                        >
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
                            Still unwell
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() =>
                            snoozeReminder(reminder.noteId, reminder.medIndex, 3_600_000)
                              .then(() => checkDueReminders())
                              .then(setDueReminders)
                          }
                          style={({ pressed }) => ({
                            paddingHorizontal: 10,
                            paddingVertical: 6,
                            borderRadius: 6,
                            borderWidth: 1,
                            borderColor: palette.border,
                            backgroundColor: pressed ? `${palette.muted}12` : 'transparent',
                            opacity: pressed ? 0.9 : 1,
                          })}
                        >
                          <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600' }}>
                            Snooze 1h
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {detectedWorkflow && detectedWorkflow.type !== 'none' && detectedWorkflow.confidence >= 0.65 && (
                <SmartWorkflowCard
                  detection={detectedWorkflow}
                  onDismiss={() => setDetectedWorkflow(null)}
                  onCreateWorkflow={(type) => {
                    setWorkflowModalType(type);
                    setWorkflowModalData(detectedWorkflow.extracted || {});
                  }}
                  onKeepAsNote={() => setDetectedWorkflow(null)}
                />
              )}

              <SearchFilterBar
                palette={{
                  bg: palette.bg,
                  accent: palette.accent,
                  border: palette.border,
                  surface: uiPalette.surface,
                  surfaceAlt: uiPalette.surfaceAlt,
                  textBody: uiPalette.textBody,
                  textDim: uiPalette.textDim,
                  textMuted: uiPalette.textMuted,
                  chipBorder: uiPalette.chipBorder,
                }}
                value={searchText}
                count={filteredNotes.length}
                filter={filter}
                dateFilter={dateFilter}
                onChange={setSearchText}
                onChangeFilter={setFilter}
                onChangeDateFilter={setDateFilter}
              />

              {filteredNotes.length === 0 ? (
                <View style={{ width: '100%', borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: uiPalette.surface, alignItems: 'center', gap: 8, padding: 12, alignSelf: 'stretch' }}>
                  <Ionicons name={notes.length === 0 ? 'document-text-outline' : 'search-outline'} size={28} color={palette.accent} />
                  <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{notesEmptyTitle}</Text>
                  <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{notesEmptyText}</Text>
                  <Pressable
                    style={({ pressed }) => [
                      mainAppStyles.btn,
                      { backgroundColor: palette.accent, borderColor: palette.accent, opacity: pressed ? 0.85 : 1, alignSelf: 'stretch' },
                    ]}
                    onPress={() => {
                      if (notes.length === 0) {
                        draftInputRef.current?.focus();
                        return;
                      }
                      setSearchText('');
                      setFilter('all');
                      setOfficeEntityFilter(null);
                    }}
                  >
                    <Text style={[mainAppStyles.btnText, { textAlign: 'center', color: '#000' }]}>{notes.length === 0 ? 'New note' : 'Clear filters'}</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.gridWrap}>
                {noteRows.map((row, rowIndex) => (
                  <View key={`row-${rowIndex}`} style={styles.gridRow}>
                    {row.map((note) => {
                      const expanded = expandedNoteId === note.id;
                      const editing = editingNoteId === note.id;
                      return (
                        <View key={note.id} style={{ flex: 1, minWidth: 0 }}>
                          <NoteCard
                            note={note}
                            palette={{
                              bg: palette.bg,
                              accent: palette.accent,
                              border: palette.border,
                              surface: uiPalette.surface,
                              surfaceAlt: uiPalette.surfaceAlt,
                              textBody: uiPalette.textBody,
                              textDim: uiPalette.textDim,
                              textMuted: uiPalette.textMuted,
                              textPrimary: uiPalette.textPrimary,
                              chipBorder: uiPalette.chipBorder,
                            }}
                            expanded={expanded}
                            editing={editing}
                            editingText={editingText}
                            selected={selectedNoteIds.size > 0 ? selectedNoteIds.has(note.id) : undefined}
                            onToggleExpand={() => {
                              if (selectedNoteIds.size > 0) { toggleNoteSelection(note.id); return; }
                              setExpandedNoteId(expanded ? null : note.id);
                            }}
                            onLongPress={() => enterSelectionMode(note.id)}
                            onStartEdit={() => {
                              setEditingNoteId(note.id);
                              setEditingText(note.text);
                            }}
                            onChangeEditingText={(value) => {
                              const nextText = String(value || '');
                              setEditingText(nextText);
                              if (!editing) {
                                updateNoteText(note.id, nextText).then(setNotes).catch(() => undefined);
                              }
                            }}
                            onSaveEdit={() => updateNoteText(note.id, editingText).then((next) => {
                              clearDraftFlag(note.id).then(setNotes);
                              setEditingNoteId(null);
                              setEditingText('');
                            })}
                            onCancelEdit={() => {
                              setEditingNoteId(null);
                              setEditingText('');
                            }}
                            onTogglePinned={() => togglePinned(note.id).then(setNotes)}
                            onOpenImage={setPreviewNoteImageUri}
                            onCopy={(text) => forceCopyToClipboard(text).catch(() => undefined)}
                            settings={settings}
                            onCopyValue={(value, label) => {
                              forceCopyToClipboard(value).then(() => showToast(`${label} copied`)).catch(() => undefined);
                            }}
                            onPressOffice={(office) => {
                              setOfficeEntityFilter((current) => (current === office ? null : office));
                              showToast(`Office filter: ${office}`);
                            }}
                            onSaveToDevice={() => saveNoteToDevice(note).catch(() => undefined)}
                            onShare={() => setShareNote(note)}
                            onOpenVersions={() => setVersionNoteId(note.id)}
                            onSetReminder={() => createQuickReminderFromNote(note).catch(() => undefined)}
                            onArchive={() => toggleArchived(note.id).then(setNotes)}
                            onDelete={() => handleRemoveNote(note.id).then(setNotes)}
                            onSetColor={(color) => setNoteColor(note.id, color).then(setNotes)}
                            onDoubleTap={() => setDetailNote(note)}
                            onDuplicate={() => duplicateNote(note).catch(() => undefined)}
                            onUpdateWorkflowStatus={async (id, status) => {
                              const next = await updateWorkflowStatus(id, status);
                              setNotes(next);
                            }}
                            onMedicationTaken={(id, medIndex) => handleMedicationTaken(id, medIndex).catch(() => undefined)}
                            onMedicationSnooze={(id, medIndex, ms) => handleMedicationSnooze(id, medIndex, ms).catch(() => undefined)}
                            onMedicationDismissCycle={(id, medIndex) => handleMedicationDismissCycle(id, medIndex).catch(() => undefined)}
                            onMedicationReactivate={(id, medIndex) => handleMedicationReactivate(id, medIndex).catch(() => undefined)}
                          />
                        </View>
                      );
                    })}
                    {row.length < (isDesktop ? desktopColumns : 1) ? Array.from({ length: (isDesktop ? desktopColumns : 1) - row.length }).map((_, i) => <View key={`fill-${i}`} style={{ flex: 1, minWidth: 0 }} />) : null}
                  </View>
                ))}
              </View>

              {notesHasMore && (
                <Pressable
                  onPress={() => setNotesPage((p) => p + 1)}
                  style={({ pressed }) => [
                    mainAppStyles.btn,
                    { backgroundColor: palette.accent, borderColor: palette.accent, opacity: pressed ? 0.85 : 1, alignSelf: 'stretch', marginTop: 16 },
                  ]}
                >
                  <Text style={[mainAppStyles.btnText, { textAlign: 'center' }]}>Load more ({pagedFilteredNotes.length} / {filteredNotes.length})</Text>
                </Pressable>
              )}
            </View>
          </>
        ) : null}

        {workspaceTab === 'templates' ? (
          <>
            <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border, width: '100%', alignSelf: 'stretch' }]}>
              <TextInput ref={templateInputRef} style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Template name" placeholderTextColor={palette.muted} value={templateName} onChangeText={setTemplateName} />
              <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="To (emails separated by ;)" placeholderTextColor={palette.muted} value={templateTo} onChangeText={setTemplateTo} />
              <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Subject" placeholderTextColor={palette.muted} value={templateSubject} onChangeText={setTemplateSubject} />
              <TextInput style={[mainAppStyles.input, styles.noteInput, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Body" placeholderTextColor={palette.muted} multiline value={templateBody} onChangeText={setTemplateBody} />
              <View style={styles.editorActions}>
                <Pressable style={[styles.iconOnlyAction, { borderColor: palette.border }]} onPress={() => {
                  const payload = { name: templateName || 'Template', kind: 'email' as const, to: String(templateTo || '').trim(), subject: templateSubject, body: templateBody, location: '', durationMinutes: 30 };
                  const action = editingTemplateId ? updateTemplate(editingTemplateId, payload) : addTemplate(payload);
                  action.then(setTemplates).then(() => resetTemplateEditor()).catch(() => undefined);
                }}>
                  <Ionicons name="save-outline" size={16} color={palette.fg} />
                </Pressable>
                {editingTemplateId ? (
                  <Pressable style={[styles.iconOnlyAction, { borderColor: palette.border }]} onPress={resetTemplateEditor}>
                    <Ionicons name="close-outline" size={16} color={palette.fg} />
                  </Pressable>
                ) : null}
              </View>
            </View>
            <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border, width: '100%', alignSelf: 'stretch' }]}>
              <View style={[styles.searchRow, { borderColor: palette.border, backgroundColor: palette.bg }]}>
                <Ionicons name="search" size={15} color={templateSearch ? palette.accent : palette.muted} />
                <TextInput
                  style={[styles.searchInput, { color: palette.fg }]}
                  placeholder="Search templates"
                  placeholderTextColor={palette.muted}
                  value={templateSearch}
                  onChangeText={setTemplateSearch}
                />
                <View style={[mainAppStyles.filterChipCompact, { borderColor: palette.border, borderWidth: 1 }]}>
                  <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700' }}>{filteredTemplates.length} templates</Text>
                </View>
              </View>
            {filteredTemplates.length === 0 ? (
              <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border, alignItems: 'center', gap: 10, width: '100%', alignSelf: 'stretch' }]}>
                <Ionicons name={templates.length === 0 ? 'layers-outline' : 'search-outline'} size={28} color={palette.accent} />
                <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{templatesEmptyTitle}</Text>
                <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{templatesEmptyText}</Text>
                <Pressable
                  style={({ pressed }) => [
                    mainAppStyles.btn,
                    { backgroundColor: palette.accent, borderColor: palette.accent, opacity: pressed ? 0.85 : 1, alignSelf: 'stretch' },
                  ]}
                  onPress={() => {
                    if (templates.length === 0) {
                      templateInputRef.current?.focus();
                      return;
                    }
                    setTemplateSearch('');
                  }}
                >
                  <Text style={[mainAppStyles.btnText, { textAlign: 'center' }]}>{templates.length === 0 ? 'Create template' : 'Clear search'}</Text>
                </Pressable>
              </View>
            ) : null}
            {filteredTemplates.length > 0 ? (
              <View style={{ gap: 8 }}>
                {filteredTemplates.map((template) => (
                  <View key={template.id} style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 12, backgroundColor: palette.card, overflow: 'hidden' }}>
                    {/* Header */}
                    <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8, gap: 3 }}>
                      <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{template.name}</Text>
                      {template.to ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Ionicons name="mail-outline" size={11} color={palette.muted} />
                          <Text style={{ color: palette.muted, fontSize: 11 }} numberOfLines={1}>{template.to}</Text>
                        </View>
                      ) : null}
                      {template.subject ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Ionicons name="document-text-outline" size={11} color={palette.muted} />
                          <Text style={{ color: palette.muted, fontSize: 11 }} numberOfLines={1}>{template.subject}</Text>
                        </View>
                      ) : null}
                    </View>
                    {/* Body preview */}
                    {template.body ? (
                      <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
                        <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>{template.body}</Text>
                      </View>
                    ) : null}
                    {/* Actions */}
                    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: palette.border }}>
                      {[
                        { icon: 'create-outline' as const,      label: 'Editar',     color: palette.fg,  onPress: () => startEditingTemplate(template) },
                        { icon: 'copy-outline' as const,        label: 'Copiar',     color: palette.fg,  onPress: () => forceCopyToClipboard(buildTemplateShareText(template)).catch(() => undefined) },
                        { icon: 'logo-whatsapp' as const,       label: 'WhatsApp',   color: '#25D366',   onPress: () => { const t = buildTemplateShareText(template); void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(t)}`); } },
                        { icon: 'mail-outline' as const,        label: 'Email',      color: palette.accent, onPress: () => { const b = buildTemplateShareText(template); void Linking.openURL(`mailto:${encodeURIComponent(template.to || '')}?subject=${encodeURIComponent(template.subject || template.name)}&body=${encodeURIComponent(b)}`); } },
                        { icon: 'trash-outline' as const,       label: 'Eliminar',   color: '#ef4444',   onPress: () => removeTemplate(template.id).then(setTemplates) },
                      ].map((action, idx, arr) => (
                        <Pressable
                          key={action.label}
                          onPress={action.onPress}
                          style={({ pressed }) => ({
                            flex: 1,
                            minHeight: 44,
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 2,
                            borderRightWidth: idx < arr.length - 1 ? 1 : 0,
                            borderRightColor: palette.border,
                            backgroundColor: pressed ? palette.border : 'transparent',
                          })}
                        >
                          <Ionicons name={action.icon} size={15} color={action.color} />
                          <Text style={{ color: action.color, fontSize: 9, fontWeight: '600', letterSpacing: 0.2 }}>{action.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
            </View>
          </>
        ) : null}

        {workspaceTab === 'clipboard' ? (
          <ClipboardScreen
            palette={palette}
            settings={settings}
            onSendToNote={sendClipboardToNote}
            onSendToTemplate={sendClipboardToTemplate}
          />
        ) : null}
      </View>

      <Modal animationType="fade" transparent visible={Boolean(previewEntry)} onRequestClose={() => setPreviewEntry(null)} statusBarTranslucent>
        <Pressable style={mainAppStyles.modalBackdrop} onPress={() => setPreviewEntry(null)}>
          <Pressable style={[mainAppStyles.modalForm, { backgroundColor: palette.card, borderColor: palette.border, maxWidth: 580 }]} onPress={() => null}>
            <View style={mainAppStyles.modalHeader}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>Clipboard Preview</Text>
              <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={() => setPreviewEntry(null)}>
                <Ionicons name="close" size={18} color={palette.fg} />
              </Pressable>
            </View>
            {previewEntry?.kind === 'image' && previewEntry.imageDataUri ? (
              <Image source={{ uri: previewEntry.imageDataUri }} style={styles.previewImage} resizeMode="contain" />
            ) : (
              <Text style={{ color: palette.fg, fontSize: 13, lineHeight: 20 }}>{previewEntry?.content || ''}</Text>
            )}
            <Text style={{ color: palette.muted, fontSize: 11, marginTop: 8 }}>Would you like to create a note with this item?</Text>
            <View style={styles.previewActions}>
              <Pressable style={[styles.previewBtn, { borderColor: palette.border }]} onPress={() => setPreviewEntry(null)}>
                <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.previewBtn, { backgroundColor: palette.accent, borderColor: palette.accent }]} onPress={() => createNoteFromPreview().catch(() => undefined)}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Create note</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="fade" transparent visible={Boolean(previewNoteImageUri)} onRequestClose={() => setPreviewNoteImageUri(null)} statusBarTranslucent>
        <Pressable style={mainAppStyles.modalBackdrop} onPress={() => setPreviewNoteImageUri(null)}>
          <Pressable style={[mainAppStyles.modalForm, { backgroundColor: palette.card, borderColor: palette.border, maxWidth: 760 }]} onPress={() => null}>
            <View style={mainAppStyles.modalHeader}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>Note Image</Text>
              <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={() => setPreviewNoteImageUri(null)}>
                <Ionicons name="close" size={18} color={palette.fg} />
              </Pressable>
            </View>
            {previewNoteImageUri ? <Image source={{ uri: previewNoteImageUri }} style={styles.previewImageLarge} resizeMode="contain" /> : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal animationType="fade" transparent visible={Boolean(shareNote)} onRequestClose={() => setShareNote(null)} statusBarTranslucent>
        <Pressable style={mainAppStyles.modalBackdrop} onPress={() => setShareNote(null)}>
          <Pressable style={[mainAppStyles.modalForm, { backgroundColor: palette.card, borderColor: palette.border, maxWidth: 560 }]} onPress={() => null}>
            <View style={mainAppStyles.modalHeader}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>Share note</Text>
              <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={() => setShareNote(null)}>
                <Ionicons name="close" size={18} color={palette.fg} />
              </Pressable>
            </View>
            <Text style={{ color: palette.muted, fontSize: 11, marginBottom: 10 }}>
              Choose WhatsApp, email, or internal group share.
            </Text>
            <View style={styles.shareRow}>
              <Pressable style={[styles.previewBtn, { borderColor: palette.border }]} onPress={() => { if (!shareNote) return; void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(shareNote.text)}`); }}>
                <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>WhatsApp</Text>
              </Pressable>
              <Pressable style={[styles.previewBtn, { borderColor: palette.border }]} onPress={() => { if (!shareNote) return; void Linking.openURL(`mailto:?subject=${encodeURIComponent('Shared note')}&body=${encodeURIComponent(shareNote.text)}`); }}>
                <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Email</Text>
              </Pressable>
            </View>
            {groups.length ? (
              <View style={{ marginTop: 10, gap: 8 }}>
                {groups.map((g) => (
                  <Pressable
                    key={g.id}
                    style={[styles.previewBtn, { borderColor: palette.border }]}
                    onPress={() => {
                      if (!shareNote) return;
                      void upsertSharedGroupNote(g.id, { ...shareNote, groupId: g.id });
                      setShareNote(null);
                    }}
                  >
                    <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Share to {g.name}</Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={{ color: palette.muted, fontSize: 11, marginTop: 8 }}>
                No groups found. Go to Settings {'>'} Shared groups to create or join one, then return here.
              </Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Smart Note Generator ── */}
      <SmartNoteGeneratorModal
        visible={generatorVisible}
        palette={uiPalette}
        onClose={() => setGeneratorVisible(false)}
        onSelect={async ({ text, category }) => {
          const groupId = activeGroupId === 'personal' ? undefined : activeGroupId;
          const result = await addRichNoteUnique(text, category, [], groupId);
          setNotes(result.notes);
          setFilter('all');
          if (result.inserted) showToast('Note created');
        }}
        onCreateTemplate={({ text, category }) => createTemplateFromSuggestion(text, category)}
      />
      </ScrollView>

      {/* ── OCR: image → note ── */}
      <NoteOcrModal
        visible={ocrVisible}
        palette={{ bg: uiPalette.surface, fg: uiPalette.textBody, accent: palette.accent, muted: uiPalette.textDim, card: uiPalette.surfaceAlt, border: uiPalette.chipBorder }}
        settings={settings}
        onClose={() => setOcrVisible(false)}
        onCreateNote={async (text) => {
          const groupId = activeGroupId === 'personal' ? undefined : activeGroupId;
          const result = await addRichNoteUnique(text, 'general', [], groupId);
          setNotes(result.notes);
          setFilter('all');
          showToast('Note created from image');
        }}
      />

      {/* ── Note detail (double-tap) ── */}
      <NoteDetailModal
        note={detailNote}
        visible={Boolean(detailNote)}
        palette={uiPalette}
        onClose={() => setDetailNote(null)}
        onSave={async (id, title, text) => {
          let next = notes;
          if (String(text || '').trim()) next = await updateNoteText(id, String(text || ''));
          next = await updateNoteTitle(id, title);
          setNotes(next);
          showToast('Note updated');
        }}
        onSetColor={(color) => { if (detailNote) setNoteColor(detailNote.id, color).then((n) => { setNotes(n); setDetailNote((prev) => prev ? n.find((x) => x.id === prev.id) ?? null : null); }); }}
        onTogglePinned={(id) => togglePinned(id).then((n) => { setNotes(n); setDetailNote((prev) => prev?.id === id ? n.find((x) => x.id === id) ?? null : prev); })}
        onArchive={(id) => toggleArchived(id).then(setNotes)}
        onDelete={(id) => handleRemoveNote(id).then(setNotes)}
        onCopy={(text) => forceCopyToClipboard(text).catch(() => undefined)}
        onShare={(id) => { const n = notes.find((x) => x.id === id); if (n) setShareNote(n); setDetailNote(null); }}
      />

      {/* ── Medication Workflow Modal ── */}
      <MedicationWorkflowModal
        visible={workflowModalType === 'medication'}
        onClose={() => setWorkflowModalType(null)}
        initialData={{
          medicationName: String(workflowModalData.medicationName || ''),
          medicationNames: Array.isArray(workflowModalData.medicationNames) ? workflowModalData.medicationNames as string[] : [],
          doseText: String(workflowModalData.doseText || ''),
          takenAtText: String(workflowModalData.takenAtText || ''),
          reason: String(workflowModalData.reason || ''),
        }}
        onSave={(metadata) => {
          createMedicationFollowUpNote(metadata).then(() => {
            showToast('Medication follow-up created');
          }).catch(() => undefined);
          setDraftText((current) => {
            const quickText = Array.isArray(workflowModalData.medicationNames)
              ? (workflowModalData.medicationNames as string[]).join(', ')
              : String(workflowModalData.medicationName || '');
            const safeCurrent = String(current || '');
            if (!quickText.trim()) return safeCurrent;
            return safeCurrent.replace(quickText, '').replace(/\n{3,}/g, '\n\n').trim();
          });
          setWorkflowModalType(null);
          setWorkflowModalData({});
          setDetectedWorkflow(null);
        }}
      />

      {/* ── Shopping Workflow Modal ── */}
      <ShoppingWorkflowModal
        visible={workflowModalType === 'shopping'}
        onClose={() => setWorkflowModalType(null)}
        initialItems={Array.isArray(workflowModalData.items) ? (workflowModalData.items as string[]) : []}
        onSave={(items) => {
          const groupId = activeGroupId === 'personal' ? undefined : activeGroupId;
          const checklistEntries = (items.checklistItems || []).filter((entry) => String(entry.text || '').trim());
          const checklist = checklistEntries.map((entry) => {
            const text = String(entry.text || '').trim();
            const quantity = String(entry.quantity || '').trim();
            const unit = String(entry.unit || '').trim();
            return quantity ? `${text}: ${quantity}${unit ? ` ${unit}` : ''}` : text;
          });
          const shoppingNote = checklist.length > 0
            ? `Shopping List\n${checklist.map((item) => `- ${item}`).join('\n')}`
            : '';
          if (!shoppingNote) {
            setWorkflowModalType(null);
            setDetectedWorkflow(null);
            return;
          }
          addRichNoteUnique(shoppingNote, 'shopping', [], groupId, false, false).then(async (result) => {
            setNotes(result.notes);
            if (result.inserted) {
              const createdNote = result.notes[0];
              const updatedNotes = await updateNoteSmartType(createdNote.id, 'shopping', 'active', {
                checklistItems: checklistEntries.map((entry) => ({
                  id: entry.id,
                  text: String(entry.text || '').trim(),
                  completed: Boolean(entry.completed),
                  quantity: String(entry.quantity || '').trim() || undefined,
                  unit: String(entry.unit || '').trim() || undefined,
                  rawText: String(entry.rawText || entry.text || '').trim() || undefined,
                })),
                extractedFromText: true,
              });
              setNotes(updatedNotes);
              showToast('Shopping list created');
              setFilter('all');
              setDraftText('');
              setDraftImages([]);
              setManualCategory(null);
              setDraftAutoSaveStatus('idle');
              if (draftAutoSaveTimerRef.current) {
                clearTimeout(draftAutoSaveTimerRef.current);
                draftAutoSaveTimerRef.current = null;
              }
              AsyncStorage.removeItem(DRAFT_KEY).catch(() => undefined);
            } else {
              showToast('Shopping list already exists');
            }
            setWorkflowModalType(null);
            setWorkflowModalData({});
            setDetectedWorkflow(null);
          }).catch(() => undefined);
        }}
      />

      {/* ── Toast ── */}
      {(() => {
        const versionNote = versionNoteId ? notes.find((n) => n.id === versionNoteId) ?? null : null;
        const versions = versionNote
          ? [
              { id: `${versionNote.id}_current`, title: versionNote.title, text: versionNote.text, createdAt: versionNote.updatedAt, isCurrent: true as const },
              ...((versionNote.versions || []).map((entry) => ({ ...entry, isCurrent: false as const }))),
            ]
          : [];

        if (!versionNote) return null;
        const currentText = versionNote.text;

        return (
      <Modal animationType="fade" transparent visible={Boolean(versionNote)} onRequestClose={() => { setVersionNoteId(null); setSelectedVersionId(null); }} statusBarTranslucent>
        <Pressable style={mainAppStyles.modalBackdrop} onPress={() => { setVersionNoteId(null); setSelectedVersionId(null); }}>
          <Pressable style={[mainAppStyles.modalForm, { backgroundColor: palette.card, borderColor: palette.border, maxWidth: 640 }]} onPress={() => null}>
            <View style={mainAppStyles.modalHeader}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>Note versions</Text>
              <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={() => { setVersionNoteId(null); setSelectedVersionId(null); }}>
                <Ionicons name="close" size={18} color={palette.fg} />
              </Pressable>
            </View>
            {versions.length ? (
              <View style={{ gap: 10 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 2 }}>
                  {versions.slice(1).map((version) => {
                    const active = selectedVersionId === version.id;
                    return (
                      <Pressable
                        key={version.id}
                        onPress={() => setSelectedVersionId(version.id)}
                        style={({ pressed }) => ({
                          minHeight: 34,
                          paddingHorizontal: 12,
                          borderRadius: 999,
                          borderWidth: 1,
                          borderColor: active ? palette.accent : palette.border,
                          backgroundColor: active ? `${palette.accent}18` : palette.card,
                          justifyContent: 'center',
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        <Text style={{ color: active ? palette.accent : palette.fg, fontSize: 11, fontWeight: '700' }}>
                          {new Date(version.createdAt).toLocaleDateString()}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                {versions.map((version) => (
                  <View key={version.id} style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 12, padding: 12, gap: 10, backgroundColor: version.isCurrent ? palette.bg : palette.card }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons
                          name={version.isCurrent ? 'ellipse' : 'git-branch-outline'}
                          size={12}
                          color={version.isCurrent ? palette.accent : palette.muted}
                        />
                        <Text style={{ color: palette.fg, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
                          {version.isCurrent ? 'Current version' : new Date(version.createdAt).toLocaleString()}
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Pressable
                          style={[styles.previewBtn, { borderColor: palette.border, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, minWidth: 104 }]}
                          onPress={() => {
                            if (!versionNote) return;
                            if (version.isCurrent) return;
                            createBranchFromNoteVersion(versionNote.id, version.id).then(setNotes).catch(() => undefined);
                          }}
                        >
                          <Ionicons name="git-branch-outline" size={14} color={palette.fg} />
                          <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Branch</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.previewBtn, { backgroundColor: palette.accent, borderColor: palette.accent, flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 16, minWidth: 104 }]}
                          onPress={() => {
                            if (!versionNote || version.isCurrent) return;
                            mergeNoteVersion(versionNote.id, version.id).then((next) => { setNotes(next); setVersionNoteId(versionNote.id); }).catch(() => undefined);
                          }}
                        >
                          <Ionicons name="git-merge-outline" size={14} color="#000" />
                          <Text style={{ color: '#000', fontSize: 12, fontWeight: '800' }}>Merge</Text>
                        </Pressable>
                      </View>
                    </View>
                    {!version.isCurrent && (() => {
                      const diffLines = computeLineDiff(version.text || '', currentText || '');
                      const hasChanges = diffLines.some((d) => d.type !== 'same');
                      return (
                        <View style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 10, overflow: 'hidden' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.bg }}>
                            <Text style={{ color: palette.muted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              Diff — {new Date(version.createdAt).toLocaleString()} → Current
                            </Text>
                            {!hasChanges && (
                              <Text style={{ color: palette.muted, fontSize: 10 }}>Sin cambios</Text>
                            )}
                          </View>
                          <ScrollView style={{ maxHeight: 160 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                            <View style={{ padding: 10, gap: 2 }}>
                              {hasChanges ? diffLines.map((dl, idx) => (
                                <View
                                  key={idx}
                                  style={{
                                    flexDirection: 'row', gap: 6,
                                    backgroundColor: dl.type === 'add' ? '#22c55e18' : dl.type === 'remove' ? '#ef444418' : 'transparent',
                                    borderRadius: 3, paddingHorizontal: 4,
                                  }}
                                >
                                  <Text style={{ color: dl.type === 'add' ? '#22c55e' : dl.type === 'remove' ? '#ef4444' : palette.muted, fontSize: 11, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, width: 10 }}>
                                    {dl.type === 'add' ? '+' : dl.type === 'remove' ? '-' : ' '}
                                  </Text>
                                  <Text style={{ color: dl.type === 'add' ? '#22c55e' : dl.type === 'remove' ? '#ef4444' : palette.fg, fontSize: 11, lineHeight: 17, flex: 1, fontFamily: Platform.OS === 'web' ? 'monospace' : undefined }}>
                                    {dl.line || ' '}
                                  </Text>
                                </View>
                              )) : (
                                <Text style={{ color: palette.muted, fontSize: 11 }}>El contenido es idéntico al actual.</Text>
                              )}
                            </View>
                          </ScrollView>
                        </View>
                      );
                    })()}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ color: palette.muted, fontSize: 12 }}>No versions yet.</Text>
            )}
          </Pressable>
        </Pressable>
      </Modal>
        );
      })()}

      <Toast toast={toast} onHide={hideToast} />

      {/* ── Barra flotante de selección múltiple ── */}
      {selectedNoteIds.size > 0 ? (
        <View style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          backgroundColor: palette.card,
          borderTopWidth: 1, borderTopColor: palette.border,
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 12, gap: 12,
        }}>
          <Pressable
            onPress={() => setSelectedNoteIds(new Set())}
            style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={18} color={palette.muted} />
          </Pressable>
          <Text style={{ flex: 1, color: palette.fg, fontWeight: '600', fontSize: 14 }}>
            {selectedNoteIds.size} selected
          </Text>
          <Pressable
            onPress={() => {
              const all = new Set(filteredNotes.map((n) => n.id));
              setSelectedNoteIds(all);
            }}
            style={{ paddingHorizontal: 12, height: 36, borderRadius: 10, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '600' }}>All</Text>
          </Pressable>
          <Pressable
            onPress={() => deleteSelectedNotes().catch(() => undefined)}
            style={{ paddingHorizontal: 16, height: 36, borderRadius: 10, backgroundColor: '#C0392B', flexDirection: 'row', alignItems: 'center', gap: 6 }}
          >
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Delete</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 128, width: '100%', minWidth: 0, alignItems: 'stretch' },
  workspace: { gap: 10, minWidth: 0 },
  workspaceTabs: { flexDirection: 'row', gap: 6, marginBottom: 0 },
  workspaceTab: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  resumeCard: { paddingVertical: 10 },
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  groupSelectorRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  shareRow: { flexDirection: 'row', gap: 10, minWidth: 0 },
  iconAction: { borderWidth: 1, borderRadius: 999, minHeight: 44, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' },
  noteInput: { minHeight: 100, textAlignVertical: 'top' },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  attachmentChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 120 },
  editorFooter: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  categoryRow: { flexDirection: 'row', gap: 6 },
  categoryChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, minHeight: 44, justifyContent: 'center' },
  editorActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  iconOnlyAction: { width: 44, height: 44, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: 6 },
  filterChipRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
  gridWrap: { gap: 8, width: '100%', minWidth: 0 },
  gridRow: { flexDirection: 'row', gap: 8, width: '100%', minWidth: 0 },
  compactCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8, minWidth: 0 },
  noteThumb: { width: '100%', height: 120, borderRadius: 8, backgroundColor: '#111' },
  clipThumb: { width: '100%', height: 96, borderRadius: 8, backgroundColor: '#111' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  colorRow: { flexDirection: 'row', gap: 8, marginTop: 2 },
  colorDot: { width: 14, height: 14, borderRadius: 999, borderWidth: 1 },
  previewImage: { width: '100%', height: 260, borderRadius: 10, backgroundColor: '#000' },
  previewImageLarge: { width: '100%', height: 420, borderRadius: 10, backgroundColor: '#000' },
  previewActions: { marginTop: 14, flexDirection: 'row', gap: 10 },
  previewBtn: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});


