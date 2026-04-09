import React, { useMemo, useState } from 'react';
import { Image, Modal, Pressable, Text, TextInput, View } from 'react-native';
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
  text: string;
  category: NoteCategory;
  pinned: boolean;
  archived?: boolean;
  color?: NoteColor;
  attachments?: string[];
  updatedAt: number;
};

const colorSwatches: { key: NoteColor; color: string }[] = [
  { key: 'default', color: '#141414' },
  { key: 'amber', color: '#F5C518' },
  { key: 'mint', color: '#27AE60' },
  { key: 'sky', color: '#2980B9' },
  { key: 'rose', color: '#E91E8C' },
];

const colorLabels: Record<NoteColor, string> = {
  default: 'None',
  amber: 'Yellow',
  mint: 'Green',
  sky: 'Blue',
  rose: 'Pink',
};

function noteColorHex(color?: NoteColor) {
  switch (color) {
    case 'amber':
      return '#F5C518';
    case 'mint':
      return '#27AE60';
    case 'sky':
      return '#2980B9';
    case 'rose':
      return '#E91E8C';
    default:
      return '#1E1E1E';
  }
}

export function NoteCard({
  note,
  palette,
  expanded,
  editing,
  editingText,
  onToggleExpand,
  onStartEdit,
  onChangeEditingText,
  onSaveEdit,
  onCancelEdit,
  onTogglePinned,
  onOpenImage,
  onSaveToDevice,
  onShare,
  onSetReminder,
  onDelete,
  onSetColor,
}: {
  note: NoteItem;
  palette: Palette;
  expanded: boolean;
  editing: boolean;
  editingText: string;
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onChangeEditingText: (value: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onTogglePinned: () => void;
  onOpenImage: (uri: string) => void;
  onSaveToDevice: () => void;
  onShare: () => void;
  onSetReminder: () => void;
  onDelete: () => void;
  onSetColor: (color: NoteColor) => void;
}) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const preview = useMemo(() => note.text.trim() || `Image attachment (${note.attachments?.length || 0})`, [note.attachments?.length, note.text]);
  const firstAttachment = note.attachments?.[0];
  const updatedAt = useMemo(() => {
    const date = new Date(note.updatedAt);
    return `${date.toLocaleDateString()} · ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [note.updatedAt]);
  const borderLeftColor = noteColorHex(note.color);

  const openSheet = () => setSheetVisible(true);
  const closeSheet = () => setSheetVisible(false);

  const runAndClose = (action: () => void) => {
    closeSheet();
    action();
  };

  return (
    <>
      <Pressable
        onPress={onToggleExpand}
        style={({ pressed }) => ({
          width: '100%',
          minWidth: 0,
          borderWidth: 1,
          borderColor: palette.border,
          borderLeftWidth: 4,
          borderLeftColor,
          borderRadius: 12,
          backgroundColor: palette.surface,
          padding: 14,
          gap: 10,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ color: palette.textDim, fontSize: 11, flex: 1 }} numberOfLines={1}>
            {updatedAt}
          </Text>
          <Pressable onPress={onTogglePinned} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={note.pinned ? 'bookmark' : 'bookmark-outline'} size={17} color={note.pinned ? palette.accent : '#444444'} />
          </Pressable>
        </View>

        {firstAttachment ? (
          <Pressable onPress={() => onOpenImage(firstAttachment)}>
            <Image source={{ uri: firstAttachment }} style={{ width: '100%', height: 120, borderRadius: 10, backgroundColor: '#111111' }} resizeMode="cover" />
          </Pressable>
        ) : null}

        {editing ? (
          <TextInput
            value={editingText}
            onChangeText={onChangeEditingText}
            multiline
            style={{
              minHeight: 64,
              borderWidth: 1,
              borderColor: palette.border,
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
          <Text style={{ color: palette.textBody, fontSize: 14, lineHeight: 21 }} numberOfLines={expanded ? 0 : 2}>
            {preview}
          </Text>
        )}

        {editing ? (
          <View style={{ marginTop: 2, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.border }}>
            <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '500', marginBottom: 8 }}>Color</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {colorSwatches.map((swatch) => {
                const active = (note.color || 'default') === swatch.key;
                return (
                  <Pressable
                    key={swatch.key}
                    onPress={() => onSetColor(swatch.key)}
                    hitSlop={8}
                    style={{
                      minWidth: 64,
                      height: 44,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: active ? palette.accent : palette.border,
                      backgroundColor: active ? '#1A0A00' : palette.bg,
                      paddingHorizontal: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                    }}
                  >
                    <View
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 99,
                        backgroundColor: swatch.key === 'default' ? 'transparent' : swatch.color,
                        borderWidth: 1.5,
                        borderColor: active ? palette.accent : palette.border,
                      }}
                    />
                    <Text style={{ color: active ? palette.accent : palette.textMuted, fontSize: 11, fontWeight: '500' }}>
                      {colorLabels[swatch.key]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#1E1E1E' }}>
            <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' }}>
              {note.category}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <Pressable onPress={editing ? onSaveEdit : onStartEdit} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={editing ? 'checkmark' : 'create-outline'} size={16} color="#555555" />
            </Pressable>
            <Pressable onPress={openSheet} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="ellipsis-horizontal" size={18} color="#555555" />
            </Pressable>
          </View>
        </View>
      </Pressable>

      <Modal animationType="fade" transparent visible={sheetVisible} onRequestClose={closeSheet} statusBarTranslucent>
        <Pressable
          onPress={closeSheet}
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
            paddingHorizontal: 12,
            paddingBottom: 18,
          }}
        >
          <Pressable
            onPress={() => undefined}
            style={{
              backgroundColor: palette.surface,
              borderWidth: 1,
              borderColor: palette.border,
              borderRadius: 20,
              padding: 14,
              gap: 10,
            }}
          >
            <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 99, backgroundColor: palette.chipBorder }} />
            <Pressable onPress={() => runAndClose(onSaveToDevice)} style={{ minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 }}>
              <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '600' }}>Save to device</Text>
            </Pressable>
            <Pressable onPress={() => runAndClose(onShare)} style={{ minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 }}>
              <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '600' }}>Share</Text>
            </Pressable>
            <Pressable onPress={() => runAndClose(onSetReminder)} style={{ minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 }}>
              <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '600' }}>Set reminder</Text>
            </Pressable>
            <Pressable onPress={() => runAndClose(onDelete)} style={{ minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 }}>
              <Text style={{ color: '#C0392B', fontSize: 14, fontWeight: '700' }}>Delete</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
