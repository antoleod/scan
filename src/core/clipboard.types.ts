export type ClipKind = 'text' | 'image';
export type ClipCategory = 'url' | 'code' | 'servicenow' | 'email' | 'general';
export type ClipSource = 'paste' | 'copy' | 'focus' | 'poll' | 'manual';
export type PermState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export interface ClipEntry {
  id: string;
  kind: ClipKind;
  content: string;
  category: ClipCategory;
  source: ClipSource;
  capturedAt: number;
  sig: string;
  imageDataUri?: string;
}

export type ClipboardCategory = ClipCategory;
export type ClipboardKind = ClipKind;
export type ClipboardEntry = ClipEntry;
