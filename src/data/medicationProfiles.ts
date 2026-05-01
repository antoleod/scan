import profilesJson from './euMedicationProfiles.json';
import type { EuMedicationProfile, EuMedicationProfileMap } from '../types/medicationProfiles';

const profiles = profilesJson as EuMedicationProfileMap;

export function normalizeMedicationName(value: string): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getEuMedicationProfiles(): EuMedicationProfile[] {
  return Object.values(profiles).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function findEuMedicationProfile(input: string): EuMedicationProfile | null {
  const needle = normalizeMedicationName(input);
  if (!needle) return null;

  for (const profile of Object.values(profiles)) {
    const candidates = [
      profile.id,
      profile.displayName,
      profile.activeSubstance,
      ...profile.aliases,
    ].map(normalizeMedicationName);

    if (candidates.includes(needle)) return profile;
  }

  return null;
}
