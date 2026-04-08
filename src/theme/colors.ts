export const colors = {
  light: {
    // Backgrounds
    bg: {
      base: '#F6F8FA',
      surface: '#FFFFFF',
      card: '#FFFFFF',
      elevated: '#EEF2F7',
    },

    // Brand blue - 3 levels
    blue: {
      primary: '#3B82F6',
      secondary: '#2563EB',
      muted: '#DBEAFE',
      mutedText: '#1D4ED8',
    },

    // White / slate - primary text & high-contrast actions
    white: {
      full: '#0F172A',
      muted: '#334155',
      ghost: '#64748B',
      subtle: '#E2E8F0',
    },

    // Borders
    border: {
      default: '#D7DFEA',
      subtle: '#E6EBF2',
      strong: '#93C5FD',
    },

    // Semantic
    status: {
      ready: '#16A34A',
      readyBg: '#DCFCE7',
      error: '#DC2626',
      errorBg: '#FEE2E2',
    },
  },

  matrix: {
    // Backgrounds
    bg: {
      base: '#111418',
      surface: '#1A2420',
      card: '#1A2420',
      elevated: '#1E2D24',
    },

    // Brand green - 3 levels
    green: {
      primary: '#4ADE80',
      secondary: '#22C55E',
      muted: '#166534',
      mutedText: '#86EFAC',
    },

    // White - primary text & high-contrast actions
    white: {
      full: '#FFFFFF',
      muted: '#E2E8F0',
      ghost: '#94A3B8',
      subtle: '#1E293B',
    },

    // Borders
    border: {
      default: '#1E3A28',
      subtle: '#1A2A20',
      strong: '#22C55E',
    },

    // Semantic
    status: {
      ready: '#4ADE80',
      readyBg: '#14532D',
      error: '#F87171',
      errorBg: '#450A0A',
    },
  },
} as const;

export type ColorThemeName = keyof typeof colors;

export const notesUiColors = colors.matrix;

