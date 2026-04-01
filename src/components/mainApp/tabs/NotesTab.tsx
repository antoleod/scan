import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';

import {
  NoteCategory,
  NoteItem,
  NoteTemplate,
  TemplateKind,
  addNoteUnique,
  addTemplate,
  clearNotes,
  ensureWorkNotesAndEmailTemplates,
  removeNote,
  removeTemplate,
  togglePinned,
  updateNoteText,
} from '../../../core/notes';
import { mainAppStyles } from '../styles';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

type ViewMode = 'notes' | 'templates';
type NoteFilter = 'all' | 'work' | 'pinned' | 'images';

function formatNoteDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

export function NotesTab({ palette }: { palette: Palette }) {
  const [mode, setMode] = useState<ViewMode>('notes');
  const [input, setInput] = useState('');
  const [newNoteCategory, setNewNoteCategory] = useState<NoteCategory>('general');
  const [search, setSearch] = useState('');
  const [noteFilter, setNoteFilter] = useState<NoteFilter>('all');
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateKind, setTemplateKind] = useState<TemplateKind>('email');
  const [templateSubject, setTemplateSubject] = useState('');
  const [templateBody, setTemplateBody] = useState('');

  useEffect(() => {
    ensureWorkNotesAndEmailTemplates().then(({ notes: n, templates: t }) => {
      setNotes(n);
      setTemplates(t);
    }).catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byQuery = q ? notes.filter((item) => item.text.toLowerCase().includes(q)) : notes;
    if (noteFilter === 'work') return byQuery.filter((item) => item.category === 'work');
    if (noteFilter === 'pinned') return byQuery.filter((item) => item.pinned);
    if (noteFilter === 'images') return byQuery.filter((item) => item.kind === 'image');
    return byQuery;
  }, [notes, noteFilter, search]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((item) => `${item.name} ${item.subject} ${item.body}`.toLowerCase().includes(q));
  }, [templateSearch, templates]);

  const handleAdd = async () => {
    const result = await addNoteUnique(input, newNoteCategory);
    setNotes(result.notes);
    if (result.inserted) setInput('');
  };

  const handleCreateTemplate = async () => {
    if (!templateName.trim()) {
      Alert.alert('Missing name', 'Template name is required.');
      return;
    }
    const next = await addTemplate({
      name: templateName.trim(),
      kind: templateKind,
      subject: templateSubject.trim(),
      body: templateBody,
      location: '',
      durationMinutes: 30,
    });
    setTemplates(next);
    setTemplateName('');
    setTemplateSubject('');
    setTemplateBody('');
  };

  const templateToText = (item: NoteTemplate) => {
    const now = new Date();
    const replacements: Record<string, string> = {
      '{{date}}': now.toLocaleDateString(),
      '{{time}}': now.toLocaleTimeString(),
      '{{clipboard}}': '',
    };
    const body = Object.entries(replacements).reduce((acc, [key, value]) => acc.split(key).join(value), item.body || '');
    return `${item.subject || item.name}\n${body}`.trim();
  };

  return (
    <ScrollView style={mainAppStyles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={[mainAppStyles.card, styles.heroCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
        <Text style={[styles.kicker, { color: palette.accent }]}>NOTES</Text>
        <Text style={{ color: palette.muted }}>Clipboard capture, quick notes and reusable templates.</Text>
        <View style={styles.modeRow}>
          {(['notes', 'templates'] as ViewMode[]).map((item) => {
            const active = mode === item;
            return (
              <Pressable key={item} style={[styles.tabButton, { borderColor: palette.accent, backgroundColor: active ? palette.accent : 'transparent' }]} onPress={() => setMode(item)}>
                <Text style={{ color: active ? palette.bg : palette.accent, fontWeight: '800' }}>{item === 'notes' ? 'Notes' : 'Templates'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {mode === 'notes' ? (
        <>
          <View style={[mainAppStyles.card, styles.quickCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <TextInput style={[mainAppStyles.input, styles.noteInput, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Write a quick note..." placeholderTextColor={palette.muted} multiline value={input} onChangeText={setInput} />
            <View style={styles.row}>
              <Pressable style={[styles.chip, { borderColor: newNoteCategory === 'general' ? palette.accent : palette.border }]} onPress={() => setNewNoteCategory('general')}><Text style={{ color: palette.fg }}>General</Text></Pressable>
              <Pressable style={[styles.chip, { borderColor: newNoteCategory === 'work' ? palette.accent : palette.border }]} onPress={() => setNewNoteCategory('work')}><Text style={{ color: palette.fg }}>Work</Text></Pressable>
              <Pressable style={[styles.saveBtn, { backgroundColor: palette.accent }]} onPress={() => handleAdd().catch(() => undefined)}><Text style={[styles.saveBtnText, { color: palette.bg }]}>Save note</Text></Pressable>
            </View>
            <Pressable style={[styles.secondaryBtn, { borderColor: palette.border }]} onPress={() => Clipboard.getStringAsync().then((v) => addNoteUnique(v, newNoteCategory)).then((result) => setNotes(result.notes))}>
              <Text style={{ color: palette.fg, fontWeight: '700' }}>Paste from clipboard</Text>
            </Pressable>
          </View>

          <View style={[mainAppStyles.card, styles.quickCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Search notes..." placeholderTextColor={palette.muted} value={search} onChangeText={setSearch} />
            <View style={[styles.row, { marginTop: 10 }]}>
              {(['all', 'work', 'pinned', 'images'] as NoteFilter[]).map((item) => (
                <Pressable key={item} style={[styles.chip, { borderColor: noteFilter === item ? palette.accent : palette.border }]} onPress={() => setNoteFilter(item)}>
                  <Text style={{ color: palette.fg }}>{item.toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.headerRow}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>Saved notes ({filtered.length})</Text>
              <Pressable onPress={() => Alert.alert('Clear notes', 'Delete all notes?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => clearNotes().then(() => setNotes([])) }])}>
                <Text style={{ color: '#ef4444', fontWeight: '800' }}>Clear all</Text>
              </Pressable>
            </View>

            {filtered.map((note) => (
              <View key={note.id} style={[styles.noteCard, { borderColor: palette.border, backgroundColor: palette.bg }]}>
                <Text style={{ color: palette.muted, fontSize: 11 }}>{formatNoteDate(note.updatedAt)}</Text>
                <Text style={{ color: note.category === 'work' ? palette.accent : palette.muted, fontSize: 11, fontWeight: '800' }}>{note.category.toUpperCase()}</Text>
                {editingId === note.id ? (
                  <TextInput style={[mainAppStyles.input, { backgroundColor: palette.card, color: palette.fg, borderColor: palette.border, marginTop: 6 }]} value={editingText} multiline onChangeText={setEditingText} />
                ) : (
                  <Text style={{ color: palette.fg, marginTop: 4 }}>{note.text}</Text>
                )}
                <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 8 }]}>
                  {editingId === note.id ? (
                    <Pressable onPress={() => updateNoteText(note.id, editingText).then((next) => { setNotes(next); setEditingId(null); setEditingText(''); })}><Ionicons name="checkmark-outline" size={20} color={palette.accent} /></Pressable>
                  ) : (
                    <Pressable onPress={() => { setEditingId(note.id); setEditingText(note.text); }}><Ionicons name="create-outline" size={20} color={palette.accent} /></Pressable>
                  )}
                  <Pressable onPress={() => Clipboard.setStringAsync(note.text)}><Ionicons name="copy-outline" size={20} color={palette.accent} /></Pressable>
                  <Pressable onPress={() => togglePinned(note.id).then(setNotes)}><Ionicons name={note.pinned ? 'bookmark' : 'bookmark-outline'} size={20} color={palette.accent} /></Pressable>
                  <Pressable onPress={() => removeNote(note.id).then(setNotes)}><Ionicons name="trash-outline" size={20} color="#ef4444" /></Pressable>
                </View>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          <View style={[mainAppStyles.card, styles.quickCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>Create template</Text>
            <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Template name" placeholderTextColor={palette.muted} value={templateName} onChangeText={setTemplateName} />
            <View style={styles.modeRow}>
              <Pressable style={[styles.tabButton, { borderColor: palette.accent, backgroundColor: templateKind === 'email' ? palette.accent : 'transparent' }]} onPress={() => setTemplateKind('email')}><Text style={{ color: templateKind === 'email' ? palette.bg : palette.accent, fontWeight: '700' }}>Email</Text></Pressable>
              <Pressable style={[styles.tabButton, { borderColor: palette.accent, backgroundColor: templateKind === 'appointment' ? palette.accent : 'transparent' }]} onPress={() => setTemplateKind('appointment')}><Text style={{ color: templateKind === 'appointment' ? palette.bg : palette.accent, fontWeight: '700' }}>Appointment</Text></Pressable>
            </View>
            <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Subject" placeholderTextColor={palette.muted} value={templateSubject} onChangeText={setTemplateSubject} />
            <TextInput style={[mainAppStyles.input, styles.noteInput, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Body" placeholderTextColor={palette.muted} multiline value={templateBody} onChangeText={setTemplateBody} />
            <Pressable style={[styles.saveBtn, { alignSelf: 'flex-start', backgroundColor: palette.accent }]} onPress={() => handleCreateTemplate().catch(() => undefined)}><Text style={[styles.saveBtnText, { color: palette.bg }]}>Save template</Text></Pressable>
          </View>

          <View style={[mainAppStyles.card, styles.quickCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Search templates..." placeholderTextColor={palette.muted} value={templateSearch} onChangeText={setTemplateSearch} />
            {filteredTemplates.map((item) => (
              <View key={item.id} style={[styles.noteCard, { borderColor: palette.border, backgroundColor: palette.bg }]}>
                <Text style={{ color: palette.fg, fontWeight: '800' }}>{item.name} · {item.kind.toUpperCase()}</Text>
                <Text style={{ color: palette.muted }}>{item.subject || '(No subject)'}</Text>
                <View style={[styles.row, { justifyContent: 'flex-end' }]}>
                  <Pressable onPress={() => { setMode('notes'); setInput(templateToText(item)); }}><Ionicons name="sparkles-outline" size={18} color={palette.accent} /></Pressable>
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
  heroCard: {
    borderLeftWidth: 3,
  },
  quickCard: {
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  kicker: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1, fontFamily: 'monospace' },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tabButton: { flex: 1, borderWidth: 1, borderRadius: 8, minHeight: 34, alignItems: 'center', justifyContent: 'center' },
  noteInput: { minHeight: 90 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  saveBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  saveBtnText: { fontWeight: '800' },
  secondaryBtn: { marginTop: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  noteCard: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
});
