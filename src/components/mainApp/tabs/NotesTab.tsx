import React, { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

import {
  NoteCategory,
  NoteItem,
  NoteTemplate,
  addRichNoteUnique,
  addTemplate,
  ensureWorkNotesAndEmailTemplates,
  removeNote,
  removeTemplate,
  togglePinned,
  updateNoteText,
  buildAppointmentIcs,
  refreshNotesFromCloudSilently,
} from '../../../core/notes';
import { ClipboardEntry } from '../../../core/clipboard.types';
import { addClipboardEntryUnique, addClipboardImageUnique, loadClipboardEntries } from '../../../core/clipboard';
import { mainAppStyles } from '../styles';

type Palette = { bg: string; fg: string; accent: string; muted: string; card: string; border: string };
type WorkspaceTab = 'notes' | 'templates' | 'clipboard';
type NoteFilter = 'all' | 'work' | 'pinned';

type SmartResult = {
  ticketNumber: string;
  userName: string;
  location: string;
  configurationItem: string;
  followUp: string;
  summary: string;
  timeWorked: string;
  rawText?: string;
};

const DRAFT_KEY = '@oryxen_notes_draft_v2';

function detectAutoCategory(text: string): NoteCategory {
  const value = String(text || '').toUpperCase();
  if (/\b(RITM\d+|INC\d+|REQ\d+|SCTASK\d+)\b/.test(value)) return 'work';
  if (/\b(USER|WORK|REQUEST|OFFICE|CALL|FOLLOW)\b/.test(value)) return 'work';
  return 'general';
}

function extractField(text: string, pattern: RegExp): string {
  const match = text.match(pattern);
  return (match?.[1] || '').trim();
}

function analyzeSmartContent(text: string, imageRefs: string[]): SmartResult {
  const merged = `${text}\n${imageRefs.join('\n')}`;
  const ticketNumber = extractField(merged, /\b(RITM\d+|INC\d+|REQ\d+|SCTASK\d+)\b/i) || extractField(merged, /request\s*item\s*[:\-]?\s*([A-Z0-9]+)/i);
  const userName = extractField(merged, /(?:requested\s*for|user|name)\s*[:\-]?\s*([A-Za-z][A-Za-z .'-]{2,})/i);
  const location = extractField(merged, /(?:location|site|office)\s*[:\-]?\s*([^\n]+)/i);
  const configurationItem = extractField(merged, /(?:configuration\s*item|ci|asset)\s*[:\-]?\s*([^\n]+)/i);
  const followUp = extractField(merged, /(?:follow\s*up|next\s*action)\s*(?:\(.*?\))?\s*[:\-]?\s*([^\n]+)/i) || extractField(merged, /\b(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}(?::\d{2})?)\b/i);
  const timeWorked = extractField(merged, /time\s*worked\s*[:\-]?\s*([^\n]+)/i);

  const summary = [
    `Ticket: ${ticketNumber || '-'}`,
    `User: ${userName || '-'}`,
    `Location: ${location || '-'}`,
    `Configuration item: ${configurationItem || '-'}`,
    `Follow-up: ${followUp || '-'}`,
    `Time worked: ${timeWorked || '-'}`,
    imageRefs.length ? `Images: ${imageRefs.length}` : '',
  ].filter(Boolean).join('\n');

  return { ticketNumber, userName, location, configurationItem, followUp, summary, timeWorked };
}

function chunk<T>(items: T[], columns: number): T[][] {
  if (columns <= 1) return items.map((item) => [item]);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return rows;
}

function mergeNotesByNewest(local: NoteItem[], incoming: NoteItem[]): NoteItem[] {
  const map = new Map<string, NoteItem>();
  for (const item of local) map.set(item.id, item);
  for (const item of incoming) {
    const prev = map.get(item.id);
    if (!prev || item.updatedAt >= prev.updatedAt) map.set(item.id, item);
  }
  return Array.from(map.values()).sort((a, b) => (a.pinned === b.pinned ? b.updatedAt - a.updatedAt : a.pinned ? -1 : 1));
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

function parseFollowUpDate(value: string): Date | null {
  const text = String(value || '');
  const m = text.match(/\b(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?\b/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  const year = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  const second = Number(m[6] || '0');
  const date = new Date(year, month, day, hour, minute, second, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function NotesTab({ palette }: { palette: Palette }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const desktopColumns = width >= 1600 ? 3 : width >= 1200 ? 2 : 1;

  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('notes');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [clipboardItems, setClipboardItems] = useState<ClipboardEntry[]>([]);

  const [draftText, setDraftText] = useState('');
  const [draftImages, setDraftImages] = useState<string[]>([]);
  const [manualCategory, setManualCategory] = useState<NoteCategory | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<NoteFilter>('all');
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [smartResult, setSmartResult] = useState<SmartResult | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);

  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');
  const [clipboardAvailable, setClipboardAvailable] = useState(true);
  const [previewEntry, setPreviewEntry] = useState<ClipboardEntry | null>(null);
  const [lastTap, setLastTap] = useState<{ id: string; ts: number } | null>(null);

  const autoCategory = useMemo(() => detectAutoCategory(draftText), [draftText]);
  const activeCategory = manualCategory || autoCategory;

  useEffect(() => {
    ensureWorkNotesAndEmailTemplates().then(({ notes: n, templates: t }) => {
      setNotes(n);
      setTemplates(t);
    }).catch(() => undefined);
    loadClipboardEntries().then(setClipboardItems).catch(() => undefined);

    // Silent cloud pull on open for fast cross-device consistency.
    refreshNotesFromCloudSilently().then((result) => {
      if (!result) return;
      setNotes((current) => mergeNotesByNewest(current, result.notes));
      setTemplates((current) => mergeTemplatesByNewest(current, result.templates));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    // Silent periodic refresh without any user-facing messages.
    const timer = setInterval(() => {
      refreshNotesFromCloudSilently().then((result) => {
        if (!result) return;
        setNotes((current) => mergeNotesByNewest(current, result.notes));
        setTemplates((current) => mergeTemplatesByNewest(current, result.templates));
      }).catch(() => undefined);
    }, 10000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.text === 'string') setDraftText(parsed.text);
      if (Array.isArray(parsed?.images)) setDraftImages(parsed.images.map((v: unknown) => String(v || '')).filter(Boolean));
      if (parsed?.category === 'general' || parsed?.category === 'work') setManualCategory(parsed.category);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ text: draftText, images: draftImages, category: manualCategory, updatedAt: Date.now() })).catch(() => undefined);
  }, [draftText, draftImages, manualCategory, workspaceTab]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onPaste = (event: ClipboardEvent) => {
      const data = event.clipboardData;
      if (!data) return;

      const text = data.getData('text');
      if (text && text.trim()) {
        addClipboardEntryUnique(text.trim()).then((result) => {
          if (result.inserted) setClipboardItems(result.entries);
        }).catch(() => undefined);
      }

      const items = Array.from(data.items || []);
      const imageItem = items.find((item) => item.type.startsWith('image/'));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUri = String(reader.result || '');
        if (!dataUri.startsWith('data:image/')) return;
        addClipboardImageUnique(dataUri).then((result) => {
          if (result.inserted) setClipboardItems(result.entries);
        }).catch(() => undefined);
        setDraftImages((current) => Array.from(new Set([dataUri, ...current])).slice(0, 6));
      };
      reader.readAsDataURL(file);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  useEffect(() => {
    if (!clipboardAvailable) return;
    let mounted = true;
    let lastSeen = '';
    let lastImageSig = '';

    const tick = async () => {
      try {
        const text = await Clipboard.getStringAsync();
        const value = String(text || '').trim();
        if (!mounted || !value || value === lastSeen) return;
        lastSeen = value;
        const result = await addClipboardEntryUnique(value);
        if (result.inserted) setClipboardItems(result.entries);

        const getImageAsync = (Clipboard as unknown as { getImageAsync?: () => Promise<{ data: string } | null> }).getImageAsync;
        if (getImageAsync) {
          const image = await getImageAsync();
          if (image?.data) {
            const signature = image.data.slice(0, 64);
            if (signature && signature !== lastImageSig) {
              lastImageSig = signature;
              const dataUri = `data:image/png;base64,${image.data}`;
              const imageResult = await addClipboardImageUnique(dataUri);
              if (imageResult.inserted) setClipboardItems(imageResult.entries);
            }
          }
        }
      } catch {
        setClipboardAvailable(false);
      }
    };

    const timer = setInterval(() => { tick().catch(() => undefined); }, 900);
    tick().catch(() => undefined);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [clipboardAvailable]);

  const filteredNotes = useMemo(() => {
    const q = search.trim().toLowerCase();
    let next = q ? notes.filter((n) => `${n.text} ${(n.attachments || []).join(' ')} ${n.category}`.toLowerCase().includes(q)) : notes;
    if (filter === 'work') next = next.filter((n) => n.category === 'work');
    if (filter === 'pinned') next = next.filter((n) => n.pinned);
    return next;
  }, [notes, search, filter]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => `${t.name} ${t.subject} ${t.body}`.toLowerCase().includes(q));
  }, [templates, templateSearch]);

  const noteRows = useMemo(() => chunk(filteredNotes, isDesktop ? desktopColumns : 1), [filteredNotes, isDesktop, desktopColumns]);
  const clipboardRows = useMemo(() => chunk(clipboardItems, isDesktop ? desktopColumns : 1), [clipboardItems, isDesktop, desktopColumns]);

  async function addImageToDraft() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, base64: false });
    if (picked.canceled || !picked.assets?.length) return;
    const uri = picked.assets[0].uri;
    setDraftImages((current) => Array.from(new Set([uri, ...current])).slice(0, 6));
  }

  async function pasteImageFromClipboardToDraft() {
    const getImageAsync = (Clipboard as unknown as { getImageAsync?: () => Promise<{ data: string } | null> }).getImageAsync;
    if (!getImageAsync) return;
    const image = await getImageAsync();
    if (!image?.data) return;
    const dataUri = `data:image/png;base64,${image.data}`;
    setDraftImages((current) => Array.from(new Set([dataUri, ...current])).slice(0, 6));
  }

  async function saveDraftAsNote() {
    const result = await addRichNoteUnique(draftText, activeCategory, draftImages);
    setNotes(result.notes);
    if (result.inserted) {
      setFilter('all');
      setDraftText('');
      setDraftImages([]);
      setManualCategory(null);
      setSmartResult(null);
      await AsyncStorage.removeItem(DRAFT_KEY);
    }
  }

  function runSmartGenerate() {
    if (!draftText.trim() && draftImages.length === 0) return;
    setSmartResult(analyzeSmartContent(draftText, draftImages));
  }

  async function runSmartGenerateWithOcr() {
    if (!draftText.trim() && draftImages.length === 0) return;
    setOcrBusy(true);
    try {
      let ocrText = '';
      const firstImage = draftImages[0];
      const maybeTesseract = (globalThis as unknown as { Tesseract?: { recognize: (img: string, lang: string) => Promise<{ data?: { text?: string } }> } }).Tesseract;
      if (firstImage && maybeTesseract?.recognize) {
        const result = await maybeTesseract.recognize(firstImage, 'eng');
        ocrText = String(result?.data?.text || '').trim();
      }
      const merged = [draftText.trim(), ocrText].filter(Boolean).join('\n');
      const parsed = analyzeSmartContent(merged, draftImages);
      setSmartResult({ ...parsed, rawText: ocrText || undefined });
    } finally {
      setOcrBusy(false);
    }
  }

  async function sendClipboardToNote(entry: ClipboardEntry) {
    setWorkspaceTab('notes');
    if (entry.kind === 'image' && entry.imageDataUri) {
      setDraftImages((current) => Array.from(new Set([entry.imageDataUri as string, ...current])).slice(0, 6));
      return;
    }
    setDraftText((current) => current ? `${current}\n${entry.content}` : entry.content);
  }

  function handleClipboardCardPress(entry: ClipboardEntry) {
    const now = Date.now();
    if (lastTap && lastTap.id === entry.id && now - lastTap.ts < 320) {
      setPreviewEntry(entry);
      setLastTap(null);
      return;
    }
    setLastTap({ id: entry.id, ts: now });
  }

  async function createNoteFromPreview() {
    if (!previewEntry) return;
    const category = detectAutoCategory(previewEntry.content || '');
    const attachments = previewEntry.kind === 'image' && previewEntry.imageDataUri ? [previewEntry.imageDataUri] : [];
    const text = previewEntry.kind === 'image' ? (previewEntry.content || 'Clipboard image') : previewEntry.content;
    const result = await addRichNoteUnique(text, category, attachments);
    setNotes(result.notes);
    setWorkspaceTab('notes');
    setPreviewEntry(null);
  }

  function sendClipboardToTemplate(entry: ClipboardEntry) {
    setWorkspaceTab('templates');
    setTemplateBody((current) => current ? `${current}\n${entry.content}` : entry.content);
  }

  async function createOutlookEventFromContent(raw: string) {
    const dt = parseFollowUpDate(raw);
    if (!dt) return;

    const ticketMatch = raw.match(/\b(RITM\d+|INC\d+|REQ\d+|SCTASK\d+)\b/i);
    const title = ticketMatch ? `Follow up ${ticketMatch[1].toUpperCase()}` : 'Follow up';
    const ics = buildAppointmentIcs(title, raw, '', dt, 30);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${title.replace(/\s+/g, '_')}.ics`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }

    const path = `${FileSystem.cacheDirectory}followup_${Date.now()}.ics`;
    await FileSystem.writeAsStringAsync(path, ics, { encoding: FileSystem.EncodingType.UTF8 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'text/calendar' });
    }
  }

  async function importScreenshotToClipboard() {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, base64: true });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    if (!asset.base64) return;
    const dataUri = `data:image/png;base64,${asset.base64}`;
    const result = await addClipboardImageUnique(dataUri);
    if (result.inserted) setClipboardItems(result.entries);
  }

  const workspaceWidth = '100%';

  return (
    <ScrollView style={mainAppStyles.screen} contentContainerStyle={[styles.content, { alignItems: 'center' }]} keyboardShouldPersistTaps="handled">
      <View style={[styles.workspace, { width: workspaceWidth }]}>
        <View style={[mainAppStyles.card, styles.workspaceTabs, { backgroundColor: palette.card, borderColor: palette.border }]}>
          {([
            { key: 'notes', icon: 'document-text-outline', label: 'Notes' },
            { key: 'templates', icon: 'layers-outline', label: 'Templates' },
            { key: 'clipboard', icon: 'clipboard-outline', label: 'Clipboard' },
          ] as { key: WorkspaceTab; icon: keyof typeof Ionicons.glyphMap; label: string }[]).map((tab) => {
            const active = workspaceTab === tab.key;
            return (
              <Pressable key={tab.key} onPress={() => setWorkspaceTab(tab.key)} style={({ pressed }) => [styles.workspaceTab, { borderColor: active ? palette.accent : palette.border, backgroundColor: active ? `${palette.accent}22` : palette.bg, opacity: pressed ? 0.85 : 1 }]}>
                <Ionicons name={tab.icon} size={14} color={active ? palette.accent : palette.muted} />
                <Text style={{ color: active ? palette.accent : palette.fg, fontSize: 12, fontWeight: '700' }}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {workspaceTab === 'notes' ? (
          <>
            {(draftText.trim() || draftImages.length) ? <View style={[mainAppStyles.card, styles.resumeCard, { backgroundColor: palette.card, borderColor: palette.border }]}><Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700' }}>Resume last note</Text><Text style={{ color: palette.fg, fontSize: 12 }} numberOfLines={1}>{draftText || `Images: ${draftImages.length}`}</Text></View> : null}

            <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
              <View style={styles.editorHeader}>
                <Text style={{ color: palette.fg, fontWeight: '800' }}>Intelligent note</Text>
                <Pressable onPress={() => runSmartGenerateWithOcr().catch(() => undefined)} style={({ pressed }) => [styles.iconAction, { borderColor: palette.border, backgroundColor: palette.bg, opacity: pressed ? 0.8 : 1 }]}>
                  <Ionicons name="sparkles-outline" size={16} color={palette.accent} />
                  <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>{ocrBusy ? 'Analyzing...' : 'Generate'}</Text>
                </Pressable>
              </View>
              <TextInput
                style={[mainAppStyles.input, styles.noteInput, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 8 }]}
                placeholder="Type here. Auto-save is always on."
                placeholderTextColor={palette.muted}
                multiline
                value={draftText}
                onChangeText={setDraftText}
                onKeyPress={(event) => {
                  const e = event.nativeEvent as unknown as { key?: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean };
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
                    void saveDraftAsNote();
                  }
                }}
              />

              {draftImages.length ? <View style={styles.attachmentRow}>{draftImages.map((item) => <View key={item} style={[styles.attachmentChip, { borderColor: palette.border, backgroundColor: palette.bg }]}><Ionicons name="image-outline" size={12} color={palette.muted} /><Text style={{ color: palette.fg, fontSize: 11 }} numberOfLines={1}>Image</Text></View>)}</View> : null}

              <View style={styles.editorFooter}>
                <View style={styles.categoryRow}>
                  <Pressable style={[styles.categoryChip, { borderColor: activeCategory === 'general' ? palette.accent : palette.border }]} onPress={() => setManualCategory('general')}><Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>General</Text></Pressable>
                  <Pressable style={[styles.categoryChip, { borderColor: activeCategory === 'work' ? palette.accent : palette.border }]} onPress={() => setManualCategory('work')}><Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>Work</Text></Pressable>
                </View>
                <View style={styles.editorActions}>
                  <Pressable style={[styles.iconOnlyAction, { borderColor: palette.border }]} onPress={() => addImageToDraft().catch(() => undefined)}><Ionicons name="images-outline" size={16} color={palette.fg} /></Pressable>
                  <Pressable style={[styles.iconOnlyAction, { borderColor: palette.border }]} onPress={() => pasteImageFromClipboardToDraft().catch(() => undefined)}><Ionicons name="clipboard-outline" size={16} color={palette.fg} /></Pressable>
                  <Pressable style={[styles.iconOnlyAction, { borderColor: palette.border }]} onPress={() => saveDraftAsNote().catch(() => undefined)}><Ionicons name="save-outline" size={16} color={palette.fg} /></Pressable>
                </View>
              </View>
            </View>

            {smartResult ? <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}><Text style={{ color: palette.fg, fontWeight: '800', marginBottom: 6 }}>Generated structure</Text><Text style={{ color: palette.fg, fontSize: 12, lineHeight: 18 }}>{smartResult.summary}</Text><View style={styles.editorActions}><Pressable style={[styles.iconOnlyAction, { borderColor: palette.border }]} onPress={() => saveDraftAsNote().catch(() => undefined)}><Ionicons name="document-text-outline" size={16} color={palette.fg} /></Pressable><Pressable style={[styles.iconOnlyAction, { borderColor: palette.border }]} onPress={() => { setWorkspaceTab('templates'); setTemplateName(smartResult.ticketNumber || 'Generated template'); setTemplateSubject(`Follow-up ${smartResult.ticketNumber || ''}`.trim()); setTemplateBody(smartResult.summary); }}><Ionicons name="layers-outline" size={16} color={palette.fg} /></Pressable><Pressable style={[styles.iconOnlyAction, { borderColor: palette.border }]} onPress={() => createOutlookEventFromContent(smartResult.summary).catch(() => undefined)}><Ionicons name="calendar-outline" size={16} color={palette.fg} /></Pressable></View></View> : null}

            <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
              <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Search notes" placeholderTextColor={palette.muted} value={search} onChangeText={setSearch} />
              <View style={styles.filterRow}>{(['all', 'work', 'pinned'] as NoteFilter[]).map((item) => <Pressable key={item} style={[styles.categoryChip, { borderColor: filter === item ? palette.accent : palette.border }]} onPress={() => setFilter(item)}><Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>{item}</Text></Pressable>)}</View>
            </View>

            <View style={styles.gridWrap}>
              {noteRows.map((row, rowIndex) => (
                <View key={`row-${rowIndex}`} style={styles.gridRow}>
                  {row.map((note) => {
                    const expanded = expandedNoteId === note.id;
                    const preview = note.text.trim() || `Image attachment (${note.attachments?.length || 0})`;
                    const firstAttachment = note.attachments?.[0];
                    return (
                      <Pressable
                        key={note.id}
                        onPress={() => setExpandedNoteId(expanded ? null : note.id)}
                        style={({ pressed }) => [styles.compactCard, { flex: 1, borderColor: palette.border, backgroundColor: palette.card, opacity: pressed ? 0.9 : 1 }]}
                      >
                        <View style={styles.cardHead}>
                          <Text style={{ color: palette.muted, fontSize: 10 }}>{new Date(note.updatedAt).toLocaleDateString()} {new Date(note.updatedAt).toLocaleTimeString()}</Text>
                          <Pressable onPress={() => togglePinned(note.id).then(setNotes)}>
                            <Ionicons name={note.pinned ? 'bookmark' : 'bookmark-outline'} size={16} color={palette.accent} />
                          </Pressable>
                        </View>
                        {firstAttachment ? <Image source={{ uri: firstAttachment }} style={styles.noteThumb} resizeMode="cover" /> : null}
                        {editingNoteId === note.id ? (
                          <TextInput value={editingText} onChangeText={setEditingText} multiline style={[mainAppStyles.input, { marginTop: 6, backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} />
                        ) : (
                          <Text style={{ color: palette.fg, fontSize: 12, lineHeight: 17 }} numberOfLines={expanded ? 0 : 2}>{preview}</Text>
                        )}
                        <View style={styles.cardFoot}>
                          <Text style={{ color: note.category === 'work' ? palette.accent : palette.muted, fontSize: 10, fontWeight: '800' }}>{note.category.toUpperCase()}</Text>
                          <View style={styles.editorActions}>
                            {editingNoteId === note.id ? (
                              <Pressable onPress={() => updateNoteText(note.id, editingText).then((next) => { setNotes(next); setEditingNoteId(null); setEditingText(''); })}>
                                <Ionicons name="checkmark-outline" size={16} color={palette.accent} />
                              </Pressable>
                            ) : (
                              <Pressable onPress={() => { setEditingNoteId(note.id); setEditingText(note.text); }}>
                                <Ionicons name="create-outline" size={16} color={palette.fg} />
                              </Pressable>
                            )}
                            <Pressable onPress={() => removeNote(note.id).then(setNotes)}>
                              <Ionicons name="trash-outline" size={16} color="#ef4444" />
                            </Pressable>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                  {row.length < (isDesktop ? desktopColumns : 1) ? Array.from({ length: (isDesktop ? desktopColumns : 1) - row.length }).map((_, i) => <View key={`fill-${i}`} style={{ flex: 1 }} />) : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {workspaceTab === 'templates' ? (
          <>
            <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}><TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Template name" placeholderTextColor={palette.muted} value={templateName} onChangeText={setTemplateName} /><TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Subject" placeholderTextColor={palette.muted} value={templateSubject} onChangeText={setTemplateSubject} /><TextInput style={[mainAppStyles.input, styles.noteInput, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Body" placeholderTextColor={palette.muted} multiline value={templateBody} onChangeText={setTemplateBody} /><View style={styles.editorActions}><Pressable style={[styles.iconOnlyAction, { borderColor: palette.border }]} onPress={() => { addTemplate({ name: templateName || 'Template', kind: 'email', subject: templateSubject, body: templateBody, location: '', durationMinutes: 30 }).then(setTemplates).then(() => { setTemplateName(''); setTemplateSubject(''); setTemplateBody(''); }).catch(() => undefined); }}><Ionicons name="save-outline" size={16} color={palette.fg} /></Pressable></View></View>
            <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}><TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Search templates" placeholderTextColor={palette.muted} value={templateSearch} onChangeText={setTemplateSearch} />{filteredTemplates.map((template) => <View key={template.id} style={[styles.compactCard, { borderColor: palette.border, backgroundColor: palette.bg }]}><Text style={{ color: palette.fg, fontWeight: '800' }} numberOfLines={1}>{template.name}</Text><Text style={{ color: palette.muted, fontSize: 11 }} numberOfLines={1}>{template.subject || '(No subject)'}</Text><View style={styles.editorActions}><Pressable onPress={() => removeTemplate(template.id).then(setTemplates)}><Ionicons name="trash-outline" size={16} color="#ef4444" /></Pressable></View></View>)}</View>
          </>
        ) : null}

        {workspaceTab === 'clipboard' ? (
          <>
            <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}><View style={styles.editorHeader}><Text style={{ color: palette.fg, fontWeight: '800' }}>Clipboard timeline</Text><View style={styles.editorActions}><Pressable style={[styles.iconOnlyAction, { borderColor: palette.border }]} onPress={() => importScreenshotToClipboard().catch(() => undefined)}><Ionicons name="image-outline" size={16} color={palette.fg} /></Pressable></View></View><Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>{clipboardAvailable ? 'Active capture (app focus required). Duplicates are ignored.' : 'Clipboard capture not available on this device.'}</Text></View>
            <View style={styles.gridWrap}>
              {clipboardRows.map((row, rowIndex) => (
                <View key={`clip-row-${rowIndex}`} style={styles.gridRow}>
                  {row.map((entry) => {
                    const eventDate = parseFollowUpDate(entry.content);
                    return (
                      <Pressable
                        key={entry.id}
                        onPress={() => handleClipboardCardPress(entry)}
                        style={({ pressed }) => [styles.compactCard, { flex: 1, borderColor: palette.border, backgroundColor: palette.card, opacity: pressed ? 0.92 : 1 }]}
                      >
                        <View style={styles.cardHead}>
                          <Text style={{ color: palette.muted, fontSize: 10 }}>{new Date(entry.capturedAt).toLocaleDateString()} {new Date(entry.capturedAt).toLocaleTimeString()}</Text>
                          <Text style={{ color: palette.accent, fontSize: 10, fontWeight: '800' }}>{entry.category.toUpperCase()}</Text>
                        </View>
                        {entry.kind === 'image' && entry.imageDataUri ? <Image source={{ uri: entry.imageDataUri }} style={styles.clipThumb} resizeMode="cover" /> : null}
                        <Text style={{ color: palette.fg, fontSize: 12 }} numberOfLines={2}>{entry.content}</Text>
                        <Text style={{ color: palette.muted, fontSize: 10 }}>Double tap to preview</Text>
                        <View style={styles.editorActions}>
                          <Pressable onPress={() => Clipboard.setStringAsync(entry.content)}><Ionicons name="copy-outline" size={16} color={palette.fg} /></Pressable>
                          <Pressable onPress={() => sendClipboardToNote(entry).catch(() => undefined)}><Ionicons name="document-text-outline" size={16} color={palette.fg} /></Pressable>
                          <Pressable onPress={() => sendClipboardToTemplate(entry)}><Ionicons name="layers-outline" size={16} color={palette.fg} /></Pressable>
                          {eventDate ? <Pressable onPress={() => createOutlookEventFromContent(entry.content).catch(() => undefined)}><Ionicons name="calendar-outline" size={16} color={palette.fg} /></Pressable> : null}
                        </View>
                      </Pressable>
                    );
                  })}
                  {row.length < (isDesktop ? desktopColumns : 1) ? Array.from({ length: (isDesktop ? desktopColumns : 1) - row.length }).map((_, i) => <View key={`clip-fill-${i}`} style={{ flex: 1 }} />) : null}
                </View>
              ))}
            </View>
          </>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  workspace: { gap: 8 },
  workspaceTabs: { flexDirection: 'row', gap: 8, marginBottom: 0 },
  workspaceTab: { flex: 1, minHeight: 36, borderWidth: 1, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 8 },
  resumeCard: { paddingVertical: 10 },
  editorHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  iconAction: { borderWidth: 1, borderRadius: 999, minHeight: 30, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  noteInput: { minHeight: 96, textAlignVertical: 'top' },
  attachmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  attachmentChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 5, maxWidth: 120 },
  editorFooter: { marginTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  categoryRow: { flexDirection: 'row', gap: 6 },
  categoryChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  editorActions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  iconOnlyAction: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  filterRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  gridWrap: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  compactCard: { borderWidth: 1, borderRadius: 10, padding: 9, gap: 8 },
  noteThumb: { width: '100%', height: 112, borderRadius: 8, backgroundColor: '#111' },
  clipThumb: { width: '100%', height: 96, borderRadius: 8, backgroundColor: '#111' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewImage: { width: '100%', height: 260, borderRadius: 10, backgroundColor: '#000' },
  previewActions: { marginTop: 14, flexDirection: 'row', gap: 10 },
  previewBtn: { flex: 1, minHeight: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
