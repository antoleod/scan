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

/** Prefixed unique id, e.g. "ssn_lr8f2k_K7P2". */
export function generateId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = generateToken(4).toLowerCase();
  return `${prefix}_${time}_${rand}`;
}

export function generateSessionId(): string {
  return generateId('ssn');
}

export function generatePeerId(): string {
  return generateId('peer');
}
