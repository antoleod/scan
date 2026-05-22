// EU/Belgium common medications database
// Expanded list of frequently used medications across European countries
// Used for smart workflow detection in notes

export interface Medication {
  id: string;
  names: string[]; // All known names (generic, brand, aliases)
  category: 'painkiller' | 'antibiotic' | 'antacid' | 'antihistamine' | 'antiviral' | 'antifungal' | 'anti-inflammatory' | 'cardiovascular' | 'diabetes' | 'psychiatric' | 'sleep' | 'digestive' | 'respiratory' | 'other';
  commonDoseRanges?: string[]; // e.g., ['400mg', '500mg', '1000mg']
}

export const EU_MEDICATIONS: Medication[] = [
  // Pain relief & Fever
  {
    id: 'paracetamol',
    names: ['paracetamol', 'acetaminophen', 'dafalgan', 'tylenol', 'panadol', 'efferalgan', 'doliprane'],
    category: 'painkiller',
    commonDoseRanges: ['400mg', '500mg', '1000mg'],
  },
  {
    id: 'ibuprofen',
    names: ['ibuprofen', 'ibuprofeno', 'ibuprofène', 'nurofen', 'ibupirac', 'actron', 'brufen'],
    category: 'anti-inflammatory',
    commonDoseRanges: ['200mg', '400mg', '600mg', '800mg'],
  },
  {
    id: 'aspirin',
    names: ['aspirin', 'aspirine', 'asa', 'acetylsalicylic acid'],
    category: 'painkiller',
    commonDoseRanges: ['100mg', '500mg', '1000mg'],
  },
  {
    id: 'diclofenac',
    names: ['diclofenac', 'voltaren', 'diklofenak'],
    category: 'anti-inflammatory',
    commonDoseRanges: ['50mg', '75mg', '100mg'],
  },
  {
    id: 'naproxen',
    names: ['naproxen', 'naprosyn', 'aleve', 'naprosino'],
    category: 'anti-inflammatory',
    commonDoseRanges: ['250mg', '375mg', '500mg'],
  },

  // Antibiotics
  {
    id: 'amoxicillin',
    names: ['amoxicillin', 'amoxicilina', 'amoxicilline', 'augmentin', 'amoxypen'],
    category: 'antibiotic',
    commonDoseRanges: ['250mg', '500mg', '1000mg'],
  },
  {
    id: 'azithromycin',
    names: ['azithromycin', 'azitromicina', 'zithromax', 'z-pack'],
    category: 'antibiotic',
    commonDoseRanges: ['250mg', '500mg'],
  },
  {
    id: 'clarithromycin',
    names: ['clarithromycin', 'claritromicina', 'klacid'],
    category: 'antibiotic',
    commonDoseRanges: ['250mg', '500mg'],
  },
  {
    id: 'doxycycline',
    names: ['doxycycline', 'doxiciclina', 'vibramycin', 'doxyvit'],
    category: 'antibiotic',
    commonDoseRanges: ['100mg', '200mg'],
  },

  // Digestive & Antacids
  {
    id: 'omeprazole',
    names: ['omeprazole', 'omeprazol', 'losec', 'prilosec', 'omepral'],
    category: 'antacid',
    commonDoseRanges: ['20mg', '40mg'],
  },
  {
    id: 'ranitidine',
    names: ['ranitidine', 'ranitidina', 'zantac'],
    category: 'antacid',
    commonDoseRanges: ['150mg', '300mg'],
  },
  {
    id: 'metoclopramide',
    names: ['metoclopramide', 'metoclopramida', 'plasil', 'reglan'],
    category: 'digestive',
    commonDoseRanges: ['10mg'],
  },
  {
    id: 'buscopan',
    names: ['buscopan', 'hyoscine', 'buscapina', 'scopolamine'],
    category: 'digestive',
    commonDoseRanges: ['10mg', '20mg'],
  },

  // Antihistamines & Allergies
  {
    id: 'loratadine',
    names: ['loratadine', 'loratadina', 'claritine', 'claritin'],
    category: 'antihistamine',
    commonDoseRanges: ['10mg'],
  },
  {
    id: 'cetirizine',
    names: ['cetirizine', 'cetirizina', 'piriteze', 'zyrtec'],
    category: 'antihistamine',
    commonDoseRanges: ['10mg'],
  },
  {
    id: 'fexofenadine',
    names: ['fexofenadine', 'fexofenadina', 'telfast', 'allegra'],
    category: 'antihistamine',
    commonDoseRanges: ['120mg', '180mg'],
  },
  {
    id: 'desloratadine',
    names: ['desloratadine', 'desloratadina', 'aerius', 'clarinex'],
    category: 'antihistamine',
    commonDoseRanges: ['5mg'],
  },

  // Antiviral
  {
    id: 'acyclovir',
    names: ['acyclovir', 'aciclovir', 'zovirax'],
    category: 'antiviral',
    commonDoseRanges: ['200mg', '400mg', '800mg'],
  },

  // Antifungal
  {
    id: 'fluconazole',
    names: ['fluconazole', 'fluconazol', 'diflucan'],
    category: 'antifungal',
    commonDoseRanges: ['50mg', '100mg', '150mg', '200mg'],
  },

  // Cardiovascular
  {
    id: 'atorvastatin',
    names: ['atorvastatin', 'atorvastatina', 'lipitor', 'sortis'],
    category: 'cardiovascular',
    commonDoseRanges: ['10mg', '20mg', '40mg', '80mg'],
  },
  {
    id: 'simvastatin',
    names: ['simvastatin', 'simvastatina', 'zocor', 'simlip'],
    category: 'cardiovascular',
    commonDoseRanges: ['10mg', '20mg', '40mg'],
  },
  {
    id: 'lisinopril',
    names: ['lisinopril', 'lisino', 'prinivil', 'zestril'],
    category: 'cardiovascular',
    commonDoseRanges: ['5mg', '10mg', '20mg'],
  },
  {
    id: 'enalapril',
    names: ['enalapril', 'enalaprilo', 'innopril', 'renitec'],
    category: 'cardiovascular',
    commonDoseRanges: ['5mg', '10mg', '20mg'],
  },
  {
    id: 'amlodipine',
    names: ['amlodipine', 'amlodipina', 'norvasc', 'istin'],
    category: 'cardiovascular',
    commonDoseRanges: ['5mg', '10mg'],
  },

  // Diabetes
  {
    id: 'metformin',
    names: ['metformin', 'metformina', 'glucophage', 'diabetase'],
    category: 'diabetes',
    commonDoseRanges: ['500mg', '850mg', '1000mg'],
  },

  // Psychiatric/Mental Health
  {
    id: 'fluoxetine',
    names: ['fluoxetine', 'fluoxetina', 'prozac', 'fluoxeren'],
    category: 'psychiatric',
    commonDoseRanges: ['20mg', '40mg'],
  },
  {
    id: 'paroxetine',
    names: ['paroxetine', 'paroxetina', 'seroxat', 'paxil'],
    category: 'psychiatric',
    commonDoseRanges: ['20mg', '30mg'],
  },
  {
    id: 'sertraline',
    names: ['sertraline', 'sertralina', 'zoloft'],
    category: 'psychiatric',
    commonDoseRanges: ['50mg', '100mg'],
  },
  {
    id: 'escitalopram',
    names: ['escitalopram', 'escitaloprama', 'cipralex', 'lexapro'],
    category: 'psychiatric',
    commonDoseRanges: ['10mg', '20mg'],
  },
  {
    id: 'citalopram',
    names: ['citalopram', 'citaloprama', 'celexa', 'cipramil'],
    category: 'psychiatric',
    commonDoseRanges: ['20mg', '40mg'],
  },
  {
    id: 'venlafaxine',
    names: ['venlafaxine', 'venlafaxina', 'effexor'],
    category: 'psychiatric',
    commonDoseRanges: ['75mg', '150mg'],
  },
  {
    id: 'mirtazapine',
    names: ['mirtazapine', 'mirtazapina', 'remeron', 'mirthazapine'],
    category: 'psychiatric',
    commonDoseRanges: ['15mg', '30mg'],
  },

  // Sleep
  {
    id: 'zolpidem',
    names: ['zolpidem', 'zolpidema', 'ambien', 'stilnox'],
    category: 'sleep',
    commonDoseRanges: ['5mg', '10mg'],
  },
  {
    id: 'zopiclone',
    names: ['zopiclone', 'zopiclon', 'imovane', 'zimovane'],
    category: 'sleep',
    commonDoseRanges: ['5mg', '7.5mg'],
  },
  {
    id: 'melatonin',
    names: ['melatonin', 'melatonina', 'circadin'],
    category: 'sleep',
    commonDoseRanges: ['2mg', '5mg'],
  },

  // Anxiolytics/Benzodiazepines
  {
    id: 'alprazolam',
    names: ['alprazolam', 'alprazolama', 'xanax'],
    category: 'psychiatric',
    commonDoseRanges: ['0.25mg', '0.5mg', '1mg'],
  },
  {
    id: 'lorazepam',
    names: ['lorazepam', 'lorazepama', 'ativan', 'tavor'],
    category: 'psychiatric',
    commonDoseRanges: ['0.5mg', '1mg', '2mg'],
  },
  {
    id: 'diazepam',
    names: ['diazepam', 'diazepama', 'valium'],
    category: 'psychiatric',
    commonDoseRanges: ['2mg', '5mg', '10mg'],
  },

  // Respiratory
  {
    id: 'salbutamol',
    names: ['salbutamol', 'albuterol', 'ventolin', 'asmol'],
    category: 'respiratory',
    commonDoseRanges: ['100mcg'],
  },
  {
    id: 'fluticasone',
    names: ['fluticasone', 'fluticasona', 'flovent', 'flixonase'],
    category: 'respiratory',
    commonDoseRanges: ['50mcg', '110mcg'],
  },

  // Other common
  {
    id: 'levothyroxine',
    names: ['levothyroxine', 'levotiroxina', 'synthroid', 'euthyrox'],
    category: 'other',
    commonDoseRanges: ['25mcg', '50mcg', '75mcg', '100mcg'],
  },
];

