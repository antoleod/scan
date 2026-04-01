import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';
import type { BarcodeType } from 'expo-camera';
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

export function OfficeScanModal({
  visible,
  palette,
  cameraPermissionGranted,
  requestCameraPermission,
  cameraBarcodeTypes,
  onClose,
  onDetected,
}: {
  visible: boolean;
  palette: Palette;
  cameraPermissionGranted: boolean | undefined;
  requestCameraPermission: () => void;
  cameraBarcodeTypes: BarcodeType[];
  onClose: () => void;
  onDetected: (value: string) => void;
}) {
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      lockedRef.current = false;
    }
  }, [visible]);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={mainAppStyles.officeScanBackdrop} onPress={onClose}>
        <Pressable style={[mainAppStyles.officeScanModal, { backgroundColor: palette.card, borderColor: palette.border }]} onPress={() => null}>
          <View style={mainAppStyles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[mainAppStyles.sectionTitle, { color: palette.fg }]}>Scan office</Text>
              <Text style={{ color: palette.muted, fontSize: 12, marginTop: 4 }}>
                Point the camera at the office barcode or code.
              </Text>
            </View>
            <Pressable style={[mainAppStyles.modalCloseBtn, { borderColor: palette.border }]} onPress={onClose}>
              <Ionicons name="close" size={18} color={palette.fg} />
            </Pressable>
          </View>

          {!cameraPermissionGranted ? (
            <View style={[mainAppStyles.officeScanEmpty, { borderColor: palette.border }]}>
              <Text style={{ color: palette.fg, fontWeight: '700', textAlign: 'center' }}>Camera permission required</Text>
              <Pressable style={[mainAppStyles.btn, { marginTop: 12, backgroundColor: palette.accent }]} onPress={requestCameraPermission}>
                <View style={mainAppStyles.btnContent}>
                  <Ionicons name="camera-outline" size={18} color="#fff" />
                  <Text style={mainAppStyles.btnText}>Allow camera</Text>
                </View>
              </Pressable>
            </View>
          ) : (
            <View style={[mainAppStyles.officeScanCameraShell, { borderColor: palette.border, backgroundColor: '#000' }]}>
              <CameraView
                style={mainAppStyles.officeScanCamera}
                facing="back"
                autofocus="on"
                active={visible}
                barcodeScannerSettings={{ barcodeTypes: cameraBarcodeTypes }}
                onBarcodeScanned={(event) => {
                  if (lockedRef.current) return;
                  const value = String(event.data || '').trim();
                  if (!value) return;
                  lockedRef.current = true;
                  onDetected(value);
                }}
              />
              <View style={mainAppStyles.officeScanOverlay} pointerEvents="none">
                <View style={mainAppStyles.officeScanFrame} />
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center' }}>
                  Scan the office barcode
                </Text>
              </View>
            </View>
          )}

          <View style={mainAppStyles.officeScanFooter}>
            <Text style={{ color: palette.muted, fontSize: 11, flex: 1 }}>
              The scanned value will be saved into the office field.
            </Text>
            <Pressable style={[mainAppStyles.smallBtn, { borderColor: palette.border }]} onPress={onClose}>
              <Text style={{ color: palette.fg, fontWeight: '700' }}>Cancel</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
