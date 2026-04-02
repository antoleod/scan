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
    bg: '#F2F6FC',
    fg: '#0A1428',
    accent: '#005ED9',
    muted: '#495A77',
    card: '#FFFFFF',
    border: '#C3D2EA',
  },
  eu_blue: {
    bg: '#050d08',
    fg: '#C4FFC9',
    accent: '#31ff65',
    muted: '#6fa77b',
    card: '#08150d',
    border: '#14301f',
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
    muted: '#9f9f9f',
    card: '#171717',
    border: '#3a3a3a',
  },
  midnightSteel: {
    bg: '#060A12',
    fg: '#EEFBFF',
    accent: '#00E5FF',
    muted: '#9ec8da',
    card: '#0A1624',
    border: '#00A7C2',
  },
  obsidianGold: {
    bg: '#000000',
    fg: '#F2F2F2',
    accent: '#C8A96E',
    muted: '#767676',
    card: '#050505',
    border: '#151515',
  },
};

export type ThemeName = keyof typeof themes;

export const lightThemes: ThemeName[] = ['light'];
