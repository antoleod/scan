import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SmartNoteModel } from '../core/smartNotes';
import type { NotePalette as Palette } from '../theme/theme';

export function NoteListBlock({
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
