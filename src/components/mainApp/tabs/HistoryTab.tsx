import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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

function formatType(type: string) {
  return String(type || '').trim().toUpperCase() || 'OTHER';
}

function uniqueFilters(values: string[]) {
  return Array.from(new Set(values.map((value) => formatType(value)).filter(Boolean)));
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
  const editLockRef = useRef(false);

  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 1200);
    return () => clearTimeout(timer);
  }, [copiedId]);

  const allFilterTypes = useMemo(() => {
    const discovered = uniqueFilters(filteredHistory.map((item) => visibleScanType(item.type)));
    return uniqueFilters([...PRIMARY_FILTERS, ...OVERFLOW_FILTERS, ...discovered]);
  }, [filteredHistory, visibleScanType]);

  const hiddenFilters = useMemo(
    () => allFilterTypes.filter((type) => !PRIMARY_FILTERS.includes(type)),
    [allFilterTypes]
  );

  const moreActive = !PRIMARY_FILTERS.includes(formatType(filterType));

  async function copyValue(item: ScanRecord) {
    await Clipboard.setStringAsync(item.codeValue || item.codeNormalized);
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
        placeholder="Search..."
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
              dateFilter === d ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 },
              mainAppStyles.filterChipNoGrow,
            ]}
            onPress={() => onDateFilterChange(d)}
          >
            <Text style={{ color: dateFilter === d ? '#fff' : palette.fg, fontSize: 12, fontWeight: '700' }}>{d}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[
            mainAppStyles.filterChipCompact,
            selectedDateLabel ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 },
            mainAppStyles.filterChipNoGrow,
          ]}
          onPress={onOpenDatePicker}
        >
          <View style={mainAppStyles.compactAction}>
            <Ionicons name="calendar-outline" size={14} color={selectedDateLabel ? '#fff' : palette.fg} />
            <Text style={{ color: selectedDateLabel ? '#fff' : palette.fg, fontSize: 12, fontWeight: '700' }}>
              {selectedDateLabel || 'DATE'}
            </Text>
          </View>
        </Pressable>
      </View>

      <FlatList
        data={filteredHistory}
        keyExtractor={(item) => item.id}
        contentContainerStyle={mainAppStyles.listContent}
        ListEmptyComponent={
          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Text style={{ color: palette.fg }}>No scans yet.</Text>
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
                    <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Notes</Text>
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

