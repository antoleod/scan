/**
 * QR payload encode/decode for AirDrop pairing.
 *
 * The QR now encodes a real **deep-link URL** so that scanning it with ANY
 * external reader (phone camera, Lens, etc.) opens the app straight into
 * AirDrop → Receive and pairs automatically:
 *
 *   https://<host><basePath>/app?airdrop=<sessionId>:<token>#airdrop
 *
 * The pairing data carries NO file bytes and no sensitive identity — only a
 * session id + short token used to JOIN over signaling.
 *
 * For backward compatibility, the legacy compact form
 * `scan-airdrop:1:<sessionId>:<token>` is still decoded.
 */
import { AIRDROP_JOIN_PARAM, AIRDROP_QR_PREFIX, AIRDROP_QR_VERSION } from '../constants';

export interface QrPairingPayload {
  v: number;
  session: string;
  token: string;
}

/** `<sessionId>:<token>` — the value carried in the `airdrop` query param. */
function joinCode(sessionId: string, token: string): string {
  return `${sessionId}:${token}`;
}

/**
 * Resolve the app's base URL for the current deployment so the QR points at a
 * real, openable address. On web uses the live origin + EXPO_PUBLIC_BASE_PATH;
 * off-web falls back to a stable https placeholder host.
 */
function appBaseUrl(): string {
  const rawBase = String(process.env.EXPO_PUBLIC_BASE_PATH || '').trim();
  // Normalize base path to "" or "/x" (no trailing slash).
  let base = rawBase;
  if (base === '/' ) base = '';
  if (base && !base.startsWith('/')) base = `/${base}`;
  if (base.endsWith('/')) base = base.slice(0, -1);

  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://app.local';
  return `${origin}${base}`;
}

/**
 * Encode a scannable deep-link URL, e.g.
 * `https://host/scan/app?airdrop=ssn_x:TOKEN#airdrop`.
 */
export function encodeQrPayload(sessionId: string, token: string): string {
  const code = encodeURIComponent(joinCode(sessionId, token));
  return `${appBaseUrl()}/app?${AIRDROP_JOIN_PARAM}=${code}#airdrop`;
}

/** Parse a `<sessionId>:<token>` join code into a payload. */
function parseJoinCode(code: string): QrPairingPayload | null {
  const value = decodeURIComponent(String(code || '').trim());
  const idx = value.indexOf(':');
  if (idx <= 0) return null;
  const session = value.slice(0, idx);
  const token = value.slice(idx + 1);
  if (!session || !token) return null;
  return { v: AIRDROP_QR_VERSION, session, token };
}

/**
 * Returns the parsed payload, or null if the string is not an AirDrop QR.
 * Accepts three shapes:
 *   1. deep-link URL with `?airdrop=session:token`
 *   2. legacy compact `scan-airdrop:1:session:token`
 *   3. bare `session:token` (manual entry convenience)
 */
export function decodeQrPayload(raw: string): QrPairingPayload | null {
  const text = String(raw || '').trim();
  if (!text) return null;

  // (1) Deep-link URL
  const fromUrl = decodeFromUrl(text);
  if (fromUrl) return fromUrl;

  // (2) Legacy compact form
  if (text.startsWith(AIRDROP_QR_PREFIX)) {
    const body = text.slice(AIRDROP_QR_PREFIX.length);
    const parts = body.split(':');
    if (parts.length !== 3) return null;
    const v = Number(parts[0]);
    if (!Number.isFinite(v) || v < 1) return null;
    if (!parts[1] || !parts[2]) return null;
    return { v, session: parts[1], token: parts[2] };
  }

  return null;
}

/** Extract the join code from a deep-link URL's `airdrop` query param. */
function decodeFromUrl(text: string): QrPairingPayload | null {
  if (!/^https?:\/\//i.test(text)) return null;
  // Pull the query string without depending on URL() (RN-safe).
  const qIndex = text.indexOf('?');
  if (qIndex < 0) return null;
  const afterQ = text.slice(qIndex + 1);
  // Query ends at the hash.
  const query = afterQ.split('#')[0];
  for (const pair of query.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const key = pair.slice(0, eq);
    if (key === AIRDROP_JOIN_PARAM) {
      return parseJoinCode(pair.slice(eq + 1));
    }
  }
  return null;
}

/** Quick predicate for a camera handler to test a scanned string. */
export function isAirdropQr(raw: string): boolean {
  const text = String(raw || '').trim();
  if (!text) return false;
  if (text.startsWith(AIRDROP_QR_PREFIX)) return true;
  // A deep-link URL that actually carries the join param.
  return /^https?:\/\//i.test(text) && decodeFromUrl(text) !== null;
}

/**
 * Read the pairing payload from the app's current URL (`?airdrop=…`), if any.
 * Used at boot to auto-open Receive. Web-only; returns null elsewhere.
 */
export function readJoinFromCurrentUrl(): QrPairingPayload | null {
  if (typeof window === 'undefined' || !window.location) return null;
  const search = window.location.search || '';
  if (!search) return null;
  const params = search.replace(/^\?/, '').split('&');
  for (const pair of params) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    if (pair.slice(0, eq) === AIRDROP_JOIN_PARAM) {
      return parseJoinCode(pair.slice(eq + 1));
    }
  }
  return null;
}

/** Remove the `airdrop` param from the URL after consuming it (web). */
export function clearJoinFromUrl(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  const { origin, pathname, hash, search } = window.location;
  if (!search) return;
  const kept = search
    .replace(/^\?/, '')
    .split('&')
    .filter((p) => p.split('=')[0] !== AIRDROP_JOIN_PARAM);
  const nextSearch = kept.length ? `?${kept.join('&')}` : '';
  window.history.replaceState(window.history.state, '', `${origin}${pathname}${nextSearch}${hash}`);
}
