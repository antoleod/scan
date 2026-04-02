import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { scanFromURLAsync } from 'expo-camera';

import {
  NoteCategory,
  NoteItem,
  NoteTemplate,
  addNoteUnique,
  addTemplate,
  ensureWorkNotesAndEmailTemplates,
  removeNote,
  removeTemplate,
  togglePinned,
  updateNoteText,
} from '../../../core/notes';
import { IMAGE_SCAN_BARCODE_TYPES } from '../../../core/scanPipeline';
import { extractFields } from '../../../core/extract';
import { mainAppStyles } from '../styles';

type Palette = { bg: string; fg: string; accent: string; muted: string; card: string; border: string };
type ViewMode = 'notes' | 'templates';
type NoteFilter = 'all' | 'work' | 'pinned';

const DRAFT_KEY = '@oryxen_notes_draft_v1';

function detectCategory(input: string): NoteCategory {
  const text = input.toUpperCase();
  if (/\b(02PI\w*|PI\d+)\b/.test(text)) return 'general';
  if (/\b(RITM\d+|REQ\d+|INC\d+|SCTASK\d+)\b/.test(text)) return 'work';
  if (/\b(USER|WORK|OFFICE|CALL|REQUEST)\b/.test(text)) return 'work';
  return 'general';
}

