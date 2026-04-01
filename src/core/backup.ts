import { AppSettings, ScanRecord, TemplateRule } from '../types';
import type { BarcodeType } from 'expo-camera';

import { defaultSettings } from './settings';
import { historyKey, normalizeHistoryType } from './history';

export const APP_BACKUP_VERSION = 1 as const;

export interface AppBackupBundle {
  version: typeof APP_BACKUP_VERSION;
  exportedAt: string;
  app: string;
  kind: 'full' | 'history';
  settings: AppSettings | null;
  templates: TemplateRule[];
  history: ScanRecord[];
}

export interface AppBackupApplyResult {
  settings: AppSettings;
  templates: TemplateRule[];
  history: ScanRecord[];
  addedHistory: number;
  skippedHistory: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const compact = value.trim();
  return compact ? compact : undefined;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

const VALID_BARCODE_TYPES: BarcodeType[] = ['aztec', 'ean13', 'ean8', 'qr', 'pdf417', 'upc_e', 'datamatrix', 'code39', 'code93', 'itf14', 'codabar', 'code128', 'upc_a'];

function asBarcodeTypes(value: unknown, fallback: BarcodeType[]): BarcodeType[] {
  if (!Array.isArray(value)) return fallback;
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry): entry is BarcodeType => VALID_BARCODE_TYPES.includes(entry as BarcodeType));
}

