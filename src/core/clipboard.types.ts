export type ClipboardCategory = 'code' | 'servicenow' | 'link' | 'general';

export interface ClipboardEntry {
  id: string;
  content: string;
  capturedAt: number;
  category: ClipboardCategory;
}
