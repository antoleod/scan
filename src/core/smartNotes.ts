import { AppSettings } from '../types';

export type SmartNoteType = 'network' | 'device' | 'office' | 'asset' | 'general';

export type SmartNoteEntities = {
  type: SmartNoteType;
  ip: string[];
  hostname: string[];
  office: string[];
  pi: string[];
};

function safeRegex(source: string, fallback: RegExp): RegExp {
  try {
    return new RegExp(source, 'gi');
  } catch {
    return fallback;
  }
}

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectNoteEntities(text: string, settings: AppSettings): SmartNoteEntities {
  const value = String(text || '');
  const smart = settings.smartNotes;
  if (!smart) {
    return { type: 'general', ip: [], hostname: [], office: [], pi: [] };
  }

  const ipEnabled = smart.ipDetectionEnabled && smart.detectionEnabled.ip;
  const ipRegex = safeRegex(smart.regex.ip, /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/gi);
  const hostRegex = safeRegex(smart.regex.hostname, /\b(?:IPOLBRUP[A-Z0-9-]*|P\d{2}[A-Z]{2}[A-Z0-9-]*)\b/gi);
  const piRegex = safeRegex(smart.regex.pi, /\b02PI[A-Z0-9]*\b/gi);
  const officeRegex = smart.offices.length
    ? new RegExp(`\\b(?:${smart.offices.map((office) => escapeRegex(office)).join('|')})\\b`, 'gi')
    : null;

  const ip = ipEnabled ? uniq(value.match(ipRegex) || []) : [];
  const hostname = smart.detectionEnabled.hostname ? uniq((value.match(hostRegex) || []).map((item) => item.toUpperCase())) : [];
  const pi = smart.detectionEnabled.asset ? uniq((value.match(piRegex) || []).map((item) => item.toUpperCase())) : [];
  const office = smart.detectionEnabled.office && officeRegex ? uniq(value.match(officeRegex) || []) : [];

  const type: SmartNoteType =
    ip.length > 0 ? 'network' :
    hostname.length > 0 ? 'device' :
    office.length > 0 ? 'office' :
    pi.length > 0 ? 'asset' :
    'general';

  return { type, ip, hostname, office, pi };
}
