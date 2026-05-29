/**
 * noteExport.ts — render a NoteItem to a PDF and deliver it.
 *
 *  - web    → expo-print returns a blob URI; we trigger a browser download
 *             (same anchor pattern as features/airdrop/transfer/fileDelivery).
 *  - native → expo-print writes a file URI; we open the OS share sheet via
 *             expo-sharing (same path shareNoteNative already uses for .txt).
 *
 * All user-supplied text is HTML-escaped before being placed in the document.
 */
import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { diag } from './diagnostics';
import type { NoteItem } from './notes';

export interface NoteExportResult {
  ok: boolean;
}

/** Minimal translator shape — we only need the `t(key)` call here. */
type Translate = (key: string, options?: Record<string, unknown>) => string;

function escapeHtml(input: string): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collect every image data URI on the note (inline base64 + attachments). */
function collectImages(note: NoteItem): string[] {
  const images: string[] = [];
  if (note.imageBase64) {
    const mime = note.imageMimeType || 'image/png';
    const uri = note.imageBase64.startsWith('data:')
      ? note.imageBase64
      : `data:${mime};base64,${note.imageBase64}`;
    images.push(uri);
  }
  for (const a of note.attachments || []) {
    if (typeof a === 'string' && a.startsWith('data:image/') && !images.includes(a)) {
      images.push(a);
    }
  }
  return images;
}

/** Build a self-contained HTML document for the note. */
export function buildNoteHtml(note: NoteItem): string {
  const rawTitle = (note.title || note.text || '').trim();
  const title = escapeHtml(rawTitle.split('\n')[0].slice(0, 120) || 'Note');
  const dateStr = escapeHtml(new Date(note.createdAt || Date.now()).toLocaleString());
  // Preserve the user's line breaks; escape first so no HTML can be injected.
  const body = escapeHtml(note.text || '').replace(/\n/g, '<br/>');
  const images = collectImages(note)
    .map((uri) => `<img src="${uri}" alt="" />`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #111; margin: 0; padding: 40px; }
  .title { font-size: 22px; font-weight: 700; margin: 0 0 4px; word-wrap: break-word; }
  .date { font-size: 12px; color: #666; margin: 0 0 20px; }
  .body { font-size: 14px; line-height: 1.6; white-space: normal; word-wrap: break-word; }
  .images { margin-top: 20px; display: flex; flex-direction: column; gap: 12px; }
  .images img { max-width: 100%; border-radius: 8px; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #eee; font-size: 10px; color: #999; }
</style>
</head>
<body>
  <h1 class="title">${title}</h1>
  <p class="date">${dateStr}</p>
  <div class="body">${body}</div>
  ${images ? `<div class="images">${images}</div>` : ''}
  <div class="footer">MyKit</div>
</body>
</html>`;
}

function fileSafeStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Render the note to a PDF and deliver it (download on web, share sheet on
 * native). Never throws — returns { ok } so the caller can toast the result.
 */
export async function exportNoteToPdf(note: NoteItem, t: Translate): Promise<NoteExportResult> {
  try {
    const html = buildNoteHtml(note);
    const { uri } = await Print.printToFileAsync({ html });

    if (Platform.OS === 'web') {
      if (typeof document === 'undefined') return { ok: false };
      // expo-print returns a blob: URI on web — fetch it and download as a file.
      const res = await fetch(uri);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `MyKit_note_${fileSafeStamp()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      await diag.info('notes.export.pdf.web', { id: note.id });
      return { ok: true };
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('notes.shareNote'),
        UTI: 'com.adobe.pdf',
      });
      await diag.info('notes.export.pdf.native', { id: note.id });
      return { ok: true };
    }
    return { ok: false };
  } catch (error) {
    await diag.warn('notes.export.pdf.error', { message: String(error) });
    return { ok: false };
  }
}
