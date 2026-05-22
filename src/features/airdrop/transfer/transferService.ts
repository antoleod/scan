/**
 * Real file transfer engine over the WebRTC DataChannel.
 *
 * Protocol (control frames are JSON strings, chunks are raw ArrayBuffers):
 *   sender → offer{file, chunkSize, chunks}
 *   receiver → accept | decline      (driven by the "Download?" confirmation UI)
 *   sender → start, then N binary chunks, then complete
 *   receiver reassembles → delivers (web download / native share-sheet save)
 *
 * Bytes flow PEER-TO-PEER only; nothing here touches Firebase/signaling. On web
 * this is a genuine transfer; on native the PeerConnection is the Unsupported
 * placeholder, so `attachSender`/`attachReceiver` simply never see an open
 * channel — no fake progress is ever emitted.
 */
import { putTransfer, patchTransfer } from '../store/airdropStore';
import { TRANSFER_CHUNK_SIZE } from '../constants';
import { diag } from '../../../core/diagnostics';
import { deliverReceivedFile } from './fileDelivery';
import type {
  FileMeta,
  PeerConnection,
  SelectedFile,
  TransferControlFrame,
  TransferProgress,
} from '../types';

/** Pause sending when the channel buffer grows beyond this (backpressure). */
const BUFFER_HIGH_WATER = 4 * 1024 * 1024; // 4 MiB
const BUFFER_LOW_WATER = 1 * 1024 * 1024; // resume below 1 MiB

function parseControl(data: string): TransferControlFrame | null {
  try {
    const obj = JSON.parse(data) as TransferControlFrame;
    return obj && typeof (obj as { t?: unknown }).t === 'string' ? obj : null;
  } catch {
    return null;
  }
}

function seedProgress(p: TransferProgress) {
  putTransfer(p);
}

// ── Sender ────────────────────────────────────────────────────────────────

/**
 * Wire the sender side. Once the channel opens, sends the offer. When the
 * receiver accepts, streams the file. Returns a disposer.
 */
export function attachSender(
  sessionId: string,
  pc: PeerConnection,
  file: SelectedFile,
): () => void {
  let cancelled = false;
  const meta: FileMeta = { name: file.name, size: file.size, mimeType: file.mimeType };
  const chunks = Math.max(1, Math.ceil(file.size / TRANSFER_CHUNK_SIZE));

  seedProgress({
    sessionId,
    direction: 'send',
    status: 'offered',
    progress: 0,
    bytesTransferred: 0,
    totalBytes: file.size,
    file: meta,
  });

  let offerSent = false;
  const sendOffer = () => {
    if (cancelled || offerSent) return; // idempotent: onChannelOpen may fire once
    offerSent = true;
    const frame: TransferControlFrame = { t: 'offer', file: meta, chunkSize: TRANSFER_CHUNK_SIZE, chunks };
    pc.sendData(JSON.stringify(frame));
    void diag.info('airdrop.transfer.offer_sent', { sessionId, name: meta.name, size: meta.size, chunks });
  };

  // onChannelOpen fires immediately (next tick) if the channel is already open.
  pc.onChannelOpen(sendOffer);

  pc.onData((data) => {
    if (typeof data !== 'string') return; // sender only consumes control frames
    const frame = parseControl(data);
    if (!frame) return;
    if (frame.t === 'accept') {
      void streamFile();
    } else if (frame.t === 'decline') {
      patchTransfer(sessionId, { status: 'declined' });
      void diag.info('airdrop.transfer.declined', { sessionId });
    }
  });

  async function streamFile() {
    try {
      patchTransfer(sessionId, { status: 'active' });
      pc.sendData(JSON.stringify({ t: 'start' } satisfies TransferControlFrame));
      const bytes = await file.getBytes();
      const started = Date.now();
      let sent = 0;

      for (let i = 0; i < bytes.length; i += TRANSFER_CHUNK_SIZE) {
        if (cancelled) return;
        // Backpressure: wait for the buffer to drain before queueing more.
        while (pc.bufferedAmount() > BUFFER_HIGH_WATER) {
          await waitFor(() => cancelled || pc.bufferedAmount() < BUFFER_LOW_WATER, 25);
          if (cancelled) return;
        }
        // Copy the slice into its own ArrayBuffer (subarray shares the backing buffer).
        const slice = bytes.slice(i, Math.min(i + TRANSFER_CHUNK_SIZE, bytes.length));
        pc.sendData(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength));
        sent += slice.byteLength;
        const elapsed = (Date.now() - started) / 1000;
        patchTransfer(sessionId, {
          bytesTransferred: sent,
          progress: bytes.length ? sent / bytes.length : 1,
          rate: elapsed > 0 ? sent / elapsed : undefined,
        });
      }

      pc.sendData(JSON.stringify({ t: 'complete' } satisfies TransferControlFrame));
      patchTransfer(sessionId, { status: 'done', progress: 1 });
      void diag.info('airdrop.transfer.sent_complete', { sessionId, bytes: sent });
    } catch (e) {
      patchTransfer(sessionId, { status: 'error', error: String(e) });
      void diag.error('airdrop.transfer.send_failed', { sessionId, error: String(e) });
    }
  }

  return () => {
    cancelled = true;
  };
}

