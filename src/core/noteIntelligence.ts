export type SmartNoteLabel =
  | 'contact'
  | 'developer'
  | 'money'
  | 'travel'
  | 'legal'
  | 'home'
  | 'idea'
  | 'general';

export type SmartNoteLabelDetection = {
  label: SmartNoteLabel;
  confidence: number;
  reason: string;
  alternatives: SmartNoteLabel[];
};

const LABEL_META: Record<SmartNoteLabel, { title: string; color: string }> = {
  contact: { title: 'Contact', color: '#14B8A6' },
  developer: { title: 'Developer', color: '#60A5FA' },
  money: { title: 'Money', color: '#22C55E' },
  travel: { title: 'Travel', color: '#F97316' },
  legal: { title: 'Legal', color: '#A855F7' },
  home: { title: 'Home', color: '#F59E0B' },
  idea: { title: 'Idea', color: '#EC4899' },
  general: { title: 'General', color: '#9CA3AF' },
};

const LABEL_RULES: Array<{ label: SmartNoteLabel; patterns: RegExp[]; reason: string }> = [
  {
    label: 'contact',
    reason: 'contact details detected',
    patterns: [
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
      /(?:\+?\d[\d\s().-]{7,}\d)/,
      /\b(contact|phone|tel|mobile|email|correo|telefono|t[eé]l[eé]fono|whatsapp)\b/i,
    ],
  },
  {
    label: 'developer',
    reason: 'developer keywords detected',
    patterns: [
      /\b(api|bug|fix|deploy|commit|branch|merge|pull request|github|gitlab|endpoint|typescript|javascript|react|node|npm|docker|sql|database|server|frontend|backend)\b/i,
      /\b(error|stack trace|exception|runtime|build failed|ci|test failed)\b/i,
      /```|=>|async\s+function|const\s+\w+\s*=|npm\s+(run|install)|git\s+(commit|push|pull)/i,
    ],
  },
  {
    label: 'money',
    reason: 'money or payment details detected',
    patterns: [
      /[$€£]\s?\d+(?:[.,]\d{2})?/,
      /\b\d+(?:[.,]\d{2})?\s?(usd|eur|gbp|dollars?|euros?)\b/i,
      /\b(invoice|receipt|budget|payment|paid|debt|loan|salary|tax|bank|transfer|crypto|money|factura|pago|presupuesto|banco|impuesto)\b/i,
    ],
  },
  {
    label: 'travel',
    reason: 'travel details detected',
    patterns: [/\b(flight|hotel|booking|reservation|airport|train|trip|travel|vuelo|hotel|reserva|aeropuerto|viaje)\b/i],
  },
  {
    label: 'legal',
    reason: 'legal details detected',
    patterns: [/\b(contract|agreement|lawyer|legal|terms|policy|firma|contrato|abogado|legal|poliza|p[oó]liza)\b/i],
  },
  {
    label: 'home',
    reason: 'home details detected',
    patterns: [/\b(rent|lease|repair|plumber|electrician|house|home|mudanza|casa|alquiler|reparaci[oó]n|electricista|fontanero)\b/i],
  },
  {
    label: 'idea',
    reason: 'idea or brainstorm detected',
    patterns: [/\b(idea|brainstorm|concept|proposal|draft|maybe|podria|podr[ií]a|concepto|propuesta)\b/i],
  },
];

export function getSmartNoteLabelMeta(label?: SmartNoteLabel) {
  return LABEL_META[label || 'general'];
}

export function detectSmartNoteLabel(text: unknown): SmartNoteLabelDetection {
  const value = String(text || '').trim();
  if (!value) return { label: 'general', confidence: 0, reason: 'empty', alternatives: [] };

  const scored = LABEL_RULES
    .map((rule) => {
      const hits = rule.patterns.filter((pattern) => pattern.test(value)).length;
      return {
        label: rule.label,
        confidence: Math.min(0.42 + hits * 0.2, 0.96),
        reason: rule.reason,
      };
    })
    .filter((item) => item.confidence > 0.42)
    .sort((a, b) => b.confidence - a.confidence);

  const best = scored[0];
  if (!best) return { label: 'general', confidence: 0.35, reason: 'no strong signal', alternatives: [] };

  return {
    ...best,
    alternatives: scored.slice(1, 4).map((item) => item.label),
  };
}
