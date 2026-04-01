import React from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { mainAppStyles } from './styles';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

type ItemType = 'PI' | 'OFFICE' | 'OTHER';

export function HistoryItemModal({
  visible,
  mode,
  value,
  type,
  customLabel,
  ticketNumber,
  officeCode,
  notes,
  busy,
  palette,
  onClose,
  onChangeValue,
  onChangeType,
  onChangeLabel,
  onChangeTicket,
  onChangeOffice,
  onChangeNotes,
  onScanOffice,
  onSave,
  onSaveBarcode,
  onSaveQr,
}: {
  visible: boolean;
  mode: 'add' | 'edit';
  value: string;
  type: ItemType;
  customLabel: string;
  ticketNumber: string;
  officeCode: string;
  notes: string;
  busy?: boolean;
  palette: Palette;
  onClose: () => void;
  onChangeValue: (value: string) => void;
  onChangeType: (type: ItemType) => void;
  onChangeLabel: (value: string) => void;
  onChangeTicket: (value: string) => void;
  onChangeOffice: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onScanOffice?: () => void;
  onSave: () => void;
  onSaveBarcode?: () => void;
  onSaveQr?: () => void;
}) {
  const isAdd = mode === 'add';
  const typeOptions: ItemType[] = ['PI', 'OFFICE', 'OTHER'];
  const isPiType = type === 'PI';
  const valueLabel = isPiType ? 'PI Code' : 'Value';
  const valuePlaceholder = isPiType ? 'Paste PI code (example: 02PI20...)' : 'Enter value';

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={mainAppStyles.modalBackdrop} onPress={onClose}>
        <Pressable
          style={[mainAppStyles.modalForm, { backgroundColor: palette.card, borderColor: palette.border }]}
          onPress={() => null}
        >
          <View style={mainAppStyles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>
                {isAdd ? 'Add Item' : 'Edit Item'}
              </Text>
              <Text style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>
                {isAdd ? 'Save a manual history entry.' : 'Update the selected history item.'}
              </Text>
            </View>
            <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={onClose}>
              <Ionicons name="close" size={18} color={palette.fg} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 8 }}>
            <View style={mainAppStyles.formSection}>
              <Text style={[mainAppStyles.formLabel, { color: palette.fg }]}>Type</Text>
              <View style={mainAppStyles.formRow}>
                {typeOptions.map((option) => {
                  const selected = type === option;
                  return (
                    <Pressable
                      key={option}
                      style={[
                        mainAppStyles.filterChipCompact,
                        selected ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 },
                      ]}
                      onPress={() => onChangeType(option)}
                    >
                      <Text style={{ color: selected ? '#fff' : palette.fg, fontSize: 12, fontWeight: '700' }}>
                        {option}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={mainAppStyles.formSection}>
              <Text style={[mainAppStyles.formLabel, { color: palette.fg }]}>{valueLabel}</Text>
              <TextInput
                value={value}
                onChangeText={onChangeValue}
                placeholder={valuePlaceholder}
                placeholderTextColor={palette.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[
                  mainAppStyles.input,
                  mainAppStyles.formField,
                  { color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg },
                ]}
              />
              {isPiType ? (
                <Text style={{ marginTop: 6, fontSize: 11, lineHeight: 16, color: palette.muted }}>
                  Paste the PI identifier in this field. It will be saved as a PI record.
                </Text>
              ) : null}
            </View>

            <View style={mainAppStyles.formSection}>
              <Text style={[mainAppStyles.formLabel, { color: palette.fg }]}>Label / Name</Text>
              <TextInput
                value={customLabel}
                onChangeText={onChangeLabel}
                placeholder="Optional friendly label"
                placeholderTextColor={palette.muted}
                autoCapitalize="words"
                autoCorrect={false}
                style={[
                  mainAppStyles.input,
                  mainAppStyles.formField,
                  { color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg },
                ]}
              />
            </View>

            <View style={mainAppStyles.formSection}>
              <Text style={[mainAppStyles.formLabel, { color: palette.fg }]}>Notes</Text>
              <TextInput
                value={notes}
                onChangeText={onChangeNotes}
                placeholder="Optional notes"
                placeholderTextColor={palette.muted}
                autoCapitalize="sentences"
                autoCorrect
                multiline
                numberOfLines={3}
                style={[
                  mainAppStyles.input,
                  { minHeight: 84, textAlignVertical: 'top', color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg },
                ]}
              />
            </View>

            <View style={mainAppStyles.formSection}>
              <Text style={[mainAppStyles.formLabel, { color: palette.fg }]}>Ticket number</Text>
              <TextInput
                value={ticketNumber}
                onChangeText={onChangeTicket}
                placeholder="INC..., RITM..., REQ..., SCTASK..."
                placeholderTextColor={palette.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[
                  mainAppStyles.input,
                  mainAppStyles.formField,
                  { color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg },
                ]}
              />
            </View>

            <View style={mainAppStyles.formSection}>
              <View style={mainAppStyles.modalHeader}>
                <Text style={[mainAppStyles.formLabel, { color: palette.fg, marginBottom: 0 }]}>Office code</Text>
                {onScanOffice ? (
                  <Pressable onPress={onScanOffice}>
                    <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>Scan office</Text>
                  </Pressable>
                ) : null}
              </View>
              <TextInput
                value={officeCode}
                onChangeText={onChangeOffice}
                placeholder="Optional office barcode or code"
                placeholderTextColor={palette.muted}
                autoCapitalize="characters"
                autoCorrect={false}
                style={[
                  mainAppStyles.input,
                  mainAppStyles.formField,
                  { color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg },
                ]}
              />
            </View>

          </ScrollView>

          <View style={[mainAppStyles.pickerFooterPinned, { borderTopColor: palette.border }]}>
            {isAdd ? (
              <>
                <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 15, flex: 1, minWidth: '100%' }}>
                  Office entries are saved as Code128 and can also preview a QR code.
                </Text>
                <Pressable
                  style={[
                    mainAppStyles.smallBtn,
                    mainAppStyles.actionBtn,
                    { borderColor: palette.border, opacity: busy ? 0.5 : 1 },
                  ]}
                  onPress={onSave}
                  disabled={busy}
                >
                  <View style={mainAppStyles.inlineAction}>
                    <Ionicons name="save-outline" size={16} color={palette.fg} />
                    <Text style={{ color: palette.fg }}>Save</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[
                    mainAppStyles.smallBtn,
                    mainAppStyles.actionBtn,
                    { borderColor: palette.border, opacity: busy || !onSaveBarcode ? 0.5 : 1 },
                  ]}
                  onPress={onSaveBarcode}
                  disabled={busy || !onSaveBarcode}
                >
                  <View style={mainAppStyles.inlineAction}>
                    <Ionicons name="barcode-outline" size={16} color={palette.fg} />
                    <Text style={{ color: palette.fg }}>Save + Barcode</Text>
                  </View>
                </Pressable>
                <Pressable
                  style={[
                    mainAppStyles.smallBtn,
                    mainAppStyles.actionBtn,
                    { borderColor: palette.border, opacity: busy || !onSaveQr ? 0.5 : 1 },
                  ]}
                  onPress={onSaveQr}
                  disabled={busy || !onSaveQr}
                >
                  <View style={mainAppStyles.inlineAction}>
                    <Ionicons name="qr-code-outline" size={16} color={palette.fg} />
                    <Text style={{ color: palette.fg }}>Save + QR</Text>
                  </View>
                </Pressable>
              </>
            ) : (
              <Pressable
                style={[
                  mainAppStyles.smallBtn,
                  mainAppStyles.actionBtn,
                  { borderColor: palette.border, opacity: busy ? 0.5 : 1, flex: 1 },
                ]}
                onPress={onSave}
                disabled={busy}
              >
                <View style={mainAppStyles.inlineAction}>
                  <Ionicons name="save-outline" size={16} color={palette.fg} />
                  <Text style={{ color: palette.fg }}>Save</Text>
                </View>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
