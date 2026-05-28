import React, { useMemo, useRef, useEffect } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

export interface CommandPaletteItem {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  keywords?: string;
  onPress: () => void;
}

export function CommandPalette({
  visible,
  palette,
  query,
  items,
  onQueryChange,
  onClose,
}: {
  visible: boolean;
  palette: Palette;
  query: string;
  items: CommandPaletteItem[];
  onQueryChange: (value: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const normalized = query.trim().toLowerCase();
  const filteredItems = useMemo(() => {
    if (!normalized) return items.slice(0, 24);
    return items
      .filter((item) => `${item.title} ${item.subtitle ?? ''} ${item.keywords ?? ''}`.toLowerCase().includes(normalized))
      .slice(0, 30);
  }, [items, normalized]);

  useEffect(() => {
    if (!visible) return;
    const id = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(id);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[styles.panel, { backgroundColor: palette.bg, borderColor: palette.border }]}
        >
          <View style={[styles.searchBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Ionicons name="search-outline" size={18} color={palette.accent} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={onQueryChange}
              placeholder={t('commandPalette.searchPlaceholder')}
              placeholderTextColor={palette.muted}
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel="Global search and command palette"
              style={[styles.searchInput, { color: palette.fg }]}
            />
            {query ? (
              <Pressable onPress={() => onQueryChange('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={18} color={palette.muted} />
              </Pressable>
            ) : null}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={styles.results} contentContainerStyle={styles.resultsBody}>
            {filteredItems.length ? filteredItems.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                onPress={() => {
                  item.onPress();
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.resultRow,
                  { borderColor: palette.border, backgroundColor: pressed ? `${palette.accent}14` : palette.card },
                ]}
              >
                <View style={[styles.resultIcon, { borderColor: `${palette.accent}44`, backgroundColor: `${palette.accent}18` }]}>
                  <Ionicons name={item.icon} size={16} color={palette.accent} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.resultTitle, { color: palette.fg }]} numberOfLines={1}>{item.title}</Text>
                  {item.subtitle ? <Text style={[styles.resultSubtitle, { color: palette.muted }]} numberOfLines={2}>{item.subtitle}</Text> : null}
                </View>
                <Ionicons name="return-down-forward-outline" size={16} color={palette.muted} />
              </Pressable>
            )) : (
              <View style={styles.emptyState}>
                <Ionicons name="search-outline" size={24} color={palette.muted} />
                <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '800' }}>{t('commandPalette.noResults')}</Text>
                <Text style={{ color: palette.muted, fontSize: 11, textAlign: 'center' }}>{t('commandPalette.emptyHint')}</Text>
              </View>
            )}
          </ScrollView>

          {Platform.OS === 'web' ? (
            <Text style={[styles.footer, { color: palette.muted }]}>{t('commandPalette.shortcut')}</Text>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.58)', justifyContent: 'flex-start', alignItems: 'center', padding: 12, paddingTop: 72 },
  panel: { width: '100%', maxWidth: 720, maxHeight: '82%', borderWidth: 1, borderRadius: 16, padding: 12, gap: 10 },
  searchBox: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 14, paddingVertical: 10 },
  results: { maxHeight: 520 },
  resultsBody: { gap: 8, paddingBottom: 4 },
  resultRow: { minHeight: 62, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultIcon: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { fontSize: 13, fontWeight: '800' },
  resultSubtitle: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  emptyState: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 18 },
  footer: { fontSize: 10, fontWeight: '800', textAlign: 'right', textTransform: 'uppercase', letterSpacing: 1 },
});
