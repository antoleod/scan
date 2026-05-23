// Smart workflow detection for notes: medication, shopping, reminder, task
import { analyzeShoppingListCandidate } from './shoppingList';
import { findMedication } from './euMedicationDatabase';

export type SmartWorkflowType = 'none' | 'medication' | 'shopping' | 'reminder' | 'task';

export interface SmartWorkflowDetection {
  type: SmartWorkflowType;
  confidence: number; // 0-1
  title: string;
  reason: string;
  extracted?: Record<string, unknown>;
}

export interface WorkflowMetadata {
  medicationName?: string;
  doseText?: string;
  takenAt?: number;
  takenAtText?: string;
  reason?: string;
  symptomLevel?: number;
  followUpAt?: number;
  followUpLabel?: string;
  checklistItems?: {
    id: string;
    text: string;
    completed: boolean;
  }[];
  extractedFromText?: boolean;
}

// Medication keywords by language
const MEDICATION_KEYWORDS = {
  es: [
    'medicamento', 'medicación', 'pastilla', 'tableta', 'jarabe',
    'tomé', 'tome', 'tomar', 'dosis', 'fiebre', 'garganta', 'dolor', 'tos',
  ],
  fr: [
    'médicament', 'comprimé', 'sirop', 'pris', 'prendre', 'dose',
    'fièvre', 'gorge', 'douleur', 'toux',
  ],
  en: [
    'medication', 'medicine', 'pill', 'tablet', 'syrup',
    'took', 'take', 'dose', 'fever', 'throat', 'pain', 'cough',
  ],
};

// Reminder keywords by language
const REMINDER_KEYWORDS = {
  es: [
    'recordar', 'recuérdame', 'recordatorio', 'no olvidar', 'tengo que',
  ],
  fr: [
    'rappel', 'rappelle-moi', 'ne pas oublier', 'je dois',
  ],
  en: [
    'remind', 'reminder', 'do not forget', 'must', 'have to', 'remember to',
  ],
};

// Task keywords by language.
// NOTE: deliberately excludes ultra-common verbs ('hacer', 'do', 'necesito',
// 'need to', 'faire') — at 0.5/keyword they would misclassify ordinary notes as
// tasks. Kept to distinctive task markers + explicit lead keywords like 'todo'.
const TASK_KEYWORDS = {
  es: [
    'tarea', 'tareas', 'pendiente', 'todo', 'por hacer',
  ],
  fr: [
    'tâche', 'tâches', 'à faire',
  ],
  en: [
    'task', 'tasks', 'todo', 'to-do', 'pending',
  ],
};

function detectLanguage(text: string): 'es' | 'fr' | 'en' {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return 'en';

  // M-4: score distinctive, low-ambiguity markers and pick the max instead of
  // returning on the first loose match. The old code keyed on shared function
  // words ("la", "el", "un") that match both Spanish AND French, so any French
  // note containing "la" was misclassified as Spanish (Spanish was checked first),
  // selecting the wrong keyword set and lowering detection accuracy.
  let es = 0;
  let fr = 0;

  // Spanish-only characters / words
  if (/[ñ¿¡]/.test(lower)) es += 2;
  if (/\b(tomé|tome|pastilla|medicamento|medicación|recordar|recuérdame|recordatorio|olvidar|olvides|tarea|pendiente|tengo que|necesito|debo|mañana|jarabe|fiebre|garganta|dolor)\b/.test(lower)) es += 1;

  // French-only characters / words
  if (/[çœ]/.test(lower)) fr += 2;
  if (/\b(je|j'ai|c'est|médicament|comprimé|sirop|prendre|pris|rappel|rappelle|tâche|tâches|n'oublie|ne pas oublier|aujourd'hui|demain|fièvre|gorge|douleur)\b/.test(lower)) fr += 1;

  if (es === 0 && fr === 0) return 'en';
  return es >= fr ? 'es' : 'fr';
}

function countKeywordMatches(text: string, keywords: string[]): number {
  const lower = String(text || '').toLowerCase();
  return keywords.filter(kw => lower.includes(kw)).length;
}

