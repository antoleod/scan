import type { BarcodeType } from 'expo-camera';

export type BootStatus = 'booting' | 'ready' | 'error';
export type AuthStatus = 'unknown' | 'authenticated' | 'guest';
export type PersistenceMode = 'local' | 'firebase';
export type ScanState =
  | 'idle'
  | 'scanning'
  | 'detecting'
  | 'success'
  | 'timeout'
  | 'manual_capture_ready'
  | 'saving_photo'
  | 'saved'
  | 'error';

export interface AppSettings {
  fullPrefix: string;
  shortPrefix: string;
  ocrCorrection: boolean;
  autoDetect: boolean;
  scanProfile: string;
  serviceNowBaseUrl: string;
  theme: 'dark' | 'light' | 'eu_blue' | 'custom' | 'parliament' | 'noirGraphite' | 'midnightSteel' | 'obsidianGold';
  customAccent: string;
  openUrls: boolean;
  barcodeOutputFormat: 'CODE128' | 'CODE39' | 'EAN13' | 'EAN8' | 'QR';
  barcodeTypes: BarcodeType[];
  laserSpeed: 'slow' | 'normal' | 'fast';
  historyAutoClearDays: number;
  staySignedIn: boolean;
  savePasswordEncrypted: boolean;
  smartNotes?: SmartNoteSettings;
}

export interface SmartNoteSettings {
  offices: string[];
  ipDetectionEnabled: boolean;
  detectionEnabled: {
    ip: boolean;
    hostname: boolean;
    office: boolean;
    asset: boolean;
  };
  regex: {
    ip: string;
    hostname: string;
    pi: string;
  };
}

export interface TemplateRule {
  id: string;
  name: string;
  type: string;
  regexRules: Record<string, string>;
  mappingRules: Record<string, string>;
  samplePayloads: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ScanRecord {
  id: string;
  codeOriginal: string;
  codeNormalized: string;
  type: string;
  codeValue?: string;
  codeFormat?: 'code128' | 'qr' | 'other';
  codeType?: 'pi' | 'office' | 'other';
  label?: string;
  notes?: string;
  customLabel?: string;
  ticketNumber?: string;
  officeCode?: string;
  hasQr?: boolean;
  profileId: string;
  piMode: string;
  source: 'camera' | 'image' | 'nfc' | 'paste' | 'import' | 'manual';
  structuredFields: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: number;
  date: string;
  status: 'pending' | 'sent';
  used: boolean;
  dateUsed: string | null;
}
