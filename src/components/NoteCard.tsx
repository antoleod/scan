import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  PanResponder,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { detectNoteEntities, buildSmartNoteModel, segmentNoteText, SmartNoteEntities, SmartNoteModel, NoteSegment } from '../core/smartNotes';
import { AppSettings } from '../types';

type Palette = {
  bg: string;
  accent: string;
  border: string;
  surface: string;
  surfaceAlt: string;
  textBody: string;
  textDim: string;
  textMuted: string;
  textPrimary: string;
  chipBorder: string;
};

type NoteCategory = 'general' | 'work';
type NoteColor = 'default' | 'amber' | 'mint' | 'sky' | 'rose';

type NoteItem = {
  id: string;
  title?: string;
  text: string;
  category: NoteCategory;
  pinned: boolean;
  archived?: boolean;
  color?: NoteColor;
  attachments?: string[];
  versions?: { id: string; title?: string; text: string; createdAt: number }[];
  updatedAt: number;
};

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
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
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

export function NoteCard({
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
  onCopy: () => void;
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
  settings: AppSettings;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const heartPulse = useRef(new Animated.Value(1)).current;

  // Double-tap detection
  const lastTapRef = useRef<number>(0);

  useEffect(() => {
    if (!note.attachments?.length) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heartPulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(heartPulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [heartPulse, note.attachments?.length]);

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
      useNativeDriver: true,
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
      useNativeDriver: true,
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
  const preview = useMemo(
    () => note.text.trim() || `Image attachment (${note.attachments?.length ?? 0})`,
    [note.attachments?.length, note.text],
  );
  const firstAttachment = note.attachments?.[0];
  const updatedAt = useMemo(() => {
    const d = new Date(note.updatedAt);
    return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [note.updatedAt]);

  const borderLeftColor = noteColorHex(note.color, palette.border);
  const smart = useMemo(() => detectNoteEntities(note.text, settings), [note.text, settings]);
  const isSmart = smart.type !== 'general';
  const model = useMemo(() => buildSmartNoteModel(note.text, smart), [note.text, smart]);
  const [showOriginal, setShowOriginal] = React.useState(false);
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
              borderLeftWidth: selected ? 2 : 4,
              borderLeftColor: selected ? palette.accent : borderLeftColor,
              borderRadius: 14,
              backgroundColor: selected ? `${palette.accent}12` : palette.surface,
              padding: 14,
              gap: 10,
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
                  minHeight: 80,
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
            ) : isSmart ? (
              <SmartEntityBlock
                smart={smart}
                model={model}
                typeMeta={typeMeta}
                palette={palette}
                expanded={expanded}
                showOriginal={showOriginal}
                showRawText={settings.showRawText}
                onToggleOriginal={() => setShowOriginal((v) => !v)}
                onPressOffice={onPressOffice}
                onCopyValue={onCopyValue}
                preview={preview}
              />
            ) : model.isList ? (
              <NoteListBlock model={model} palette={palette} expanded={expanded} />
            ) : (
              <Text
                style={{ color: palette.textBody, fontSize: 14, lineHeight: 21 }}
                numberOfLines={expanded ? 0 : 3}
              >
                {preview}
              </Text>
            )}

            {/* ── Color picker (editing mode only) ── */}
            {editing ? (
              <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.border, gap: 8 }}>
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
              {/* Category + archived chips */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: palette.surfaceAlt }}>
                  <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    {note.category}
                  </Text>
                </View>
                {note.archived ? (
                  <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: palette.surfaceAlt }}>
                    <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                      archived
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ActionPill icon="copy-outline"         label="Copy"  color="#0891b2" onPress={onCopy} />
                  <ActionPill icon="share-social-outline" label="Share" color="#7c3aed" onPress={onShare} />
                  <ActionPill icon="create-outline"       label="Edit"  color="#059669" onPress={onStartEdit} />

                  {/* Chevron toggle — reliable on PC; also works on mobile alongside swipe */}
                  <Pressable
                    onPress={toggleSwipe}
                    hitSlop={6}
                    style={({ pressed }) => ({
                      width: 28,
                      height: 28,
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
                onPress={() => setConfirmDelete(false)}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: palette.textBody, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
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

// ─── Entity token colors ──────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, { text: string; bg: string; label: string }> = {
  pi:       { text: '#FF9F43', bg: 'rgba(255,159,67,0.14)',  label: 'PI' },
  hostname: { text: '#A970FF', bg: 'rgba(169,112,255,0.14)', label: 'Hostname' },
  ip:       { text: '#4DA3FF', bg: 'rgba(77,163,255,0.14)',  label: 'IP' },
  office:   { text: '#4ADE80', bg: 'rgba(74,222,128,0.14)',  label: 'Office' },
};

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
  showOriginal: boolean;
  showRawText: boolean;
  onToggleOriginal: () => void;
  onPressOffice: (office: string) => void;
  onCopyValue: (value: string, label: 'IP' | 'Hostname') => void;
  preview: string;
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

// ─── NoteListBlock ──────────────────────────────────────────────────────────────

function NoteListBlock({
  model,
  palette,
  expanded,
}: {
  model: SmartNoteModel;
  palette: Palette;
  expanded: boolean;
}) {
  const visibleItems = expanded ? model.items : model.items.slice(0, 6);
  const hidden = model.items.length - visibleItems.length;

  return (
    <View style={{ gap: 5 }}>
      {visibleItems.map((item) => (
        <View key={item.index} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          {item.kind === 'checkbox' ? (
            <View style={{
              width: 16, height: 16, borderRadius: 4, borderWidth: 1.5,
              borderColor: item.checked ? palette.accent : palette.textDim,
              backgroundColor: item.checked ? palette.accent : 'transparent',
              alignItems: 'center', justifyContent: 'center',
              marginTop: 2, flexShrink: 0,
            }}>
              {item.checked ? <Ionicons name="checkmark" size={10} color="#000" /> : null}
            </View>
          ) : item.kind === 'numbered' ? (
            <Text style={{ color: palette.textDim, fontSize: 12, fontWeight: '600', width: 20, textAlign: 'right', flexShrink: 0, marginTop: 1 }}>
              {item.index + 1}.
            </Text>
          ) : (
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: palette.accent, marginTop: 7, flexShrink: 0 }} />
          )}
          <Text style={{
            color: item.checked ? palette.textMuted : palette.textBody,
            fontSize: 13, lineHeight: 20, flex: 1,
            textDecorationLine: item.checked ? 'line-through' : 'none',
          }}>
            {item.text}
          </Text>
        </View>
      ))}
      {hidden > 0 ? (
        <Text style={{ color: palette.textMuted, fontSize: 11 }}>+{hidden} more items</Text>
      ) : null}
    </View>
  );
}
