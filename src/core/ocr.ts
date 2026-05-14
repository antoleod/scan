// Core OCR helper — reusable across components
import { Platform } from 'react-native';

declare const require: (moduleName: string) => any;

export interface OcrResult {
  text: string;
  confidence?: number;
  source?: 'image';
}

export interface OcrOptions {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
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

    const worker = await createWorker('eng+spa', 1, {
      logger: (m: { status: string; progress: number }) => {
        if (options?.signal?.aborted) {
          throw new Error('OCR cancelled');
        }
        if (m.status === 'recognizing text') {
          options?.onProgress?.(Math.round(m.progress * 100));
        }
      },
    });

    const { data } = await worker.recognize(imageUri);
    await worker.terminate();

    const extractedText = data.text ?? '';
    return {
      text: extractedText,
      confidence: data.confidence,
      source: 'image',
    };
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
