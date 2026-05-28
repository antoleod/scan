import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { detectNoteEntities, buildSmartNoteModel, segmentNoteText, parseServiceNowFields, buildRedactedText, SmartNoteEntities, SmartNoteModel, ServiceNowField, ServiceNowModel, NoteSegment, SENSITIVE_FIELD_KEYS } from '../core/smartNotes';
import { isShoppingList, parseShoppingList } from '../core/shoppingList';
import { detectSmartNoteLabel, getSmartNoteLabelMeta } from '../core/noteIntelligence';
import { ShoppingListBlock } from './ShoppingListBlock';
import { MedicationCard } from './MedicationCard';
import { NoteListBlock } from './NoteListBlock';
import { NoteContentRenderer } from './NoteContentRenderer';
import { AppSettings } from '../types';
import type { WorkflowStatus, NoteItem, NoteColor } from '../core/notes';
import { useFieldVisibility } from '../hooks/useFieldVisibility';
import type { NotePalette as Palette } from '../theme/theme';

const colorSwatches: { key: NoteColor; hex: string; label: string }[] = [
  { key: 'default', hex: 'transparent', label: 'None' },
  { key: 'amber',   hex: '#F5C518',     label: 'Yellow' },
  { key: 'mint',    hex: '#27AE60',     label: 'Green' },
  { key: 'sky',     hex: '#2980B9',     label: 'Blue' },
  { key: 'rose',    hex: '#E91E8C',     label: 'Pink' },
];

function noteColorHex(color?: NoteColor, fallback = 'transparent'): string {
  switch (color) {
    case 'amber': return '#F5C518';
    case 'mint':  return '#27AE60';
    case 'sky':   return '#2980B9';
    case 'rose':  return '#E91E8C';
    default:      return fallback;
  }
}

const SWIPE_WIDTH = 180;
const SWIPE_THRESHOLD = 60;

// ─── Footer action pill ──────────────────────────────────────────────────────

function ActionPill({
  icon,
  label,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        minHeight: 44,
        borderRadius: 999,
        backgroundColor: pressed ? `${color}30` : `${color}18`,
      })}
    >
      <Ionicons name={icon} size={13} color={color} />
      <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

// ─── Swipe action button ─────────────────────────────────────────────────────

function SwipeAction({
  bg,
  icon,
  label,
  onPress,
  roundRight,
}: {
  bg: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  roundRight?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: 60,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        backgroundColor: pressed ? `${bg}bb` : bg,
        borderTopRightRadius: roundRight ? 14 : 0,
        borderBottomRightRadius: roundRight ? 14 : 0,
      })}
    >
      <Ionicons name={icon} size={19} color="#fff" />
      <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.2 }}>{label}</Text>
    </Pressable>
  );
}

// ─── NoteCard ────────────────────────────────────────────────────────────────

