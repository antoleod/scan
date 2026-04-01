import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { ScanRecord } from '../../../types';
import { mainAppStyles } from '../styles';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

type DateFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';

const PRIMARY_FILTERS = ['ALL', 'PI', 'RITM', 'REQ', 'INC'];
const OVERFLOW_FILTERS = ['SCTASK', 'OFFICE', 'QR', 'OTHER'];

const WEEK_DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function toDateKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function recordToDateKey(ts: number | string) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function formatType(type: string) {
  return String(type || '').trim().toUpperCase() || 'OTHER';
}

function uniqueFilters(values: string[]) {
  return Array.from(new Set(values.map((value) => formatType(value)).filter(Boolean)));
}

function HistoryCalendar({
  palette,
  items,
  selectedDay,
  onSelectDay,
}: {
  palette: Palette;
  items: ScanRecord[];
  selectedDay: string | null;
  onSelectDay: (key: string | null) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const countByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      const key = recordToDateKey(item.date);
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

  const monthTotal = useMemo(() => {
    let total = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${year}-${month}-${d}`;
      total += countByDay[key] || 0;
    }
    return total;
  }, [countByDay, year, month, daysInMonth]);

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
          <Text style={{ color: palette.muted, fontSize: 11 }}>{monthTotal} captures</Text>
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
                count > 0 && !isSelected && { fontWeight: '700' },
              ]}>
                {day}
              </Text>
              {count > 0 ? (
                <View style={[calStyles.dot, { backgroundColor: isSelected ? palette.bg : palette.accent }]} />
              ) : (
                <View style={calStyles.dotEmpty} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function HistoryTab({
  palette,
  filteredHistory,
  query,
  filterType,
  dateFilter,
  selection,
  selectedDateLabel,
  onQueryChange,
  onFilterTypeChange,
  onDateFilterChange,
  onOpenDatePicker,
  onToggleSelection,
  onLongPressSelection,
  onToggleUsed,
  onEditItem,
  onDeleteItem,
  onOpenBarcode,
  visibleScanType,
}: {
  palette: Palette;
  filteredHistory: ScanRecord[];
  query: string;
  filterType: string;
  dateFilter: DateFilter;
  selection: Set<string>;
  selectedDateLabel: string | null;
  onQueryChange: (value: string) => void;
  onFilterTypeChange: (value: string) => void;
  onDateFilterChange: (value: DateFilter) => void;
  onOpenDatePicker: () => void;
  onToggleSelection: (id: string) => void;
  onLongPressSelection: (id: string) => void;
  onToggleUsed: (id: string) => void;
  onEditItem: (item: ScanRecord) => void;
  onDeleteItem: (item: ScanRecord) => void;
  onOpenBarcode: (value: string, codeType?: 'pi' | 'office' | 'other') => void;
  visibleScanType: (type: string) => string;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDay, setCalendarDay] = useState<string | null>(null);
  const editLockRef = useRef(false);

  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 1200);
    return () => clearTimeout(timer);
  }, [copiedId]);

  // Clear calendar day selection when date filter changes externally
  useEffect(() => {
    setCalendarDay(null);
  }, [dateFilter, selectedDateLabel]);

  const allFilterTypes = useMemo(() => {
    const discovered = uniqueFilters(filteredHistory.map((item) => visibleScanType(item.type)));
    return uniqueFilters([...PRIMARY_FILTERS, ...OVERFLOW_FILTERS, ...discovered]);
  }, [filteredHistory, visibleScanType]);

  const hiddenFilters = useMemo(
    () => allFilterTypes.filter((type) => !PRIMARY_FILTERS.includes(type)),
    [allFilterTypes]
  );

  const moreActive = !PRIMARY_FILTERS.includes(formatType(filterType));

  // Apply local calendar day filter on top of filteredHistory
  const displayHistory = useMemo(() => {
    if (!calendarDay) return filteredHistory;
    return filteredHistory.filter((item) => recordToDateKey(item.date) === calendarDay);
  }, [filteredHistory, calendarDay]);

  async function copyValue(item: ScanRecord) {
    const value = item.codeValue || item.codeNormalized;
    await Clipboard.setStringAsync(value);
    const readBack = await Clipboard.getStringAsync();
    if ((readBack || '').trim() !== (value || '').trim() && Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([value], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `history-hardcopy-${item.id}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    }
    setCopiedId(item.id);
  }

  function confirmDelete(item: ScanRecord) {
    const message = 'Are you sure you want to delete this item from history?';

    if (Platform.OS === 'web') {
      const ok = typeof window === 'undefined' ? true : window.confirm(message);
      if (ok) {
        void onDeleteItem(item);
      }
      return;
    }

    Alert.alert('Delete item?', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeleteItem(item) },
    ]);
  }

  function renderFilterChip(label: string, active: boolean, onPress: () => void, compact = false) {
    return (
      <Pressable
        key={label}
        onPress={onPress}
        style={[
          compact ? mainAppStyles.filterChipCompact : mainAppStyles.filterChip,
          active ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 },
          mainAppStyles.filterChipNoGrow,
        ]}
      >
        <Text style={{ color: active ? '#fff' : palette.fg, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={[mainAppStyles.screen, mainAppStyles.screenLocked]}>
      <TextInput
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search code, type or notes..."
        placeholderTextColor={palette.muted}
        style={[mainAppStyles.input, { color: palette.fg, borderColor: palette.border, backgroundColor: palette.card }]}
      />

      <View style={mainAppStyles.filterBar}>
        <View style={mainAppStyles.filterPrimaryRow}>
          {PRIMARY_FILTERS.map((type) => renderFilterChip(type, filterType === type, () => onFilterTypeChange(type), true))}
        </View>
        {renderFilterChip('...', moreActive, () => setMoreVisible(true), true)}
      </View>

      <View style={[mainAppStyles.filterRow, { alignItems: 'center' }]}>
        {(['ALL', 'TODAY', 'WEEK', 'MONTH'] as DateFilter[]).map((d) => (
          <Pressable
            key={d}
            style={[
              mainAppStyles.filterChipCompact,
              dateFilter === d && !calendarOpen ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 },
              mainAppStyles.filterChipNoGrow,
            ]}
            onPress={() => { onDateFilterChange(d); setCalendarOpen(false); setCalendarDay(null); }}
          >
            <Text style={{ color: dateFilter === d && !calendarOpen ? '#fff' : palette.fg, fontSize: 12, fontWeight: '700' }}>{d}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[
            mainAppStyles.filterChipCompact,
            selectedDateLabel && !calendarOpen ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 },
            mainAppStyles.filterChipNoGrow,
          ]}
          onPress={onOpenDatePicker}
        >
          <View style={mainAppStyles.compactAction}>
            <Ionicons name="calendar-outline" size={14} color={selectedDateLabel && !calendarOpen ? '#fff' : palette.fg} />
            <Text style={{ color: selectedDateLabel && !calendarOpen ? '#fff' : palette.fg, fontSize: 12, fontWeight: '700' }}>
              {selectedDateLabel || 'DATE'}
            </Text>
          </View>
        </Pressable>
        {/* Calendar toggle */}
        <Pressable
          style={[
            mainAppStyles.filterChipCompact,
            calendarOpen ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 },
            mainAppStyles.filterChipNoGrow,
          ]}
          onPress={() => { setCalendarOpen(v => !v); if (calendarOpen) setCalendarDay(null); }}
        >
          <View style={mainAppStyles.compactAction}>
            <Ionicons name="grid-outline" size={14} color={calendarOpen ? '#fff' : palette.fg} />
            <Text style={{ color: calendarOpen ? '#fff' : palette.fg, fontSize: 12, fontWeight: '700' }}>CAL</Text>
          </View>
        </Pressable>
      </View>

      {/* Inline calendar panel */}
      {calendarOpen && (
        <View style={[histStyles.calCard, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <HistoryCalendar
            palette={palette}
            items={filteredHistory}
            selectedDay={calendarDay}
            onSelectDay={setCalendarDay}
          />
          {calendarDay && (
            <Pressable
              style={[histStyles.clearDayBtn, { borderColor: palette.border }]}
              onPress={() => setCalendarDay(null)}
            >
              <Ionicons name="close-circle-outline" size={14} color={palette.muted} />
              <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700' }}>Clear day filter</Text>
            </Pressable>
          )}
        </View>
      )}

      <FlatList
        data={displayHistory}
        keyExtractor={(item) => item.id}
        contentContainerStyle={mainAppStyles.listContent}
        ListEmptyComponent={
          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={{ color: palette.fg }}>
              {calendarDay ? 'No scans on this day.' : 'No scans yet.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isSelected = selection.has(item.id);
          const isUrl = item.codeNormalized.startsWith('http://') || item.codeNormalized.startsWith('https://');
          const typeLabel = formatType(visibleScanType(item.type));
          const used = Boolean(item.used);
          const barcodeValue = item.codeValue || item.codeNormalized;
          const userValue = item.label || item.customLabel || '—';
          const ticketValue = item.ticketNumber || '—';
          const piValue = item.codeType === 'pi' || typeLabel === 'PI' ? barcodeValue : '';
          const officeValue = item.officeCode || (item.codeType === 'office' || typeLabel === 'OFFICE' ? barcodeValue : '');
          const notesValue = item.notes || '—';

          const handlePress = () => {
            if (isUrl && selection.size === 0) {
              Alert.alert('Open Link', `Do you want to open this URL?\n\n${item.codeNormalized}`, [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Open',
                  onPress: async () => {
                    try {
                      const supported = await Linking.canOpenURL(item.codeNormalized);
                      if (supported) {
                        await Linking.openURL(item.codeNormalized);
                      } else {
                        Alert.alert('Error', 'Cannot open this URL.');
                      }
                    } catch (e) {
                      Alert.alert('Error', `Failed to open link: ${String(e)}`);
                    }
                  },
                },
              ]);
            } else if (selection.size > 0) {
              onToggleSelection(item.id);
            }
          };

          return (
            <View
              style={[
                mainAppStyles.card,
                mainAppStyles.cardContained,
                { backgroundColor: palette.card, borderColor: palette.border },
                isSelected && { borderColor: palette.accent, borderWidth: 2 },
              ]}
            >
              <Pressable
                onPress={handlePress}
                onLongPress={() => onLongPressSelection(item.id)}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              >
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>User</Text>
                    <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' }} numberOfLines={1}>{userValue}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Ticket number</Text>
                    <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '700', flex: 1, textAlign: 'right' }} numberOfLines={1}>{ticketValue}</Text>
                  </View>

                  <View style={{ borderWidth: 1, borderColor: `${palette.accent}55`, borderRadius: 12, padding: 10, backgroundColor: `${palette.accent}12`, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>PI</Text>
                      <Pressable
                        disabled={!piValue}
                        onPress={() => onOpenBarcode(piValue, 'pi')}
                        style={[mainAppStyles.tinyBtn, { borderColor: palette.border, opacity: piValue ? 1 : 0.35, paddingVertical: 6 }]}
                      >
                        <Ionicons name="barcode-outline" size={14} color={palette.fg} />
                      </Pressable>
                    </View>
                    <Text style={[mainAppStyles.code, { color: piValue ? palette.fg : palette.muted, fontSize: 15 }]} numberOfLines={2}>{piValue || '—'}</Text>
                  </View>

                  <View style={{ borderWidth: 1, borderColor: `${palette.accent}40`, borderRadius: 12, padding: 10, backgroundColor: `${palette.accent}0D`, gap: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>Office</Text>
                      <Pressable
                        disabled={!officeValue}
                        onPress={() => onOpenBarcode(officeValue, 'office')}
                        style={[mainAppStyles.tinyBtn, { borderColor: palette.border, opacity: officeValue ? 1 : 0.35, paddingVertical: 6 }]}
                      >
                        <Ionicons name="barcode-outline" size={14} color={palette.fg} />
                      </Pressable>
                    </View>
                    <Text style={[mainAppStyles.code, { color: officeValue ? palette.fg : palette.muted, fontSize: 15 }]} numberOfLines={2}>{officeValue || '—'}</Text>
                  </View>

                  <View style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 12, padding: 10, gap: 6 }}>
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Date / Cal / Notes</Text>
                    <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>
                      {new Date(item.date).toLocaleDateString()} - {new Date(item.date).toLocaleTimeString()}
                    </Text>
                    <Text style={{ color: palette.fg, fontSize: 13, lineHeight: 18 }} numberOfLines={3}>{notesValue}</Text>
                  </View>
                </View>

                <View style={mainAppStyles.itemMetaRow}>
                  <View style={[mainAppStyles.typeBadge, { backgroundColor: palette.accent + '22' }]}>
                    <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '800' }}>{typeLabel}</Text>
                  </View>
                  <View
                    style={[
                      mainAppStyles.statusChip,
                      { backgroundColor: used ? 'rgba(120, 130, 145, 0.18)' : 'rgba(34, 197, 94, 0.18)' },
                    ]}
                  >
                    <View style={[mainAppStyles.statusDot, { backgroundColor: used ? '#93a1b5' : '#22c55e' }]} />
                    <Text style={{ color: used ? palette.muted : '#22c55e', fontSize: 12, fontWeight: '700' }}>
                      {used ? 'Used' : 'Ready to use'}
                    </Text>
                  </View>
                  <Text style={{ color: palette.muted, fontSize: 12 }}>{new Date(item.date).toLocaleString()}</Text>
                  {copiedId === item.id ? <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>Copied</Text> : null}
                </View>
              </Pressable>

              <View style={mainAppStyles.itemActions}>
                <Pressable style={[mainAppStyles.tinyBtn, { borderColor: palette.border }]} onPress={() => copyValue(item)}>
                  <View style={mainAppStyles.compactAction}>
                    <Ionicons name="copy-outline" size={14} color={palette.fg} />
                    <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Copy</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[mainAppStyles.tinyBtn, { borderColor: palette.border }]}
                  onPress={() => {
                    if (editLockRef.current) return;
                    editLockRef.current = true;
                    onEditItem(item);
                    setTimeout(() => {
                      editLockRef.current = false;
                    }, 260);
                  }}
                >
                  <View style={mainAppStyles.compactAction}>
                    <Ionicons name="create-outline" size={14} color={palette.fg} />
                    <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Edit</Text>
                  </View>
                </Pressable>
                <Pressable style={[mainAppStyles.tinyBtn, { borderColor: palette.border }]} onPress={() => onToggleUsed(item.id)}>
                  <View style={mainAppStyles.compactAction}>
                    <Ionicons name={used ? 'checkmark-circle-outline' : 'ellipse-outline'} size={14} color={palette.fg} />
                    <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>{used ? 'Available' : 'Used'}</Text>
                  </View>
                </Pressable>
                <Pressable style={[mainAppStyles.tinyBtn, { borderColor: palette.border }]} onPress={() => confirmDelete(item)}>
                  <View style={mainAppStyles.compactAction}>
                    <Ionicons name="trash-outline" size={14} color={palette.fg} />
                    <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Delete</Text>
                  </View>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <Modal animationType="fade" transparent visible={moreVisible} onRequestClose={() => setMoreVisible(false)} statusBarTranslucent>
        <Pressable style={mainAppStyles.moreSheetBackdrop} onPress={() => setMoreVisible(false)}>
          <Pressable
            style={[mainAppStyles.moreSheet, { backgroundColor: palette.card, borderColor: palette.border }]}
            onPress={() => null}
          >
            <View style={mainAppStyles.moreSheetHeader}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>More filters</Text>
              <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={() => setMoreVisible(false)}>
                <Ionicons name="close" size={18} color={palette.fg} />
              </Pressable>
            </View>
            <ScrollView horizontal={false} contentContainerStyle={mainAppStyles.moreSheetGrid}>
              {hiddenFilters.map((type) =>
                renderFilterChip(type, filterType === type, () => {
                  onFilterTypeChange(type);
                  setMoreVisible(false);
                })
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
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
  dotEmpty: { width: 4, height: 4, marginTop: 1 },
});

const histStyles = StyleSheet.create({
  calCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 4,
    overflow: 'hidden',
  },
  clearDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: 1,
    paddingVertical: 10,
  },
});
