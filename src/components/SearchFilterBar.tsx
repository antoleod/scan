import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
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
  chipBorder: string;
};

type FilterKey = 'all' | 'work' | 'pinned' | 'archived';

export function SearchFilterBar({
  palette,
  value,
  count,
  filter,
  onChange,
  onChangeFilter,
}: {
  palette: Palette;
  value: string;
  count: number;
  filter: FilterKey;
  onChange: (text: string) => void;
  onChangeFilter: (filter: FilterKey) => void;
}) {
  const filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'all' },
    { key: 'work', label: 'work' },
    { key: 'pinned', label: 'pinned' },
    { key: 'archived', label: 'archived' },
  ];

  return (
    <View style={{ width: '100%' }}>
      <View style={{ position: 'relative', width: '100%' }}>
        <Ionicons name="search" size={16} color={palette.textDim} style={{ position: 'absolute', left: 12, top: 12, zIndex: 2 }} />
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="Search notes..."
          placeholderTextColor={palette.textMuted}
          style={{
            height: 40,
            width: '100%',
            borderRadius: 10,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
            paddingLeft: 36,
            paddingRight: 74,
            color: palette.textBody,
            fontSize: 14,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            right: 8,
            top: 10,
            backgroundColor: palette.surfaceAlt,
            borderRadius: 6,
            paddingHorizontal: 8,
            paddingVertical: 2,
          }}
        >
          <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: '500' }}>{count} notes</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {filters.map((item) => {
          const active = filter === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onChangeFilter(item.key)}
              hitSlop={8}
              style={({ pressed }) => ({
                height: 28,
                paddingHorizontal: 12,
                borderRadius: 99,
                borderWidth: 1,
                borderColor: active ? palette.accent : palette.chipBorder,
                backgroundColor: active ? palette.accent : 'transparent',
                justifyContent: 'center',
                opacity: pressed ? 0.82 : 1,
              })}
            >
              <Text style={{ color: active ? '#000000' : palette.textDim, fontSize: 12, fontWeight: active ? '600' : '500', textTransform: 'capitalize' }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
