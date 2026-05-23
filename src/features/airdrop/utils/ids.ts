/**
 * ID and token generation for AirDrop.
 *
 * Uses crypto-grade randomness when available (`crypto.getRandomValues`, present
 * on web and modern RN runtimes) and falls back to Math.random only as a last
 * resort. Tokens are URL/QR safe.
 */
import { SESSION_TOKEN_LENGTH } from '../constants';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const g = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (g?.getRandomValues) {
    g.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < n; i += 1) out[i] = Math.floor(Math.random() * 256);
  return out;
}

/** Crockford-ish base32-flavored token, e.g. "K7P2QM9XAB". */
export function generateToken(length = SESSION_TOKEN_LENGTH): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Prefixed unique id, e.g. "ssn_lr8f2k_k7p2qm9xab12".
 *
 * The random suffix is the entropy source: 16 chars over a 32-symbol alphabet
 * ≈ 80 bits, so session ids are not enumerable even though the signaling room
 * is publicly readable. (Authorization is the separately-enforced token; this
 * just removes the cheap-guess / enumeration vector.) The timestamp segment is
 * for human-readable ordering only and is not relied on for uniqueness.
 */
export function generateId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = generateToken(16).toLowerCase();
  return `${prefix}_${time}_${rand}`;
}

export function generateSessionId(): string {
  return generateId('ssn');
}

export function generatePeerId(): string {
  return generateId('peer');
}

/**
 * Authorization gate for a guest's presence frame on the PUBLIC signaling room.
 * The host only pairs when the presented token exactly matches the session's
 * own token. A constant-time-ish equality is unnecessary here (tokens are
 * single-use, short-lived, ≥10 random chars) but the match must be strict:
 * empty/undefined tokens never authorize, so possession of a public sessionId
 * alone is not enough to join.
 */
export function isPresenceAuthorized(
  expectedToken: string | undefined | null,
  presentedToken: string | undefined | null,
): boolean {
  if (!expectedToken || !presentedToken) return false;
  return expectedToken === presentedToken;
}
