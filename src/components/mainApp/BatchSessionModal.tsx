import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScanRecord } from '../../types';

type Palette = {
  bg: string;
  accent: string;
  border: string;
  card: string;
  fg: string;
  muted: string;
};

type Props = {
  visible: boolean;
  items: ScanRecord[];
  palette: Palette;
  saveBusy: boolean;
  onRemoveItem: (id: string) => void;
  onSaveAll: () => void;
  onExportCsv: () => void;
  onDiscard: () => void;
  onClose: () => void;
};

export function BatchSessionModal({
  visible,
  items,
  palette: P,
  saveBusy,
  onRemoveItem,
  onSaveAll,
  onExportCsv,
  onDiscard,
  onClose,
}: Props) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  const visibleType = (type: string) =>
    type === 'PI' ? 'PI' : type === 'QR' ? 'QR' : type === 'OFFICE' ? 'Office' : 'Code';

  const renderItem = useCallback(
    (item: ScanRecord) => (
      <View
        key={item.id}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderBottomWidth: 1,
          borderBottomColor: P.border,
        }}
      >
        {/* Type badge */}
        <View
          style={{
            backgroundColor: item.type === 'PI' ? `${P.accent}22` : 'rgba(100,200,100,0.14)',
            borderRadius: 6,
            paddingHorizontal: 7,
            paddingVertical: 3,
            minWidth: 42,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: item.type === 'PI' ? P.accent : '#4ade80', fontSize: 10, fontWeight: '800' }}>
            {visibleType(item.type)}
          </Text>
        </View>

        {/* Code */}
        <Text style={{ color: P.fg, fontSize: 13, fontWeight: '600', flex: 1 }} numberOfLines={1}>
          {item.codeNormalized}
        </Text>

        {/* Time */}
        <Text style={{ color: P.muted, fontSize: 11 }}>
          {new Date(item.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </Text>

        {/* Remove */}
        <Pressable
          onPress={() => onRemoveItem(item.id)}
          hitSlop={10}
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            backgroundColor: 'rgba(220,38,38,0.12)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close" size={14} color="#dc2626" />
        </Pressable>
      </View>
    ),
    [P, onRemoveItem],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: P.bg,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '85%',
            alignSelf: isDesktop ? 'center' : 'stretch',
            width: isDesktop ? 560 : '100%',
            borderTopWidth: 1,
            borderLeftWidth: isDesktop ? 1 : 0,
            borderRightWidth: isDesktop ? 1 : 0,
            borderColor: P.border,
            paddingBottom: Platform.OS === 'ios' ? 28 : 16,
          }}
        >
          {/* ── Handle ── */}
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 99, backgroundColor: P.border, marginTop: 12, marginBottom: 16 }} />

          {/* ── Header ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 6, gap: 10 }}>
            <View style={{
              width: 34, height: 34, borderRadius: 10,
              backgroundColor: `${P.accent}20`,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="layers-outline" size={18} color={P.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: P.fg, fontSize: 16, fontWeight: '800' }}>Batch Session</Text>
              <Text style={{ color: P.muted, fontSize: 12, marginTop: 1 }}>
                {items.length === 0 ? 'No items yet — keep scanning' : `${items.length} item${items.length === 1 ? '' : 's'} captured`}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: P.border, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={16} color={P.muted} />
            </Pressable>
          </View>

          {/* ── Item list ── */}
          <ScrollView
            style={{ maxHeight: 380, borderTopWidth: 1, borderTopColor: P.border }}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {items.length === 0 ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
                <Ionicons name="barcode-outline" size={36} color={P.muted} />
                <Text style={{ color: P.muted, fontSize: 13, textAlign: 'center' }}>
                  Point the camera at a barcode{'\n'}to start collecting items.
                </Text>
              </View>
            ) : (
              items.map(renderItem)
            )}
          </ScrollView>

          {/* ── Action buttons ── */}
          <View style={{ paddingHorizontal: 14, paddingTop: 12, gap: 8 }}>
            {/* Primary: save all */}
            <Pressable
              onPress={onSaveAll}
              disabled={items.length === 0 || saveBusy}
              style={({ pressed }) => ({
                minHeight: 48,
                borderRadius: 14,
                backgroundColor: items.length === 0 ? `${P.accent}50` : P.accent,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: 8,
                opacity: pressed ? 0.88 : 1,
              })}
            >
              {saveBusy
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="checkmark-done-outline" size={18} color="#fff" />}
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                {saveBusy ? 'Saving…' : `Save All (${items.length})`}
              </Text>
            </Pressable>

            {/* Secondary row */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={onExportCsv}
                disabled={items.length === 0}
                style={({ pressed }) => ({
                  flex: 1, minHeight: 44, borderRadius: 12,
                  borderWidth: 1, borderColor: P.border,
                  alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 6,
                  opacity: pressed || items.length === 0 ? 0.55 : 1,
                  backgroundColor: P.card,
                })}
              >
                <Ionicons name="download-outline" size={15} color={P.muted} />
                <Text style={{ color: P.muted, fontSize: 13, fontWeight: '600' }}>Export CSV</Text>
              </Pressable>

              <Pressable
                onPress={onDiscard}
                style={({ pressed }) => ({
                  flex: 1, minHeight: 44, borderRadius: 12,
                  borderWidth: 1, borderColor: 'rgba(220,38,38,0.35)',
                  alignItems: 'center', justifyContent: 'center',
                  flexDirection: 'row', gap: 6,
                  opacity: pressed ? 0.7 : 1,
                  backgroundColor: 'rgba(220,38,38,0.07)',
                })}
              >
                <Ionicons name="trash-outline" size={15} color="#dc2626" />
                <Text style={{ color: '#dc2626', fontSize: 13, fontWeight: '600' }}>Discard</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
