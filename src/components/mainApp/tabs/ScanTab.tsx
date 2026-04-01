import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CameraView } from 'expo-camera';
import type { BarcodeType } from 'expo-camera';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { ScanState } from '../../../types';
import { ScanFeedbackBanner } from '../ScanFeedbackBanner';
import { ScanViewfinder } from '../ScanViewfinder';

const C = {
  bg: '#111111',
  panel: '#161616',
  accent: '#FF6B00',
  text: '#e6e6e6',
  muted: '#999999',
  tertiary: '#777777',
  border: '#2c2c2c',
  chip: '#1e1e1e',
  toast: '#1e1e1e',
  toastBorder: 'rgba(255,107,0,0.4)',
};

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

type Feedback = {
  type: 'success' | 'duplicate' | 'error';
  message: string;
} | null;

export function ScanTab({
  palette: _palette,
  isCompactLayout,
  cameraPermissionGranted,
  requestCameraPermission,
  cameraRef,
  cameraBarcodeTypes,
  scanFeedback,
  onScanFromImage,
  onTakePicture,
  onScanFromNfc,
  nfcBusy,
  nfcReady,
  scanState,
  showManualCapture,
  manualCaptureBusy,
  cameraActive,
  torchEnabled,
  onToggleTorch,
  onCameraReady,
  laserAnim: _laserAnim,
  laserDuration: _laserDuration,
  onBarcodeScanned,
}: {
  palette: Palette;
  isCompactLayout: boolean;
  cameraPermissionGranted: boolean | undefined;
  requestCameraPermission: () => void;
  cameraRef: React.RefObject<CameraView | null>;
  cameraBarcodeTypes: BarcodeType[];
  scanFeedback: Feedback;
  onScanFromImage: () => void;
  onTakePicture: () => void;
  onScanFromNfc: () => void;
  nfcBusy: boolean;
  nfcReady: boolean;
  scanState: ScanState;
  showManualCapture: boolean;
  manualCaptureBusy: boolean;
  cameraActive: boolean;
  torchEnabled: boolean;
  onToggleTorch: () => void;
  onCameraReady: () => void;
  laserAnim: unknown;
  laserDuration: number;
  onBarcodeScanned: (data: string) => void;
}) {
  const { height } = useWindowDimensions();
  const cameraHeight = Math.max(320, Math.round(height * 0.65));
  const [toastVisible, setToastVisible] = React.useState(false);
  const toastY = useSharedValue(60);

  React.useEffect(() => {
    if (scanState === 'success') {
      setToastVisible(false);
      toastY.value = withTiming(60, { duration: 180 });
      return;
    }

    if (!showManualCapture) {
      setToastVisible(false);
      toastY.value = withTiming(60, { duration: 180 });
      return;
    }

    setToastVisible(true);
    toastY.value = withTiming(0, { duration: 220 });
    const timer = setTimeout(() => {
      setToastVisible(false);
      toastY.value = withTiming(60, { duration: 180 });
    }, 5000);
    return () => clearTimeout(timer);
  }, [scanState, showManualCapture, toastY]);

  const toastStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: toastY.value }],
    opacity: toastVisible ? 1 : 0,
  }));

  return (
    <View style={styles.root}>
      <ScanFeedbackBanner feedback={scanFeedback} palette={{ accent: C.accent }} />
      {!cameraPermissionGranted ? (
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>Camera permission required</Text>
          <Pressable style={styles.allowBtn} onPress={requestCameraPermission}>
            <Ionicons name="camera-outline" size={16} color="#fff" />
            <Text style={styles.allowBtnText}>Allow camera</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.cameraArea, { height: cameraHeight }]}>
          <CameraView
            ref={cameraRef}
            style={[styles.camera, isCompactLayout ? styles.cameraCompact : null]}
            facing="back"
            autofocus="on"
            active={cameraActive}
            enableTorch={torchEnabled}
            ratio="4:3"
            barcodeScannerSettings={{ barcodeTypes: cameraBarcodeTypes }}
            onCameraReady={onCameraReady}
            onBarcodeScanned={(event) => {
              onBarcodeScanned(event.data);
            }}
          />
          <ScanViewfinder torchEnabled={torchEnabled} onToggleTorch={onToggleTorch} />
        </View>
      )}

      <View style={styles.bottomPanel}>
        <View style={styles.modeRow}>
          <Pressable style={[styles.modeBtn, styles.modeBtnActive]}>
            <Ionicons name="barcode-outline" size={14} color="#fff" />
            <Text style={[styles.modeText, styles.modeTextActive]}>Barcode</Text>
          </Pressable>
          <Pressable style={styles.modeBtn} onPress={onScanFromImage}>
            <Ionicons name="images-outline" size={14} color={C.muted} />
            <Text style={styles.modeText}>Image scan</Text>
          </Pressable>
          <Pressable style={styles.modeBtn} onPress={onScanFromNfc} disabled={nfcBusy}>
            <MaterialCommunityIcons name="nfc-variant" size={14} color={C.tertiary} />
            <Text style={[styles.modeText, styles.modeTextTertiary]}>{nfcBusy ? 'Reading...' : nfcReady ? 'NFC' : 'NFC'}</Text>
          </Pressable>
        </View>

        <Animated.View style={[styles.toast, toastStyle]}>
          <Text style={styles.toastTitle}>Scanning is taking too long</Text>
          <Text style={styles.toastSubtitle}>You can capture the code with a photo and process it now.</Text>
          <Pressable style={styles.toastBtn} onPress={onTakePicture} disabled={manualCaptureBusy}>
            {manualCaptureBusy ? <ActivityIndicator size="small" color={C.accent} /> : <Text style={styles.toastBtnText}>Take photo</Text>}
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  permissionText: {
    color: C.text,
    fontSize: 14,
  },
  allowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.accent,
  },
  allowBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  cameraArea: {
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraCompact: {
    minHeight: 260,
  },
  bottomPanel: {
    flex: 1,
    backgroundColor: C.panel,
    paddingTop: 12,
    paddingBottom: 14,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 10,
    paddingVertical: 9,
    backgroundColor: C.chip,
    borderWidth: 1,
    borderColor: C.border,
  },
  modeBtnActive: {
    backgroundColor: C.accent,
    borderColor: C.accent,
  },
  modeText: {
    fontSize: 12,
    fontWeight: '500',
    color: C.muted,
  },
  modeTextActive: {
    color: '#fff',
  },
  modeTextTertiary: {
    color: C.tertiary,
  },
  toast: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.toastBorder,
    backgroundColor: C.toast,
    padding: 12,
    gap: 8,
  },
  toastTitle: {
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
  },
  toastSubtitle: {
    color: C.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  toastBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  toastBtnText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '600',
  },
});
