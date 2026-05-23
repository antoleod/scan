import { Platform } from 'react-native';
import { callFirebaseFunction } from './firebase';
import { diag } from './diagnostics';

declare const require: (moduleName: string) => any;

export interface CalendarEventDraft {
  title: string;
  startAt: number;
  endAt?: number;
  description?: string;
  location?: string;
}

function padIcsDate(value: number): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function escapeIcsText(value: string): string {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export function buildIcsCalendarEvent(event: CalendarEventDraft): string {
  const start = Number(event.startAt || Date.now());
  const end = Number(event.endAt || start + 30 * 60 * 1000);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MyKit//Integrations//EN',
    'BEGIN:VEVENT',
    `UID:mykit-${start}-${Math.random().toString(36).slice(2)}@local`,
    `DTSTAMP:${padIcsDate(Date.now())}`,
    `DTSTART:${padIcsDate(start)}`,
    `DTEND:${padIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
    event.description ? `DESCRIPTION:${escapeIcsText(event.description)}` : '',
    event.location ? `LOCATION:${escapeIcsText(event.location)}` : '',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean).join('\r\n');
}

export function buildGoogleCalendarUrl(event: CalendarEventDraft): string {
  const start = Number(event.startAt || Date.now());
  const end = Number(event.endAt || start + 30 * 60 * 1000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${padIcsDate(start)}/${padIcsDate(end)}`,
  });
  if (event.description) params.set('details', event.description);
  if (event.location) params.set('location', event.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export async function shareTextFile(name: string, text: string, mimeType = 'text/plain'): Promise<boolean> {
  try {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && 'share' in navigator) {
      const file = new File([text], name, { type: mimeType });
      const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: unknown) => Promise<void> };
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share?.({ files: [file], title: name });
        return true;
      }
    }

    if (Platform.OS !== 'web') {
      const Sharing = require('expo-sharing');
      const FileSystem = require('expo-file-system/legacy').FileSystem;
      const path = `${FileSystem.cacheDirectory}${name}`;
      await FileSystem.writeAsStringAsync(path, text);
      await Sharing.shareAsync(path, { mimeType });
      return true;
    }
  } catch (error) {
    await diag.warn('integrations.shareFile.error', { message: String(error) });
  }
  return false;
}

export function generateAiNote(prompt: string): Promise<{ text: string }> {
  return callFirebaseFunction('generateAiNote', { prompt });
}

export function sendProductEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<{ ok: boolean }> {
  return callFirebaseFunction('sendProductEmail', input);
}

export function serviceNowRequest(input: {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
}): Promise<{ ok: boolean; status: number; data: unknown }> {
  return callFirebaseFunction('serviceNowProxy', input);
}

export async function captureIntegrationError(error: unknown, context?: Record<string, unknown>): Promise<void> {
  await diag.error('integration.error', {
    message: error instanceof Error ? error.message : String(error),
    ...context,
  });

  try {
    const Sentry = require('@sentry/react-native');
    Sentry.captureException?.(error, { extra: context });
  } catch {
    // Sentry is optional and only active when the package is installed/configured.
  }
}
