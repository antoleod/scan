export const themes = {
  dark: {
    bg: '#060B16',
    fg: '#EAF2FF',
    accent: '#FFD84D',
    muted: '#8EA0BF',
    card: '#0E1730',
    border: '#263B68',
  },
  light: {
    bg: '#F7FAFF',
    fg: '#0F1D33',
    accent: '#0B63F6',
    muted: '#5C6E8A',
    card: '#FFFFFF',
    border: '#D7E1F2',
  },
  eu_blue: {
    bg: '#020617',
    fg: '#F8FAFC',
    accent: '#FDE047',
    muted: '#64748B',
    card: '#1E293B',
    border: '#1E293B',
  },
  custom: {
    bg: '#0A1628',
    fg: '#FFFFFF',
    accent: '#00D4FF',
    muted: '#7AAABB',
    card: '#112244',
    border: '#00AACC',
  },
  parliament: {
    bg: '#1A0A2E',
    fg: '#FFFFFF',
    accent: '#FFD45C',
    muted: '#C4A8FF',
    card: '#2A1245',
    border: '#6B3FB5',
  },
  noirGraphite: {
    bg: '#111111',
    fg: '#FFFFFF',
    accent: '#FF6B00',
    muted: '#888888',
    card: '#1A1A1A',
    border: '#333333',
  },
  midnightSteel: {
    bg: '#060A12',
    fg: '#DFF7FF',
    accent: '#00E5FF',
    muted: '#7AAABB',
    card: '#0D1828',
    border: '#00A7C2',
  },
  obsidianGold: {
    bg: '#0A0A0C',
    fg: '#E0E0E0',
    accent: '#C8A96E',
    muted: '#555555',
    card: '#111116',
    border: '#1E1E24',
  },
};

export type ThemeName = keyof typeof themes;

export const lightThemes: ThemeName[] = ['light'];