// ── Receiver ────────────────────────────────────────────────────────────────

export interface ReceiverHandlers {
  /** Called when the sender's offer arrives; UI shows the "Download?" prompt. */
  onOffer: (meta: FileMeta) => void;
  /** Called when the file is fully received and delivered. */
  onComplete?: (meta: FileMeta) => void;
}

/**
 * Wire the receiver side. Buffers chunks after `start`, reassembles on
 * `complete`, then delivers. The accept/decline decision is deferred to the UI
 * via {@link respondToOffer}.
 */
export function attachReceiver(
  sessionId: string,
  pc: PeerConnection,
  handlers: ReceiverHandlers,
): () => void {
  let cancelled = false;
  let meta: FileMeta | null = null;
  let receiving = false;
  let received = 0;
  const parts: Uint8Array[] = [];
  const started = { at: 0 };

  pc.onData((data) => {
    if (cancelled) return;

    if (typeof data === 'string') {
      const frame = parseControl(data);
      if (!frame) return;
      if (frame.t === 'offer') {
        meta = frame.file;
        seedProgress({
          sessionId,
          direction: 'receive',
          status: 'offered',
          progress: 0,
          bytesTransferred: 0,
          totalBytes: frame.file.size,
          file: frame.file,
        });
        void diag.info('airdrop.transfer.offer_recv', { sessionId, name: frame.file.name, size: frame.file.size });
        handlers.onOffer(frame.file);
      } else if (frame.t === 'start') {
        receiving = true;
        started.at = Date.now();
        patchTransfer(sessionId, { status: 'active' });
      } else if (frame.t === 'complete') {
        void finish();
      } else if (frame.t === 'error') {
        patchTransfer(sessionId, { status: 'error', error: frame.message });
      }
      return;
    }

    // Binary chunk
    if (receiving) {
      const chunk = new Uint8Array(data);
      parts.push(chunk);
      received += chunk.byteLength;
      const total = meta?.size ?? 0;
      const elapsed = (Date.now() - started.at) / 1000;
      patchTransfer(sessionId, {
        bytesTransferred: received,
        progress: total ? Math.min(received / total, 1) : 0,
        rate: elapsed > 0 ? received / elapsed : undefined,
      });
    }
  });

  async function finish() {
    if (!meta) return;
    try {
      const total = parts.reduce((n, p) => n + p.byteLength, 0);
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const p of parts) {
        bytes.set(p, offset);
        offset += p.byteLength;
      }
      await deliverReceivedFile(bytes, meta);
      patchTransfer(sessionId, { status: 'done', progress: 1, bytesTransferred: total });
      void diag.info('airdrop.transfer.recv_complete', { sessionId, bytes: total });
      handlers.onComplete?.(meta);
    } catch (e) {
      patchTransfer(sessionId, { status: 'error', error: String(e) });
      void diag.error('airdrop.transfer.recv_failed', { sessionId, error: String(e) });
    }
  }

  return () => {
    cancelled = true;
  };
}

/** Receiver UI calls this to accept/decline the pending offer. */
export function respondToOffer(pc: PeerConnection, accept: boolean): void {
  pc.sendData(JSON.stringify({ t: accept ? 'accept' : 'decline' } satisfies TransferControlFrame));
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** Number of chunks a payload of `byteSize` would split into. */
export function plannedChunkCount(byteSize?: number): number {
  if (!byteSize || byteSize <= 0) return 0;
  return Math.ceil(byteSize / TRANSFER_CHUNK_SIZE);
}

function waitFor(cond: () => boolean, intervalMs: number): Promise<void> {
  return new Promise((resolve) => {
    const tick = () => {
      if (cond()) resolve();
      else setTimeout(tick, intervalMs);
    };
    tick();
  });
}
