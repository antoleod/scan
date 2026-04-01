declare const require: any;

import type { BarcodeType } from 'expo-camera';

export type BarcodeFormat = 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'QR';
export type CodeType = 'pi' | 'office' | 'other';
export type CodeFormat = 'code128' | 'qr' | 'other';

export const DEFAULT_BARCODE_FORMAT: BarcodeFormat = 'CODE128';

export const BARCODE_FORMAT_OPTIONS: Array<{ value: BarcodeFormat; label: string; helper?: string }> = [
  { value: 'CODE128', label: 'Code128', helper: 'Recommended for PI and Office' },
  { value: 'CODE39', label: 'Code39' },
  { value: 'EAN13', label: 'EAN-13' },
  { value: 'EAN8', label: 'EAN-8' },
  { value: 'QR', label: 'QR', helper: 'Recommended for Office scanning' },
];

export const SCAN_BARCODE_TYPES: BarcodeType[] = ['qr', 'code128', 'code39', 'ean13', 'ean8'];

export interface BarcodeGenerationResult {
  value: string;
  requestedFormat: BarcodeFormat;
  finalFormat: BarcodeFormat;
  forced: boolean;
  reason: string | null;
}

export interface CodePreviewVariant {
  kind: 'barcode' | 'qr';
  label: string;
  value: string;
  barcodeFormat?: Exclude<BarcodeFormat, 'QR'>;
}

export interface CodePreviewPlan {
  value: string;
  codeType: CodeType;
  codeFormat: CodeFormat;
  variants: CodePreviewVariant[];
}

type BarcodeEncoderCtor = new (data: string, options: Record<string, unknown>) => { encode: () => { data?: string } };

let cachedBarcodes: Record<string, BarcodeEncoderCtor> | null = null;

function getBarcodes(): Record<string, BarcodeEncoderCtor> | null {
  if (cachedBarcodes) return cachedBarcodes;

  try {
    const loaded = require('jsbarcode/bin/JsBarcode.js');
    if (typeof loaded?.getModule === 'function') {
      cachedBarcodes = {
        CODE128: loaded.getModule('CODE128'),
        CODE39: loaded.getModule('CODE39'),
        EAN13: loaded.getModule('EAN13'),
        EAN8: loaded.getModule('EAN8'),
      } as Record<string, BarcodeEncoderCtor>;
    } else {
      cachedBarcodes = null;
    }
    return cachedBarcodes;
  } catch {
    return null;
  }
}

function compact(value: string): string {
  return String(value ?? '').trim();
}

export function normalizeCodeValue(value: string): string {
  return compact(value);
}

export function normalizeBarcodeValue(value: string): string {
  return normalizeCodeValue(value);
}

export function getBarcodeFormatLabel(format: BarcodeFormat): string {
  return BARCODE_FORMAT_OPTIONS.find((option) => option.value === format)?.label || format;
}

export function isPiCode(value: string): boolean {
  const payload = compact(value).replace(/\s+/g, '').toUpperCase();
  return /^02PI\d+$/.test(payload);
}

function isTicketLike(value: string): boolean {
  const payload = compact(value).replace(/\s+/g, '').toUpperCase();
  return /^(RITM|REQ|INC|SCTASK)\d+$/.test(payload);
}

export function looksLikeOfficeCode(value: string): boolean {
  const payload = compact(value);
  if (!payload) return false;
  if (isPiCode(payload) || isTicketLike(payload)) return false;
  if (/^(https?:\/\/|mailto:)/i.test(payload)) return false;

  const upper = payload.toUpperCase();
  const hasLetters = /[A-Z]/.test(upper);
  const hasDigits = /\d/.test(upper);
  const hasSpaces = /\s/.test(payload);

  return hasLetters && hasDigits && (hasSpaces || upper.length >= 6);
}

export function detectCodeType(value: string, hint?: CodeType): CodeType {
  if (hint) return hint;
  if (isPiCode(value)) return 'pi';
  if (looksLikeOfficeCode(value)) return 'office';
  return 'other';
}

