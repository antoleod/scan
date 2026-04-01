import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import { mainAppStyles } from './styles';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string) {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  if (!year || !month || !day) return null;
  const next = new Date(year, month - 1, day);
  return Number.isNaN(next.getTime()) ? null : next;
}

export function HistoryDateModal({
  visible,
  value,
  palette,
  onApply,
  onClear,
  onClose,
}: {
  visible: boolean;
  value: Date | null;
  palette: Palette;
  onApply: (date: Date) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Date>(value || new Date());

  useEffect(() => {
    if (visible) {
      setDraft(value || new Date());
    }
  }, [visible, value]);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={mainAppStyles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[mainAppStyles.pickerModal, { backgroundColor: palette.card, borderColor: palette.border }]}
          onPress={() => null}
        >
          <View style={mainAppStyles.previewHeader}>
            <View>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>Select Date</Text>
              <Text style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>Filter history by one day.</Text>
            </View>
            <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={onClose}>
              <Ionicons name="close" size={18} color={palette.fg} />
            </Pressable>
          </View>

          <View style={[mainAppStyles.pickerBox, { backgroundColor: palette.bg, borderColor: palette.border }]}>
            {Platform.OS === 'web' ? (
              <TextInput
                value={toDateInputValue(draft)}
                onChangeText={(value) => {
                  const next = fromDateInputValue(value);
                  if (next) setDraft(next);
                }}
                {...({ type: 'date' } as any)}
                style={[
                  mainAppStyles.formField,
                  {
                    width: '100%',
                    marginTop: 0,
                    color: palette.fg,
                    borderColor: palette.border,
                    backgroundColor: palette.card,
                    minHeight: 52,
                  },
                ]}
              />
            ) : (
              <DateTimePicker
                value={draft}
                mode="date"
                display={Platform.OS === 'android' ? 'calendar' : 'spinner'}
                style={{ width: '100%', height: Platform.OS === 'android' ? 340 : 260 }}
                onChange={(_, nextDate) => {
                  if (nextDate) {
                    setDraft(nextDate);
                  }
                }}
              />
            )}
          </View>

          <View style={mainAppStyles.pickerFooter}>
            <Pressable style={[mainAppStyles.smallBtn, mainAppStyles.actionBtn, { borderColor: palette.border }]} onPress={onClear}>
              <View style={mainAppStyles.inlineAction}>
                <Ionicons name="trash-outline" size={16} color={palette.fg} />
                <Text style={{ color: palette.fg }}>Clear</Text>
              </View>
            </Pressable>
            <Pressable
              style={[mainAppStyles.smallBtn, mainAppStyles.actionBtn, { borderColor: palette.border, backgroundColor: palette.accent }]}
              onPress={() => onApply(draft)}
            >
              <View style={mainAppStyles.inlineAction}>
                <Ionicons name="checkmark-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff' }}>Apply</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
