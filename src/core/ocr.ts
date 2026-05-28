// Core OCR helper — reusable across components
import { Platform } from 'react-native';

declare const require: (moduleName: string) => any;

const OCR_LANGUAGES = 'eng+spa+fra+nld';
const OCR_MAX_DIMENSION = 2200;
export type OcrCropMode = 'full' | 'center' | 'top';

// Pin to the installed tesseract.js version so the worker/core/lang assets all
// match. Keep in sync with package.json ("tesseract.js": "^7.0.0").
const TESSERACT_VERSION = '7.0.0';

// Production logs showed the default jsdelivr worker script failing to load
// ("NetworkError ... importScripts ... worker.min.js failed to load"), which
// broke OCR entirely. We try a primary CDN and fall back to a mirror so a
// transient outage on one host no longer kills the feature. `langPath` points
// at the canonical tessdata host (one directory holding every <lang>.traineddata)
// rather than jsdelivr's per-language packages.
type OcrCdnConfig = { name: string; workerPath: string; corePath: string; langPath: string };

const OCR_CDNS: OcrCdnConfig[] = [
  {
    name: 'jsdelivr',
    workerPath: `https://cdn.jsdelivr.net/npm/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`,
    corePath: `https://cdn.jsdelivr.net/npm/tesseract.js-core@${TESSERACT_VERSION}`,
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  },
  {
    name: 'unpkg',
    workerPath: `https://unpkg.com/tesseract.js@${TESSERACT_VERSION}/dist/worker.min.js`,
    corePath: `https://unpkg.com/tesseract.js-core@${TESSERACT_VERSION}`,
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  },
];

// Maps Tesseract status strings to a [basePercent, maxPercent] window so all
// lifecycle stages are reflected in progress, not just 'recognizing text'.
const STAGE_RANGES: Record<string, [number, number]> = {
  'loading ocr engine':  [0,  15],
  'initializing api':    [15, 30],
  'building languages':  [30, 60],
  'loading language traineddata': [30, 60],
  'initialized api':     [60, 62],
  'recognizing text':    [62, 100],
};

// Per-call progress sink — redirected before each recognize() call, cleared after.
// Single-threaded by design (one Tesseract worker processes one image at a time).
let _currentProgressFn: ((pct: number) => void) | null = null;

function sharedLogger(m: { status: string; progress: number }) {
  const range = STAGE_RANGES[m.status];
  if (!range) return;
  const pct = Math.round(range[0] + m.progress * (range[1] - range[0]));
  _currentProgressFn?.(pct);
}

// Singleton worker — created once, reused across all OCR calls. Avoids the
// 1–3 s init overhead and traineddata re-download on every invocation.
let _workerPromise: Promise<any> | null = null;

async function createOcrWorker(
  createWorker: (langs: string, oem: number, options: Record<string, unknown>) => Promise<any>,
): Promise<any> {
  let lastError: unknown;
  for (const cdn of OCR_CDNS) {
    try {
      return await createWorker(OCR_LANGUAGES, 1, {
        workerPath: cdn.workerPath,
        corePath: cdn.corePath,
        langPath: cdn.langPath,
        logger: sharedLogger,
      });
    } catch (error) {
      lastError = error;
      // Try the next mirror before giving up.
    }
  }
  throw lastError instanceof Error
    ? new Error(`OCR engine could not load (network). ${lastError.message}`)
    : new Error('OCR engine could not load. Check your connection and retry.');
}

function getOcrWorker(): Promise<any> {
  if (!_workerPromise) {
    // Metro can lose dynamic import chunks during OCR/HMR; a literal require is
    // statically registered and avoids "Requiring unknown module <id>" at runtime.
    const Tesseract = require('tesseract.js');
    const createWorker = Tesseract.createWorker ?? Tesseract.default?.createWorker;
    if (!createWorker) {
      return Promise.reject(new Error('Tesseract not available'));
    }
    _workerPromise = createOcrWorker(createWorker).catch((e) => {
      _workerPromise = null; // Allow retry on next call
      throw e;
    });
  }
  return _workerPromise;
}

/** Call on app exit or when OCR is no longer needed to free the WASM memory. */
export function releaseOcrWorker(): void {
  _workerPromise
    ?.then((w) => w.terminate().catch(() => undefined))
    .catch(() => undefined);
  _workerPromise = null;
  _currentProgressFn = null;
}

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
    const worker = await getOcrWorker();

    const preparedImageUri = await preprocessImageForOcr(imageUri, options?.cropMode ?? 'full');

    if (options?.signal?.aborted) throw new Error('OCR cancelled');

    // Wire up per-call progress handler before recognition starts.
    _currentProgressFn = options?.onProgress ?? null;

    try {
      const recognizePromise = worker.recognize(preparedImageUri, {
        preserve_interword_spaces: '1',
      });

      // Race recognition against the caller's abort signal so closing the modal
      // cancels the in-flight call without waiting for Tesseract to finish.
      let abortListener: (() => void) | undefined;
      const { data } = await (options?.signal
        ? Promise.race([
            recognizePromise,
            new Promise<never>((_, reject) => {
              abortListener = () => reject(new Error('OCR cancelled'));
              options.signal!.addEventListener('abort', abortListener, { once: true });
            }),
          ])
        : recognizePromise
      ).finally(() => {
        if (abortListener) options?.signal?.removeEventListener('abort', abortListener);
      });

      const extractedText = String(data.text ?? '').trim();
      return {
        text: extractedText,
        confidence: data.confidence,
        source: 'image',
      };
    } finally {
      _currentProgressFn = null;
      // Worker is a singleton — do NOT terminate here.
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