function sanitizeHistoryRecord(value: unknown): ScanRecord | null {
  if (!isRecord(value)) return null;

  const codeNormalized = asString(value.codeNormalized || value.code || value.c).trim();
  const type = normalizeHistoryType(asString(value.type || value.t, ''));
  const date = asString(value.date || value.d, new Date().toISOString());
  const codeType = (['pi', 'office', 'other'].includes(asString(value.codeType, '').toLowerCase())
    ? asString(value.codeType, '').toLowerCase()
    : type === 'PI'
      ? 'pi'
      : type === 'OFFICE'
        ? 'office'
        : 'other') as ScanRecord['codeType'];
  const codeFormat = (['code128', 'qr', 'other'].includes(asString(value.codeFormat, '').toLowerCase())
    ? asString(value.codeFormat, '').toLowerCase()
    : codeType === 'office' || codeType === 'pi'
      ? 'code128'
      : 'other') as ScanRecord['codeFormat'];
  const baseDate = asString(value.createdAt || value.created_at, date);
  const updatedAt = asString(value.updatedAt || value.updated_at, date);

  if (!codeNormalized || !type) return null;

  return {
    id: asString(value.id, `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
    codeOriginal: asString(value.codeOriginal || value.code || value.c, codeNormalized),
    codeNormalized,
    type,
    codeValue: asOptionalString(value.codeValue || value.value) || codeNormalized,
    codeFormat,
    codeType,
    label: asOptionalString(value.label || value.customLabel || value.name),
    notes: asOptionalString(value.notes || value.comment),
    customLabel: asOptionalString(value.customLabel || value.label || value.name),
    ticketNumber: asOptionalString(value.ticketNumber),
    officeCode: asOptionalString(value.officeCode || value.officeNumber),
    hasQr: asBoolean(value.hasQr, codeType === 'office'),
    profileId: asString(value.profileId || value.profile || 'import', 'import'),
    piMode: asString(value.piMode || value.pi_mode, 'N/A'),
    source: (['camera', 'image', 'nfc', 'paste', 'import', 'manual'].includes(asString(value.source, 'import')) ? asString(value.source, 'import') : 'import') as ScanRecord['source'],
    structuredFields: isRecord(value.structuredFields) ? (value.structuredFields as Record<string, string>) : {},
    createdAt: baseDate,
    updatedAt,
    date,
    status: value.status === 'sent' ? 'sent' : 'pending',
    used: asBoolean(value.used, false),
    dateUsed: value.dateUsed === null ? null : asString(value.dateUsed || value.usedAt || null, ''),
  };
}

function sanitizeTemplateRule(value: unknown): TemplateRule | null {
  if (!isRecord(value)) return null;

  const id = asString(value.id, '').trim() || `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const name = asString(value.name, '').trim();
  const type = asString(value.type, '').trim();
  if (!name || !type) return null;

  const regexRules = isRecord(value.regexRules) ? (value.regexRules as Record<string, string>) : {};
  const mappingRules = isRecord(value.mappingRules) ? (value.mappingRules as Record<string, string>) : {};
  const samplePayloads = Array.isArray(value.samplePayloads)
    ? value.samplePayloads.filter((entry): entry is string => typeof entry === 'string')
    : [];

  const createdAt = asString(value.createdAt, new Date().toISOString());
  const updatedAt = asString(value.updatedAt, createdAt);

  return {
    id,
    name,
    type,
    regexRules,
    mappingRules,
    samplePayloads,
    createdAt,
    updatedAt,
  };
}

function sanitizeSettings(value: unknown): AppSettings {
  const source = isRecord(value) ? value : {};

  return {
    ...defaultSettings,
    fullPrefix: asString(source.fullPrefix, defaultSettings.fullPrefix).trim() || defaultSettings.fullPrefix,
    shortPrefix: asString(source.shortPrefix, defaultSettings.shortPrefix).trim() || defaultSettings.shortPrefix,
    ocrCorrection: asBoolean(source.ocrCorrection, defaultSettings.ocrCorrection),
    autoDetect: asBoolean(source.autoDetect, defaultSettings.autoDetect),
    scanProfile: asString(source.scanProfile, defaultSettings.scanProfile).trim() || defaultSettings.scanProfile,
    serviceNowBaseUrl: asString(source.serviceNowBaseUrl, defaultSettings.serviceNowBaseUrl).trim(),
    theme: (['dark', 'light', 'eu_blue', 'custom'].includes(asString(source.theme, defaultSettings.theme))
      ? asString(source.theme, defaultSettings.theme)
      : defaultSettings.theme) as AppSettings['theme'],
    customAccent: asString(source.customAccent, defaultSettings.customAccent).trim(),
    openUrls: asBoolean(source.openUrls, defaultSettings.openUrls),
    barcodeOutputFormat: (['CODE128', 'CODE39', 'EAN13', 'EAN8', 'QR'].includes(asString(source.barcodeOutputFormat, defaultSettings.barcodeOutputFormat))
      ? asString(source.barcodeOutputFormat, defaultSettings.barcodeOutputFormat)
      : defaultSettings.barcodeOutputFormat) as AppSettings['barcodeOutputFormat'],
    barcodeTypes: asBarcodeTypes(source.barcodeTypes, defaultSettings.barcodeTypes),
    laserSpeed: (['slow', 'normal', 'fast'].includes(asString(source.laserSpeed, defaultSettings.laserSpeed))
      ? asString(source.laserSpeed, defaultSettings.laserSpeed)
      : defaultSettings.laserSpeed) as AppSettings['laserSpeed'],
    historyAutoClearDays: Math.max(0, Math.floor(asNumber(source.historyAutoClearDays, defaultSettings.historyAutoClearDays))),
  };
}

export function buildBackupBundle(input: {
  settings: AppSettings;
  templates: TemplateRule[];
  history: ScanRecord[];
}): AppBackupBundle {
  return {
    version: APP_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'oryxen-scanner',
    kind: 'full',
    settings: sanitizeSettings(input.settings),
    templates: input.templates.slice(),
    history: input.history.slice(),
  };
}

export function serializeBackupBundle(bundle: AppBackupBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function parseBackupBundle(raw: string): AppBackupBundle | null {
  const text = String(raw || '').trim();
  if (!text) return null;

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const history = parsed.map(sanitizeHistoryRecord).filter((item): item is ScanRecord => Boolean(item));
      return {
        version: APP_BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        app: 'oryxen-scanner',
        kind: 'history',
        settings: null,
        templates: [],
        history,
      };
    }

    if (!isRecord(parsed)) return null;

    const settings = sanitizeSettings(parsed.settings);
    const templates = Array.isArray(parsed.templates)
      ? parsed.templates.map(sanitizeTemplateRule).filter((item): item is TemplateRule => Boolean(item))
      : [];
    const history = Array.isArray(parsed.history)
      ? parsed.history.map(sanitizeHistoryRecord).filter((item): item is ScanRecord => Boolean(item))
      : [];

    return {
      version: APP_BACKUP_VERSION,
      exportedAt: asString(parsed.exportedAt, new Date().toISOString()),
      app: asString(parsed.app, 'oryxen-scanner'),
      kind: parsed.kind === 'history' ? 'history' : 'full',
      settings,
      templates,
      history,
    };
  } catch {
    return null;
  }
}

export function applyImportedBackup(
  current: {
    settings: AppSettings;
    templates: TemplateRule[];
    history: ScanRecord[];
  },
  imported: AppBackupBundle,
): AppBackupApplyResult {
  const settings = imported.kind === 'full' && imported.settings ? sanitizeSettings(imported.settings) : current.settings;

  const templatesById = new Map<string, TemplateRule>();
  if (imported.kind === 'full') {
    for (const template of imported.templates) {
      templatesById.set(template.id, template);
    }
  } else {
    for (const template of current.templates) {
      templatesById.set(template.id, template);
    }
  }

  const historyByKey = new Map<string, ScanRecord>();
  for (const record of current.history) {
    historyByKey.set(historyKey(record), record);
  }

  let addedHistory = 0;
  let skippedHistory = 0;
  for (const record of imported.history) {
    const key = historyKey(record);
    if (historyByKey.has(key)) {
      skippedHistory += 1;
      continue;
    }
    historyByKey.set(key, record);
    addedHistory += 1;
  }

  return {
    settings,
    templates: [...templatesById.values()],
    history: [...historyByKey.values()],
    addedHistory,
    skippedHistory,
  };
}