/**
 * Get all medication names for quick lookup
 */
export function getAllMedicationNames(): string[] {
  const names = new Set<string>();
  for (const med of EU_MEDICATIONS) {
    for (const name of med.names) {
      names.add(name.toLowerCase());
    }
  }
  return Array.from(names);
}

// H-3: Pre-compute lowercased (name → medication) pairs once at module load,
// sorted longest-first so specific multi-word names win over short aliases
// (e.g. "acetylsalicylic acid" before "asa"). This avoids re-lowercasing all
// ~150 names on every findMedication() call — which previously ran on every
// keystroke in the notes composer.
const MEDICATION_NAME_INDEX: { name: string; med: Medication }[] = (() => {
  const pairs: { name: string; med: Medication }[] = [];
  for (const med of EU_MEDICATIONS) {
    for (const name of med.names) {
      pairs.push({ name: name.toLowerCase(), med });
    }
  }
  return pairs.sort((a, b) => b.name.length - a.name.length);
})();

/**
 * Find medication by name (substring matching)
 */
export function findMedication(text: string): Medication | null {
  const lower = String(text || '').toLowerCase();
  if (!lower) return null;
  for (const { name, med } of MEDICATION_NAME_INDEX) {
    if (lower.includes(name)) return med;
  }
  return null;
}

/**
 * Get medication names for a specific category
 */
export function getMedicationsByCategory(category: Medication['category']): Medication[] {
  return EU_MEDICATIONS.filter((med) => med.category === category);
}
