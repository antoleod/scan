// Medication detection and follow-up management
import medicationsData from '../data/medications.common.json';

export interface MedicationProfile {
  id: string;
  genericName: string;
  displayName: string;
  aliases: string[];
  category: string;
  commonForms: string[];
  defaultDoseLabel: string;
  minIntervalHours: number | null;
  preferredFollowUpHours: number | null;
  usualFollowUpOptionsHours: number[];
  maxDailyDoseLabel: string;
  allowAutoPrefill: boolean;
  requiresDoctor: boolean;
  safetyNotes: string[];
  redFlags: string[];
  confidenceBoostKeywords: string[];
}

export interface MedicationDetectionResult {
  profile: MedicationProfile;
  detectedName: string;
  detectedDose: string | null;
  detectedDoseValue: number | null;
  detectedDoseUnit: string | null;
  detectedTime: string | null;
  detectedTimeMs: number;
  detectedReason: string | null;
  confidence: number;
  hasRedFlagKeywords: boolean;
}

export interface MedicationFollowUpDraft {
  medicationId: string;
  medicationName: string;
  displayName: string;
  dose: string;
  timeTaken: number;
  timeTakenText: string;
  reason: string | null;
  category: string;
  followUpHours: number;
  followUpLabel: string;
  followUpOptionsHours: number[];
  allowAutoPrefill: boolean;
  requiresDoctor: boolean;
  safetyNotes: string[];
  redFlags: string[];
  reminderText: string;
  prescriptionWarning: string | null;
  declinedFollowUp?: boolean;
}

// Build reverse alias map for fast lookup
function buildAliasMap(): Map<string, MedicationProfile> {
  const map = new Map<string, MedicationProfile>();

  for (const med of medicationsData.medications) {
    const profile = med as MedicationProfile;

    // Map each alias (normalized) to the profile
    for (const alias of profile.aliases) {
      const normalized = normalizeText(alias);
      map.set(normalized, profile);
    }

    // Also map the generic name and display name
    map.set(normalizeText(profile.genericName), profile);
    // For display name, take the first part before " / "
    const displayNameFirst = profile.displayName.split(' / ')[0];
    map.set(normalizeText(displayNameFirst), profile);
  }

  return map;
}

const aliasMap = buildAliasMap();

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Remove accents: é → e, ñ → n, etc.
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Keep only alphanumeric and space
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function countConfidenceKeywords(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) {
      count += 1;
    }
  }
  return count;
}

function extractDose(text: string): { dose: string; value: number | null; unit: string | null } | null {
  // Patterns: "400mg", "400 mg", "2 tablets", "1 comprimido", "5 ml", "500mg/1 tablet", etc.
  const patterns = [
    /(\d+(?:[.,]\d+)?)\s*([a-z%]+)/gi,  // "400 mg", "1.5 tablets"
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) {
      const value = parseFloat(match[1].replace(',', '.'));
      const unit = match[2].toLowerCase().trim();
      return {
        dose: match[0].trim(),
        value: isNaN(value) ? null : value,
        unit: unit || null,
      };
    }
  }

  return null;
}

function extractTime(text: string): { time: string; ms: number } | null {
  // Patterns: "8am", "8:30", "20h", "à 20h", "a las 8", "às 8h30"
  const timePatterns = [
    /(?:a las|à|às|at)?\s*(\d{1,2}):?(\d{2})?\s*(?:h|am|pm)?/i,
  ];

  for (const pattern of timePatterns) {
    const match = pattern.exec(text);
    if (match) {
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;

      // Simple heuristic: if PM indicator or hour >= 12 in 24h format
      if (/pm/i.test(text) && hours < 12) {
        hours += 12;
      }

      if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
        const now = new Date();
        const timeMs = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes).getTime();
        const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        return {
          time: timeStr,
          ms: timeMs,
        };
      }
    }
  }

  return null;
}

function extractReason(text: string): string | null {
  // Patterns: "para dolor", "pour fièvre", "for fever", "because of headache"
  const reasonPatterns = [
    /(?:para|por|pour|for|because of)\s+([^,.!?;]+)/i,
  ];

  for (const pattern of reasonPatterns) {
    const match = pattern.exec(text);
    if (match) {
      return match[1].trim();
    }
  }

  return null;
}

