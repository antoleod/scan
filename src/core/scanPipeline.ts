import { AppSettings, ScanRecord, TemplateRule } from '../types';
import type { BarcodeType } from 'expo-camera';

import { classify, Classified } from './classify';
import { extractFields } from './extract';
import { addHistoryUnique, createHistoryId } from './history';
import { normalizeCodeValue, detectCodeType, type CodeType, type BarcodeFormat } from './codeStrategy';
import { piLogic } from './settings';

export const IMAGE_SCAN_BARCODE_TYPES: BarcodeType[] = ['qr', 'code128', 'code39', 'ean13', 'ean8'];

export type ScanSource = ScanRecord['source'];

export interface BuiltScanRecord {
  raw: string;
  classified: Classified;
  record: ScanRecord;
}

export type ScanOutcome =
  | {
      status: 'saved';
      message: string;
      history: ScanRecord[];
      record: ScanRecord;
    }
  | {
      status: 'duplicate';
      message: string;
      history: ScanRecord[];
      duplicate: ScanRecord;
    }
  | {
      status: 'invalid';
      message: string;
      history: ScanRecord[];
    }
  | {
      status: 'empty';
      message: string;
      history: ScanRecord[];
    };

export function classifyIncomingScan(raw: string, settings: AppSettings): Classified {
  const compact = String(raw || '').trim();
  if (!compact) {
    return { profileId: 'auto', type: 'QR', normalized: '', piMode: 'N/A' };
  }

  if (settings.autoDetect || settings.scanProfile === 'auto') {
    return classify(compact, settings);
  }

  if (settings.scanProfile === 'pi_full') {
    const normalized = piLogic.convert(compact, 'FULL', settings) || piLogic.normalize(compact, settings);
    return { profileId: 'pi_full', type: 'PI', normalized, piMode: 'FULL' };
  }

  if (settings.scanProfile === 'pi_short') {
    const normalized = piLogic.convert(compact, 'SHORT', settings) || piLogic.normalize(compact, settings);
    return { profileId: 'pi_short', type: 'PI', normalized, piMode: 'SHORT' };
  }

  return classify(compact, settings);
}

export function buildScanRecord(
  raw: string,
  source: ScanSource,
  settings: AppSettings,
  templates: TemplateRule[],
): BuiltScanRecord | null {
  const payload = String(raw || '').trim();
  if (!payload) return null;

  const classified = classifyIncomingScan(payload, settings);
  if (!classified.normalized) return null;

  if (classified.type === 'PI') {
    const isValid = piLogic.validate(
      classified.normalized,
      classified.piMode === 'SHORT' ? 'SHORT' : 'FULL',
      settings,
    );
    if (!isValid) {
      return null;
    }
  }

  const fields = extractFields(payload, templates);
  const codeType = detectCodeType(classified.normalized, classified.type === 'PI' ? 'pi' : 'other');
  const codeFormat: ScanRecord['codeFormat'] = classified.type === 'PI' ? 'code128' : classified.type === 'QR' ? 'qr' : 'other';
  const now = new Date().toISOString();
  const officeCode = fields.officeCode || fields.officeNumber || undefined;
  const record: ScanRecord = {
    id: createHistoryId('scan'),
    codeOriginal: payload,
    codeNormalized: classified.normalized,
    type: classified.type === 'PI' ? 'PI' : classified.type,
    codeValue: normalizeCodeValue(payload),
    codeFormat,
    codeType,
    label: fields.customLabel || fields.shortDescription || undefined,
    notes: fields.notes || undefined,
    customLabel: fields.customLabel || fields.shortDescription || undefined,
    ticketNumber: fields.ticketNumber || undefined,
    officeCode,
    hasQr: codeType === 'office',
    profileId: classified.profileId,
    piMode: classified.type === 'PI' ? classified.piMode : 'N/A',
    source,
    structuredFields: fields,
    createdAt: now,
    updatedAt: now,
    date: now,
    status: 'pending',
    used: false,
    dateUsed: null,
  };

  return { raw: payload, classified, record };
}

export async function processScanInput(
  raw: string,
  source: ScanSource,
  settings: AppSettings,
  templates: TemplateRule[],
): Promise<ScanOutcome> {
  const payload = String(raw || '').trim();

  if (!payload) {
    return {
      status: 'empty',
      message: 'No scan data',
      history: [],
    };
  }

  const built = buildScanRecord(payload, source, settings, templates);
  if (!built) {
    return {
      status: 'invalid',
      message: 'Invalid PI format',
      history: [],
    };
  }

  const result = await addHistoryUnique(built.record);
  if (!result.inserted) {
    return {
      status: 'duplicate',
      message: 'Already exists',
      history: result.history,
      duplicate: result.duplicate as ScanRecord,
    };
  }

  return {
    status: 'saved',
    message: built.record.codeNormalized,
    history: result.history,
    record: built.record,
  };
}
