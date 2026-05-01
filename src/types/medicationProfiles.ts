export interface EuMedicationProfile {
  id: string;
  displayName: string;
  aliases: string[];
  activeSubstance: string;
  category: string;
  defaultDoseLabel?: string;
  doseOptions: string[];
  recommendedFollowUpHours?: number;
  minIntervalHours?: number;
  maxDailyDoseLabel?: string;
  safetyNote: string;
  sourceRegion: string;
}

export type EuMedicationProfileMap = Record<string, EuMedicationProfile>;
