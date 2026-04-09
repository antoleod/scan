import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  imageScanPreviewUri,
  imageScanBusy,
  onClearImagePreview,
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
  imageScanPreviewUri: string | null;
  imageScanBusy: boolean;
  onClearImagePreview: () => void;
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
  const { height, width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const cameraHeight = isDesktop ? Math.max(420, Math.round(height * 0.58)) : Math.max(320, Math.round(height * 0.65));
  const [toastVisible, setToastVisible] = React.useState(false);
  const lastCameraEventRef = React.useRef<{ data: string; ts: number }>({ data: '', ts: 0 });
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
    <ScrollView style={styles.root} contentContainerStyle={[styles.scrollContent, isDesktop ? styles.scrollContentDesktop : null]} showsVerticalScrollIndicator={false} bounces>
      <ScanFeedbackBanner feedback={scanFeedback} />
      <Animated.View style={[styles.toastTop, isDesktop ? styles.toastTopDesktop : null, toastStyle]}>
        <Text style={styles.toastTitle}>Scanning is taking longer than expected</Text>
        <Text style={styles.toastSubtitle}>Capture a photo to extract the code quickly.</Text>
        <Pressable style={styles.toastBtn} onPress={onTakePicture} disabled={manualCaptureBusy}>
          {manualCaptureBusy ? <ActivityIndicator size="small" color={C.accent} /> : <Text style={styles.toastBtnText}>Take photo</Text>}
        </Pressable>
      </Animated.View>
      {!cameraPermissionGranted ? (
        <View style={styles.permissionBox}>
          <Text style={styles.permissionText}>Camera permission required</Text>
          <Pressable style={styles.allowBtn} onPress={requestCameraPermission}>
            <Ionicons name="camera-outline" size={16} color="#fff" />
            <Text style={styles.allowBtnText}>Allow camera</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[styles.cameraArea, isDesktop ? styles.cameraAreaDesktop : null, { height: cameraHeight }]}>
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
              const now = Date.now();
              const value = String(event.data || '');
              if (!value) return;
              if (value === lastCameraEventRef.current.data && now - lastCameraEventRef.current.ts < 300) return;
              lastCameraEventRef.current = { data: value, ts: now };
              onBarcodeScanned(event.data);
            }}
          />
          <ScanViewfinder torchEnabled={torchEnabled} onToggleTorch={onToggleTorch} isDesktop={isDesktop} />
        </View>
      )}

      <View style={[styles.bottomPanel, isDesktop ? styles.bottomPanelDesktop : null]}>
        <View style={styles.scanStatusRow}>
          <View style={[styles.scanDot, { backgroundColor: cameraActive ? '#22c55e' : C.muted }]} />
          <Text style={styles.scanStatusText}>{cameraActive ? (scanState === 'scanning' || scanState === 'detecting' ? 'Scanning active' : 'Scanner ready') : 'Scanner paused'}</Text>
        </View>
        <View style={styles.modeRow}>
          <Pressable style={[styles.modeBtn, styles.modeBtnActive]}>
            <Ionicons name="barcode-outline" size={14} color="#fff" />
            <Text style={[styles.modeText, styles.modeTextActive]}>Barcode</Text>
          </Pressable>
          <Pressable style={styles.modeBtn} onPress={onScanFromImage}>
            <Ionicons name="image-outline" size={14} color={C.muted} />
            <Text style={styles.modeText}>Image Scan</Text>
          </Pressable>
          <Pressable style={styles.modeBtn} onPress={onScanFromNfc} disabled={nfcBusy}>
            <MaterialCommunityIcons name="nfc-variant" size={14} color={C.tertiary} />
            <Text style={[styles.modeText, styles.modeTextTertiary]}>{nfcBusy ? 'Reading...' : nfcReady ? 'NFC' : 'NFC'}</Text>
          </Pressable>
        </View>

        {imageScanPreviewUri ? (
          <View style={styles.previewCard}>
            <Image source={{ uri: imageScanPreviewUri }} style={styles.previewImage} resizeMode="cover" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.previewTitle}>{imageScanBusy ? 'Reading selected photo...' : 'Selected photo loaded'}</Text>
              <Text style={styles.previewSubtitle}>
                {imageScanBusy ? 'Searching barcode/QR in image.' : 'You can select another image or clear this preview.'}
              </Text>
            </View>
            <Pressable style={styles.previewClearBtn} onPress={onClearImagePreview}>
              <Ionicons name="close" size={16} color={C.muted} />
            </Pressable>
          </View>
        ) : null}

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    flexGrow: 1,
  },
  scrollContentDesktop: {
    paddingHorizontal: 12,
    paddingBottom: 18,
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
    minHeight: 44,
    justifyContent: 'center',
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
  cameraAreaDesktop: {
    alignSelf: 'center',
    maxWidth: 920,
    borderRadius: 20,
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  cameraCompact: {
    minHeight: 260,
  },
  bottomPanel: {
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: C.panel,
    paddingTop: 12,
    paddingBottom: 14,
  },
  bottomPanelDesktop: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 920,
    marginTop: 12,
    borderRadius: 20,
    overflow: 'hidden',
  },
  scanStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  scanDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
  },
  scanStatusText: {
    color: C.text,
    fontSize: 12,
    fontWeight: '600',
  },
  toastTop: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.toastBorder,
    backgroundColor: C.toast,
    padding: 12,
    gap: 8,
  },
  toastTopDesktop: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 920,
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
    minHeight: 44,
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
  previewCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.chip,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewImage: {
    width: 56,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#0b0b0b',
  },
  previewTitle: {
    color: C.text,
    fontSize: 12,
    fontWeight: '700',
  },
  previewSubtitle: {
    color: C.muted,
    fontSize: 11,
    lineHeight: 15,
  },
  previewClearBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
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
    minHeight: 44,
    justifyContent: 'center',
  },
  toastBtnText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '600',
  },
});

