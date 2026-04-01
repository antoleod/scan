import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';

export type ThemeName =
  | 'euBlue'
  | 'dark'
  | 'light'
  | 'parliament'
  | 'custom'
  | 'noirGraphite'
  | 'midnightSteel'
  | 'obsidianGold';

export type ThemeTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  card: string;
  inputBg: string;
  text: string;
  textSecondary: string;
  primary: string;
  secondary: string;
  border: string;
  success: string;
  warning: string;
  error: string;
  icon: string;
};

export type ThemeStatusTokens = {
  duplicate: string;
  saved: string;
  invalid: string;
  pending: string;
};

export type AppTheme = ThemeTokens & {
  mode: ThemeName;
  status: ThemeStatusTokens;
  scanTypes: {
    PI: string;
    RITM: string;
    REQ: string;
    INC: string;
  };
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
};

export const themeTokens = {
  euBlue: {
    background: '#020617', // Midnight Navy Pro
    surface: '#0F172A',
    surfaceAlt: '#020612',
    card: '#1E293B',
    inputBg: '#0B1222',
    text: '#F8FAFC',
    textSecondary: '#64748B',
    primary: '#1E40AF',
    secondary: '#FDE047', // Technical Gold
    border: '#1E293B',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    icon: '#94A3B8',
  },
  dark: {
    background: '#020202', // Pitch Black
    surface: '#080808',
    surfaceAlt: '#040404',
    card: '#0A0A0A',
    inputBg: '#050505',
    text: '#00FF41', // Matrix Green
    textSecondary: '#008F11', // Darker Terminal Green
    primary: '#003B00', // Deep Forest Structure
    secondary: '#00FF41', // Matrix Highlight
    border: '#003B00',
    success: '#00FF41',
    warning: '#D1FFD1',
    error: '#FF0000',
    icon: '#008F11',
  },
  light: {
    background: '#F7F9FC',
    surface: '#FFFFFF',
    surfaceAlt: '#F3F6FB',
    card: '#FFFFFF',
    inputBg: '#F8FAFD',
    text: '#172033',
    textSecondary: '#5F6B81',
    primary: '#EAF0F9',
    secondary: '#3F73D8',
    border: '#DCE4F1',
    success: '#2F9E5A',
    warning: '#D6A300',
    error: '#C84B3A',
    icon: '#6B768D',
  },
  parliament: {
    background: '#1A0A2E',
    surface: '#2A1245',
    surfaceAlt: '#150825',
    card: '#2A1245',
    inputBg: '#150825',
    text: '#FFFFFF',
    textSecondary: '#C4A8FF',
    primary: '#3D1A6B',
    secondary: '#FFD45C',
    border: '#6B3FB5',
    success: '#00AA44',
    warning: '#FFCC00',
    error: '#CC2200',
    icon: '#C4A8FF',
  },
  custom: {
    background: '#0A1628',
    surface: '#112244',
    surfaceAlt: '#091220',
    card: '#112244',
    inputBg: '#091220',
    text: '#FFFFFF',
    textSecondary: '#7AAABB',
    primary: '#1A3366',
    secondary: '#00D4FF',
    border: '#00AACC',
    success: '#00AA44',
    warning: '#FFCC00',
    error: '#CC2200',
    icon: '#7AAABB',
  },
  noirGraphite: {
    background: '#111111',
    surface: '#1A1A1A',
    surfaceAlt: '#0D0D0D',
    card: '#1A1A1A',
    inputBg: '#0D0D0D',
    text: '#FFFFFF',
    textSecondary: '#888888',
    primary: '#1A1A1A',
    secondary: '#FF6B00',
    border: '#333333',
    success: '#00AA44',
    warning: '#FF6B00',
    error: '#CC2200',
    icon: '#FFFFFF',
  },
  midnightSteel: {
    background: '#050B14',
    surface: '#0C1628',
    surfaceAlt: '#08101E',
    card: '#111E33',
    inputBg: '#081427',
    text: '#E9F3FF',
    textSecondary: '#77A7D6',
    primary: '#14243D',
    secondary: '#2DE2FF',
    border: '#1E4D7A',
    success: '#1ED6A2',
    warning: '#2DE2FF',
    error: '#FF5D73',
    icon: '#8BC3F4',
  },
  obsidianGold: {
    background: '#0A0A0C',
    surface: '#111116',
    surfaceAlt: '#0D0D10',
    card: '#111116',
    inputBg: '#0D0D10',
    text: '#E0E0E0',
    textSecondary: '#555555',
    primary: '#111116',
    secondary: '#C8A96E',
    border: '#1E1E24',
    success: '#00AA44',
    warning: '#C8A96E',
    error: '#CC2200',
    icon: '#C8A96E',
  },
} satisfies Record<ThemeName, ThemeTokens>;