export function detectMedicationFromText(text: string): MedicationDetectionResult | null {
  if (!text || text.trim().length < 3) {
    return null;
  }

  const normalized = normalizeText(text);

  // Try to find matching medication by alias
  let matchedProfile: MedicationProfile | null = null;
  let detectedName = '';

  // Check each word in the text to find a match
  const words = text.split(/\s+/);
  for (const word of words) {
    const normWord = normalizeText(word);
    if (aliasMap.has(normWord)) {
      matchedProfile = aliasMap.get(normWord)!;
      detectedName = word;
      break;
    }
  }

  if (!matchedProfile) {
    return null;
  }

  // Extract dose
  const doseInfo = extractDose(text);
  const detectedDose = doseInfo?.dose || null;
  const detectedDoseValue = doseInfo?.value || null;
  const detectedDoseUnit = doseInfo?.unit || null;

  // Extract time
  const timeInfo = extractTime(text);
  const detectedTime = timeInfo?.time || null;
  const detectedTimeMs = timeInfo?.ms || Date.now();

  // Extract reason
  const detectedReason = extractReason(text);

  // Calculate confidence
  let confidence = 0.5; // Base confidence for alias match

  // Boost confidence if dose is detected
  if (doseInfo) {
    confidence += 0.15;
  }

  // Boost confidence if time is detected
  if (timeInfo) {
    confidence += 0.1;
  }

  // Boost confidence if reason is detected
  if (detectedReason) {
    confidence += 0.1;
  }

  // Boost confidence if confidence keywords are present
  const keywordCount = countConfidenceKeywords(text, matchedProfile.confidenceBoostKeywords);
  confidence += Math.min(keywordCount * 0.08, 0.15);

  confidence = Math.min(confidence, 1);

  // Check for red flag keywords
  const lowerText = text.toLowerCase();
  const hasRedFlagKeywords = matchedProfile.redFlags.some(flag =>
    lowerText.includes(flag.toLowerCase())
  );

  return {
    profile: matchedProfile,
    detectedName,
    detectedDose,
    detectedDoseValue,
    detectedDoseUnit,
    detectedTime,
    detectedTimeMs,
    detectedReason,
    confidence,
    hasRedFlagKeywords,
  };
}

export function buildMedicationFollowUp(
  detection: MedicationDetectionResult,
  overrides?: {
    dose?: string;
    timeTakenMs?: number;
    reason?: string;
    followUpHours?: number;
  }
): MedicationFollowUpDraft {
  const profile = detection.profile;

  // Determine dose
  let finalDose = overrides?.dose || detection.detectedDose || profile.defaultDoseLabel || 'As prescribed';

  // Determine time taken
  const timeTakenMs = overrides?.timeTakenMs || detection.detectedTimeMs;
  const timeTakenDate = new Date(timeTakenMs);
  const timeTakenText = `${String(timeTakenDate.getHours()).padStart(2, '0')}:${String(timeTakenDate.getMinutes()).padStart(2, '0')}`;

  // Determine reason
  const reason = overrides?.reason || detection.detectedReason || null;

  // Determine follow-up hours
  let followUpHours = overrides?.followUpHours || profile.preferredFollowUpHours || 6;

  // Build follow-up label
  const followUpLabel = `Check how you feel in ${followUpHours} hour${followUpHours === 1 ? '' : 's'}.`;

  // Build reminder text based on medication type
  let reminderText = followUpLabel;
  if (profile.requiresDoctor) {
    reminderText = 'Follow prescription and doctor instructions. ' + followUpLabel;
  }

  // Prescription warning for Rx-only medications
  const prescriptionWarning = profile.requiresDoctor
    ? 'Prescription-only medication. Follow your doctor or pharmacist instructions exactly.'
    : null;

  return {
    medicationId: profile.id,
    medicationName: profile.genericName,
    displayName: profile.displayName,
    dose: finalDose,
    timeTaken: timeTakenMs,
    timeTakenText,
    reason,
    category: profile.category,
    followUpHours,
    followUpLabel,
    followUpOptionsHours: profile.usualFollowUpOptionsHours,
    allowAutoPrefill: profile.allowAutoPrefill,
    requiresDoctor: profile.requiresDoctor,
    safetyNotes: profile.safetyNotes,
    redFlags: profile.redFlags,
    reminderText,
    prescriptionWarning,
  };
}

export function getMedicationById(id: string): MedicationProfile | null {
  for (const med of medicationsData.medications) {
    if ((med as MedicationProfile).id === id) {
      return med as MedicationProfile;
    }
  }
  return null;
}

export function getAllMedications(): MedicationProfile[] {
  return medicationsData.medications as MedicationProfile[];
}
