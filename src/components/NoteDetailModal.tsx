import React, { useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type NoteCategory = 'general' | 'work';
type NoteColor   = 'default' | 'amber' | 'mint' | 'sky' | 'rose';

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
  createdAt?: number;
};

type Palette = {
  bg: string;
  accent: string;
  border: string;
  surface: string;
  surfaceAlt: string;
  textBody: string;
  textDim: string;
  textMuted: string;
  chipBorder: string;
};

const colorSwatches: { key: NoteColor; hex: string; label: string }[] = [
  { key: 'default', hex: 'transparent', label: 'None'   },
  { key: 'amber',   hex: '#F5C518',     label: 'Yellow' },
  { key: 'mint',    hex: '#27AE60',     label: 'Green'  },
  { key: 'sky',     hex: '#2980B9',     label: 'Blue'   },
  { key: 'rose',    hex: '#E91E8C',     label: 'Pink'   },
];

// ─── NoteDetailModal ──────────────────────────────────────────────────────────

export function NoteDetailModal({
  note,
  visible,
  palette,
  onClose,
  onSave,
  onSetColor,
  onTogglePinned,
  onArchive,
  onDelete,
  onCopy,
  onShare,
}: {
  note: NoteItem | null;
  visible: boolean;
  palette: Palette;
  onClose: () => void;
  onSave: (id: string, title: string, text: string) => void;
  onSetColor?: (color: NoteColor) => void;
  onTogglePinned: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onCopy: (text: string) => void;
  onShare: (id: string) => void;
}) {
  const [localTitle, setLocalTitle] = useState('');
  const [localText,  setLocalText]  = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bodyRef = useRef<TextInput>(null);

  // Sync from note when modal opens
  useEffect(() => {
    if (visible && note) {
      setLocalTitle(note.title ?? '');
      setLocalText(note.text);
      setConfirmDelete(false);
    }
  }, [visible, note?.id]);

  // Early return MUST come after all hooks
  if (!note) return null;

  const hasChanges =
    localTitle.trim() !== (note.title ?? '') ||
    localText.trim()  !== note.text.trim();

  const handleClose = () => {
    Keyboard.dismiss();
    if (hasChanges) onSave(note.id, localTitle, localText);
    onClose();
  };

  const handleDelete = () => {
    onDelete(note.id);
    onClose();
  };

  const createdAt = note.createdAt
    ? new Date(note.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
    : null;
  const updatedAt = new Date(note.updatedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  const catColor = note.category === 'work' ? '#2563eb' : '#059669';

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View style={{
          backgroundColor: palette.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          borderWidth: 1,
          borderBottomWidth: 0,
          borderColor: palette.border,
          maxHeight: '92%',
          paddingBottom: 32,
        }}>
          {/* Drag handle */}
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 99, backgroundColor: palette.chipBorder, marginTop: 12, marginBottom: 4 }} />

          {/* ── Toolbar ── */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: palette.border,
            gap: 6,
          }}>
            {/* Category badge */}
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: `${catColor}18` }}>
              <Text style={{ color: catColor, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {note.category}
              </Text>
            </View>
            {note.archived ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: `${palette.textMuted}18` }}>
                <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  archived
                </Text>
              </View>
            ) : null}

            <View style={{ flex: 1 }} />

            {/* Action icons */}
            <ToolBtn icon={note.pinned ? 'bookmark' : 'bookmark-outline'} color={note.pinned ? '#2563eb' : palette.textDim} onPress={() => onTogglePinned(note.id)} />
            <ToolBtn icon="copy-outline"          color={palette.textDim} onPress={() => onCopy(localText)} />
            <ToolBtn icon="share-social-outline"  color={palette.textDim} onPress={() => onShare(note.id)} />
            <ToolBtn icon={note.archived ? 'archive' : 'archive-outline'} color={palette.textDim} onPress={() => { onArchive(note.id); onClose(); }} />

            {/* Delete */}
            {confirmDelete ? (
              <>
                <Pressable
                  onPress={() => setConfirmDelete(false)}
                  style={{ paddingHorizontal: 10, height: 32, borderRadius: 8, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: palette.textDim, fontSize: 12, fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={handleDelete}
                  style={{ paddingHorizontal: 10, height: 32, borderRadius: 8, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Delete</Text>
                </Pressable>
              </>
            ) : (
              <ToolBtn icon="trash-outline" color="#dc2626" onPress={() => setConfirmDelete(true)} />
            )}

            {/* Close / Save */}
            <Pressable
              onPress={handleClose}
              style={({ pressed }) => ({
                paddingHorizontal: 14,
                height: 34,
                borderRadius: 10,
                backgroundColor: hasChanges ? palette.accent : palette.surfaceAlt,
                borderWidth: 1,
                borderColor: hasChanges ? palette.accent : palette.border,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ color: hasChanges ? '#000' : palette.textDim, fontSize: 12, fontWeight: '700' }}>
                {hasChanges ? 'Save' : 'Close'}
              </Text>
            </Pressable>
          </View>

          {/* ── Editable content ── */}
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, gap: 12 }}
          >
            {/* Optional title */}
            <TextInput
              value={localTitle}
              onChangeText={setLocalTitle}
              placeholder="Add a title (optional)"
              placeholderTextColor={palette.textMuted}
              returnKeyType="next"
              onSubmitEditing={() => bodyRef.current?.focus()}
              style={{
                color: palette.textBody,
                fontSize: 20,
                fontWeight: '700',
                borderBottomWidth: 1,
                borderBottomColor: localTitle ? palette.border : 'transparent',
                paddingBottom: localTitle ? 8 : 0,
                marginBottom: localTitle ? 4 : 0,
              }}
            />

            {/* Body */}
            <TextInput
              ref={bodyRef}
              value={localText}
              onChangeText={setLocalText}
              multiline
              placeholder="Note body…"
              placeholderTextColor={palette.textMuted}
              style={{
                color: palette.textBody,
                fontSize: 15,
                lineHeight: 24,
                textAlignVertical: 'top',
                minHeight: 180,
              }}
            />

            {/* ── Color picker ── */}
            {onSetColor ? (
              <View style={{ paddingTop: 12, borderTopWidth: 1, borderTopColor: palette.border, gap: 8 }}>
                <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Note color
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {colorSwatches.map((swatch) => {
                    const active = (note.color ?? 'default') === swatch.key;
                    return (
                      <Pressable
                        key={swatch.key}
                        onPress={() => onSetColor(swatch.key)}
                        hitSlop={8}
                        style={({ pressed }) => ({
                          minWidth: 64,
                          height: 36,
                          borderRadius: 999,
                          borderWidth: active ? 2 : 1,
                          borderColor: active ? palette.accent : palette.border,
                          backgroundColor: pressed ? `${palette.accent}10` : palette.surfaceAlt,
                          paddingHorizontal: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        })}
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
                        <Text style={{ color: active ? palette.accent : palette.textMuted, fontSize: 11, fontWeight: '600' }}>
                          {swatch.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Metadata footer */}
            <View style={{ borderTopWidth: 1, borderTopColor: palette.border, paddingTop: 12, gap: 4 }}>
              {createdAt ? (
                <Text style={{ color: palette.textMuted, fontSize: 11 }}>
                  Created: {createdAt}
                </Text>
              ) : null}
              <Text style={{ color: palette.textMuted, fontSize: 11 }}>
                Last modified: {updatedAt}
              </Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Toolbar icon button ──────────────────────────────────────────────────────

function ToolBtn({
  icon,
  color,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 34,
        height: 34,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? `${color}18` : 'transparent',
      })}
    >
      <Ionicons name={icon} size={18} color={color} />
    </Pressable>
  );
}
