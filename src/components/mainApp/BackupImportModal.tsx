import React from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { mainAppStyles } from './styles';

type Palette = {
  bg: string;
  card: string;
  fg: string;
  muted: string;
  border: string;
};

export function BackupImportModal({
  visible,
  text,
  busy,
  palette,
  onTextChange,
  onPasteClipboard,
  onImport,
  onClose,
}: {
  visible: boolean;
  text: string;
  busy: boolean;
  palette: Palette;
  onTextChange: (value: string) => void;
  onPasteClipboard: () => void;
  onImport: () => void;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={mainAppStyles.modalBackdrop} onPress={onClose}>
        <Pressable style={[mainAppStyles.backupModal, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={() => null}>
          <Text style={[mainAppStyles.sectionTitle, { color: palette.fg, marginBottom: 8 }]}>Import backup</Text>
          <Text style={{ color: palette.muted, fontSize: 12, marginBottom: 12 }}>
            Paste the JSON backup here. Settings and templates are replaced. History is merged without duplicates.
          </Text>
          <TextInput
            value={text}
            onChangeText={onTextChange}
            placeholder="Paste backup JSON"
            multiline
            textAlignVertical="top"
            placeholderTextColor={palette.muted}
            style={[mainAppStyles.input, mainAppStyles.backupInput, { color: palette.fg, borderColor: palette.border, backgroundColor: palette.bg }]}
          />
          <View style={mainAppStyles.rowButtons}>
            <Pressable
              style={[mainAppStyles.smallBtn, mainAppStyles.actionBtn, { borderColor: palette.border }]}
              onPress={onPasteClipboard}
              disabled={busy}
            >
              <View style={mainAppStyles.inlineAction}>
                <Ionicons name="clipboard-outline" size={16} color={palette.fg} />
                <Text style={{ color: palette.fg }}>{busy ? 'Working...' : 'Paste clipboard'}</Text>
              </View>
            </Pressable>
            <Pressable
              style={[mainAppStyles.smallBtn, mainAppStyles.actionBtn, { borderColor: palette.border, opacity: busy ? 0.5 : 1 }]}
              onPress={onImport}
              disabled={busy}
            >
              <View style={mainAppStyles.inlineAction}>
                <Ionicons name="cloud-upload-outline" size={16} color={palette.fg} />
                <Text style={{ color: palette.fg }}>Import</Text>
              </View>
            </Pressable>
            <Pressable style={[mainAppStyles.smallBtn, mainAppStyles.actionBtn, { borderColor: palette.border }]} onPress={onClose}>
              <View style={mainAppStyles.inlineAction}>
                <Ionicons name="close-outline" size={16} color={palette.fg} />
                <Text style={{ color: palette.fg }}>Cancel</Text>
              </View>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
