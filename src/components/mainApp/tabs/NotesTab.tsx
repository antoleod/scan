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
import { detectSearchKind, matchesNoteByQuery } from '../../../core/smartSearch';
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

const FILTER_ICONS: Record<NoteFilter, keyof typeof Ionicons.glyphMap> = {
  all: 'list-outline',
  work: 'briefcase-outline',
  pinned: 'bookmark-outline',
  images: 'image-outline',
};

const FILTER_LABELS: Record<NoteFilter, string> = {
  all: 'All',
  work: 'Work',
  pinned: 'Pinned',
  images: 'Images',
};

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function noteToDateKey(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatNoteDate(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}

function CalendarGrid({
  palette,
  items,
  selectedDay,
  onSelectDay,
}: {
  palette: Palette;
  items: NoteItem[];
  selectedDay: string | null;
  onSelectDay: (key: string | null) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const countByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      const key = noteToDateKey(item.updatedAt);
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [items]);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const todayKey = toDateKey(today);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const totalCaptures = Object.values(countByDay).reduce((a, b) => a + b, 0);

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <View style={calStyles.calWrap}>
      <View style={calStyles.calHeader}>
        <Pressable onPress={prevMonth} style={calStyles.navBtn}>
          <Ionicons name="chevron-back" size={16} color={palette.fg} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[calStyles.calTitle, { color: palette.fg }]}>
            {MONTH_NAMES[month]} {year}
          </Text>
          <Text style={{ color: palette.muted, fontSize: 11 }}>{totalCaptures} notes</Text>
        </View>
        <Pressable onPress={nextMonth} style={calStyles.navBtn}>
          <Ionicons name="chevron-forward" size={16} color={palette.fg} />
        </Pressable>
      </View>

      <View style={calStyles.weekRow}>
        {WEEK_DAYS.map((d, i) => (
          <Text key={i} style={[calStyles.weekDay, { color: palette.muted }]}>{d}</Text>
        ))}
      </View>

      <View style={calStyles.grid}>
        {cells.map((day, i) => {
          if (!day) return <View key={`e${i}`} style={calStyles.cell} />;
          const key = `${year}-${month}-${day}`;
          const count = countByDay[key] || 0;
          const isToday = key === todayKey;
          const isSelected = key === selectedDay;
          return (
            <Pressable
              key={key}
              onPress={() => onSelectDay(isSelected ? null : key)}
              style={[
                calStyles.cell,
                isSelected && { backgroundColor: palette.accent, borderRadius: 8 },
                isToday && !isSelected && { borderWidth: 1, borderColor: palette.accent, borderRadius: 8 },
              ]}
            >
              <Text style={[
                calStyles.dayNum,
                { color: isSelected ? palette.bg : palette.fg },
                isToday && !isSelected && { color: palette.accent, fontWeight: '800' },
              ]}>
                {day}
              </Text>
              {count > 0 && (
                <View style={[calStyles.dot, { backgroundColor: isSelected ? palette.bg : palette.accent }]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
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
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDay, setCalendarDay] = useState<string | null>(null);

  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [templateSearch, setTemplateSearch] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
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
    let result = search.trim() ? notes.filter((item) => matchesNoteByQuery(item, search)) : notes;
    if (noteFilter === 'work') result = result.filter((item) => item.category === 'work');
    else if (noteFilter === 'pinned') result = result.filter((item) => item.pinned);
    else if (noteFilter === 'images') result = result.filter((item) => item.kind === 'image');
    if (calendarDay) {
      result = result.filter((item) => noteToDateKey(item.updatedAt) === calendarDay);
    }
    return result;
  }, [notes, noteFilter, search, calendarDay]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((item) => `${item.name} ${item.subject} ${item.body}`.toLowerCase().includes(q));
  }, [templateSearch, templates]);

  const detectedSearchKind = useMemo(() => detectSearchKind(search), [search]);

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
    setShowCreateForm(false);
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

          {/* Search + filters */}
          <View style={[mainAppStyles.card, styles.quickCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Search notes..." placeholderTextColor={palette.muted} value={search} onChangeText={setSearch} />
            {search.trim() ? (
              <Text style={{ color: palette.muted, fontSize: 11, marginTop: 8 }}>
                Smart search: {detectedSearchKind.toUpperCase()}
              </Text>
            ) : null}
            <View style={[styles.row, { marginTop: 10 }]}>
              {(['all', 'work', 'pinned', 'images'] as NoteFilter[]).map((item) => {
                const active = noteFilter === item;
                return (
                  <Pressable
                    key={item}
                    style={[styles.filterChip, { borderColor: active ? palette.accent : palette.border, backgroundColor: active ? `${palette.accent}20` : 'transparent' }]}
                    onPress={() => setNoteFilter(item)}
                  >
                    <Ionicons name={FILTER_ICONS[item]} size={13} color={active ? palette.accent : palette.muted} />
                    <Text style={{ color: active ? palette.accent : palette.fg, fontSize: 12, fontWeight: active ? '800' : '600' }}>{FILTER_LABELS[item]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Calendar view */}
          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border, padding: 0, overflow: 'hidden' }]}>
            <Pressable
              style={[styles.sectionToggle, { borderBottomWidth: calendarOpen ? 1 : 0, borderBottomColor: palette.border }]}
              onPress={() => { setCalendarOpen(v => !v); setCalendarDay(null); }}
            >
              <View style={styles.row}>
                <Ionicons name="calendar-outline" size={16} color={palette.accent} />
                <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>Calendar</Text>
                {calendarDay && (
                  <View style={[styles.activeBadge, { backgroundColor: palette.accent }]}>
                    <Text style={{ color: palette.bg, fontSize: 10, fontWeight: '800' }}>FILTERED</Text>
                  </View>
                )}
              </View>
              <Ionicons name={calendarOpen ? 'chevron-up' : 'chevron-down'} size={16} color={palette.muted} />
            </Pressable>
            {calendarOpen && (
              <CalendarGrid
                palette={palette}
                items={notes}
                selectedDay={calendarDay}
                onSelectDay={setCalendarDay}
              />
            )}
          </View>

          {/* Notes list */}
          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <View style={styles.headerRow}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>
                Saved notes ({filtered.length})
                {calendarDay ? <Text style={{ color: palette.accent }}> · day filtered</Text> : null}
              </Text>
              <Pressable onPress={() => Alert.alert('Clear notes', 'Delete all notes?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => clearNotes().then(() => setNotes([])) }])}>
                <Text style={{ color: '#ef4444', fontWeight: '800' }}>Clear all</Text>
              </Pressable>
            </View>

            {filtered.length === 0 && (
              <Text style={{ color: palette.muted, textAlign: 'center', paddingVertical: 12 }}>
                {calendarDay ? 'No notes on this day.' : 'No notes yet.'}
              </Text>
            )}

            {filtered.map((note) => (
              <View key={note.id} style={[styles.noteCard, { borderColor: palette.border, backgroundColor: palette.bg }]}>
                <View style={[styles.row, { justifyContent: 'space-between' }]}>
                  <Text style={{ color: palette.muted, fontSize: 11 }}>{formatNoteDate(note.updatedAt)}</Text>
                  <Text style={{ color: note.category === 'work' ? palette.accent : palette.muted, fontSize: 11, fontWeight: '800' }}>{note.category.toUpperCase()}</Text>
                </View>
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
          {/* Templates header with + button */}
          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border, padding: 0, overflow: 'hidden' }]}>
            <Pressable
              style={[styles.sectionToggle, { borderBottomWidth: showCreateForm ? 1 : 0, borderBottomColor: palette.border }]}
              onPress={() => setShowCreateForm(v => !v)}
            >
              <View style={styles.row}>
                <Ionicons name="add-circle-outline" size={18} color={palette.accent} />
                <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>New template</Text>
              </View>
              <Ionicons name={showCreateForm ? 'chevron-up' : 'chevron-down'} size={16} color={palette.muted} />
            </Pressable>

            {showCreateForm && (
              <View style={{ padding: 12, gap: 0 }}>
                <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Template name" placeholderTextColor={palette.muted} value={templateName} onChangeText={setTemplateName} />
                <View style={[styles.modeRow, { marginTop: 10 }]}>
                  <Pressable style={[styles.tabButton, { borderColor: palette.accent, backgroundColor: templateKind === 'email' ? palette.accent : 'transparent' }]} onPress={() => setTemplateKind('email')}>
                    <View style={styles.row}><Ionicons name="mail-outline" size={13} color={templateKind === 'email' ? palette.bg : palette.accent} /><Text style={{ color: templateKind === 'email' ? palette.bg : palette.accent, fontWeight: '700' }}>Email</Text></View>
                  </Pressable>
                  <Pressable style={[styles.tabButton, { borderColor: palette.accent, backgroundColor: templateKind === 'appointment' ? palette.accent : 'transparent' }]} onPress={() => setTemplateKind('appointment')}>
                    <View style={styles.row}><Ionicons name="calendar-outline" size={13} color={templateKind === 'appointment' ? palette.bg : palette.accent} /><Text style={{ color: templateKind === 'appointment' ? palette.bg : palette.accent, fontWeight: '700' }}>Appointment</Text></View>
                  </Pressable>
                </View>
                <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Subject" placeholderTextColor={palette.muted} value={templateSubject} onChangeText={setTemplateSubject} />
                <TextInput style={[mainAppStyles.input, styles.noteInput, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border }]} placeholder="Body  —  use {{date}}, {{time}}, {{clipboard}}" placeholderTextColor={palette.muted} multiline value={templateBody} onChangeText={setTemplateBody} />
                <View style={[styles.row, { marginTop: 10 }]}>
                  <Pressable style={[styles.saveBtn, { backgroundColor: palette.accent, flex: 1, alignItems: 'center' }]} onPress={() => handleCreateTemplate().catch(() => undefined)}>
                    <Text style={[styles.saveBtnText, { color: palette.bg }]}>Save template</Text>
                  </Pressable>
                  <Pressable style={[styles.saveBtn, { borderWidth: 1, borderColor: palette.border, alignItems: 'center' }]} onPress={() => setShowCreateForm(false)}>
                    <Text style={{ color: palette.muted, fontWeight: '700' }}>Cancel</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>

          {/* Template search + list */}
          <View style={[mainAppStyles.card, styles.quickCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <TextInput style={[mainAppStyles.input, { backgroundColor: palette.bg, color: palette.fg, borderColor: palette.border, marginTop: 0 }]} placeholder="Search templates..." placeholderTextColor={palette.muted} value={templateSearch} onChangeText={setTemplateSearch} />
            {filteredTemplates.length === 0 && (
              <Text style={{ color: palette.muted, textAlign: 'center', paddingVertical: 12 }}>No templates yet. Tap + New template to create one.</Text>
            )}
            {filteredTemplates.map((item) => (
              <View key={item.id} style={[styles.noteCard, { borderColor: palette.border, backgroundColor: palette.bg }]}>
                <View style={styles.row}>
                  <View style={[styles.kindBadge, { backgroundColor: `${palette.accent}22` }]}>
                    <Ionicons name={item.kind === 'email' ? 'mail-outline' : 'calendar-outline'} size={12} color={palette.accent} />
                    <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '700' }}>{item.kind.toUpperCase()}</Text>
                  </View>
                  <Text style={{ color: palette.fg, fontWeight: '800', flex: 1 }}>{item.name}</Text>
                </View>
                <Text style={{ color: palette.muted, marginTop: 4 }}>{item.subject || '(No subject)'}</Text>
                <View style={[styles.row, { justifyContent: 'flex-end', marginTop: 6 }]}>
                  <Pressable style={[styles.useBtn, { borderColor: palette.accent }]} onPress={() => { setMode('notes'); setInput(templateToText(item)); }}>
                    <Ionicons name="sparkles-outline" size={13} color={palette.accent} />
                    <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>Use</Text>
                  </Pressable>
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

const calStyles = StyleSheet.create({
  calWrap: { padding: 12 },
  calHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  calTitle: { fontSize: 14, fontWeight: '800' },
  navBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayNum: { fontSize: 13, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 99, marginTop: 1 },
});

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  heroCard: { borderLeftWidth: 3 },
  quickCard: {
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  kicker: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.1, fontFamily: 'monospace' },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  tabButton: { flex: 1, borderWidth: 1, borderRadius: 8, minHeight: 34, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  noteInput: { minHeight: 90 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', gap: 4 },
  saveBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  saveBtnText: { fontWeight: '800' },
  secondaryBtn: { marginTop: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  noteCard: { borderWidth: 1, borderRadius: 12, padding: 10, marginTop: 8 },
  sectionToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  activeBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 },
  kindBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  useBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
});