export function NotesTab({ palette }: { palette: Palette }) {
  const [mode, setMode] = useState<ViewMode>('notes');
  const [input, setInput] = useState('');
  const [manualCategory, setManualCategory] = useState<NoteCategory | null>(null);
  const [search, setSearch] = useState('');
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [templateName, setTemplateName] = useState('');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [templateSearch, setTemplateSearch] = useState('');

  useEffect(() => {
    ensureWorkNotesAndEmailTemplates().then(({ notes: n, templates: t }) => {
      setNotes(n);
      setTemplates(t);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(DRAFT_KEY).then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed?.text === 'string') {
        setInput(parsed.text);
        setManualCategory(parsed.category === 'work' || parsed.category === 'general' ? parsed.category : null);
      }
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(DRAFT_KEY, JSON.stringify({ text: input, category: manualCategory, updatedAt: Date.now() })).catch(() => undefined);
  }, [input, manualCategory]);

  const resolvedCategory = manualCategory || detectCategory(input);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = q ? notes.filter((n) => `${n.text} ${n.category}`.toLowerCase().includes(q)) : notes;
    if (noteFilter === 'work') result = result.filter((n) => n.category === 'work');
    if (noteFilter === 'pinned') result = result.filter((n) => n.pinned);
    return result;
  }, [notes, search, noteFilter]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => `${t.name} ${t.subject} ${t.body}`.toLowerCase().includes(q));
  }, [templateSearch, templates]);

  const saveDraftAsNote = async () => {
    const result = await addNoteUnique(input, resolvedCategory);
    setNotes(result.notes);
    if (result.inserted) {
      setInput('');
      setManualCategory(null);
      await AsyncStorage.removeItem(DRAFT_KEY);
    }
  };

  const createFromScreenshot = async () => {
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, base64: false });
    if (picked.canceled || !picked.assets?.length) return;
    const uri = picked.assets[0].uri;
    const codes = await scanFromURLAsync(uri, IMAGE_SCAN_BARCODE_TYPES).catch(() => []);
    const rawText = codes.map((c) => c.data).join('\n');
    const fields = extractFields(rawText, []);
    const noteLines = [
      `Request item: ${fields.ticketNumber || '-'}`,
      `Requested for: ${fields.customerId || '-'}`,
      `Location: ${fields.officeNumber || fields.officeCode || '-'}`,
      `Configuration item: ${fields.shortDescription || '-'}`,
      `Follow up: -`,
      `Time worked: -`,
    ];
    const noteText = noteLines.join('\n');
    const result = await addNoteUnique(noteText, 'work');
    setNotes(result.notes);

    Alert.alert('Structured note created', 'Use icons to export this note to ServiceNow or Calendar.', [
      {
        text: 'ServiceNow',
        onPress: () => {
          const ticket = fields.ticketNumber || '';
          const query = encodeURIComponent(ticket || noteText);
          void Linking.openURL(`https://www.google.com/search?q=ServiceNow+${query}`);
        },
      },
      {
        text: 'Calendar',
        onPress: () => {
          const title = encodeURIComponent(fields.ticketNumber || 'Follow up');
          void Linking.openURL(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}`);
        },
      },
      { text: 'Close', style: 'cancel' },
    ]);
  };

  return (
    <ScrollView style={mainAppStyles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
        <View style={styles.modeRow}>
          {(['notes', 'templates'] as ViewMode[]).map((item) => (
            <Pressable key={item} style={[styles.tabButton, { borderColor: palette.accent, backgroundColor: mode === item ? palette.accent : 'transparent' }]} onPress={() => setMode(item)}>
              <Text style={{ color: mode === item ? palette.bg : palette.accent, fontWeight: '800' }}>{item === 'notes' ? 'Notes' : 'Templates'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {mode === 'notes' ? (
        <>
          {input.trim().length > 0 ? (
            <Pressable style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={() => undefined}>
              <Text style={{ color: palette.muted, fontSize: 11 }}>Continue last note</Text>
              <Text style={{ color: palette.fg, fontSize: 12 }} numberOfLines={1}>{input}</Text>
            </Pressable>
          ) : null}

          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
            <TextInput
              style={[mainAppStyles.input, styles.noteInput, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]}
              placeholder="Write a quick note..."
              placeholderTextColor={palette.muted}
              multiline
              value={input}
              onChangeText={setInput}
            />
            <View style={styles.row}>
              <Pressable style={[styles.chip, { borderColor: resolvedCategory === 'general' ? palette.accent : palette.border }]} onPress={() => setManualCategory('general')}><Text style={{ color: palette.fg }}>General</Text></Pressable>
              <Pressable style={[styles.chip, { borderColor: resolvedCategory === 'work' ? palette.accent : palette.border }]} onPress={() => setManualCategory('work')}><Text style={{ color: palette.fg }}>Work</Text></Pressable>
              <Pressable style={[styles.saveBtn, { backgroundColor: palette.accent }]} onPress={() => saveDraftAsNote().catch(() => undefined)}><Text style={[styles.saveBtnText, { color: palette.bg }]}>Save</Text></Pressable>
            </View>
          </View>

          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Quick search..." placeholderTextColor={palette.muted} value={search} onChangeText={setSearch} />
            <View style={styles.row}>
              {(['all', 'work', 'pinned'] as NoteFilter[]).map((item) => (
                <Pressable key={item} style={[styles.chip, { borderColor: noteFilter === item ? palette.accent : palette.border }]} onPress={() => setNoteFilter(item)}>
                  <Text style={{ color: palette.fg }}>{item}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
            <Text style={{ color: palette.fg, fontWeight: '800' }}>Saved notes ({filtered.length})</Text>
            {filtered.map((note) => (
              <View key={note.id} style={[styles.noteCard, { borderColor: palette.border, backgroundColor: palette.bg }]}>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Text style={{ color: palette.muted, fontSize: 11 }}>{new Date(note.updatedAt).toLocaleString()}</Text>
                  <Text style={{ color: note.category === 'work' ? palette.accent : palette.muted, fontSize: 11, fontWeight: '800' }}>{note.category.toUpperCase()}</Text>
                </View>
                {editingId === note.id ? (
                  <TextInput style={[mainAppStyles.input, { backgroundColor: palette.card, color: palette.fg, borderColor: palette.border, marginTop: 6 }]} value={editingText} multiline onChangeText={setEditingText} />
                ) : (
                  <Text style={{ color: palette.fg, marginTop: 4 }} numberOfLines={1}>{note.text}</Text>
                )}
                <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 8 }]}>
                  {editingId === note.id ? (
                    <Pressable onPress={() => updateNoteText(note.id, editingText).then((next) => { setNotes(next); setEditingId(null); setEditingText(''); })}><Ionicons name="checkmark-outline" size={20} color={palette.accent} /></Pressable>
                  ) : (
                    <Pressable onPress={() => { setEditingId(note.id); setEditingText(note.text); }}><Ionicons name="create-outline" size={20} color={palette.accent} /></Pressable>
                  )}
                  <Pressable onPress={() => togglePinned(note.id).then(setNotes)}><Ionicons name={note.pinned ? 'bookmark' : 'bookmark-outline'} size={20} color={palette.accent} /></Pressable>
                  <Pressable onPress={() => removeNote(note.id).then(setNotes)}><Ionicons name="trash-outline" size={20} color="#ef4444" /></Pressable>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
            <Pressable style={[styles.saveBtn, { backgroundColor: palette.accent }]} onPress={() => createFromScreenshot().catch(() => undefined)}>
              <Text style={[styles.saveBtnText, { color: palette.bg }]}>Create from Screenshot</Text>
            </Pressable>
            <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Template name" placeholderTextColor={palette.muted} value={templateName} onChangeText={setTemplateName} />
            <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Subject" placeholderTextColor={palette.muted} value={templateSubject} onChangeText={setTemplateSubject} />
            <TextInput style={[mainAppStyles.input, styles.noteInput, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Body" placeholderTextColor={palette.muted} multiline value={templateBody} onChangeText={setTemplateBody} />
            <Pressable
              style={[styles.saveBtn, { backgroundColor: palette.accent }]}
              onPress={() => {
                addTemplate({ name: templateName || 'Template', kind: 'email', subject: templateSubject, body: templateBody, location: '', durationMinutes: 30 })
                  .then(setTemplates)
                  .then(() => { setTemplateName(''); setTemplateSubject(''); setTemplateBody(''); })
                  .catch(() => undefined);
              }}
            >
              <Text style={[styles.saveBtnText, { color: palette.bg }]}>Save template</Text>
            </Pressable>
          </View>

          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}> 
            <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Search templates" placeholderTextColor={palette.muted} value={templateSearch} onChangeText={setTemplateSearch} />
            {filteredTemplates.map((item) => (
              <View key={item.id} style={[styles.noteCard, { borderColor: palette.border, backgroundColor: palette.bg }]}>
                <Text style={{ color: palette.fg, fontWeight: '800' }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ color: palette.muted, marginTop: 4 }} numberOfLines={1}>{item.subject || '(No subject)'}</Text>
                <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 6 }]}>
                  <Pressable onPress={() => removeTemplate(item.id).then(setTemplates)}><Ionicons name="trash-outline" size={18} color="#ef4444" /></Pressable>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  modeRow: { flexDirection: 'row', gap: 8 },
  tabButton: { flex: 1, borderWidth: 1, borderRadius: 8, minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  noteInput: { minHeight: 90 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  saveBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  saveBtnText: { fontWeight: '800' },
  noteCard: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
});