function extractMedicationName(text: string): string | null {
  const value = String(text || '');
  // Use EU medication database for detection
  const med = findMedication(value);
  if (med) {
    // Try to extract the word after "tomé" or "tome" for context
    const match = value.match(
      new RegExp(`(?:tomé|tome|tomar|pris|prendre|took|take)\\s+([a-záéíóúña-z]+)`, 'i')
    );
    if (match) return match[1];

    // Return the medication name (use first name in the list)
    return med.names[0];
  }
  return null;
}

function extractDoseText(text: string): string | null {
  const value = String(text || '');
  // Match patterns like "400mg", "1g", "2 comprimidos", etc.
  const match = value.match(/(\d+(?:,\d+)?)\s*([a-z]+)/i);
  if (match) return match[0];
  return null;
}

function extractTakenAtText(text: string): string | null {
  const value = String(text || '');
  // Match time patterns: "8", "08:00", "20h", "las 8", "à 20h"
  const match = value.match(/(?:a las|à|at)?\s*(\d{1,2}):?(\d{2})?\s*(?:h|am|pm)?/i);
  if (match) {
    return match[0].trim();
  }
  return null;
}

function extractReason(text: string): string | null {
  // Extract reason after "por", "pour", "for", "because of"
  const value = String(text || '');
  const match = value.match(/(?:por|pour|for|because of)\s+([^,.]+)/i);
  if (match) return match[1].trim();
  return null;
}

function detectMedicationWorkflow(text: string): SmartWorkflowDetection {
  const value = String(text || '');
  const lang = detectLanguage(value);
  const keywords = MEDICATION_KEYWORDS[lang] || MEDICATION_KEYWORDS.en;

  let confidence = 0;

  // Check for medication aliases (high confidence)
  const medicationName = extractMedicationName(value);
  if (medicationName) {
    confidence = 0.7; // Direct medication name found = high confidence
  }

  // Check for keywords (only if no medication name detected)
  const keywordMatches = countKeywordMatches(value, keywords);
  if (!medicationName) {
    confidence += Math.min(keywordMatches * 0.15, 0.4);
  }

  // Check for dose pattern
  if (extractDoseText(value)) {
    confidence += medicationName ? 0.05 : 0.1; // Smaller boost if already confident
  }

  // Check for time pattern
  if (extractTakenAtText(value)) {
    confidence += medicationName ? 0.05 : 0.1; // Smaller boost if already confident
  }

  const hasMedicationSignal = medicationName || keywordMatches >= 2;

  return {
    type: hasMedicationSignal ? 'medication' : 'none',
    confidence: Math.min(confidence, 1),
    title: 'Medication detected',
    reason: 'We can create a follow-up reminder from this note.',
    extracted: {
      medicationName,
      doseText: extractDoseText(value),
      takenAtText: extractTakenAtText(value),
      reason: extractReason(value),
    },
  };
}

function detectShoppingWorkflow(text: string): SmartWorkflowDetection {
  const value = String(text || '');
  // Use the SAME shopping engine as the rest of the app (shoppingList.ts).
  // Previously this path used groceryDetection, which split only on \n;,: (not
  // spaces) — so "milk bread and cheese" matched 0 items — and lacked the
  // health-keyword blocker. analyzeShoppingListCandidate handles space/connector
  // tokenization, narrative blockers, and health blocking in one place.
  const analysis = analyzeShoppingListCandidate(value);

  // Treat as shopping when EITHER signal fires:
  //  - isCandidate: the strict gate (great for short connector lists like
  //    "milk bread and cheese"), OR
  //  - ≥3 parsed items with a high score: covers longer comma lists where the
  //    engine's strict `productHits >= parsedItems.length` check is over-tight
  //    on plurals/accents (e.g. "Manzanas, plátanos, leche, …" scores 0.94 yet
  //    isCandidate is false). Health/narrative blockers already zeroed those.
  const looksLikeShopping =
    analysis.isCandidate ||
    (analysis.parsedItems.length >= 3 && analysis.confidence >= 0.62);

  if (!looksLikeShopping) {
    return { type: 'none', confidence: 0, title: '', reason: '' };
  }

  return {
    type: 'shopping',
    // Floor at 0.65 so a confirmed candidate clears detectSmartWorkflow's gate;
    // analysis.confidence (already 0..1) carries the finer signal above that.
    confidence: Math.max(0.65, Math.min(analysis.confidence, 1)),
    title: 'Shopping list detected',
    reason: 'We can turn this note into a checklist.',
    extracted: {
      items: analysis.parsedItems.map((item) => ({ text: item.label })),
    },
  };
}

