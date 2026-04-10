import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, FlatList, Linking, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

import { ScanRecord } from '../../../types';
import { HistorySort } from '../../../core/smartSearch';
import { mainAppStyles } from '../styles';
import { MiniCalendar } from '../../SearchFilterBar';

type Palette = { bg: string; fg: string; accent: string; muted: string; card: string; border: string };
type DateFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';

const PRIMARY_FILTERS = ['ALL', 'INC'];
const HIDDEN_BY_DEFAULT = ['PI', 'RITM', 'REQ'];

function formatType(type: string) {
  return String(type || '').trim().toUpperCase() || 'OTHER';
}

// ─── Swipe-to-delete constants ────────────────────────────────────────────────
const SWIPE_WIDTH = 80;
const SWIPE_THRESHOLD = 40;

// ─── HistoryItemCard ──────────────────────────────────────────────────────────
// Wraps each history item with swipe-left gesture to reveal a delete button,
// mirroring the NoteCard swipe pattern.
function HistoryItemCard({
  item,
  palette,
  columns,
  showActionLabels,
  isSelected,
  isCopied,
  isExpanded,
  onPress,
  onLongPress,
  onCopy,
  onEdit,
  onToggleUsed,
  onDelete,
  onOpenBarcode,
  onToggleExpand,
  visibleScanType,
}: {
  item: ScanRecord;
  palette: Palette;
  columns: number;
  showActionLabels: boolean;
  isSelected: boolean;
  isCopied: boolean;
  isExpanded: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onToggleUsed: () => void;
  onDelete: () => void;
  onOpenBarcode: (value: string, codeType?: 'pi' | 'office' | 'other') => void;
  onToggleExpand: () => void;
  visibleScanType: (type: string) => string;
}) {
  const swipeOpenRef = useRef(false);
  const swipeOffsetRef = useRef(0);
  const translateX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    swipeOffsetRef.current = 0;
    swipeOpenRef.current = false;
    translateX.setValue(0);
  }, [item.id]);

  const closeSwipe = useCallback(() => {
    swipeOffsetRef.current = 0;
    swipeOpenRef.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true, tension: 90, friction: 13 }).start();
  }, [translateX]);

  const openSwipe = useCallback(() => {
    swipeOffsetRef.current = -SWIPE_WIDTH;
    swipeOpenRef.current = true;
    Animated.spring(translateX, { toValue: -SWIPE_WIDTH, useNativeDriver: true, tension: 90, friction: 13 }).start();
  }, [translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) => {
          const isHorizontal = Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5;
          if (!isHorizontal) return false;
          return swipeOpenRef.current ? true : gs.dx < 0;
        },
        onPanResponderGrant: () => { translateX.stopAnimation(); },
        onPanResponderMove: (_, gs) => {
          const raw = swipeOffsetRef.current + gs.dx;
          translateX.setValue(Math.max(-SWIPE_WIDTH, Math.min(0, raw)));
        },
        onPanResponderRelease: (_, gs) => {
          const raw = swipeOffsetRef.current + gs.dx;
          if (raw < -SWIPE_THRESHOLD) openSwipe();
          else closeSwipe();
        },
        onPanResponderTerminate: () => closeSwipe(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const used = Boolean(item.used);
  const typeLabel = formatType(visibleScanType(item.type));
  const isUrl = item.codeNormalized.startsWith('http://') || item.codeNormalized.startsWith('https://');
  const barcodeValue = item.codeValue || item.codeNormalized;
  const userValue = item.label || item.customLabel || '-';
  const ticketValue = item.ticketNumber || '-';
  const piValue = item.codeType === 'pi' || typeLabel === 'PI' ? barcodeValue : '';
  const officeValue = item.officeCode || (item.codeType === 'office' || typeLabel === 'OFFICE' ? barcodeValue : '');
  const notesValue = item.notes || '-';

  return (
    <View
      style={[
        mainAppStyles.card,
        mainAppStyles.cardContained,
        { backgroundColor: palette.card, borderColor: isSelected ? palette.accent : palette.border, borderWidth: isSelected ? 2 : 1, marginBottom: 0, padding: 0 },
        columns > 1 ? { flex: 1, minWidth: 0 } : null,
      ]}
    >
      {/* Delete panel — revealed by swiping left */}
      <View
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: SWIPE_WIDTH,
          zIndex: 1,
        }}
      >
        <Pressable
          onPress={() => { closeSwipe(); onDelete(); }}
          style={({ pressed }) => ({
            flex: 1,
            backgroundColor: pressed ? '#991b1b' : '#dc2626',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            borderTopRightRadius: 12,
            borderBottomRightRadius: 12,
          })}
        >
          <Ionicons name="trash-outline" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.8 }}>DELETE</Text>
        </Pressable>
      </View>

      {/* Card content — slides left to reveal delete panel */}
      <Animated.View
        pointerEvents="box-none"
        style={{ transform: [{ translateX }], zIndex: 2, backgroundColor: palette.card, borderRadius: 12, overflow: 'hidden' }}
        {...panResponder.panHandlers}
      >
        <View style={{ padding: 12 }}>
          <Pressable
            onPress={() => {
              if (swipeOpenRef.current) { closeSwipe(); return; }
              onPress();
            }}
            onLongPress={onLongPress}
            style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
          >
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

              {isExpanded ? <Text style={{ color: palette.fg, fontSize: 12, lineHeight: 17 }}>{notesValue}</Text> : null}
              <Pressable
                onPress={onToggleExpand}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}
              >
                <Ionicons name={isExpanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={12} color={palette.accent} />
                <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '700' }}>{isExpanded ? 'Less' : 'More'}</Text>
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
              {isCopied ? <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>Copied</Text> : null}
            </View>
          </Pressable>

          <View style={[mainAppStyles.itemActions, { alignItems: 'center' }]}>
            <Pressable style={({ pressed }) => [mainAppStyles.tinyBtn, { borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 }]} onPress={onCopy}>
              <Ionicons name="copy-outline" size={14} color={palette.fg} />
              {showActionLabels ? <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>Copy</Text> : null}
            </Pressable>
            <Pressable style={({ pressed }) => [mainAppStyles.tinyBtn, { borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 }]} onPress={onEdit}>
              <Ionicons name="create-outline" size={14} color={palette.fg} />
              {showActionLabels ? <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>Edit</Text> : null}
            </Pressable>
            <Pressable style={({ pressed }) => [mainAppStyles.tinyBtn, { borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 }]} onPress={onToggleUsed}>
              <Ionicons name={used ? 'checkmark-circle-outline' : 'ellipse-outline'} size={14} color={palette.fg} />
              {showActionLabels ? <Text style={{ color: palette.fg, fontSize: 11, fontWeight: '700' }}>{used ? 'Unuse' : 'Use'}</Text> : null}
            </Pressable>
            <Pressable style={({ pressed }) => [mainAppStyles.tinyBtn, { borderColor: palette.border, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.75 : 1 }]} onPress={onDelete}>
              <Ionicons name="trash-outline" size={14} color="#ef4444" />
              {showActionLabels ? <Text style={{ color: '#ef4444', fontSize: 11, fontWeight: '700' }}>Delete</Text> : null}
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
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
  onToggleSelection,
  onLongPressSelection,
  onToggleUsed,
  onEditItem,
  onDeleteItem,
  onOpenBarcode,
  onOpenScanner,
  historyCount,
  visibleScanType,
}: {
  palette: Palette;
  filteredHistory: ScanRecord[];
  historyCount: number;
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
  onToggleSelection: (id: string) => void;
  onLongPressSelection: (id: string) => void;
  onToggleUsed: (id: string) => void;
  onEditItem: (item: ScanRecord) => void;
  onDeleteItem: (item: ScanRecord) => void;
  onOpenBarcode: (value: string, codeType?: 'pi' | 'office' | 'other') => void;
  onOpenScanner: () => void;
  visibleScanType: (type: string) => string;
}) {
  const { width } = useWindowDimensions();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [moreVisible, setMoreVisible] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ScanRecord | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const editLockRef = useRef(false);

  // Palette bridge for MiniCalendar (which expects the extended Palette type)
  const calPalette = {
    bg: palette.bg, accent: palette.accent, border: palette.border,
    surface: palette.card, surfaceAlt: palette.bg,
    textBody: palette.fg, textDim: palette.muted, textMuted: palette.muted,
    chipBorder: palette.border,
  };

  // Filter history by specific calendar date (on top of parent-level filtering)
  const displayHistory = calendarDate
    ? filteredHistory.filter((item) => item.date === calendarDate)
    : filteredHistory;
  const columns = width >= 1600 ? 3 : width >= 1100 ? 2 : 1;
  const showActionLabels = width >= 1200;

  useEffect(() => {
    if (!copiedId) return;
    const timer = setTimeout(() => setCopiedId(null), 1200);
    return () => clearTimeout(timer);
  }, [copiedId]);

  const allFilterTypes = useMemo(() => {
    const discovered = Array.from(new Set(filteredHistory.map((item) => formatType(visibleScanType(item.type)))));
    return Array.from(new Set([...PRIMARY_FILTERS, ...HIDDEN_BY_DEFAULT, ...discovered]));
  }, [filteredHistory, visibleScanType]);

  const hiddenFilters = useMemo(() => allFilterTypes.filter((type) => !PRIMARY_FILTERS.includes(type) && type !== 'ALL'), [allFilterTypes]);
  const emptyStateTitle = historyCount === 0 ? 'Scan a code to get started' : 'No results';
  const emptyStateText = historyCount === 0
    ? 'Your history appears here after you scan or paste a code.'
    : 'Clear filters or adjust your search to see results.';

  async function copyValue(item: ScanRecord) {
    const value = item.codeValue || item.codeNormalized;
    await Clipboard.setStringAsync(value);
    setCopiedId(item.id);
  }

  function confirmDelete(item: ScanRecord) {
    setDeleteTarget(item);
  }

  return (
    <View style={[mainAppStyles.screen, mainAppStyles.screenLocked, { alignSelf: 'center', maxWidth: width >= 1280 ? 1280 : 1200, minWidth: 0 }]}>
      <FlatList
        data={displayHistory}
        numColumns={columns}
        key={`history-grid-${columns}`}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        style={Platform.OS === 'web' ? ({ scrollbarWidth: 'none', msOverflowStyle: 'none' } as any) : undefined}
        contentContainerStyle={[mainAppStyles.listContent, { gap: 8, paddingTop: 8, paddingBottom: 120, paddingHorizontal: 0, minWidth: 0 }]}
        columnWrapperStyle={columns > 1 ? { gap: 10, width: '100%', minWidth: 0 } : undefined}
        ListHeaderComponent={(
          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border, marginBottom: 0, gap: 10, paddingVertical: width >= 1280 ? 16 : 12, paddingHorizontal: width >= 1280 ? 16 : 12 }]}>
            <View style={[mainAppStyles.filterBar, { marginTop: 0 }]}>
              <TextInput
                value={query}
                onChangeText={onQueryChange}
                placeholder="Search code, user, ticket, notes..."
                placeholderTextColor={palette.muted}
                style={[mainAppStyles.input, { flex: 1, color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg, marginTop: 0 }]}
              />
              <View style={[mainAppStyles.filterChipCompact, { borderColor: palette.border, borderWidth: 1 }]}>
                <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '700' }}>{filteredHistory.length} results</Text>
              </View>
            </View>

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
                style={[mainAppStyles.filterChipCompact, (selectedDateLabel || calendarDate) ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 }]}
                onPress={() => setCalendarOpen(true)}
              >
                <View style={mainAppStyles.compactAction}>
                  <Ionicons name="calendar-outline" size={14} color={(selectedDateLabel || calendarDate) ? '#fff' : palette.fg} />
                  <Text style={{ color: (selectedDateLabel || calendarDate) ? '#fff' : palette.fg, fontSize: 11, fontWeight: '700' }}>
                    {calendarDate
                      ? new Date(calendarDate + 'T12:00:00').toLocaleDateString('en', { day: 'numeric', month: 'short' })
                      : selectedDateLabel || (dateFilter === 'TODAY' ? 'Today' : dateFilter === 'WEEK' ? 'Week' : 'Date')}
                  </Text>
                </View>
              </Pressable>
              {calendarDate ? (
                <Pressable
                  onPress={() => setCalendarDate(null)}
                  style={[mainAppStyles.filterChipCompact, { borderColor: palette.border, borderWidth: 1 }]}
                >
                  <Ionicons name="close" size={12} color={palette.fg} />
                </Pressable>
              ) : null}
              {calendarOpen ? (
                <MiniCalendar
                  selected={calendarDate}
                  palette={calPalette}
                  onSelect={(ymd) => { setCalendarDate(ymd); setCalendarOpen(false); }}
                  onClose={() => setCalendarOpen(false)}
                />
              ) : null}
            </View>
          </View>
        )}
        stickyHeaderIndices={[0]}
        ListEmptyComponent={(
          <View style={[mainAppStyles.card, { backgroundColor: palette.card, borderColor: palette.border, alignItems: 'center', gap: 10 }]}>
            <Ionicons name={historyCount === 0 ? 'scan-outline' : 'search-outline'} size={28} color={palette.accent} />
            <Text style={{ color: palette.fg, fontSize: 15, fontWeight: '800', textAlign: 'center' }}>{emptyStateTitle}</Text>
            <Text style={{ color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' }}>{emptyStateText}</Text>
            <Pressable
              onPress={historyCount === 0 ? onOpenScanner : () => {
                onQueryChange('');
                onFilterTypeChange('ALL');
                onDateFilterChange('ALL');
                onSortByChange('recent');
              }}
              style={({ pressed }) => [
                mainAppStyles.btn,
                { backgroundColor: palette.accent, borderColor: palette.accent, opacity: pressed ? 0.85 : 1, alignSelf: 'stretch' },
              ]}
            >
              <Text style={[mainAppStyles.btnText, { textAlign: 'center' }]}>{historyCount === 0 ? 'Open Scanner' : 'Clear filters'}</Text>
            </Pressable>
          </View>
        )}
        renderItem={({ item }) => {
          const isUrl = item.codeNormalized.startsWith('http://') || item.codeNormalized.startsWith('https://');
          return (
            <HistoryItemCard
              item={item}
              palette={palette}
              columns={columns}
              showActionLabels={showActionLabels}
              isSelected={selection.has(item.id)}
              isCopied={copiedId === item.id}
              isExpanded={expandedId === item.id}
              visibleScanType={visibleScanType}
              onPress={() => {
                if (isUrl && selection.size === 0) {
                  Alert.alert('Open Link', `Do you want to open this URL?\n\n${item.codeNormalized}`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Open', onPress: async () => { if (await Linking.canOpenURL(item.codeNormalized)) await Linking.openURL(item.codeNormalized); } },
                  ]);
                } else if (selection.size > 0) {
                  onToggleSelection(item.id);
                }
              }}
              onLongPress={() => onLongPressSelection(item.id)}
              onCopy={() => copyValue(item)}
              onEdit={() => {
                if (editLockRef.current) return;
                editLockRef.current = true;
                onEditItem(item);
                setTimeout(() => { editLockRef.current = false; }, 260);
              }}
              onToggleUsed={() => onToggleUsed(item.id)}
              onDelete={() => confirmDelete(item)}
              onOpenBarcode={onOpenBarcode}
              onToggleExpand={() => setExpandedId(expandedId === item.id ? null : item.id)}
            />
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
              {filterType === 'ALL' ? hiddenFilters.map((type) => (
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
              )) : (
                <Text style={{ color: palette.muted, fontSize: 11 }}>Open ALL to reveal PI, RITM, and REQ.</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(deleteTarget)}
        onRequestClose={() => setDeleteTarget(null)}
        statusBarTranslucent
      >
        <Pressable style={mainAppStyles.modalBackdrop} onPress={() => setDeleteTarget(null)}>
          <Pressable
            style={[mainAppStyles.modalForm, { backgroundColor: palette.card, borderColor: palette.border, maxWidth: 520 }]}
            onPress={() => null}
          >
            <View style={mainAppStyles.modalHeader}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>Delete item</Text>
              <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={() => setDeleteTarget(null)}>
                <Ionicons name="close" size={18} color={palette.fg} />
              </Pressable>
            </View>
            <Text style={{ color: palette.muted, fontSize: 13, lineHeight: 20 }}>
              This action will remove the item from history.
            </Text>
            <Text style={{ color: palette.fg, fontSize: 12, marginTop: 8 }} numberOfLines={2}>
              {deleteTarget?.codeValue || deleteTarget?.codeNormalized || '-'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable
                style={({ pressed }) => [{ flex: 1, borderWidth: 1, borderColor: palette.border, borderRadius: 10, minHeight: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 }]}
                onPress={() => setDeleteTarget(null)}
              >
                <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [{ flex: 1, borderRadius: 10, minHeight: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#b91c1c', opacity: pressed ? 0.82 : 1 }]}
                onPress={async () => {
                  if (!deleteTarget) return;
                  await onDeleteItem(deleteTarget);
                  setDeleteTarget(null);
                }}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

