// Core OCR helper — reusable across components
import { Platform } from 'react-native';

declare const require: (moduleName: string) => any;

const OCR_LANGUAGES = 'eng+spa+fra+nld';
const OCR_MAX_DIMENSION = 2200;
export type OcrCropMode = 'full' | 'center' | 'top';

export interface OcrResult {
  text: string;
  confidence?: number;
  source?: 'image';
}

export interface OcrOptions {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
  cropMode?: OcrCropMode;
}

function getCropRect(width: number, height: number, cropMode: OcrCropMode) {
  if (cropMode === 'center') {
    const marginX = Math.round(width * 0.12);
    const marginY = Math.round(height * 0.16);
    return {
      sx: marginX,
      sy: marginY,
      sw: Math.max(1, width - marginX * 2),
      sh: Math.max(1, height - marginY * 2),
    };
  }
  if (cropMode === 'top') {
    return { sx: 0, sy: 0, sw: width, sh: Math.max(1, Math.round(height * 0.58)) };
  }
  return { sx: 0, sy: 0, sw: width, sh: height };
}

async function preprocessImageForOcr(imageUri: string, cropMode: OcrCropMode = 'full'): Promise<string> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return imageUri;

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const sourceWidth = image.naturalWidth || image.width;
        const sourceHeight = image.naturalHeight || image.height;
        if (!sourceWidth || !sourceHeight) {
          resolve(imageUri);
          return;
        }

        const crop = getCropRect(sourceWidth, sourceHeight, cropMode);
        const scale = Math.min(1, OCR_MAX_DIMENSION / Math.max(crop.sw, crop.sh));
        const width = Math.max(1, Math.round(crop.sw * scale));
        const height = Math.max(1, Math.round(crop.sh * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) {
          resolve(imageUri);
          return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);

        const frame = ctx.getImageData(0, 0, width, height);
        for (let i = 0; i < frame.data.length; i += 4) {
          const gray = 0.299 * frame.data[i] + 0.587 * frame.data[i + 1] + 0.114 * frame.data[i + 2];
          const boosted = Math.max(0, Math.min(255, (gray - 128) * 1.25 + 128));
          frame.data[i] = boosted;
          frame.data[i + 1] = boosted;
          frame.data[i + 2] = boosted;
        }
        ctx.putImageData(frame, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(imageUri);
      }
    };
    image.onerror = () => resolve(imageUri);
    image.src = imageUri;
  });
}

/**
 * Extract text from an image using Tesseract.js
 * Supports data URLs (web) and file URIs.
 * On native, returns an error message since Tesseract.js is not fully supported.
 */
export async function extractTextFromImage(
  imageUri: string,
  options?: OcrOptions
): Promise<OcrResult> {
  if (Platform.OS !== 'web') {
    throw new Error('OCR is currently only available on web/PWA');
  }

  if (options?.signal?.aborted) {
    throw new Error('OCR cancelled');
  }

  try {
    // Metro can lose dynamic import chunks during OCR/HMR; a literal require is
    // statically registered and avoids "Requiring unknown module <id>" at runtime.
    const Tesseract = require('tesseract.js');
    const createWorker = Tesseract.createWorker ?? Tesseract.default?.createWorker;
    if (!createWorker) {
      throw new Error('Tesseract not available');
    }

    const worker = await createWorker(OCR_LANGUAGES, 1, {
      logger: (m: { status: string; progress: number }) => {
        if (options?.signal?.aborted) {
          throw new Error('OCR cancelled');
        }
        if (m.status === 'recognizing text') {
          options?.onProgress?.(Math.round(m.progress * 100));
        }
      },
    });

    try {
      const preparedImageUri = await preprocessImageForOcr(imageUri, options?.cropMode ?? 'full');
      const { data } = await worker.recognize(preparedImageUri, {
        preserve_interword_spaces: '1',
      });

      const extractedText = String(data.text ?? '').trim();
      return {
        text: extractedText,
        confidence: data.confidence,
        source: 'image',
      };
    } finally {
      await worker.terminate().catch(() => undefined);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OCR failed';
    throw new Error(message);
  }
}

/**
 * Convert a Blob or File to a data URL for OCR processing
 */
export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Check if a string is a valid image data URL
 */
export function isImageDataUrl(str: string): boolean {
  return str.startsWith('data:image/');
}
