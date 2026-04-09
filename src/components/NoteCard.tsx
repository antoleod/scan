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
  onSaveToDevice: _onSaveToDevice,
  onShare,
  onSetReminder,
  onArchive,
  onDelete,
  onSetColor,
  onLongPress,
  onDoubleTap,
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
  onSaveToDevice: () => void;
  onShare: () => void;
  onSetReminder: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onSetColor: (color: NoteColor) => void;
  onLongPress?: () => void;
  onDoubleTap?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Double-tap detection
  const lastTapRef = useRef<number>(0);

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

  // ── Swipe action handlers ────────────────────────────────────────────────
  const handleReminder  = () => { closeSwipe(); onSetReminder(); };
  const handleArchive   = () => { closeSwipe(); onArchive(); };
  const handleDeleteTap = () => { closeSwipe(); setConfirmDelete(true); };

  return (
    <>
      {/* Outer container — clips card so the slide-left reveals the action panel */}
      <View style={{ borderRadius: 14, overflow: 'hidden' }}>

        {/* ── Swipe actions (positioned behind the card on the right) ── */}
        <View
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: SWIPE_WIDTH,
            flexDirection: 'row',
          }}
        >
          <SwipeAction bg="#2563eb" icon="alarm-outline"   label="Remind"  onPress={handleReminder} />
          <SwipeAction bg="#7c3aed" icon="archive-outline" label="Archive" onPress={handleArchive} />
          <SwipeAction bg="#dc2626" icon="trash-outline"   label="Delete"  onPress={handleDeleteTap} roundRight />
        </View>

        {/* ── Animated card — slides left to reveal actions ── */}
        <Animated.View
          style={{ transform: [{ translateX }] }}
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
              <Text style={{ color: palette.textDim, fontSize: 11, flex: 1 }} numberOfLines={1}>
                {updatedAt}
              </Text>
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
              <Pressable onPress={() => onOpenImage(firstAttachment)}>
                <Image
                  source={{ uri: firstAttachment }}
                  style={{ width: '100%', height: 120, borderRadius: 10, backgroundColor: palette.surfaceAlt }}
                  resizeMode="cover"
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
