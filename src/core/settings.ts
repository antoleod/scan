import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppSettings } from '../types';

const KEY = 'barra_settings';

export const defaultSettings: AppSettings = {
  fullPrefix: '02PI20',
  shortPrefix: 'MUSTBRUN',
  ocrCorrection: true,
  autoDetect: true,
  scanProfile: 'auto',
  serviceNowBaseUrl: '',
  theme: 'noirGraphite',
  customAccent: '',
  openUrls: true,
  barcodeOutputFormat: 'CODE128',
  barcodeTypes: ['qr', 'code128', 'code39', 'ean13', 'ean8'],
  laserSpeed: 'normal',
  historyAutoClearDays: 0,
  staySignedIn: true,
  savePasswordEncrypted: false,
  clipboardCloudSync: false,
  showRawText: false,
  smartNotes: {
    offices: ['Spinelli', 'Kohl', 'Strasbourg'],
    ipDetectionEnabled: true,
    detectionEnabled: {
      ip: true,
      hostname: true,
      office: true,
      asset: true,
    },
    regex: {
      ip: String.raw`\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b`,
      hostname: String.raw`\b(?:IPOLBRUP[A-Z0-9-]*|P\d{2}[A-Z]{2}[A-Z0-9-]*)\b`,
      pi: String.raw`\b02PI[A-Z0-9]*\b`,
    },
  },
};

export async function loadSettings(): Promise<AppSettings> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return defaultSettings;
  try {
    const rawParsed = JSON.parse(raw) as Partial<AppSettings>;
    const parsed = {
      ...defaultSettings,
      ...rawParsed,
      clipboardCloudSync: rawParsed.clipboardCloudSync === true,
      smartNotes: {
        ...defaultSettings.smartNotes,
        ...(rawParsed.smartNotes || {}),
        detectionEnabled: {
          ...defaultSettings.smartNotes!.detectionEnabled,
          ...(rawParsed.smartNotes?.detectionEnabled || {}),
        },
        regex: {
          ...defaultSettings.smartNotes!.regex,
          ...(rawParsed.smartNotes?.regex || {}),
        },
        offices: Array.isArray(rawParsed.smartNotes?.offices)
          ? rawParsed.smartNotes!.offices.map((value) => String(value || '').trim()).filter(Boolean)
          : defaultSettings.smartNotes!.offices,
      },
    } as AppSettings;
    const allowedThemes: AppSettings['theme'][] = ['dark', 'light', 'eu_blue', 'custom', 'parliament', 'noirGraphite', 'midnightSteel', 'obsidianGold'];
    if (!allowedThemes.includes(parsed.theme)) {
      parsed.theme = 'noirGraphite';
    }
    return parsed;
  } catch {
    return defaultSettings;
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

// Keep PI conversion behavior identical to web app.
export const piLogic = {
  normalize(code: string, settings: AppSettings) {
    let c = (code || '').trim().toUpperCase().replace(/\s+/g, '');
    if (settings.ocrCorrection) c = c.replace(/O/g, '0');
    return c;
  },
  convert(code: string, targetMode: 'FULL' | 'SHORT', settings: AppSettings) {
    const c = this.normalize(code, settings), f = settings.fullPrefix, s = settings.shortPrefix, isFull = c.startsWith(f), isShort = c.startsWith(s) || (!isFull && /^[A-Z0-9]+$/.test(c));
    if (targetMode === 'SHORT') {
      if (isShort) return c;
      if (isFull) { const core = c.substring(f.length, c.length - 2); return s + core; }
    } else {
      if (isFull) return c;
      if (isShort) { let core = c; if (c.startsWith(s)) core = c.substring(s.length); return f + core + '00'; }
    }
    return null;
  },
  validate(code: string, mode: 'FULL' | 'SHORT', settings: AppSettings) {
    const c = this.normalize(code, settings);
    if (c.length < 5) return false;
    if (mode === 'FULL' && !c.startsWith(settings.fullPrefix)) return false;
    return true;
  },
};
