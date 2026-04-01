import React from 'react';
import { ActivityIndicator, Animated, Platform, Pressable, Text, View } from 'react-native';
import { CameraView } from 'expo-camera';
import type { BarcodeType } from 'expo-camera';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { ScanState } from '../../../types';
import { mainAppStyles } from '../styles';
import { ScanFeedbackBanner } from '../ScanFeedbackBanner';

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
  palette,
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
  laserAnim,
  laserDuration,
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
  laserAnim: Animated.Value;
  laserDuration: number;
  onBarcodeScanned: (data: string) => void;
}) {
  const statusLabel =
    scanState === 'detecting'
      ? 'Detectando...'
      : scanState === 'success'
        ? 'Código detectado'
        : scanState === 'timeout'
          ? 'El escaneo está tardando'
          : scanState === 'saving_photo'
            ? 'Guardando foto...'
            : scanState === 'saved'
              ? 'Foto guardada'
              : scanState === 'error'
                ? 'Error de escaneo'
                : 'Apunta al código para escanear';

  return (
    <View style={mainAppStyles.screen}>
      <ScanFeedbackBanner feedback={scanFeedback} palette={palette} />
      {!cameraPermissionGranted ? (
        <View style={mainAppStyles.center}>
          <Text style={{ color: palette.fg, marginBottom: 12 }}>Camera permission required</Text>
          <Pressable style={[mainAppStyles.btn, mainAppStyles.actionBtn, { backgroundColor: palette.accent }]} onPress={requestCameraPermission}>
            <View style={mainAppStyles.btnContent}>
              <Ionicons name="camera-outline" size={18} color="#fff" />
              <Text style={mainAppStyles.btnText}>Allow camera</Text>
            </View>
          </Pressable>
        </View>
      ) : (
        <View style={[mainAppStyles.cameraContainer, { backgroundColor: '#000' }]}>
          <CameraView
            ref={cameraRef}
            style={[mainAppStyles.camera, isCompactLayout ? mainAppStyles.cameraCompact : null, { borderColor: palette.border }]}
            facing="back"
            autofocus="on"
            active={cameraActive}
            enableTorch={torchEnabled}
            ratio={Platform.OS === 'android' ? '4:3' : undefined}
            barcodeScannerSettings={{ barcodeTypes: cameraBarcodeTypes }}
            onCameraReady={onCameraReady}
            onBarcodeScanned={(event) => {
              onBarcodeScanned(event.data);
            }}
          />
          <View style={mainAppStyles.viewfinderContainer} pointerEvents="none">
            <View style={mainAppStyles.viewfinderTop} />
            <View style={mainAppStyles.viewfinderMiddle}>
              <View style={mainAppStyles.viewfinderSide} />
              <View style={mainAppStyles.viewfinderCenter}>
                <View style={[mainAppStyles.viewfinderCorner, mainAppStyles.viewfinderCornerTL]} />
                <View style={[mainAppStyles.viewfinderCorner, mainAppStyles.viewfinderCornerTR]} />
                <View style={[mainAppStyles.viewfinderCorner, mainAppStyles.viewfinderCornerBL]} />
                <View style={[mainAppStyles.viewfinderCorner, mainAppStyles.viewfinderCornerBR]} />
                <Animated.View
                  style={[
                    mainAppStyles.laser,
                    {
                      backgroundColor: palette.accent,
                      shadowColor: palette.accent,
                      top: laserAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['5%', '95%'],
                      }),
                    },
                  ]}
                />
              </View>
              <View style={mainAppStyles.viewfinderSide} />
            </View>
            <View style={mainAppStyles.viewfinderBottom}>
              <View style={mainAppStyles.viewfinderPill}>
                <Text style={mainAppStyles.viewfinderText}>{statusLabel}</Text>
              </View>
            </View>
          </View>

          <View style={mainAppStyles.cameraOverlayActions} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={torchEnabled ? 'Disable torch' : 'Enable torch'}
              onPress={onToggleTorch}
              style={[mainAppStyles.cameraAction, { backgroundColor: palette.card, borderColor: palette.border }]}
            >
              <Ionicons name={torchEnabled ? 'flash' : 'flash-outline'} size={18} color={palette.fg} />
            </Pressable>
          </View>
        </View>
      )}

      {showManualCapture && (
        <View style={[mainAppStyles.scanFallbackCard, { backgroundColor: palette.card, borderColor: palette.accent }]}>
          <Text style={[mainAppStyles.scanFallbackTitle, { color: palette.fg }]}>El escaneo está tardando</Text>
          <Text style={[mainAppStyles.scanFallbackText, { color: palette.muted }]}>
            Puedes tomar una foto y guardarla localmente para procesarla o revisarla después.
          </Text>
          <Pressable
            style={[
              mainAppStyles.btn,
              mainAppStyles.scanPrimaryBtn,
              { backgroundColor: palette.accent, opacity: manualCaptureBusy ? 0.75 : 1 },
            ]}
            onPress={onTakePicture}
            disabled={manualCaptureBusy}
          >
            <View style={mainAppStyles.btnContent}>
              {manualCaptureBusy ? <ActivityIndicator color="#fff" /> : <Ionicons name="camera" size={18} color="#fff" />}
              <Text style={mainAppStyles.btnText}>{manualCaptureBusy ? 'Saving...' : 'Tomar foto'}</Text>
            </View>
          </Pressable>
        </View>
      )}

      <View style={mainAppStyles.rowButtons}>
        <Pressable style={[mainAppStyles.btn, mainAppStyles.actionBtn, { flex: 1, backgroundColor: palette.card, borderColor: palette.border }]} onPress={onScanFromImage}>
          <View style={mainAppStyles.btnContent}>
            <Ionicons name="images-outline" size={19} color={palette.fg} />
            <Text style={[mainAppStyles.btnText, { color: palette.fg }]}>Image scan</Text>
          </View>
        </Pressable>
        <Pressable
          style={[
            mainAppStyles.btn,
            mainAppStyles.actionBtn,
            { flex: 1, backgroundColor: palette.card, borderColor: palette.border, opacity: nfcBusy ? 0.7 : 1 },
          ]}
          onPress={onScanFromNfc}
          disabled={nfcBusy}
        >
          <View style={mainAppStyles.btnContent}>
            <MaterialCommunityIcons name="nfc-variant" size={19} color={palette.fg} />
            <Text style={[mainAppStyles.btnText, { color: palette.fg }]}>{nfcBusy ? 'Reading NFC...' : nfcReady ? 'NFC' : 'NFC (setup)'}</Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
