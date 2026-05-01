import { resolveUsernameToAuthEmail } from './firebase';

const DEFAULT_EMAIL_DOMAIN = 'MyKit.tech';

export function normalizeIdentifier(input: string) {
  const value = input.trim().toLowerCase();
  if (!value) return '';
  return value.includes('@') ? value : `${value}@${DEFAULT_EMAIL_DOMAIN}`;
}

export async function resolveAuthEmailForLogin(identifier: string): Promise<string> {
  const value = identifier.trim().toLowerCase();
  if (!value) return '';
  if (value.includes('@')) return value;
  try {
    const resolved = await resolveUsernameToAuthEmail(value);
    if (resolved?.authEmail) return resolved.authEmail;
  } catch {
    // network error — fall through to legacy
  }
  return `${value}@${DEFAULT_EMAIL_DOMAIN}`;
}
