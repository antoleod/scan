// Smart workflow detection for notes: medication, shopping, reminder, task

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

const MEDICATION_ALIASES = [
  'dafalgan', 'doliprane', 'paracetamol', 'acetaminophen',
  'ibuprofen', 'ibuprofeno', 'ibuprofène', 'nurofen',
  'amoxicillin', 'amoxicilina', 'amoxicilline', 'augmentin',
];

// Shopping keywords by language
const SHOPPING_KEYWORDS = {
  es: [
    'comprar', 'compra', 'supermercado', 'mercado', 'necesito comprar', 'lista de compras',
  ],
  fr: [
    'acheter', 'courses', 'supermarché', 'liste de courses',
  ],
  en: [
    'buy', 'shopping', 'groceries', 'grocery list', 'need to buy',
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

// Task keywords by language
const TASK_KEYWORDS = {
  es: [
    'tarea', 'tareas', 'hacer', 'debo', 'necesito', 'pendiente', 'todo',
  ],
  fr: [
    'tâche', 'tâches', 'faire', 'je dois', 'j\'ai besoin',
  ],
  en: [
    'task', 'tasks', 'do', 'must do', 'need to', 'todo', 'pending',
  ],
};

function detectLanguage(text: string): 'es' | 'fr' | 'en' {
  const lower = text.toLowerCase();

  // Spanish indicators
  if (/\b(tomé|tome|tomar|para|por|de la|el|la|los|las|una|unos)\b/.test(lower)) {
    return 'es';
  }

  // French indicators
  if (/\b(pris|prendre|pour|à|le|la|les|un|une|des)\b/.test(lower)) {
    return 'fr';
  }

  // English by default
  return 'en';
}

function countKeywordMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter(kw => lower.includes(kw)).length;
}

function extractMedicationName(text: string): string | null {
  const lower = text.toLowerCase();
  for (const alias of MEDICATION_ALIASES) {
    if (lower.includes(alias)) {
      // Try to extract the word after "tomé" or "tome"
      const match = text.match(
        new RegExp(`(?:tomé|tome|tomar|pris|prendre)\\s+([a-záéíóúñ]+)`, 'i')
      );
      if (match) return match[1];
      return alias;
    }
  }
  return null;
}

function extractDoseText(text: string): string | null {
  // Match patterns like "400mg", "1g", "2 comprimidos", etc.
  const match = text.match(/(\d+(?:,\d+)?)\s*([a-z]+)/i);
  if (match) return match[0];
  return null;
}

function extractTakenAtText(text: string): string | null {
  // Match time patterns: "8", "08:00", "20h", "las 8", "à 20h"
  const match = text.match(/(?:a las|à|at)?\s*(\d{1,2}):?(\d{2})?\s*(?:h|am|pm)?/i);
  if (match) {
    return match[0].trim();
  }
  return null;
}

function extractReason(text: string): string | null {
  // Extract reason after "por", "pour", "for", "because of"
  const match = text.match(/(?:por|pour|for|because of)\s+([^,.]+)/i);
  if (match) return match[1].trim();
  return null;
}

function detectMedicationWorkflow(text: string): SmartWorkflowDetection {
  const lang = detectLanguage(text);
  const keywords = MEDICATION_KEYWORDS[lang] || MEDICATION_KEYWORDS.en;

  let confidence = 0;

  // Check for medication aliases (high confidence)
  if (extractMedicationName(text)) {
    confidence += 0.5;
  }

  // Check for keywords
  const keywordMatches = countKeywordMatches(text, keywords);
  confidence += Math.min(keywordMatches * 0.15, 0.4);

  // Check for dose pattern
  if (extractDoseText(text)) {
    confidence += 0.1;
  }

  // Check for time pattern
  if (extractTakenAtText(text)) {
    confidence += 0.1;
  }

  const medicationName = extractMedicationName(text);
  const hasMedicationSignal = medicationName || keywordMatches >= 2;

  return {
    type: hasMedicationSignal ? 'medication' : 'none',
    confidence: Math.min(confidence, 1),
    title: 'Medication detected',
    reason: 'We can create a follow-up reminder from this note.',
    extracted: {
      medicationName,
      doseText: extractDoseText(text),
      takenAtText: extractTakenAtText(text),
      reason: extractReason(text),
    },
  };
}

function detectShoppingWorkflow(text: string): SmartWorkflowDetection {
  const lang = detectLanguage(text);
  const keywords = SHOPPING_KEYWORDS[lang] || SHOPPING_KEYWORDS.en;

  let confidence = 0;

  // Check for shopping keywords
  const keywordMatches = countKeywordMatches(text, keywords);
  confidence += Math.min(keywordMatches * 0.3, 0.4);

  // Check for list pattern (commas, newlines, "y/and/et")
  const hasListPattern = /[,\n]|(\s(?:y|and|et)\s)/.test(text);
  if (hasListPattern) {
    confidence += 0.3;
  }

  // Check for multiple items
  const items = text.split(/[,\n]/).filter(s => s.trim().length > 2);
  if (items.length >= 2) {
    confidence += 0.2;
  }

  return {
    type: keywordMatches >= 1 || (hasListPattern && items.length >= 2) ? 'shopping' : 'none',
    confidence: Math.min(confidence, 1),
    title: 'Shopping list detected',
    reason: 'We can turn this note into a checklist.',
    extracted: {
      items: items.map(s => s.trim()).filter(s => s),
    },
  };
}

function detectReminderWorkflow(text: string): SmartWorkflowDetection {
  const lang = detectLanguage(text);
  const keywords = REMINDER_KEYWORDS[lang] || REMINDER_KEYWORDS.en;

  let confidence = 0;

  const keywordMatches = countKeywordMatches(text, keywords);
  confidence += Math.min(keywordMatches * 0.25, 0.6);

  // Check for future/time references
  if (/(?:mañana|tomorrow|demain|next|próximo|la próxima)/i.test(text)) {
    confidence += 0.2;
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
  const lang = detectLanguage(text);
  const keywords = TASK_KEYWORDS[lang] || TASK_KEYWORDS.en;

  let confidence = 0;

  const keywordMatches = countKeywordMatches(text, keywords);
  confidence += Math.min(keywordMatches * 0.25, 0.5);

  return {
    type: keywordMatches >= 1 ? 'task' : 'none',
    confidence: Math.min(confidence, 1),
    title: 'Task detected',
    reason: 'We can track this as a task.',
    extracted: {},
  };
}

export function detectSmartWorkflow(text: string): SmartWorkflowDetection {
  if (!text || text.trim().length < 10) {
    return {
      type: 'none',
      confidence: 0,
      title: '',
      reason: '',
    };
  }

  // Check all workflow types and return the highest confidence
  const detections = [
    detectMedicationWorkflow(text),
    detectShoppingWorkflow(text),
    detectReminderWorkflow(text),
    detectTaskWorkflow(text),
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
