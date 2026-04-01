import React, { useMemo } from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect } from 'react-native-svg';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buildCodePreviewPlan,
  getBarcodeFormatLabel,
  renderBarcodeBits,
  normalizeCodeValue,
  type BarcodeFormat,
  type CodeType,
} from '../../core/barcode';
import { mainAppStyles } from './styles';

type Palette = {
  card: string;
  fg: string;
  muted: string;
  border: string;
  bg: string;
  accent: string;
};

function OneDBarcodePreview({
  value,
  format,
  width,
  height,
  margin,
}: {
  value: string;
  format: Exclude<BarcodeFormat, 'QR'>;
  width: number;
  height: number;
  margin: number;
}) {
  const bits = useMemo(() => renderBarcodeBits(value, format), [value, format]);

  const bars = useMemo(() => {
    if (!bits) return [];
    const availableWidth = Math.max(1, width - margin * 2);
    const moduleWidth = Math.max(2, Math.floor(availableWidth / bits.length));
    const totalWidth = bits.length * moduleWidth;
    const offset = Math.max(0, Math.floor((availableWidth - totalWidth) / 2));
    const modules: Array<{ x: number; w: number }> = [];
    let start = -1;

    for (let i = 0; i < bits.length; i += 1) {
      if (bits[i] === '1' && start < 0) {
        start = i;
      }
      const isEnd = i === bits.length - 1;
      if (start >= 0 && (bits[i] === '0' || isEnd)) {
        const end = bits[i] === '0' ? i : i + 1;
        modules.push({
          x: margin + offset + start * moduleWidth,
          w: (end - start) * moduleWidth,
        });
        start = -1;
      }
    }

    return modules;
  }, [bits, width, margin]);

  if (!bits) {
    return (
      <View style={[mainAppStyles.barcodePreviewFallback, { height }]}>
        <Text style={{ color: '#4b5563', textAlign: 'center', fontWeight: '600' }}>
          This value cannot be rendered as {format}.
        </Text>
      </View>
    );
  }

  const innerHeight = Math.max(1, height - margin * 2);
  const availableWidth = Math.max(1, width - margin * 2);
  const aspectRatio = availableWidth / innerHeight;

  return (
    <Svg
      width="100%"
      height={innerHeight}
      viewBox={`0 0 ${availableWidth} ${innerHeight}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ width: '100%', maxWidth: '100%', alignSelf: 'center', aspectRatio }}
    >
      {bars.map((bar, index) => (
        <Rect key={`${bar.x}-${index}`} x={bar.x - margin} y={0} width={bar.w} height={innerHeight} fill="#111" />
      ))}
    </Svg>
  );
}

function CodePreviewCard({
  label,
  children,
  palette,
}: {
  label: string;
  children: React.ReactNode;
  palette: Palette;
}) {
  return (
    <View
      style={[
        mainAppStyles.card,
        {
          marginBottom: 0,
          backgroundColor: '#fff',
          borderColor: palette.border,
          padding: 12,
          gap: 10,
          width: '100%',
        },
      ]}
    >
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
      <View
        style={[
          mainAppStyles.barcodePreviewShell,
          {
            backgroundColor: '#fff',
            borderColor: palette.border,
            width: '100%',
            maxWidth: '100%',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

export function BarcodeModal({
  visible,
  data,
  width,
  palette,
  preferredFormat,
  codeType,
  onClose,
}: {
  visible: boolean;
  data: string;
  width: number;
  palette: Palette;
  preferredFormat: BarcodeFormat;
  codeType?: CodeType;
  onClose: () => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const plan = useMemo(() => buildCodePreviewPlan(data, { preferredFormat, codeType }), [data, preferredFormat, codeType]);
  const normalized = normalizeCodeValue(data);
  const modalWidth = Math.min(Math.max(width - 24, 0), 420);
  const sheetMaxHeight = Math.min(windowHeight * 0.68, 520);
  const previewWidth = Math.max(1, modalWidth - 32);
  const previewHeight = Math.max(88, Math.min(116, Math.round(windowHeight * 0.13)));
  const qrSize = Math.min(modalWidth * 0.66, 220);
  const hasValue = Boolean(String(normalized || plan.value || '').trim());
  const isOffice = plan.codeType === 'office';

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={mainAppStyles.barcodeSheetBackdrop} onPress={onClose}>
        <Pressable
          style={[
            mainAppStyles.barcodeSheet,
            {
              width: '100%',
              maxWidth: modalWidth,
              maxHeight: sheetMaxHeight,
              backgroundColor: palette.card,
              borderColor: palette.border,
              paddingBottom: Math.max(insets.bottom, 12) + 12,
            },
          ]}
          onPress={() => null}
        >
          <View style={mainAppStyles.barcodeSheetHandle} />

          <View style={mainAppStyles.barcodeSheetHeader}>
            <View style={mainAppStyles.barcodeSheetHeaderText}>
              <Text style={[mainAppStyles.barcodeSheetTitle, { color: palette.fg }]}>Barcode</Text>
              <Text style={[mainAppStyles.barcodeSheetMeta, { color: palette.muted }]}>
                {isOffice ? 'Office code: Code128 + QR' : `Using: ${getBarcodeFormatLabel(plan.variants[0]?.barcodeFormat || 'CODE128')}`}
              </Text>
              <Text style={[mainAppStyles.barcodeSheetMeta, { color: palette.muted }]}>
                {isOffice
                  ? 'Both encodings carry the exact same value.'
                  : plan.codeType === 'pi'
                    ? 'PI values are rendered as Code128.'
                    : 'Ready to display and reuse.'}
              </Text>
            </View>

            <Pressable style={[mainAppStyles.barcodeSheetCloseBtn, { borderColor: palette.border }]} onPress={onClose}>
              <Ionicons name="close" size={16} color={palette.fg} />
            </Pressable>
          </View>

          <View style={mainAppStyles.barcodeSheetBody}>
            {!hasValue ? (
              <View style={[mainAppStyles.barcodePreviewFallback, { minHeight: 120 }]}>
                <Text style={{ color: palette.muted, textAlign: 'center', fontWeight: '600' }}>No value to generate.</Text>
              </View>
            ) : (
              plan.variants.map((variant) => (
                <CodePreviewCard key={`${variant.kind}-${variant.label}`} label={variant.label} palette={palette}>
                  {variant.kind === 'qr' ? (
                    <QRCode value={variant.value} size={qrSize} backgroundColor="#fff" color="#111" />
                  ) : variant.barcodeFormat ? (
                    <OneDBarcodePreview
                      value={variant.value}
                      format={variant.barcodeFormat}
                      width={previewWidth}
                      height={previewHeight}
                      margin={10}
                    />
                  ) : null}
                </CodePreviewCard>
              ))
            )}

            <Text style={[mainAppStyles.barcodeRawValue, { color: palette.fg }]} numberOfLines={2}>
              {normalized || plan.value || data}
            </Text>

            <Text style={[mainAppStyles.barcodeSheetNote, { color: palette.muted }]}>
              Saved in history. This value can be copied or regenerated later.
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
