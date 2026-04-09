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

type SheetRow = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color?: string;
  onPress: () => void;
};

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
  onSaveToDevice,
  onShare,
  onSetReminder,
  onArchive,
  onDelete,
  onSetColor,
  onLongPress,
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
}) {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const preview = useMemo(
    () => note.text.trim() || `Image attachment (${note.attachments?.length || 0})`,
    [note.attachments?.length, note.text],
  );
  const firstAttachment = note.attachments?.[0];
  const updatedAt = useMemo(() => {
    const d = new Date(note.updatedAt);
    return `${d.toLocaleDateString()} · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }, [note.updatedAt]);

  const borderLeftColor = noteColorHex(note.color, palette.border);

  const openSheet = () => { setConfirmDelete(false); setSheetVisible(true); };
  const closeSheet = () => { setConfirmDelete(false); setSheetVisible(false); };
  const run = (fn: () => void) => { closeSheet(); fn(); };

  const sheetRows: SheetRow[] = [
    { icon: 'copy-outline',          label: 'Copiar texto',            onPress: () => run(onCopy) },
    { icon: 'share-social-outline',  label: 'Compartir',               onPress: () => run(onShare) },
    { icon: 'download-outline',      label: 'Guardar en dispositivo',  onPress: () => run(onSaveToDevice) },
    { icon: 'alarm-outline',         label: 'Recordatorio',            onPress: () => run(onSetReminder) },
    {
      icon: note.archived ? 'archive-outline' : 'archive-outline',
      label: note.archived ? 'Desarchivar' : 'Archivar',
      onPress: () => run(onArchive),
    },
  ];

  return (
    <>
      <Pressable
        onPress={onToggleExpand}
        onLongPress={onLongPress}
        delayLongPress={350}
        style={({ pressed }) => ({
          width: '100%',
          minWidth: 0,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? palette.accent : palette.border,
          borderLeftWidth: selected ? 2 : 4,
          borderLeftColor: selected ? palette.accent : borderLeftColor,
          borderRadius: 12,
          backgroundColor: selected ? `${palette.accent}12` : palette.surface,
          padding: 14,
          gap: 10,
          opacity: pressed ? 0.92 : 1,
        })}
      >
        {/* Header row: date + pin / selection check */}
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
            <Pressable onPress={onTogglePinned} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons
                name={note.pinned ? 'bookmark' : 'bookmark-outline'}
                size={17}
                color={note.pinned ? palette.accent : palette.textDim}
              />
            </Pressable>
          )}
        </View>

        {/* Image attachment thumbnail */}
        {firstAttachment ? (
          <Pressable onPress={() => onOpenImage(firstAttachment)}>
            <Image
              source={{ uri: firstAttachment }}
              style={{ width: '100%', height: 120, borderRadius: 10, backgroundColor: palette.surfaceAlt }}
              resizeMode="cover"
            />
          </Pressable>
        ) : null}

        {/* Text / edit area */}
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
          <Text style={{ color: palette.textBody, fontSize: 14, lineHeight: 21 }} numberOfLines={expanded ? 0 : 3}>
            {preview}
          </Text>
        )}

        {/* Color picker (editing mode) */}
        {editing ? (
          <View style={{ paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.border, gap: 8 }}>
            <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '600' }}>Color de la nota</Text>
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

        {/* Footer: category chip + actions */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}>
            <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: palette.surfaceAlt }}>
              <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                {note.category}
              </Text>
            </View>
            {note.archived ? (
              <View style={{ borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: palette.surfaceAlt }}>
                <Text style={{ color: palette.textMuted, fontSize: 10, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  archivada
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            {editing ? (
              <>
                <Pressable onPress={onCancelEdit} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="close-outline" size={18} color={palette.textDim} />
                </Pressable>
                <Pressable onPress={onSaveEdit} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="checkmark" size={18} color={palette.accent} />
                </Pressable>
              </>
            ) : (
              <>
                <Pressable onPress={onCopy} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="copy-outline" size={15} color={palette.textDim} />
                </Pressable>
                <Pressable onPress={onStartEdit} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="create-outline" size={16} color={palette.textDim} />
                </Pressable>
                <Pressable onPress={openSheet} hitSlop={10} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="ellipsis-horizontal" size={18} color={palette.textDim} />
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Pressable>

      {/* Action sheet */}
      <Modal animationType="fade" transparent visible={sheetVisible} onRequestClose={closeSheet} statusBarTranslucent>
        <Pressable
          onPress={closeSheet}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingBottom: 18 }}
        >
          <Pressable
            onPress={() => undefined}
            style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 20, padding: 14, gap: 4 }}
          >
            <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 99, backgroundColor: palette.chipBorder, marginBottom: 6 }} />

            {sheetRows.map((row) => (
              <Pressable
                key={row.label}
                onPress={row.onPress}
                style={({ pressed }) => ({
                  minHeight: 48,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  backgroundColor: pressed ? palette.surfaceAlt : 'transparent',
                })}
              >
                <Ionicons name={row.icon} size={18} color={row.color ?? palette.textBody} />
                <Text style={{ color: row.color ?? palette.textBody, fontSize: 14, fontWeight: '500', flex: 1 }}>{row.label}</Text>
              </Pressable>
            ))}

            <View style={{ height: 1, backgroundColor: palette.border, marginVertical: 4 }} />

            {/* Delete with confirm */}
            {confirmDelete ? (
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 6 }}>
                <Pressable
                  onPress={closeSheet}
                  style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: palette.textBody, fontSize: 13, fontWeight: '600' }}>Cancelar</Text>
                </Pressable>
                <Pressable
                  onPress={() => run(onDelete)}
                  style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#C0392B', alignItems: 'center', justifyContent: 'center' }}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Confirmar</Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirmDelete(true)}
                style={({ pressed }) => ({
                  minHeight: 48,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  backgroundColor: pressed ? '#2a0a0a' : 'transparent',
                })}
              >
                <Ionicons name="trash-outline" size={18} color="#C0392B" />
                <Text style={{ color: '#C0392B', fontSize: 14, fontWeight: '600', flex: 1 }}>Eliminar nota</Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
