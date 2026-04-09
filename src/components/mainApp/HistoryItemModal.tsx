import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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

export function HistoryItemModal({
  visible,
  mode,
  value,
  customLabel,
  ticketNumber,
  officeCode,
  notes,
  busy,
  palette,
  onClose,
  onChangeValue,
  onChangeLabel,
  onChangeTicket,
  onChangeOffice,
  onChangeNotes,
  onScanOffice,
  onSave,
}: {
  visible: boolean;
  mode: 'add' | 'edit';
  value: string;
  customLabel: string;
  ticketNumber: string;
  officeCode: string;
  notes: string;
  busy?: boolean;
  palette: Palette;
  onClose: () => void;
  onChangeValue: (value: string) => void;
  onChangeLabel: (value: string) => void;
  onChangeTicket: (value: string) => void;
  onChangeOffice: (value: string) => void;
  onChangeNotes: (value: string) => void;
  onScanOffice?: () => void;
  onSave: () => void;
}) {
  const [notesHeight, setNotesHeight] = React.useState(84);
  const isAdd = mode === 'add';
  const handleSaveShortcut = (event: unknown) => {
    const e = (event as { nativeEvent?: { key?: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean } })?.nativeEvent;
    if (!e) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
      onSave();
    }
  };

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={mainAppStyles.modalBackdrop} onPress={onClose}>
          <Pressable
            style={[
              mainAppStyles.modalForm,
              { backgroundColor: palette.card, borderColor: palette.border, maxWidth: 560, maxHeight: '86%', width: '100%', flex: 1, overflow: 'hidden' },
            ]}
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

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: 12, paddingBottom: 16 }}
              style={{ flex: 1 }}
            >
              <View style={mainAppStyles.formSection}>
                <Text style={[mainAppStyles.formLabel, { color: palette.fg }]}>Ticket</Text>
                <TextInput
                  value={ticketNumber}
                  onChangeText={onChangeTicket}
                  placeholder="INC..., RITM..., REQ..., SCTASK..."
                  placeholderTextColor={palette.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onKeyPress={handleSaveShortcut}
                  style={[
                    mainAppStyles.input,
                    mainAppStyles.formField,
                    { color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg },
                  ]}
                />
              </View>

              <View style={mainAppStyles.formSection}>
                <Text style={[mainAppStyles.formLabel, { color: palette.fg }]}>User</Text>
                <TextInput
                  value={customLabel}
                  onChangeText={onChangeLabel}
                  placeholder="Requested for / user"
                  placeholderTextColor={palette.muted}
                  autoCapitalize="words"
                  autoCorrect={false}
                  onKeyPress={handleSaveShortcut}
                  style={[
                    mainAppStyles.input,
                    mainAppStyles.formField,
                    { color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg },
                  ]}
                />
              </View>

              <View style={mainAppStyles.formSection}>
                <Text style={[mainAppStyles.formLabel, { color: palette.fg }]}>PI</Text>
                <TextInput
                  value={value}
                  onChangeText={onChangeValue}
                  placeholder="Paste PI code (example: 02PI20...)"
                  placeholderTextColor={palette.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onKeyPress={handleSaveShortcut}
                  style={[
                    mainAppStyles.input,
                    mainAppStyles.formField,
                    { color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg },
                  ]}
                />
              </View>

              <View style={mainAppStyles.formSection}>
                <View style={mainAppStyles.modalHeader}>
                  <Text style={[mainAppStyles.formLabel, { color: palette.fg, marginBottom: 0 }]}>Office</Text>
                  {onScanOffice ? (
                    <Pressable onPress={onScanOffice} hitSlop={8}>
                      <Text style={{ color: palette.accent, fontSize: 12, fontWeight: '700' }}>Scan office</Text>
                    </Pressable>
                  ) : null}
                </View>
                <TextInput
                  value={officeCode}
                  onChangeText={onChangeOffice}
                  placeholder="Office barcode or code"
                  placeholderTextColor={palette.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  onKeyPress={handleSaveShortcut}
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
                  onKeyPress={handleSaveShortcut}
                  onContentSizeChange={(event) => {
                    const nextHeight = Math.max(84, Math.min(220, Math.round(event.nativeEvent.contentSize.height) + 24));
                    setNotesHeight(nextHeight);
                  }}
                  style={[
                    mainAppStyles.input,
                    { minHeight: notesHeight, textAlignVertical: 'top', color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg },
                  ]}
                />
              </View>
            </ScrollView>

            <View style={[mainAppStyles.pickerFooterPinned, { borderTopColor: palette.border, paddingBottom: 10 }]}>
              <Text style={{ color: palette.muted, fontSize: 11, lineHeight: 15, flex: 1, minWidth: '100%' }}>
                {isAdd ? 'Save to add a compact history entry.' : 'Save changes to update this item.'}
              </Text>
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
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
