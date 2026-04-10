import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { mainAppStyles } from '../components/mainApp/styles';
import { ClipboardPermissionBadge } from '../clipboard/ClipboardPermissionBadge';
import { ManualCaptureBar } from '../clipboard/ManualCaptureBar';
import { useClipboard } from '../clipboard/useClipboard';
import { addRichNoteUnique } from '../core/notes';
import { ClipEntry } from '../core/clipboard.types';
import { removeClipboardEntriesByDay, removeClipboardEntriesByIds, updateClipboardEntryCategory } from '../core/clipboard';
import { MiniCalendar } from '../components/SearchFilterBar';

type Palette = { bg: string; fg: string; accent: string; muted: string; card: string; border: string };

// MiniCalendar requires a Palette with these fields; build a bridge object inline
function toCal(p: Palette) {
  return { bg: p.bg, accent: p.accent, border: p.border, surface: p.card, surfaceAlt: p.bg, textBody: p.fg, textDim: p.muted, textMuted: p.muted, chipBorder: p.border };
}

type Props = {
  palette: Palette;
  onSendToNote?: (entry: ClipEntry) => Promise<void> | void;
  onSendToTemplate?: (entry: ClipEntry) => Promise<void> | void;
};

function chunk<T>(items: T[], columns: number): T[][] {
  if (columns <= 1) return items.map((item) => [item]);
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return rows;
}

function classifyTitle(kind: ClipEntry['kind']) {
  return kind === 'image' ? 'Image' : 'Text';
}

