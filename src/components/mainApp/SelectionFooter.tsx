import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { mainAppStyles } from './styles';

type Palette = {
  accent: string;
  card: string;
  border: string;
  fg: string;
};

export function SelectionFooter({
  count,
  palette,
  onClear,
  onShare,
  onMarkUsed,
}: {
  count: number;
  palette: Palette;
  onClear: () => void;
  onShare: () => void;
  onMarkUsed: () => void;
}) {
  if (count <= 0) return null;

  return (
    <View style={[mainAppStyles.selectionFooter, { backgroundColor: palette.card, borderColor: palette.border }]}>
      <Pressable onPress={onClear} style={mainAppStyles.selectionBtn}>
        <Ionicons name="close" size={24} color={palette.fg} />
      </Pressable>
      <Text style={{ color: palette.fg, fontWeight: '700' }}>{count} selected</Text>
      <Pressable onPress={onMarkUsed} style={mainAppStyles.selectionBtn}>
        <Ionicons name="checkmark-done-outline" size={24} color={palette.accent} />
      </Pressable>
      <Pressable onPress={onShare} style={mainAppStyles.selectionBtn}>
        <Ionicons name="share-outline" size={24} color={palette.accent} />
      </Pressable>
    </View>
  );
}
