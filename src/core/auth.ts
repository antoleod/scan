const DEFAULT_EMAIL_DOMAIN = 'oryxen.tech';

export function normalizeIdentifier(input: string) {
  const value = input.trim().toLowerCase();
  if (!value) return '';
  return value.includes('@') ? value : `${value}@${DEFAULT_EMAIL_DOMAIN}`;
}
