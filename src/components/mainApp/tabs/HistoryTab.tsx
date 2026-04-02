import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { ScanRecord } from '../../../types';
import { HistorySort } from '../../../core/smartSearch';
import { mainAppStyles } from '../styles';

type Palette = { bg: string; fg: string; accent: string; muted: string; card: string; border: string };
type DateFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';

const PRIMARY_FILTERS = ['ALL', 'PI', 'RITM', 'REQ', 'INC'];

function formatType(type: string) {
  return String(type || '').trim().toUpperCase() || 'OTHER';
}

export function HistoryTab({
  palette,
  filteredHistory,
  query,
  filterType,
  dateFilter,
  sortBy,
  selection,
  selectedDateLabel,
  onQueryChange,
  onFilterTypeChange,
  onDateFilterChange,
  onSortByChange,
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
  sortBy: HistorySort;
  selection: Set<string>;
  selectedDateLabel: string | null;
  onQueryChange: (value: string) => void;
  onFilterTypeChange: (value: string) => void;
  onDateFilterChange: (value: DateFilter) => void;
  onSortByChange: (value: HistorySort) => void;
  onOpenDatePicker: () => void;
  onToggleSelection: (id: string) => void;
  onLongPressSelection: (id: string) => void;
  onToggleUsed: (id: string) => void;
  onEditItem: (item: ScanRecord) => void;
  onDeleteItem: (item: ScanRecord) => void;
  onOpenBarcode: (value: string, codeType?: 'pi' | 'office' | 'other') => void;
  visibleScanType: (type: string) => string;
}) {
  const { width } = useWindowDimensions();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const editLockRef = useRef(false);
  const columns = width >= 1500 ? 3 : width >= 980 ? 2 : 1;
  const showActionLabels = width >= 1200;

  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 1200);
    return () => clearTimeout(timer);
  }, [copiedId]);

  const allFilterTypes = useMemo(() => {
    const discovered = Array.from(new Set(filteredHistory.map((item) => formatType(visibleScanType(item.type)))));
    return Array.from(new Set([...PRIMARY_FILTERS, ...discovered]));
  }, [filteredHistory, visibleScanType]);

  const hiddenFilters = useMemo(() => allFilterTypes.filter((type) => !PRIMARY_FILTERS.includes(type)), [allFilterTypes]);

  async function copyValue(item: ScanRecord) {
    const value = item.codeValue || item.codeNormalized;
    await Clipboard.setStringAsync(value);
    setCopiedId(item.id);
  }

  function confirmDelete(item: ScanRecord) {
    const message = 'Are you sure you want to delete this item from history?';
    if (Platform.OS === 'web') {
      const ok = typeof window === 'undefined' ? true : window.confirm(message);
      if (ok) void onDeleteItem(item);
      return;
    }
    Alert.alert('Delete item?', message, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDeleteItem(item) }]);
  }

  return (
    <View style={[mainAppStyles.screen, mainAppStyles.screenLocked, { alignSelf: 'center', maxWidth: 1200 }]}>
      <TextInput
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search code, user, ticket, notes..."
        placeholderTextColor={palette.muted}
        style={[mainAppStyles.input, { color: palette.fg, borderColor: palette.border, backgroundColor: palette.card, marginTop: 0 }]}
      />

      <View style={[mainAppStyles.filterRow, { marginTop: 0, flexWrap: 'nowrap', alignItems: 'center' }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 8 }}>
          {PRIMARY_FILTERS.map((type) => (
            <Pressable
              key={type}
              onPress={() => onFilterTypeChange(type)}
              style={[mainAppStyles.filterChipCompact, filterType === type ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 }]}
            >
              <Text style={{ color: filterType === type ? '#fff' : palette.fg, fontSize: 12, fontWeight: '700' }}>{type}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setMoreVisible(true)} style={[mainAppStyles.filterChipCompact, { borderColor: palette.border, borderWidth: 1 }]}>
            <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>...</Text>
          </Pressable>
        </ScrollView>

        <Pressable
          style={[mainAppStyles.filterChipCompact, { borderColor: palette.border, borderWidth: 1 }]}
          onPress={() => onSortByChange(sortBy === 'recent' ? 'most_used' : sortBy === 'most_used' ? 'not_used' : 'recent')}
        >
          <View style={mainAppStyles.compactAction}>
            <Ionicons name="swap-vertical-outline" size={14} color={palette.fg} />
            <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>{sortBy === 'recent' ? 'Recent' : sortBy === 'most_used' ? 'Used' : 'Unused'}</Text>
          </View>
        </Pressable>

        <Pressable
          style={[mainAppStyles.filterChipCompact, selectedDateLabel ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 }]}
          onPress={onOpenDatePicker}
        >
          <View style={mainAppStyles.compactAction}>
            <Ionicons name="calendar-outline" size={14} color={selectedDateLabel ? '#fff' : palette.fg} />
            <Text style={{ color: selectedDateLabel ? '#fff' : palette.fg, fontSize: 11, fontWeight: '700' }}>
              {selectedDateLabel || (dateFilter === 'TODAY' ? 'Today' : dateFilter === 'WEEK' ? 'Week' : 'Date')}
            </Text>
          </View>
        </Pressable>
      </View>

      <FlatList
        data={filteredHistory}
        numColumns={columns}
        key={`history-grid-${columns}`}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[mainAppStyles.listContent, { gap: 8 }]}
        columnWrapperStyle={columns > 1 ? { gap: 10 } : undefined}
        ListEmptyComponent={<View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border }]}><Text style={{ color: palette.fg }}>No scans yet.</Text></View>}
        renderItem={({ item }) => {
          const isSelected = selection.has(item.id);
          const isUrl = item.codeNormalized.startsWith('http://') || item.codeNormalized.startsWith('https://');
          const typeLabel = formatType(visibleScanType(item.type));
          const used = Boolean(item.used);
          const barcodeValue = item.codeValue || item.codeNormalized;
          const userValue = item.label || item.customLabel || '-';
          const ticketValue = item.ticketNumber || '-';
          const piValue = item.codeType === 'pi' || typeLabel === 'PI' ? barcodeValue : '';
          const officeValue = item.officeCode || (item.codeType === 'office' || typeLabel === 'OFFICE' ? barcodeValue : '');
          const notesValue = item.notes || '-';
          const expanded = expandedId === item.id;

          const handlePress = () => {
            if (isUrl && selection.size === 0) {
              Alert.alert('Open Link', `Do you want to open this URL?\n\n${item.codeNormalized}`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open', onPress: async () => { if (await Linking.canOpenURL(item.codeNormalized)) await Linking.openURL(item.codeNormalized); } },
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
                { backgroundColor: palette.card, borderColor: palette.border, marginBottom: 0 },
                columns > 1 ? { flex: 1, minWidth: 0 } : null,
                isSelected && { borderColor: palette.accent, borderWidth: 2 },
              ]}
            >
              <Pressable onPress={handlePress} onLongPress={() => onLongPressSelection(item.id)} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
                <View style={{ gap: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '700', flex: 1 }} numberOfLines={1}>{userValue}</Text>
                    <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{ticketValue}</Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable disabled={!piValue} onPress={() => piValue ? Clipboard.setStringAsync(piValue) : undefined}>
                      <Text style={{ color: piValue ? palette.accent : palette.muted, fontSize: 12, fontWeight: '800' }} numberOfLines={1}>{piValue || '-'}</Text>
                    </Pressable>
                    <Pressable disabled={!piValue} onPress={() => onOpenBarcode(piValue, 'pi')}>
                      <Ionicons name="barcode-outline" size={14} color={piValue ? palette.fg : palette.muted} />
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ color: officeValue ? palette.fg : palette.muted, fontSize: 12, fontWeight: '700', flex: 1 }} numberOfLines={1}>{officeValue || '-'}</Text>
                    <Pressable disabled={!officeValue} onPress={() => onOpenBarcode(officeValue, 'office')}>
                      <Ionicons name="barcode-outline" size={14} color={officeValue ? palette.fg : palette.muted} />
                    </Pressable>
                  </View>

                  {expanded ? <Text style={{ color: palette.fg, fontSize: 12, lineHeight: 17 }}>{notesValue}</Text> : null}
                  <Pressable onPress={() => setExpandedId(expanded ? null : item.id)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}>
                    <Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={12} color={palette.accent} />
                    <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '700' }}>{expanded ? 'Less' : 'More'}</Text>
                  </Pressable>
                </View>

                <View style={mainAppStyles.itemMetaRow}>
                  <View style={[mainAppStyles.typeBadge, { backgroundColor: `${palette.accent}22` }]}>
                    <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '800' }}>{typeLabel}</Text>
                  </View>
                  <View style={[mainAppStyles.statusChip, { backgroundColor: used ? 'rgba(120, 130, 145, 0.18)' : 'rgba(34, 197, 94, 0.18)' }]}>
                    <View style={[mainAppStyles.statusDot, { backgroundColor: used ? '#93a1b5' : '#22c55e' }]} />
                    <Text style={{ color: used ? palette.muted : '#22c55e', fontSize: 12, fontWeight: '700' }}>{used ? 'Used' : 'Ready'}</Text>
                  </View>
                  {copiedId === item.id ? <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>Copied</Text> : null}
                </View>
              </Pressable>

              <View style={[mainAppStyles.itemActions, { alignItems: 'center' }]}>
                <Pressable style={({ pressed }) => [mainAppStyles.tinyBtn, { borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 }]} onPress={() => copyValue(item)}>
                  <Ionicons name="copy-outline" size={14} color={palette.fg} />
                  {showActionLabels ? <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>Copy</Text> : null}
                </Pressable>
                <Pressable
                  style={({ pressed }) => [mainAppStyles.tinyBtn, { borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 }]}
                  onPress={() => {
                    if (editLockRef.current) return;
                    editLockRef.current = true;
                    onEditItem(item);
                    setTimeout(() => {
                      editLockRef.current = false;
                    }, 260);
                  }}
                >
                  <Ionicons name="create-outline" size={14} color={palette.fg} />
                  {showActionLabels ? <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>Edit</Text> : null}
                </Pressable>
                <Pressable style={({ pressed }) => [mainAppStyles.tinyBtn, { borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 }]} onPress={() => onToggleUsed(item.id)}>
                  <Ionicons name={used ? 'checkmark-circle-outline' : 'ellipse-outline'} size={14} color={palette.fg} />
                  {showActionLabels ? <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>{used ? 'Unuse' : 'Use'}</Text> : null}
                </Pressable>
                <Pressable style={({ pressed }) => [mainAppStyles.tinyBtn, { borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 }]} onPress={() => confirmDelete(item)}>
                  <Ionicons name="trash-outline" size={14} color={palette.fg} />
                  {showActionLabels ? <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>Delete</Text> : null}
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      <Modal animationType="fade" transparent visible={moreVisible} onRequestClose={() => setMoreVisible(false)} statusBarTranslucent>
        <Pressable style={mainAppStyles.moreSheetBackdrop} onPress={() => setMoreVisible(false)}>
          <Pressable style={[mainAppStyles.moreSheet, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={() => null}>
            <View style={mainAppStyles.moreSheetHeader}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>More filters</Text>
              <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={() => setMoreVisible(false)}>
                <Ionicons name="close" size={18} color={palette.fg} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={mainAppStyles.moreSheetGrid}>
              {hiddenFilters.map((type) => (
                <Pressable
                  key={type}
                  onPress={() => {
                    onFilterTypeChange(type);
                    setMoreVisible(false);
                  }}
                  style={[mainAppStyles.filterChipCompact, filterType === type ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 }]}
                >
                  <Text style={{ color: filterType === type ? '#fff' : palette.fg, fontSize: 12, fontWeight: '700' }}>{type}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