function NoteCardBase({
  note,
  palette,
  expanded,
  editing,
  editingText,
  selected,
  onToggleExpand,
  onStartEdit,
  onChangeEditingText,
  onSaveEdit,
  onCancelEdit,
  onTogglePinned,
  onOpenImage,
  onCopy,
  onCopyValue,
  onPressOffice,
  onSaveToDevice: _onSaveToDevice,
  onShare,
  onOpenVersions,
  onSetReminder,
  onArchive,
  onDelete,
  onSetColor,
  onLongPress,
  onDoubleTap,
  onDuplicate,
  onUpdateWorkflowStatus,
  onMedicationTaken,
  onMedicationSnooze,
  onMedicationDismissCycle,
  onMedicationReactivate,
  settings,
}: {
  note: NoteItem;
  palette: Palette;
  expanded: boolean;
  editing: boolean;
  editingText: string;
  selected?: boolean;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onChangeEditingText: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onTogglePinned: () => void;
  onOpenImage: (uri: string) => void;
  onCopy: (text: string) => void;
  onCopyValue: (value: string, label: 'IP' | 'Hostname') => void;
  onPressOffice: (office: string) => void;
  onSaveToDevice: () => void;
  onShare: () => void;
  onOpenVersions?: () => void;
  onSetReminder: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSetColor: (color: NoteColor) => void;
  onLongPress?: () => void;
  onDoubleTap?: () => void;
  onDuplicate?: () => void;
  onUpdateWorkflowStatus?: (id: string, status: WorkflowStatus) => void;
  onMedicationTaken?: (id: string, medIndex: number) => void;
  onMedicationSnooze?: (id: string, medIndex: number, snoozeMs: number) => void;
  onMedicationDismissCycle?: (id: string, medIndex: number) => void;
  onMedicationReactivate?: (id: string, medIndex: number) => void;
  settings: AppSettings;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const heartPulse = useRef(new Animated.Value(1)).current;

  // Double-tap detection
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    if (!note.attachments?.length) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heartPulse, { toValue: 1.12, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(heartPulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [heartPulse, note.attachments?.length]);

  // Auto-download images uploaded to RTDB by another device
  const [rtdbImages, setRtdbImages] = useState<string[]>([]);
  useEffect(() => {
    const paths = note.imageRtdbPaths;
    if (!paths?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const { resolveRtdbImage } = await import('../core/imageSync');
        const resolved: string[] = [];
        for (const p of paths) {
          // Do NOT delete after download: the RTDB relay is shared across all of
          // the user's devices. Deleting on first read loses the image for every
          // other device. The 30-day `expiresAt` TTL handles cleanup instead.
          const img = await resolveRtdbImage(p, false);
          if (img) resolved.push(img);
        }
        if (!cancelled && resolved.length) setRtdbImages(resolved);
      } catch { /* non-critical */ }
    })();
    return () => { cancelled = true; };
  }, [note.imageRtdbPaths?.join(',')]);

  // Merge local attachments with freshly-downloaded RTDB images
  const mergedAttachments = useMemo(() => {
    const local = (note.attachments || []).filter((a) => !a.startsWith('data:') || a.length > 0);
    const all = [...local, ...rtdbImages.filter((img) => !local.includes(img))];
    return all.length ? all : undefined;
  }, [note.attachments, rtdbImages]);

  // swipeOpen as both ref (for PanResponder closures) and state (to re-render chevron)
  const [swipeOpen, setSwipeOpen] = useState(false);
  const swipeOpenRef   = useRef(false);
  const swipeOffsetRef = useRef(0);   // last snapped position: 0 or -SWIPE_WIDTH
  const translateX     = useRef(new Animated.Value(0)).current;

  // Reset swipe panel whenever the note identity changes (e.g. list re-order after pin)
  useEffect(() => {
    swipeOffsetRef.current = 0;
    swipeOpenRef.current   = false;
    setSwipeOpen(false);
    translateX.setValue(0);
  }, [note.id]);

  const closeSwipe = useCallback(() => {
    swipeOffsetRef.current = 0;
    swipeOpenRef.current   = false;
    setSwipeOpen(false);
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: Platform.OS !== 'web',
      tension: 90,
      friction: 13,
    }).start();
  }, [translateX]);

  const openSwipe = useCallback(() => {
    swipeOffsetRef.current = -SWIPE_WIDTH;
    swipeOpenRef.current   = true;
    setSwipeOpen(true);
    Animated.spring(translateX, {
      toValue: -SWIPE_WIDTH,
      useNativeDriver: Platform.OS !== 'web',
      tension: 90,
      friction: 13,
    }).start();
  }, [translateX]);

  const toggleSwipe = useCallback(() => {
    if (swipeOpenRef.current) closeSwipe();
    else openSwipe();
  }, [closeSwipe, openSwipe]);

  // PanResponder — works for touch on mobile; on PC use the chevron toggle instead
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gs) => {
          const isHorizontal =
            Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5;
          if (!isHorizontal) return false;
          return swipeOpenRef.current ? true : gs.dx < 0;
        },
        onPanResponderGrant: () => {
          translateX.stopAnimation();
        },
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

  // ── Derived display values ───────────────────────────────────────────────
  const noteText = String(note.text || '');
  const preview = useMemo(
    () => noteText.trim() || `Image attachment (${note.attachments?.length ?? 0})`,
    [note.attachments?.length, noteText],
  );
  // Image notes (kind='image') store the image in imageBase64, not attachments —
  // fall back to a reconstructed data: URI so the thumbnail actually shows.
  const firstAttachment =
    mergedAttachments?.[0] ??
    note.attachments?.[0] ??
    (note.imageBase64
      ? `data:${note.imageMimeType || 'image/png'};base64,${note.imageBase64}`
      : undefined);
  const updatedAt = useMemo(() => {
    const d = new Date(note.updatedAt);
    return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [note.updatedAt]);

  const smartTypeColor = note.smartType === 'medication' ? '#4DA3FF'
    : note.smartType === 'shopping' ? '#22c55e'
    : note.smartType === 'reminder' ? '#F59E0B'
    : note.category === 'work' ? '#A855F7'
    : undefined;
  const borderLeftColor = smartTypeColor || noteColorHex(note.color, palette.border);
  const smart = useMemo(() => detectNoteEntities(noteText, settings), [noteText, settings]);
  const isSmart = smart.type !== 'general';
  const model = useMemo(() => buildSmartNoteModel(noteText, smart), [noteText, smart]);
  const sfModel = useMemo(() => parseServiceNowFields(noteText), [noteText]);
  const isShopping = useMemo(() => note.smartType === 'shopping' || note.category === 'shopping' || isShoppingList(noteText), [note.category, note.smartType, noteText]);
  // L-4: memoize — detectSmartNoteLabel scans the full note text; only recompute
  // when the stored label or the text actually changes.
  const smartLabel = useMemo(
    () => note.smartLabel || detectSmartNoteLabel(noteText).label,
    [note.smartLabel, noteText],
  );
  const smartLabelMeta = getSmartNoteLabelMeta(smartLabel);
  const previousShoppingItems = useMemo(() => (
    note.workflowMetadata?.checklistItems?.map((item) => ({
      id: item.id,
      label: item.text,
      quantity: item.quantity || '',
      unit: item.unit || '',
      checked: item.completed,
      rawLine: item.rawText || item.text,
    })) || []
  ), [note.workflowMetadata?.checklistItems]);
  const shoppingModel = useMemo(() => isShopping ? parseShoppingList(noteText, previousShoppingItems) : null, [isShopping, noteText, previousShoppingItems]);
  const { hiddenKeys, toggleField } = useFieldVisibility();
  // Word / char count for the footer stat chip
  const wordCount = useMemo(() => {
    const t = noteText.trim();
    if (!t) return { words: 0, chars: 0 };
    return { words: t.split(/\s+/).length, chars: t.length };
  }, [noteText]);
  const typeMeta = useMemo(() => {
    switch (smart.type) {
      case 'network':
        return { title: 'Network Note', color: '#4DA3FF' };
      case 'device':
        return { title: 'Device Note', color: '#A970FF' };
      case 'office':
        return { title: 'Office Note', color: '#4ADE80' };
      case 'asset':
        return { title: 'Asset Note', color: '#FF9F43' };
      default:
        return { title: 'General Note', color: palette.accent };
    }
  }, [palette.accent, smart.type]);

  // ── Swipe action handlers ────────────────────────────────────────────────
  const handleReminder  = () => { closeSwipe(); onSetReminder(); };
  const handleArchive   = () => { closeSwipe(); onArchive(); };
  const handleDeleteTap = () => { closeSwipe(); setConfirmDelete(true); };

  return (
    <>
      {/* Outer container — clips card so the slide-left reveals the action panel */}
      <View style={{ borderRadius: 14, overflow: 'hidden', position: 'relative' }}>

        {/* ── Swipe actions (positioned behind the card on the right) ── */}
        <View
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: SWIPE_WIDTH,
            flexDirection: 'row',
            zIndex: 1,
          }}
        >
          <SwipeAction bg="#2563eb" icon="alarm-outline"   label="Remind"  onPress={handleReminder} />
          <SwipeAction bg="#7c3aed" icon="archive-outline" label="Archive" onPress={handleArchive} />
          <SwipeAction bg="#dc2626" icon="trash-outline"   label="Delete"  onPress={handleDeleteTap} roundRight />
        </View>

        {/* ── Animated card — slides left to reveal actions ── */}
        <Animated.View
          pointerEvents="box-none"
          style={{ transform: [{ translateX }], zIndex: 2 }}
          {...panResponder.panHandlers}
        >
          <Pressable
            onPress={() => {
              if (swipeOpenRef.current) { closeSwipe(); return; }
              const now = Date.now();
              if (onDoubleTap && now - lastTapRef.current < 300) {
                lastTapRef.current = 0;
                onDoubleTap();
                return;
              }
              lastTapRef.current = now;
              onToggleExpand();
            }}
            onLongPress={onLongPress}
            delayLongPress={350}
            style={({ pressed }) => ({
              width: '100%',
              minWidth: 0,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? palette.accent : palette.border,
              borderLeftWidth: selected ? 2 : smartTypeColor ? 4 : 1,
              borderLeftColor: selected ? palette.accent : borderLeftColor,
              borderRadius: 14,
              backgroundColor: selected ? `${palette.accent}12` : palette.surface,
              padding: isShopping ? 10 : 12,
              gap: isShopping ? 6 : 8,
              opacity: pressed ? 0.92 : 1,
            })}
          >
            {/* ── Header: date + bookmark / selection circle ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                {onOpenVersions ? (
                  <Pressable onPress={onOpenVersions} hitSlop={8} style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="git-branch-outline" size={14} color={palette.textDim} />
                  </Pressable>
                ) : null}
                <Text style={{ color: palette.textDim, fontSize: 11, flex: 1 }} numberOfLines={1}>
                  {updatedAt}
                </Text>
              </View>

              {/* Category and status badges (subtle) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                {note.category === 'work' && (
                  <View style={{ borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: 'transparent' }}>
                    <Text style={{ color: palette.textMuted, fontSize: 8, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' }}>
                      {note.category}
                    </Text>
                  </View>
                )}
                {smartLabel && smartLabel !== 'general' ? (
                  <View style={{ borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: `${smartLabelMeta.color}18` }}>
                    <Text style={{ color: smartLabelMeta.color, fontSize: 8, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' }}>
                      {smartLabelMeta.title}
                    </Text>
                  </View>
                ) : null}
                {note.archived ? (
                  <View style={{ borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: 'transparent' }}>
                    <Text style={{ color: palette.textMuted, fontSize: 8, fontWeight: '700', letterSpacing: 0.3, textTransform: 'uppercase' }}>
                      archived
                    </Text>
                  </View>
                ) : null}
                {note.syncStatus && note.syncStatus !== 'synced' ? (
                  <View style={{
                    borderRadius: 3,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    backgroundColor:
                      note.syncStatus === 'failed' ? '#ef444418'
                      : note.syncStatus === 'offline' ? '#94a3b818'
                      : '#f59e0b18',
                  }}>
                    <Text style={{
                      color:
                        note.syncStatus === 'failed' ? '#ef4444'
                        : note.syncStatus === 'offline' ? '#94a3b8'
                        : '#f59e0b',
                      fontSize: 8,
                      fontWeight: '700',
                      letterSpacing: 0.3,
                      textTransform: 'uppercase',
                    }}>
                      {note.syncStatus === 'failed'
                        ? 'Sync failed'
                        : note.syncStatus === 'offline'
                        ? 'Saved offline'
                        : note.syncStatus === 'retrying'
                        ? 'Retrying'
                        : 'Pending sync'}
                    </Text>
                  </View>
                ) : null}
              </View>

              {selected !== undefined ? (
                <View style={{
                  width: 24, height: 24, borderRadius: 12,
                  borderWidth: 2,
                  borderColor: selected ? palette.accent : palette.textDim,
                  backgroundColor: selected ? palette.accent : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  {selected ? <Ionicons name="checkmark" size={14} color="#000" /> : null}
                </View>
              ) : (
                <Pressable
                  onPress={onTogglePinned}
                  hitSlop={10}
                  style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons
                    name={note.pinned ? 'bookmark' : 'bookmark-outline'}
                    size={17}
                    color={note.pinned ? '#2563eb' : palette.textDim}
                  />
                </Pressable>
              )}
            </View>

            {/* ── Optional title ── */}
            {note.title ? (
              <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '700', lineHeight: 20 }} numberOfLines={1}>
                {note.title}
              </Text>
            ) : null}

            {/* ── Image attachment thumbnail ── */}
            {firstAttachment ? (
              <Pressable onPress={() => onOpenImage(firstAttachment)} style={{ position: 'relative' }}>
                <Image
                  source={{ uri: firstAttachment }}
                  style={{ width: '100%', height: 120, borderRadius: 10, backgroundColor: palette.surfaceAlt }}
                  resizeMode="cover"
                />
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: 'rgba(255,122,89,0.52)',
                    backgroundColor: 'rgba(255,122,89,0.10)',
                    opacity: heartPulse.interpolate({
                      inputRange: [1, 1.12],
                      outputRange: [0.18, 0.38],
                    }),
                  }}
                />
              </Pressable>
            ) : null}

            {/* ── Text / edit area ── */}
            {editing ? (
              <TextInput
                value={editingText}
                onChangeText={onChangeEditingText}
                multiline
                autoFocus
                style={{
                  minHeight: 70,
                  borderWidth: 1,
                  borderColor: palette.accent,
                  borderRadius: 10,
                  backgroundColor: palette.bg,
                  color: palette.textBody,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  lineHeight: 21,
                  textAlignVertical: 'top',
                }}
              />
            ) : note.smartType === 'medication' || note.smartType === 'shopping' ? (
              // A persisted smartType (set at creation by the classifier) takes
              // priority over re-detected entities/ServiceNow. Otherwise a med or
              // shopping note that merely MENTIONS an IP/office/ticket would lose
              // its MedicationCard/ShoppingList to the generic entity block.
              <NoteContentRenderer
                note={note}
                expanded={expanded}
                smartNoteModel={model}
                shoppingModel={shoppingModel}
                preview={preview}
                palette={palette}
                shoppingLanguage={settings.shoppingListLanguage}
                onRawTextChange={onChangeEditingText}
                onPressOffice={onPressOffice}
                onCopyValue={onCopyValue}
                onMedicationComplete={() => onUpdateWorkflowStatus?.(note.id, 'completed')}
                onMedicationDismiss={() => onUpdateWorkflowStatus?.(note.id, 'dismissed')}
                onMedicationTaken={onMedicationTaken ? (idx) => onMedicationTaken(note.id, idx) : undefined}
                onMedicationSnooze={onMedicationSnooze ? (idx, ms) => onMedicationSnooze(note.id, idx, ms) : undefined}
                onMedicationDismissCycle={onMedicationDismissCycle ? (idx) => onMedicationDismissCycle(note.id, idx) : undefined}
                onMedicationReactivate={onMedicationReactivate ? (idx) => onMedicationReactivate(note.id, idx) : undefined}
              />
            ) : sfModel.isStructured ? (
              <ServiceNowBlock
                sfModel={sfModel}
                smart={smart}
                typeMeta={typeMeta}
                palette={palette}
                expanded={expanded}
                hiddenKeys={hiddenKeys}
                onToggleField={toggleField}
                onPressOffice={onPressOffice}
                onCopyValue={onCopyValue}
                serviceNowBaseUrl={settings.serviceNowBaseUrl}
              />
            ) : isSmart ? (
              <SmartEntityBlock
                smart={smart}
                model={model}
                typeMeta={typeMeta}
                palette={palette}
                expanded={expanded}
                onPressOffice={onPressOffice}
                onCopyValue={onCopyValue}
              />
            ) : (
              <NoteContentRenderer
                note={note}
                expanded={expanded}
                smartNoteModel={model}
                shoppingModel={shoppingModel}
                preview={preview}
                palette={palette}
                shoppingLanguage={settings.shoppingListLanguage}
                onRawTextChange={onChangeEditingText}
                onPressOffice={onPressOffice}
                onCopyValue={onCopyValue}
                onMedicationComplete={() => onUpdateWorkflowStatus?.(note.id, 'completed')}
                onMedicationDismiss={() => onUpdateWorkflowStatus?.(note.id, 'dismissed')}
                onMedicationTaken={onMedicationTaken ? (idx) => onMedicationTaken(note.id, idx) : undefined}
                onMedicationSnooze={onMedicationSnooze ? (idx, ms) => onMedicationSnooze(note.id, idx, ms) : undefined}
                onMedicationDismissCycle={onMedicationDismissCycle ? (idx) => onMedicationDismissCycle(note.id, idx) : undefined}
                onMedicationReactivate={onMedicationReactivate ? (idx) => onMedicationReactivate(note.id, idx) : undefined}
              />
            )}

            {/* ── Color picker (editing mode only) ── */}
            {editing ? (
              <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.border, gap: 8 }}>
                <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '600' }}>Note color</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {colorSwatches.map((swatch) => {
                    const active = (note.color ?? 'default') === swatch.key;
                    return (
                      <Pressable
                        key={swatch.key}
                        onPress={() => onSetColor(swatch.key)}
                        hitSlop={8}
                        style={{
                          minWidth: 64,
                          height: 36,
                          borderRadius: 999,
                          borderWidth: active ? 2 : 1,
                          borderColor: active ? palette.accent : palette.border,
                          backgroundColor: palette.bg,
                          paddingHorizontal: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <View
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 99,
                            backgroundColor: swatch.hex === 'transparent' ? 'transparent' : swatch.hex,
                            borderWidth: swatch.hex === 'transparent' ? 1 : 0,
                            borderColor: palette.border,
                          }}
                        />
                        <Text style={{ color: active ? palette.accent : palette.textMuted, fontSize: 11, fontWeight: '500' }}>
                          {swatch.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* ── Footer ── */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              {/* Word count */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                {expanded && wordCount.words > 0 ? (
                  <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: `${palette.accent}12`, borderWidth: 1, borderColor: `${palette.accent}28` }}>
                    <Text style={{ color: palette.accent, fontSize: 9, fontWeight: '700', letterSpacing: 0.4 }}>
                      {wordCount.words}w · {wordCount.chars}c
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Right side: edit save/cancel OR action pills + chevron toggle */}
              {editing ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Pressable
                    onPress={onCancelEdit}
                    hitSlop={10}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="close-outline" size={18} color={palette.textDim} />
                  </Pressable>
                  <Pressable
                    onPress={onSaveEdit}
                    hitSlop={10}
                    style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="checkmark" size={18} color={palette.accent} />
                  </Pressable>
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', rowGap: 5 }}>
                    <ActionPill icon="copy-outline"         label="Copy"  color="#0891b2" onPress={() => {
                      const text = sfModel.isStructured
                        ? buildRedactedText(sfModel, note.text, hiddenKeys)
                        : note.text;
                      onCopy(text);
                    }} />
                    <ActionPill icon="create-outline"       label="Edit"  color="#059669" onPress={onStartEdit} />

                    {/* More menu button */}
                    <Pressable
                      onPress={() => setMoreMenuOpen(!moreMenuOpen)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="More options"
                      accessibilityState={{ expanded: moreMenuOpen }}
                      style={({ pressed }) => ({
                        height: 28,
                        paddingHorizontal: 10,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: moreMenuOpen ? palette.accent : palette.chipBorder,
                        backgroundColor: moreMenuOpen ? palette.accent : 'transparent',
                        justifyContent: 'center',
                        alignItems: 'center',
                        opacity: pressed ? 0.82 : 1,
                      })}
                    >
                      <Ionicons name="ellipsis-horizontal" size={13} color={moreMenuOpen ? '#000' : palette.textDim} />
                    </Pressable>

                    {/* Chevron toggle — reliable on PC; also works on mobile alongside swipe */}
                    <Pressable
                      onPress={toggleSwipe}
                      hitSlop={6}
                      style={({ pressed }) => ({
                        minHeight: 44,
                        minWidth: 44,
                        borderRadius: 999,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: pressed
                          ? `${palette.textDim}22`
                          : swipeOpen
                            ? `${palette.textDim}14`
                            : 'transparent',
                      })}
                    >
                      <Ionicons
                        name={swipeOpen ? 'chevron-forward-outline' : 'chevron-back-outline'}
                        size={14}
                        color={palette.textDim}
                      />
                    </Pressable>
                  </View>

                  {/* More menu dropdown */}
                  {moreMenuOpen && (
                    <View style={{ flexDirection: 'row', gap: 5, paddingTop: 2, borderTopWidth: 1, borderTopColor: palette.chipBorder }}>
                      <ActionPill icon="share-social-outline" label="Share" color="#7c3aed" onPress={() => { onShare(); setMoreMenuOpen(false); }} />
                      {onDuplicate ? (
                        <ActionPill icon="copy-outline" label="Dupe" color="#F59E0B" onPress={() => { onDuplicate(); setMoreMenuOpen(false); }} />
                      ) : null}
                    </View>
                  )}
                </>
              )}
            </View>
          </Pressable>
        </Animated.View>
      </View>

      {/* ── Delete confirmation modal ── */}
      <Modal
        animationType="fade"
        transparent
        visible={confirmDelete}
        onRequestClose={() => setConfirmDelete(false)}
        statusBarTranslucent
      >
        <Pressable
          onPress={() => setConfirmDelete(false)}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingBottom: 18 }}
        >
          <Pressable
            onPress={() => undefined}
            style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 20, padding: 20, gap: 16 }}
          >
            <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 99, backgroundColor: palette.chipBorder }} />
            <Text style={{ color: palette.textBody, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>
              Delete this note?
            </Text>
            <Text style={{ color: palette.textMuted, fontSize: 13, textAlign: 'center' }}>
              This action cannot be undone.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                onPress={() => setConfirmDelete(false)}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: palette.textBody, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete note"
                onPress={() => { setConfirmDelete(false); onDelete(); }}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Delete</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// H-2: memoize the card. Without this, every change to the parent `notes` array
// (a sync tick, any single-note mutation, a server snapshot) re-rendered ALL
// visible cards and re-ran their entity/shopping/ServiceNow detection. The
// comparator below skips re-render when nothing this card displays has changed.
//
// Key insight: every note mutation in core/notes.ts bumps `updatedAt = Date.now()`,
// so comparing id + updatedAt covers all content changes. `syncStatus` can change
// WITHOUT bumping updatedAt (markNotesSynced), so it is compared explicitly.
// Function props are intentionally ignored: the parent recreates them every render,
// but when the data props above are unchanged the closures are behaviourally
// equivalent (they capture the same note + the same primitive UI state).
function noteCardPropsEqual(
  prev: React.ComponentProps<typeof NoteCardBase>,
  next: React.ComponentProps<typeof NoteCardBase>,
): boolean {
  const a = prev.note;
  const b = next.note;
  if (a !== b) {
    if (a.id !== b.id) return false;
    if (a.updatedAt !== b.updatedAt) return false;
    if (a.syncStatus !== b.syncStatus) return false;
    if (a.pinned !== b.pinned) return false;
    if (a.isSecret !== b.isSecret) return false;
    if (a.imageRtdbPaths !== b.imageRtdbPaths) return false;
  }
  if (prev.expanded !== next.expanded) return false;
  if (prev.editing !== next.editing) return false;
  // editingText only affects THIS card while it is the one being edited; ignoring it
  // otherwise prevents every keystroke in one card from re-rendering all the others
  // (editingText is shared parent state).
  if (next.editing && prev.editingText !== next.editingText) return false;
  if (prev.selected !== next.selected) return false;
  if (prev.settings !== next.settings) return false;
  if (prev.palette !== next.palette) return false;
  return true;
}

export const NoteCard = React.memo(NoteCardBase, noteCardPropsEqual);

// ─── Entity token colors ──────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, { text: string; bg: string; label: string }> = {
  pi:       { text: '#FF9F43', bg: 'rgba(255,159,67,0.14)',  label: 'PI' },
  hostname: { text: '#A970FF', bg: 'rgba(169,112,255,0.14)', label: 'Hostname' },
  ip:       { text: '#4DA3FF', bg: 'rgba(77,163,255,0.14)',  label: 'IP' },
  office:   { text: '#4ADE80', bg: 'rgba(74,222,128,0.14)',  label: 'Office' },
};

// ─── ServiceNow: single field row ─────────────────────────────────────────────

function SnFieldRow({
  field,
  smart,
  palette,
  isLast,
  isNumber,
  serviceNowBaseUrl,
  onCopyValue,
  onPressOffice,
}: {
  field: ServiceNowField;
  smart: SmartNoteEntities;
  palette: Palette;
  isLast: boolean;
  isNumber: boolean;
  serviceNowBaseUrl: string;
  onCopyValue: (value: string, label: 'IP' | 'Hostname') => void;
  onPressOffice: (office: string) => void;
}) {
  const fieldValue = String(field.value || '');
  const segments = useMemo(() => segmentNoteText(fieldValue, smart), [fieldValue, smart]);
  const isTicket = isNumber && /^(INC|RITM|SCTASK|REQ|CHG)\d+$/i.test(fieldValue.trim());

  function ticketTable(number: string): string {
    const prefix = number.replace(/\d+$/, '').toUpperCase();
    switch (prefix) {
      case 'RITM': return 'sc_req_item';
      case 'SCTASK': return 'sc_task';
      case 'REQ':  return 'sc_request';
      case 'CHG':  return 'change_request';
      default:     return 'incident'; // INC
    }
  }

  const ticketUrl = isTicket && serviceNowBaseUrl
    ? `${serviceNowBaseUrl.replace(/\/$/, '')}/nav_to.do?uri=${ticketTable(fieldValue.trim())}.do?number=${fieldValue.trim()}`
    : null;

  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: 7,
      borderBottomWidth: isLast ? 0 : 0.5,
      borderBottomColor: palette.border,
      gap: 10,
      minHeight: 34,
    }}>
      {/* Label */}
      <Text
        style={{
          width: 128,
          flexShrink: 0,
          color: palette.textMuted,
          fontSize: 11,
          fontWeight: '700',
          letterSpacing: 0.3,
          textTransform: 'uppercase',
          paddingTop: 2,
        }}
        numberOfLines={2}
      >
        {field.rawLabel}
      </Text>

      {/* Value with entity highlights */}
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        {isTicket && ticketUrl ? (
          // Ticket number — styled as a clickable chip
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            borderRadius: 6, borderWidth: 1,
            borderColor: `${palette.accent}55`,
            backgroundColor: `${palette.accent}12`,
            paddingHorizontal: 8, paddingVertical: 3,
          }}>
            <Ionicons name="ticket-outline" size={12} color={palette.accent} />
            <Text
              style={{ color: palette.accent, fontSize: 13, fontWeight: '800', letterSpacing: 0.2 }}
              onPress={ticketUrl ? () => {
                import('react-native').then(({ Linking }) => Linking.openURL(ticketUrl).catch(() => undefined));
              } : undefined}
            >
              {fieldValue.trim()}
            </Text>
          </View>
        ) : (
          <Text style={{ fontSize: 13, lineHeight: 20, flex: 1 }}>
            {segments.map((seg, i) => {
              if (seg.kind === 'plain') {
                return <Text key={i} style={{ color: palette.textBody, fontWeight: '500' }}>{seg.text}</Text>;
              }
              const c = ENTITY_COLORS[seg.kind];
              const interactive = seg.kind !== 'pi';
              return (
                <Text
                  key={i}
                  onPress={interactive ? () => {
                    if (seg.kind === 'ip') onCopyValue(seg.text, 'IP');
                    else if (seg.kind === 'hostname') onCopyValue(seg.text, 'Hostname');
                    else if (seg.kind === 'office') onPressOffice(seg.text);
                  } : undefined}
                  style={{
                    color: c.text,
                    backgroundColor: c.bg,
                    fontWeight: '700',
                    borderRadius: 3,
                    overflow: 'hidden',
                  }}
                >
                  {seg.text}
                </Text>
              );
            })}
          </Text>
        )}
      </View>
    </View>
  );
}