export function ClipboardScreen({ palette, onSendToNote, onSendToTemplate }: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const desktopColumns = width >= 1600 ? 3 : width >= 1200 ? 2 : 1;
  const { entries, permState, captureNow, capturePastedText, importScreenshot } = useClipboard();
  const [searchText, setSearchText] = useState('');
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedClipboardIds, setSelectedClipboardIds] = useState<Set<string>>(new Set());
  const [previewEntry, setPreviewEntry] = useState<ClipEntry | null>(null);
  const [lastTap, setLastTap] = useState<{ id: string; ts: number } | null>(null);

  const filteredClipboard = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    let list = q ? entries.filter((entry) => `${entry.content} ${entry.category}`.toLowerCase().includes(q)) : entries;
    if (dateFilter) {
      list = list.filter((entry) => new Date(entry.capturedAt).toISOString().slice(0, 10) === dateFilter);
    }
    return list;
  }, [entries, searchText, dateFilter]);

  const groupedClipboard = useMemo(() => {
    const map = new Map<string, ClipEntry[]>();
    for (const entry of filteredClipboard) {
      const key = new Date(entry.capturedAt).toISOString().slice(0, 10);
      const list = map.get(key) || [];
      list.push(entry);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredClipboard]);

  async function sendToNote(entry: ClipEntry) {
    if (onSendToNote) {
      await onSendToNote(entry);
      return;
    }

    const text = entry.kind === 'image' ? entry.content : entry.content;
    const attachments = entry.kind === 'image' && entry.imageDataUri ? [entry.imageDataUri] : [];
    await addRichNoteUnique(text || 'Clipboard capture', 'general', attachments);
  }

  async function createNoteFromPreview() {
    if (!previewEntry) return;
    await sendToNote(previewEntry);
    setPreviewEntry(null);
  }

  async function deleteSelectedClipboard() {
    if (!selectedClipboardIds.size) return;
    const next = await removeClipboardEntriesByIds(Array.from(selectedClipboardIds));
    void next;
    setSelectedClipboardIds(new Set());
  }

  async function deleteClipboardDay(day: string) {
    await removeClipboardEntriesByDay(day);
    setSelectedClipboardIds(new Set());
  }

  function toggleClipboardSelection(id: string) {
    setSelectedClipboardIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleClipboardCardPress(entry: ClipEntry) {
    const now = Date.now();
    if (lastTap && lastTap.id === entry.id && now - lastTap.ts < 320) {
      setPreviewEntry(entry);
      setLastTap(null);
      return;
    }
    setLastTap({ id: entry.id, ts: now });
  }

  const clipboardEmptyTitle = entries.length === 0 ? 'Capture your clipboard' : 'No results';
  const clipboardEmptyText = entries.length === 0
    ? 'Use the capture button or paste text from any app.'
    : 'Clear the search to see the full history again.';

  return (
    <ScrollView
      style={mainAppStyles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border, gap: 10, width: '100%', alignSelf: 'stretch' }]}>
        <View style={styles.headerRow}>
          <Text style={{ color: palette.fg, fontWeight: '800' }}>Clipboard history</Text>
          <ClipboardPermissionBadge permState={permState} />
        </View>
        {permState !== 'granted' ? (
          <ManualCaptureBar
            permState={permState}
            onCaptureNow={async () => { await captureNow(); }}
            onPasteText={async (text) => { await capturePastedText(text); }}
            onImportScreenshot={async (dataUrl) => { await importScreenshot(dataUrl); }}
          />
        ) : null}
        <View style={[styles.searchRow, { borderColor: palette.border, backgroundColor: palette.bg }]}>
          <Ionicons name="search" size={15} color={searchText ? palette.accent : palette.muted} />
          <TextInput
            style={[styles.searchInput, { color: palette.fg }]}
            placeholder="Search clipboard..."
            placeholderTextColor={palette.muted}
            value={searchText}
            onChangeText={setSearchText}
          />
          <View style={[mainAppStyles.filterChipCompact, { borderColor: palette.border, borderWidth: 1 }]}>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700' }}>{filteredClipboard.length} items</Text>
          </View>
          {/* Calendar filter button */}
          <Pressable
            onPress={() => setCalendarOpen(true)}
            hitSlop={8}
            style={{
              width: 32, height: 32, borderRadius: 8, borderWidth: 1,
              borderColor: dateFilter ? palette.accent : palette.border,
              backgroundColor: dateFilter ? `${palette.accent}22` : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="calendar-outline" size={15} color={dateFilter ? palette.accent : palette.muted} />
          </Pressable>
          {(searchText || dateFilter) ? (
            <Pressable onPress={() => { setSearchText(''); setDateFilter(null); }} hitSlop={8}>
              <Ionicons name="close-circle" size={15} color={palette.muted} />
            </Pressable>
          ) : null}
        </View>
        {/* Active date chip */}
        {dateFilter ? (
          <Pressable
            onPress={() => setDateFilter(null)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, borderColor: palette.accent, backgroundColor: `${palette.accent}18` }}
          >
            <Ionicons name="calendar" size={11} color={palette.accent} />
            <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '700' }}>
              {new Date(dateFilter + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
            <Ionicons name="close" size={11} color={palette.accent} />
          </Pressable>
        ) : null}
        {calendarOpen ? (
          <MiniCalendar
            selected={dateFilter}
            palette={toCal(palette)}
            onSelect={(ymd) => { setDateFilter(ymd); }}
            onClose={() => setCalendarOpen(false)}
          />
        ) : null}
        {selectedClipboardIds.size ? (
          <View style={styles.selectionRow}>
            <Text style={{ color: palette.muted, fontSize: 11 }}>{selectedClipboardIds.size} selected</Text>
            <Pressable onPress={() => deleteSelectedClipboard().catch(() => undefined)} style={[styles.selectionBtn, { borderColor: palette.border }]}>
              <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: '800' }}>Delete selected</Text>
            </Pressable>
          </View>
        ) : null}
        {permState !== 'granted' ? (
          <Text style={{ color: palette.muted, fontSize: 11 }}>
            Firefox and Safari require a manual action to read the clipboard.
          </Text>
        ) : (
          <Text style={{ color: palette.muted, fontSize: 11 }}>
            Live capture is enabled. Long-press entries to select them for bulk delete.
          </Text>
        )}
      </View>

      {filteredClipboard.length === 0 ? (
        <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border, alignItems: 'center', gap: 10, width: '100%', alignSelf: 'stretch' }]}>
          <Ionicons name={entries.length === 0 ? 'clipboard-outline' : 'search-outline'} size={28} color={palette.accent} />
          <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{clipboardEmptyTitle}</Text>
          <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{clipboardEmptyText}</Text>
          <Pressable
            style={({ pressed }) => [
              mainAppStyles.btn,
              { backgroundColor: palette.accent, borderColor: palette.accent, opacity: pressed ? 0.85 : 1, alignSelf: 'stretch' },
            ]}
            onPress={() => {
              if (entries.length === 0) {
                captureNow().catch(() => undefined);
                return;
              }
              setSearchText('');
            }}
          >
            <Text style={[mainAppStyles.btnText, { textAlign: 'center' }]}>{entries.length === 0 ? 'Capture now' : 'Clear search'}</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.gridWrap}>
        {groupedClipboard.map(([day, dayEntries]) => (
          <View key={day} style={{ gap: 8, width: '100%', minWidth: 0 }}>
            <View style={styles.dayRow}>
              <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '800' }}>{day} ({dayEntries.length})</Text>
              <Pressable onPress={() => deleteClipboardDay(day).catch(() => undefined)} style={[styles.selectionBtn, { borderColor: palette.border }]}>
                <Text style={{ color: '#ef4444', fontSize: 10, fontWeight: '800' }}>Delete day</Text>
              </Pressable>
            </View>
            {chunk(dayEntries, isDesktop ? desktopColumns : 1).map((row, rowIndex) => (
              <View key={`clip-row-${day}-${rowIndex}`} style={styles.gridRow}>
                {row.map((entry) => {
                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => handleClipboardCardPress(entry)}
                      onLongPress={() => toggleClipboardSelection(entry.id)}
                      style={({ pressed }) => [
                        styles.card,
                        {
                          flex: 1,
                          minWidth: 0,
                          borderColor: selectedClipboardIds.has(entry.id) ? palette.accent : palette.border,
                          backgroundColor: palette.card,
                          opacity: pressed ? 0.92 : 1,
                        },
                      ]}
                    >
                      <View style={styles.cardHead}>
                        <Text style={{ color: palette.muted, fontSize: 10 }}>{new Date(entry.capturedAt).toLocaleDateString()} {new Date(entry.capturedAt).toLocaleTimeString()}</Text>
                        <Text style={{ color: palette.accent, fontSize: 10, fontWeight: '800' }}>{entry.category.toUpperCase()}</Text>
                      </View>
                      {entry.kind === 'image' && entry.imageDataUri ? <Image source={{ uri: entry.imageDataUri }} style={styles.clipThumb} resizeMode="cover" /> : null}
                      <Text style={{ color: palette.fg, fontSize: 12 }} numberOfLines={2}>{entry.kind === 'image' ? 'Screenshot capture' : entry.content}</Text>
                      <Text style={{ color: palette.muted, fontSize: 10 }}>{classifyTitle(entry.kind)}</Text>
                      <View style={styles.actionsRow}>
                        <Pressable
                          onPress={() => {
                            const order: Array<'general' | 'code' | 'servicenow' | 'url' | 'email'> = ['general', 'code', 'servicenow', 'url', 'email'];
                            const idx = order.indexOf(entry.category as typeof order[number]);
                            const nextCategory = order[(idx + 1) % order.length];
                            void updateClipboardEntryCategory(entry.id, nextCategory).catch(() => undefined);
                          }}
                          style={[styles.categoryChip, { borderColor: palette.border, paddingVertical: 4, paddingHorizontal: 8 }]}
                        >
                          <Text style={{ color: palette.fg, fontSize: 10, fontWeight: '700' }}>{entry.category}</Text>
                        </Pressable>
                        <Pressable onPress={() => sendToNote(entry).catch(() => undefined)}>
                          <Ionicons name="document-text-outline" size={16} color={palette.fg} />
                        </Pressable>
                        {onSendToTemplate ? (
                          <Pressable onPress={() => onSendToTemplate(entry)}>
                            <Ionicons name="layers-outline" size={16} color={palette.fg} />
                          </Pressable>
                        ) : null}
                        <Pressable onPress={() => setPreviewEntry(entry)}>
                          <Ionicons name="eye-outline" size={16} color={palette.fg} />
                        </Pressable>
                      </View>
                    </Pressable>
                  );
                })}
                {row.length < (isDesktop ? desktopColumns : 1) ? Array.from({ length: (isDesktop ? desktopColumns : 1) - row.length }).map((_, i) => <View key={`clip-fill-${day}-${i}`} style={{ flex: 1 }} />) : null}
              </View>
            ))}
          </View>
        ))}
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

export default ClipboardScreen;

const styles = StyleSheet.create({
  content: { paddingBottom: 128, gap: 24, width: '100%', minWidth: 0, alignItems: 'stretch' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 0 },
  selectionRow: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  selectionBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, minHeight: 34, justifyContent: 'center' },
  gridWrap: { gap: 10, width: '100%', minWidth: 0 },
  gridRow: { flexDirection: 'row', gap: 10, width: '100%', minWidth: 0 },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minWidth: 0 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, minWidth: 0 },
  clipThumb: { width: '100%', height: 96, borderRadius: 8, backgroundColor: '#111' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actionsRow: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  categoryChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  previewImage: { width: '100%', height: 260, borderRadius: 10, backgroundColor: '#000' },
  previewActions: { marginTop: 14, flexDirection: 'row', gap: 10 },
  previewBtn: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
