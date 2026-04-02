export type ClipboardCategory = 'code' | 'servicenow' | 'link' | 'general';
export type ClipboardKind = 'text' | 'image';

export interface ClipboardEntry {
  id: string;
  kind: ClipboardKind;
  content: string;
  imageDataUri?: string;
  sourceKey: string;
  capturedAt: number;
  category: ClipboardCategory;
}