export function getBarcodeOutputFormatForCodeType(codeType: CodeType, preferredFormat: BarcodeFormat = DEFAULT_BARCODE_FORMAT): BarcodeFormat {
  if (codeType === 'pi' || codeType === 'office') {
    return 'CODE128';
  }
  return preferredFormat;
}

export function isCriticalBarcodeValue(value: string): boolean {
  return isPiCode(value) || looksLikeOfficeCode(value);
}

export function generateBarcode(value: string, typeFromSettings: BarcodeFormat): BarcodeGenerationResult {
  const payload = normalizeCodeValue(value);
  const requestedFormat = typeFromSettings;
  if (!payload) {
    return {
      value: payload,
      requestedFormat,
      finalFormat: requestedFormat,
      forced: false,
      reason: null,
    };
  }

  const codeType = detectCodeType(payload);
  if (codeType === 'pi' || codeType === 'office') {
    return {
      value: payload,
      requestedFormat,
      finalFormat: 'CODE128',
      forced: true,
      reason: codeType === 'pi' ? 'PI detected' : 'Office detected',
    };
  }

  if (requestedFormat !== 'QR') {
    const canEncodeRequested = Boolean(renderBarcodeBits(payload, requestedFormat as Exclude<BarcodeFormat, 'QR'>));
    if (!canEncodeRequested) {
      return {
        value: payload,
        requestedFormat,
        finalFormat: 'CODE128',
        forced: true,
        reason: 'Selected format incompatible',
      };
    }
  }

  return {
    value: payload,
    requestedFormat,
    finalFormat: requestedFormat,
    forced: false,
    reason: null,
  };
}

export const resolveBarcodeFormat = generateBarcode;

export function renderBarcodeBits(value: string, format: Exclude<BarcodeFormat, 'QR'>) {
  const Encoder = getBarcodes()?.[format];
  if (!Encoder) return null;

  const encoder = new Encoder(value, {
    text: '',
    width: 1.6,
    height: 70,
    margin: 14,
    displayValue: false,
  });

  try {
    const encoded = encoder.encode();
    return encoded?.data || null;
  } catch {
    return null;
  }
}

export function buildCodePreviewPlan(
  value: string,
  options?: {
    codeType?: CodeType;
    preferredFormat?: BarcodeFormat;
  },
): CodePreviewPlan {
  const payload = normalizeCodeValue(value);
  const codeType = detectCodeType(payload, options?.codeType);
  const preferredFormat = options?.preferredFormat || DEFAULT_BARCODE_FORMAT;

  if (!payload) {
    return { value: payload, codeType, codeFormat: 'other', variants: [] };
  }

  if (codeType === 'pi') {
    return {
      value: payload,
      codeType,
      codeFormat: 'code128',
      variants: [{ kind: 'barcode', label: 'Code128', value: payload, barcodeFormat: 'CODE128' }],
    };
  }

  if (codeType === 'office') {
    return {
      value: payload,
      codeType,
      codeFormat: 'code128',
      variants: [
        { kind: 'barcode', label: 'Code128', value: payload, barcodeFormat: 'CODE128' },
        { kind: 'qr', label: 'QR Code', value: payload },
      ],
    };
  }

  if (preferredFormat === 'QR') {
    return {
      value: payload,
      codeType,
      codeFormat: 'qr',
      variants: [{ kind: 'qr', label: 'QR Code', value: payload }],
    };
  }

  const resolved = generateBarcode(payload, preferredFormat);
  return {
    value: payload,
    codeType,
    codeFormat: resolved.finalFormat === 'QR' ? 'qr' : 'code128',
    variants:
      resolved.finalFormat === 'QR'
        ? [{ kind: 'qr', label: 'QR Code', value: payload }]
        : [{ kind: 'barcode', label: getBarcodeFormatLabel(resolved.finalFormat), value: payload, barcodeFormat: resolved.finalFormat as Exclude<BarcodeFormat, 'QR'> }],
  };
}