const legacyThemeNameMap = {
  eu_blue: 'euBlue',
  enterprise: 'dark',
  modern: 'midnightSteel',
} as const satisfies Record<string, ThemeName>;

export function normalizeThemeName(value: unknown, fallback: ThemeName = 'euBlue'): ThemeName {
  if (typeof value !== 'string') return fallback;
  if (value in themeTokens) return value as ThemeName;
  if (value in legacyThemeNameMap) return legacyThemeNameMap[value as keyof typeof legacyThemeNameMap];
  return fallback;
}

export const accentVariant = {
  primary: '#AF52DE',
  secondary: '#BF5AF2',
} as const;

export const scanStatusColors: ThemeStatusTokens = {
  duplicate: '#FF9500',
  saved: '#34C759',
  invalid: '#FF3B30',
  pending: '#FFD60A',
};

const scanTypeColors = {
  PI: '#378ADD',
  RITM: '#1D9E75',
  REQ: '#EF9F27',
  INC: '#E24B4A',
} as const;

export const Colors = {
  light: {
    ...themeTokens.light,
    tint: themeTokens.light.secondary,
    tabIconDefault: themeTokens.light.textSecondary,
    tabIconSelected: themeTokens.light.secondary,
  },
  dark: {
    ...themeTokens.dark,
    tint: themeTokens.dark.secondary,
    tabIconDefault: themeTokens.dark.textSecondary,
    tabIconSelected: themeTokens.dark.secondary,
  },
  euBlue: {
    ...themeTokens.euBlue,
    tint: themeTokens.euBlue.secondary,
    tabIconDefault: themeTokens.euBlue.textSecondary,
    tabIconSelected: themeTokens.euBlue.secondary,
  },
  parliament: {
    ...themeTokens.parliament,
    tint: themeTokens.parliament.secondary,
    tabIconDefault: themeTokens.parliament.textSecondary,
    tabIconSelected: themeTokens.parliament.secondary,
  },
  custom: {
    ...themeTokens.custom,
    tint: themeTokens.custom.secondary,
    tabIconDefault: themeTokens.custom.textSecondary,
    tabIconSelected: themeTokens.custom.secondary,
  },
  noirGraphite: {
    ...themeTokens.noirGraphite,
    tint: themeTokens.noirGraphite.secondary,
    tabIconDefault: themeTokens.noirGraphite.textSecondary,
    tabIconSelected: themeTokens.noirGraphite.secondary,
  },
  midnightSteel: {
    ...themeTokens.midnightSteel,
    tint: themeTokens.midnightSteel.secondary,
    tabIconDefault: themeTokens.midnightSteel.textSecondary,
    tabIconSelected: themeTokens.midnightSteel.secondary,
  },
  obsidianGold: {
    ...themeTokens.obsidianGold,
    tint: themeTokens.obsidianGold.secondary,
    tabIconDefault: themeTokens.obsidianGold.textSecondary,
    tabIconSelected: themeTokens.obsidianGold.secondary,
  },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

type ThemeContextValue = {
  themeName: ThemeName;
  setThemeName: (themeName: ThemeName) => void;
  theme: AppTheme;
  tokens: ThemeTokens;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const THEME_STORAGE_KEY = 'activeTheme';

export function ThemeProvider({
  children,
  initialThemeName = 'euBlue',
}: {
  children: React.ReactNode;
  initialThemeName?: ThemeName;
}) {
  const [themeName, setThemeName] = useState<ThemeName>(initialThemeName);

  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        setThemeName(normalizeThemeName(stored, initialThemeName));
      })
      .catch(() => { });
  }, [initialThemeName]);

  useEffect(() => {
    AsyncStorage.setItem(THEME_STORAGE_KEY, themeName).catch(() => { });
  }, [themeName]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeName,
      setThemeName,
      tokens: themeTokens[themeName],
      theme: {
        ...themeTokens[themeName],
        mode: themeName,
        status: scanStatusColors,
        scanTypes: scanTypeColors,
        tint: themeTokens[themeName].secondary,
        tabIconDefault: themeTokens[themeName].textSecondary,
        tabIconSelected: themeTokens[themeName].secondary,
      },
    }),
    [themeName]
  );

  return React.createElement(ThemeContext.Provider, { value }, children);
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within ThemeProvider');
  }
  return context;
}