// ─── ServiceNow: field visibility toggles panel ────────────────────────────────

function FieldVisibilityPanel({
  fields,
  hiddenKeys,
  onToggle,
  palette,
}: {
  fields: ServiceNowField[];
  hiddenKeys: Set<string>;
  onToggle: (key: string) => void;
  palette: Palette;
}) {
  return (
    <View style={{
      marginTop: 10,
      borderTopWidth: 0.5,
      borderTopColor: palette.border,
      paddingTop: 8,
      gap: 4,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 }}>
        <Ionicons name="eye-outline" size={12} color={palette.textMuted} />
        <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 }}>
          FIELD VISIBILITY
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {fields.map((field) => {
          const hidden = hiddenKeys.has(field.key);
          const isSensitive = SENSITIVE_FIELD_KEYS.has(field.key);
          return (
            <Pressable
              key={field.key}
              onPress={() => onToggle(field.key)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 99,
                borderWidth: 1,
                borderColor: hidden ? palette.border : `${palette.accent}55`,
                backgroundColor: hidden ? 'transparent' : `${palette.accent}10`,
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Ionicons
                name={hidden ? 'eye-off-outline' : 'eye-outline'}
                size={11}
                color={hidden ? palette.textMuted : palette.accent}
              />
              {isSensitive && (
                <Ionicons name="lock-closed-outline" size={9} color={palette.textMuted} />
              )}
              <Text style={{
                fontSize: 10,
                fontWeight: '700',
                color: hidden ? palette.textMuted : palette.accent,
                letterSpacing: 0.2,
              }}>
                {field.rawLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── ServiceNow: main structured block ────────────────────────────────────────

function ServiceNowBlock({
  sfModel,
  smart,
  typeMeta,
  palette,
  expanded,
  hiddenKeys,
  onToggleField,
  onCopyValue,
  onPressOffice,
  serviceNowBaseUrl,
}: {
  sfModel: ServiceNowModel;
  smart: SmartNoteEntities;
  typeMeta: { title: string; color: string };
  palette: Palette;
  expanded: boolean;
  hiddenKeys: Set<string>;
  onToggleField: (key: string) => void;
  onCopyValue: (value: string, label: 'IP' | 'Hostname') => void;
  onPressOffice: (office: string) => void;
  serviceNowBaseUrl: string;
}) {
  const visibleFields = sfModel.fields.filter((f) => !hiddenKeys.has(f.key));
  const hiddenCount = sfModel.fields.length - visibleFields.length;
  const displayFields = expanded ? visibleFields : visibleFields.slice(0, 6);
  const moreCount = visibleFields.length - displayFields.length;

  // Segment footer text for entity highlighting
  const footerSegments = useMemo(
    () => sfModel.footer ? segmentNoteText(sfModel.footer, smart) : [],
    [sfModel.footer, smart],
  );

  return (
    <View style={{ gap: 6 }}>
      {/* Type badge + hidden-field count */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
        <View style={{
          borderRadius: 6, borderWidth: 1,
          borderColor: `${typeMeta.color}55`,
          backgroundColor: `${typeMeta.color}18`,
          paddingHorizontal: 7, paddingVertical: 3,
          flexDirection: 'row', alignItems: 'center', gap: 4,
        }}>
          <Ionicons name="document-text-outline" size={10} color={typeMeta.color} />
          <Text style={{ color: typeMeta.color, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>
            {typeMeta.title.toUpperCase()}
          </Text>
        </View>
        {hiddenCount > 0 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
            <Ionicons name="eye-off-outline" size={10} color={palette.textMuted} />
            <Text style={{ color: palette.textMuted, fontSize: 10 }}>
              {hiddenCount} hidden
            </Text>
          </View>
        )}
      </View>

      {/* Field rows */}
      <View style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: `${typeMeta.color}28`,
        backgroundColor: `${typeMeta.color}06`,
        paddingHorizontal: 10,
        paddingVertical: 4,
      }}>
        {displayFields.map((field, i) => (
          <SnFieldRow
            key={field.key}
            field={field}
            smart={smart}
            palette={palette}
            isLast={i === displayFields.length - 1 && moreCount === 0}
            isNumber={field.key === 'number'}
            serviceNowBaseUrl={serviceNowBaseUrl}
            onCopyValue={onCopyValue}
            onPressOffice={onPressOffice}
          />
        ))}
        {moreCount > 0 && (
          <Text style={{ color: palette.textMuted, fontSize: 11, paddingVertical: 4 }}>
            +{moreCount} more fields (expand to see all)
          </Text>
        )}
      </View>

      {/* Free text (non-field lines) */}
      {sfModel.freeText ? (
        <Text style={{ color: palette.textBody, fontSize: 12, lineHeight: 18, opacity: 0.75 }}>
          {sfModel.freeText}
        </Text>
      ) : null}

      {/* Footer (after ---) with entity highlights */}
      {sfModel.footer ? (
        <View style={{
          borderTopWidth: 0.5,
          borderTopColor: palette.border,
          paddingTop: 6,
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 2,
        }}>
          <Text style={{ fontSize: 12, lineHeight: 20 }}>
            {footerSegments.map((seg, i) => {
              if (seg.kind === 'plain') {
                return <Text key={i} style={{ color: palette.textBody }}>{seg.text}</Text>;
              }
              const c = ENTITY_COLORS[seg.kind];
              return (
                <Text
                  key={i}
                  onPress={seg.kind === 'office' ? () => onPressOffice(seg.text) : undefined}
                  style={{ color: c.text, backgroundColor: c.bg, fontWeight: '700', borderRadius: 3 }}
                >
                  {seg.text}
                </Text>
              );
            })}
          </Text>
        </View>
      ) : null}

      {/* Field visibility panel (only when expanded) */}
      {expanded && (
        <FieldVisibilityPanel
          fields={sfModel.fields}
          hiddenKeys={hiddenKeys}
          onToggle={onToggleField}
          palette={palette}
        />
      )}
    </View>
  );
}


// ─── SmartEntityBlock ──────────────────────────────────────────────────────────

function SmartEntityBlock({
  smart,
  model,
  typeMeta,
  palette,
  expanded,
  onPressOffice,
  onCopyValue,
}: {
  smart: SmartNoteEntities;
  model: SmartNoteModel;
  typeMeta: { title: string; color: string };
  palette: Palette;
  expanded: boolean;
  onPressOffice: (office: string) => void;
  onCopyValue: (value: string, label: 'IP' | 'Hostname') => void;
}) {
  // Build segments once per render (text rarely changes)
  const segments = React.useMemo(() => segmentNoteText(model.rawText, smart), [model.rawText, smart]);

  // Which entity types are present (for the legend)
  const legendItems = (['pi', 'hostname', 'ip', 'office'] as const).filter(
    (kind) => smart[kind].length > 0,
  );

  // Pressing a highlighted token copies its value
  function handleSegmentPress(seg: NoteSegment) {
    if (seg.kind === 'ip')       { onCopyValue(seg.text, 'IP'); return; }
    if (seg.kind === 'hostname') { onCopyValue(seg.text, 'Hostname'); return; }
    if (seg.kind === 'office')   { onPressOffice(seg.text); return; }
    // PI — no copy handler available, do nothing
  }

  return (
    <View style={{ gap: 6 }}>
      {/* ── Header row: type badge + legend ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        {/* Type badge */}
        <View style={{
          borderRadius: 6,
          borderWidth: 1,
          borderColor: `${typeMeta.color}55`,
          backgroundColor: `${typeMeta.color}18`,
          paddingHorizontal: 7,
          paddingVertical: 3,
        }}>
          <Text style={{ color: typeMeta.color, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 }}>
            {typeMeta.title.toUpperCase()}
          </Text>
        </View>

        {/* Legend dots */}
        {legendItems.map((kind) => {
          const c = ENTITY_COLORS[kind];
          return (
            <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.text }} />
              <Text style={{ color: palette.textDim, fontSize: 10, fontWeight: '600' }}>{c.label}</Text>
            </View>
          );
        })}
      </View>

      {/* ── Highlighted note text ── */}
      <View style={{
        borderRadius: 10,
        borderWidth: 1,
        borderColor: `${typeMeta.color}28`,
        backgroundColor: `${typeMeta.color}0a`,
        padding: 10,
      }}>
        <Text style={{ fontSize: 13, lineHeight: 22 }} numberOfLines={expanded ? 0 : 6}>
          {segments.map((seg, i) => {
            if (seg.kind === 'plain') {
              return (
                <Text key={i} style={{ color: palette.textBody }}>
                  {seg.text}
                </Text>
              );
            }
            const c = ENTITY_COLORS[seg.kind];
            const isInteractive = seg.kind === 'ip' || seg.kind === 'hostname' || seg.kind === 'office';
            return (
              <Text
                key={i}
                onPress={isInteractive ? () => handleSegmentPress(seg) : undefined}
                style={{
                  color: c.text,
                  backgroundColor: c.bg,
                  fontWeight: '700',
                  borderRadius: 3,
                  // Small padding via letter-spacing trick (RN doesn't support paddingHorizontal on inline Text)
                  letterSpacing: 0.2,
                }}
              >
                {seg.text}
              </Text>
            );
          })}
        </Text>
      </View>

      {/* If the note is also a checklist, show it below */}
      {model.isList && model.items.length > 0 ? (
        <NoteListBlock model={model} palette={palette} expanded={expanded} />
      ) : null}
    </View>
  );
}
