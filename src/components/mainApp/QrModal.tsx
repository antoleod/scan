import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

import { mainAppStyles } from './styles';

type Palette = {
  card: string;
  bg: string;
  fg: string;
  muted: string;
  border: string;
};

export function QrModal({
  visible,
  data,
  width,
  palette,
  onClose,
}: {
  visible: boolean;
  data: string;
  width: number;
  palette: Palette;
  onClose: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={mainAppStyles.modalBackdrop} onPress={onClose}>
        <Pressable style={[mainAppStyles.previewModal, { width: Math.min(width * 0.92, 380), backgroundColor: palette.card, borderColor: palette.border }]} onPress={() => null}>
          <View style={mainAppStyles.previewHeader}>
            <View>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>QR Code</Text>
              <Text style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>Tap outside or close to dismiss.</Text>
            </View>
            <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={onClose}>
              <Ionicons name="close" size={18} color={palette.fg} />
            </Pressable>
          </View>
          <View style={[mainAppStyles.qrContainer, { backgroundColor: '#fff', borderColor: palette.border, borderWidth: 1 }]}>
            <QRCode value={data} size={Math.min(width * 0.62, 250)} backgroundColor="#fff" color="#111" />
          </View>
          <Text style={{ color: palette.muted, marginTop: 16, fontSize: 12, textAlign: 'center' }}>Scan this code to import</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