function detectReminderWorkflow(text: string): SmartWorkflowDetection {
  const value = String(text || '');
  const lang = detectLanguage(value);
  const keywords = REMINDER_KEYWORDS[lang] || REMINDER_KEYWORDS.en;

  let confidence = 0;

  const keywordMatches = countKeywordMatches(value, keywords);
  confidence += Math.min(keywordMatches * 0.5, 1);

  // Check for future/time references
  if (/(?:mañana|tomorrow|demain|next|próximo|la próxima)/i.test(value)) {
    confidence += 0.2;
  }

  // Reminder keywords (recordar / remind / rappel / no olvidar …) are distinctive,
  // explicit intent markers — unlike the ambiguous task verbs. A single one should
  // classify on its own, so imperative reminders WITHOUT a future word ("recordar
  // comprar pan", "remind me to buy bread") don't fall through to 'none'. Floor at
  // the gate; future-word / multi-keyword still raise confidence above it.
  if (keywordMatches >= 1) {
    confidence = Math.max(confidence, 0.65);
  }

  return {
    type: keywordMatches >= 1 ? 'reminder' : 'none',
    confidence: Math.min(confidence, 1),
    title: 'Reminder detected',
    reason: 'We can create a reminder from this note.',
    extracted: {},
  };
}

function detectTaskWorkflow(text: string): SmartWorkflowDetection {
  const value = String(text || '');
  const lang = detectLanguage(value);
  const keywords = TASK_KEYWORDS[lang] || TASK_KEYWORDS.en;

  let confidence = 0;

  const keywordMatches = countKeywordMatches(value, keywords);
  // 0.5 per keyword (was 0.25 — task could never reach the 0.65 gate).
  confidence += Math.min(keywordMatches * 0.5, 1);

  // An explicit lead marker ("task:", "todo:", "tarea:", "à faire:") is a strong
  // intent signal — clears the gate on its own so "task: finish report" works.
  if (/^\s*(?:task|to-?do|tarea|tâche|pendiente)\s*[:\-]/i.test(value)) {
    confidence += 0.3;
  }

  return {
    type: keywordMatches >= 1 ? 'task' : 'none',
    confidence: Math.min(confidence, 1),
    title: 'Task detected',
    reason: 'We can track this as a task.',
    extracted: {},
  };
}

export function detectSmartWorkflow(text: string): SmartWorkflowDetection {
  const value = String(text || '');
  if (value.trim().length < 10) {
    return {
      type: 'none',
      confidence: 0,
      title: '',
      reason: '',
    };
  }

  // Check all workflow types and return the highest confidence
  const detections = [
    detectMedicationWorkflow(value),
    detectShoppingWorkflow(value),
    detectReminderWorkflow(value),
    detectTaskWorkflow(value),
  ];

  // Filter out 'none' types and sort by confidence
  const relevant = detections.filter(d => d.type !== 'none').sort((a, b) => b.confidence - a.confidence);

  if (relevant.length > 0 && relevant[0].confidence >= 0.65) {
    return relevant[0];
  }

  return {
    type: 'none',
    confidence: 0,
    title: '',
    reason: '',
  };
}

/**
 * Detect smart type from note content (simplified version for auto-classification)
 * Returns the detected type with high confidence (>= 0.65) or 'none'
 */
export function detectSmartTypeFromContent(text: string): SmartWorkflowType {
  const detection = detectSmartWorkflow(text);
  return detection.type;
}
