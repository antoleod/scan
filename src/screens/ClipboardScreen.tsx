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
import { detectNoteEntities, buildSmartNoteModel, segmentNoteText, SmartNoteEntities, SmartNoteModel, NoteSegment } from '../core/smartNotes';
import { defaultSettings } from '../core/settings';
import type { AppSettings } from '../types';

type Palette = { bg: string; fg: string; accent: string; muted: string; card: string; border: string };

// MiniCalendar requires a Palette with these fields; build a bridge object inline
function toCal(p: Palette) {
  return { bg: p.bg, accent: p.accent, border: p.border, surface: p.card, surfaceAlt: p.bg, textBody: p.fg, textDim: p.muted, textMuted: p.muted, chipBorder: p.border };
}

type Props = {
  palette: Palette;
  settings?: AppSettings;
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

function ImageThumb({ uri }: { uri: string }) {
  const [failed, setFailed] = React.useState(false);
  if (failed) {
    return (
      <View style={[styles.clipThumb, { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a1a1a' }]}>
        <Ionicons name="image-outline" size={28} color="#555" />
        <Text style={{ color: '#555', fontSize: 10, marginTop: 4 }}>Preview unavailable</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.clipThumb}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

// ─── Entity colors (same palette as NoteCard) ────────────────────────────────

const ENTITY_COLORS: Record<string, { text: string; bg: string; label: string }> = {
  pi:       { text: '#FF9F43', bg: 'rgba(255,159,67,0.14)',  label: 'PI' },
  hostname: { text: '#A970FF', bg: 'rgba(169,112,255,0.14)', label: 'Hostname' },
  ip:       { text: '#4DA3FF', bg: 'rgba(77,163,255,0.14)',  label: 'IP' },
  office:   { text: '#4ADE80', bg: 'rgba(74,222,128,0.14)',  label: 'Office' },
};

// ─── Smart list block (checkboxes / bullets / numbered) ──────────────────────

function ClipListBlock({ model, palette, expanded }: { model: SmartNoteModel; palette: Palette; expanded: boolean }) {
  const visibleItems = expanded ? model.items : model.items.slice(0, 5);
  const hidden = model.items.length - visibleItems.length;
  return (
    <View style={{ gap: 5, marginTop: 2 }}>
      {visibleItems.map((item) => (
        <View key={item.index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          {item.kind === 'checkbox' ? (
            <View style={{
              width: 15, height: 15, borderRadius: 3, borderWidth: 1.5,
              borderColor: item.checked ? palette.accent : palette.muted,
              backgroundColor: item.checked ? palette.accent : 'transparent',
              alignItems: 'center', justifyContent: 'center', marginTop: 2, flexShrink: 0,
            }}>
              {item.checked ? <Ionicons name="checkmark" size={9} color="#000" /> : null}
            </View>
          ) : item.kind === 'numbered' ? (
            <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600', width: 18, textAlign: 'right', flexShrink: 0, marginTop: 1 }}>
              {item.index + 1}.
            </Text>
          ) : (
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: palette.accent, marginTop: 8, flexShrink: 0 }} />
          )}
          <Text style={{
            color: item.checked ? palette.muted : palette.fg,
            fontSize: 13, lineHeight: 20, flex: 1,
            textDecorationLine: item.checked ? 'line-through' : 'none',
          }}>
            {item.text}
          </Text>
        </View>
      ))}
      {hidden > 0 ? (
        <Text style={{ color: palette.muted, fontSize: 11 }}>+{hidden} more items</Text>
      ) : null}
    </View>
  );
}

// ─── Smart entity block (inline highlighted text) ────────────────────────────

function ClipEntityBlock({
  smart, model, palette, expanded, onCopy,
}: {
  smart: SmartNoteEntities;
  model: SmartNoteModel;
  palette: Palette;
  expanded: boolean;
  onCopy: (value: string) => void;
}) {
  const segments = useMemo(() => segmentNoteText(model.rawText, smart), [model.rawText, smart]);
  const legendItems = (['pi', 'hostname', 'ip', 'office'] as const).filter((k) => smart[k].length > 0);

  // Pick an accent color based on which entity type dominates
  const dominantKind = smart.ip.length ? 'ip' : smart.hostname.length ? 'hostname' : smart.pi.length ? 'pi' : 'office';
  const dominantColor = ENTITY_COLORS[dominantKind].text;

  return (
    <View style={{ gap: 6 }}>
      {/* Legend row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {legendItems.map((kind) => {
          const c = ENTITY_COLORS[kind];
          return (
            <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.text }} />
              <Text style={{ color: palette.muted, fontSize: 10, fontWeight: '700' }}>{c.label}</Text>
            </View>
          );
        })}
      </View>

      {/* Highlighted text block */}
      <View style={{
        borderRadius: 8, borderWidth: 1,
        borderColor: `${dominantColor}28`,
        backgroundColor: `${dominantColor}08`,
        padding: 9,
      }}>
        <Text style={{ fontSize: 13, lineHeight: 22 }} numberOfLines={expanded ? 0 : 5}>
          {segments.map((seg, i) => {
            if (seg.kind === 'plain') {
              return <Text key={i} style={{ color: palette.fg }}>{seg.text}</Text>;
            }
            const c = ENTITY_COLORS[seg.kind];
            const copyable = seg.kind === 'ip' || seg.kind === 'hostname' || seg.kind === 'pi';
            return (
              <Text
                key={i}
                onPress={copyable ? () => onCopy(seg.text) : undefined}
                style={{ color: c.text, backgroundColor: c.bg, fontWeight: '700', borderRadius: 3 }}
              >
                {seg.text}
              </Text>
            );
          })}
        </Text>
      </View>

      {/* If also a list, show below */}
      {model.isList && model.items.length > 0 ? (
        <ClipListBlock model={model} palette={palette} expanded={expanded} />
      ) : null}
    </View>
  );
}

// ─── Unified smart body for a single clipboard text entry ────────────────────

function ClipSmartBody({
  text, palette, expanded, settings, onCopy,
}: {
  text: string;
  palette: Palette;
  expanded: boolean;
  settings: AppSettings;
  onCopy: (value: string) => void;
}) {
  const smart = useMemo(() => detectNoteEntities(text, settings), [text, settings]);
  const model = useMemo(() => buildSmartNoteModel(text, smart), [text, smart]);
  const hasEntities = smart.pi.length + smart.hostname.length + smart.ip.length + smart.office.length > 0;

  if (hasEntities) {
    return <ClipEntityBlock smart={smart} model={model} palette={palette} expanded={expanded} onCopy={onCopy} />;
  }
  if (model.isList) {
    return <ClipListBlock model={model} palette={palette} expanded={expanded} />;
  }
  return (
    <Text style={{ color: palette.fg, fontSize: 13, lineHeight: 20 }} numberOfLines={expanded ? 0 : 3}>
      {text}
    </Text>
  );
}

export function ClipboardScreen({ palette, settings, onSendToNote, onSendToTemplate }: Props) {
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
  const [expandedClipId, setExpandedClipId] = useState<string | null>(null);
  const resolvedSettings = settings ?? defaultSettings;

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
                      {entry.kind === 'image' && entry.imageDataUri ? (
                        <ImageThumb uri={entry.imageDataUri} />
                      ) : null}
                      {entry.kind === 'text' ? (
                        <ClipSmartBody
                          text={entry.content}
                          palette={palette}
                          expanded={expandedClipId === entry.id}
                          settings={resolvedSettings}
                          onCopy={(value) => {
                            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                              void navigator.clipboard.writeText(value).catch(() => undefined);
                            }
                          }}
                        />
                      ) : (
                        <Text style={{ color: palette.fg, fontSize: 12 }} numberOfLines={2}>Screenshot capture</Text>
                      )}
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
                        <Pressable onPress={() => sendToNote(entry).catch(() => undefined)} hitSlop={8}>
                          <Ionicons name="document-text-outline" size={16} color={palette.fg} />
                        </Pressable>
                        {onSendToTemplate ? (
                          <Pressable onPress={() => onSendToTemplate(entry)} hitSlop={8}>
                            <Ionicons name="layers-outline" size={16} color={palette.fg} />
                          </Pressable>
                        ) : null}
                        <Pressable onPress={() => setPreviewEntry(entry)} hitSlop={8}>
                          <Ionicons name="eye-outline" size={16} color={palette.fg} />
                        </Pressable>
                        {entry.kind === 'text' ? (
                          <Pressable
                            onPress={() => setExpandedClipId((prev) => prev === entry.id ? null : entry.id)}
                            hitSlop={8}
                            style={{ marginLeft: 'auto' }}
                          >
                            <Ionicons
                              name={expandedClipId === entry.id ? 'chevron-up' : 'chevron-down'}
                              size={15}
                              color={palette.muted}
                            />
                          </Pressable>
                        ) : null}
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
            ) : previewEntry?.kind === 'text' && previewEntry.content ? (
              <ClipSmartBody
                text={previewEntry.content}
                palette={palette}
                expanded
                settings={resolvedSettings}
                onCopy={(value) => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                    void navigator.clipboard.writeText(value).catch(() => undefined);
                  }
                }}
              />
            ) : null}
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
  clipThumb: { width: '100%', height: 96, borderRadius: 8, backgroundColor: '#1e1e1e' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  actionsRow: { flexDirection: 'row', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  categoryChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, minHeight: 36, justifyContent: 'center' },
  previewImage: { width: '100%', height: 260, borderRadius: 10, backgroundColor: '#000' },
  previewActions: { marginTop: 14, flexDirection: 'row', gap: 10 },
  previewBtn: { flex: 1, minHeight: 44, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
