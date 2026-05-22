/**
 * QR pairing glue: turn a scanned/typed string into a session join.
 *
 * Generation lives in ../utils/qr (encode/decode). This module wires decode →
 * joinSession so the Receive/Nearby screens can hand a raw camera string here
 * and get a started session back.
 */
import { decodeQrPayload, encodeQrPayload, isAirdropQr } from '../utils/qr';
import { joinSession } from '../sessions/sessionService';
import type { ReceiverHandlers } from '../transfer/transferService';
import type { ShareSession } from '../types';

export { encodeQrPayload, decodeQrPayload, isAirdropQr };

export interface PairResult {
  ok: boolean;
  session?: ShareSession;
  reason?: string;
}

/**
 * Validate a scanned QR string and join the session it points to. The optional
 * receiver handlers wire the incoming-file offer/complete callbacks so the UI
 * can show the "Download?" confirmation.
 */
export async function pairFromQrString(
  raw: string,
  receiverHandlers?: ReceiverHandlers,
): Promise<PairResult> {
  const payload = decodeQrPayload(raw);
  if (!payload) return { ok: false, reason: 'Not a valid AirDrop QR code.' };
  try {
    const session = await joinSession(payload.session, payload.token, receiverHandlers);
    return { ok: true, session };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Failed to join session.' };
  }
}
