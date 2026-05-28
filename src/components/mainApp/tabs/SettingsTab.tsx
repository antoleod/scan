import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { AppSettings, type PersistenceMode } from '../../../types';
import { BARCODE_FORMAT_OPTIONS, type BarcodeFormat } from '../../../core/barcode';
import { canInstallPwa, detectBrowserInstallSupport, getManualInstallInstructions, getPwaInstallDiagnostics, subscribePwaInstallAvailability, triggerPwaInstall } from '../../../core/pwa';
import { createSharedNoteGroup, fetchSharedGroupsForCurrentUser, joinSharedNoteGroup, type SharedNoteGroup } from '../../../core/firebase';
import { useAppTheme } from '../../../constants/theme';
import { addRichNoteUnique, loadNotes, removeNote, setNoteSecret, type NoteItem } from '../../../core/notes';
import { clearPin, hasPin } from '../../../core/secretPin';
import { diag, type LogEntry } from '../../../core/diagnostics';
import { SecretPinModal } from '../../SecretPinModal';
import { Toast, useToast } from '../../Toast';
import { useTranslation } from 'react-i18next';
import { setUiLanguage } from '../../../i18n';
import { UI_LANGUAGES, UI_LANGUAGE_LABELS } from '../../../i18n/languages';

const SECTION_STATE_KEY = '@MyKit_settings_sections_v1';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

type Palette = { bg: string; fg: string; accent: string; muted: string; card: string; border: string };

type ThemeOption = {
  key: 'dark' | 'light' | 'eu_blue' | 'custom' | 'parliament' | 'noirGraphite' | 'midnightSteel' | 'obsidianGold';
  label: string;
  background: string;
  text: string;
  border: string;
  accent: string;
};

type BarcodeOption = { name: string; label: string; description: string; hardwareOnly: boolean };
type SupportedTheme = AppSettings['theme'];
type AppThemeName = 'euBlue' | 'dark' | 'light' | 'parliament' | 'custom' | 'noirGraphite' | 'midnightSteel' | 'obsidianGold';
type SettingsSectionId =
  | 'password'
  | 'theme'
  | 'scan'
  | 'notes-features'
  | 'smart-notes'
  | 'security'
  | 'clipboard'
  | 'shared-groups'
  | 'pwa'
  | 'barcode'
  | 'cleanup'
  | 'data-sync'
  | 'health'
  | 'maintenance'
  | 'diagnostics'
  | 'advanced';

const SECTION_SEARCH: Record<SettingsSectionId, string> = {
  password: 'password generator private note copy save key',
  theme: 'theme selector color palette custom accent dark light noir',
  scan: 'scan options auto detect open url ocr correction camera',
  'notes-features': 'notes features smart type medication shopping reminder draft language app interface catalog french spanish dutch english idioma langue taal interface',
  'smart-notes': 'smart notes entity detection ip hostname office pi regex',
  security: 'security pin private notes vault lock',
  clipboard: 'clipboard cloud sync background capture paste',
  'shared-groups': 'shared groups invite code join create notes',
  pwa: 'pwa install desktop browser diagnostics',
  barcode: 'barcode formats qr code128 code39 ean scan types',
  cleanup: 'auto cleanup retention notes history archive delete',
  'data-sync': 'data sync backup export import firebase cloud local clear hard delete',
  health: 'health status runtime sync backup logs errors storage app state',
  maintenance: 'maintenance mode repair check backup sync logs clear firebase',
  diagnostics: 'production logs diagnostics logger errors warn info copy export clear behavior buttons functions',
  advanced: 'advanced prefixes urls servicenow raw text stay signed laser profile',
};

const PASSWORD_WORDS = ['choco', 'milk', 'sun', 'river', 'cloud', 'mint', 'lemon', 'tiger', 'magic', 'honey', 'rocket', 'ocean', 'forest', 'happy', 'coffee', 'pixel', 'anchor', 'velvet'];
const SYMBOLS = ['!', '@', '#', '$', '%', '&', '*', '?'];
const LETTER_POOL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomFrom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function randomChars(length: number, source: string) {
  let output = '';
  for (let i = 0; i < length; i += 1) output += source[Math.floor(Math.random() * source.length)];
  return output;
}

function stylizeSeed(seed: string) {
  const map: Record<string, string[]> = {
    a: ['a', 'A', '@', '4'],
    e: ['e', 'E', '3'],
    i: ['i', 'I', '1'],
    o: ['o', 'O', '0'],
    s: ['s', 'S', '$', '5'],
    t: ['t', 'T', '7'],
    n: ['n', 'N'],
    g: ['g', 'G', '9'],
  };
  return seed
    .trim()
    .split('')
    .map((char) => {
      const options = map[char.toLowerCase()];
      return options ? randomFrom(options) : randomFrom([char.toLowerCase(), char.toUpperCase()]);
    })
    .join('');
}

function mergeMemorableWords(first: string, second: string) {
  const left = first.slice(0, Math.max(2, Math.ceil(first.length * 0.7)));
  const right = second.slice(Math.max(1, Math.floor(second.length * 0.25)));
  return `${left}${right}`;
}

function useSectionState(sectionIds: string[], initial?: Record<string, boolean>) {
  const [state, setState] = useState<Record<string, boolean>>(() => {
    const seed: Record<string, boolean> = {};
    for (const id of sectionIds) seed[id] = Boolean(initial?.[id]);
    return seed;
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SECTION_STATE_KEY).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Record<string, boolean>;
          setState((prev) => {
            const merged: Record<string, boolean> = { ...prev };
            for (const id of sectionIds) {
              if (typeof parsed[id] === 'boolean') merged[id] = parsed[id];
            }
            return merged;
          });
        } catch {}
      }
      setHydrated(true);
    });
    return () => { cancelled = true; };
  }, [sectionIds.join('|')]);

  const persist = useCallback((next: Record<string, boolean>) => {
    setState(next);
    AsyncStorage.setItem(SECTION_STATE_KEY, JSON.stringify(next)).catch(() => undefined);
  }, []);

  const toggle = useCallback((id: string) => {
    setState((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      AsyncStorage.setItem(SECTION_STATE_KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, []);

  const setAll = useCallback((open: boolean) => {
    const next: Record<string, boolean> = {};
    for (const id of sectionIds) next[id] = open;
    persist(next);
  }, [sectionIds.join('|'), persist]);

  const openCount = useMemo(() => Object.values(state).filter(Boolean).length, [state]);

  return { state, toggle, setAll, openCount, hydrated, total: sectionIds.length };
}

function SectionCard({
  visible = true,
  open,
  onToggle,
  title,
  subtitle,
  icon,
  badge,
  badgeTone,
  accent,
  subtitleColor,
  cardBackground,
  cardBorder,
  children,
}: {
  visible?: boolean;
  open: boolean;
  onToggle: () => void;
  title: string;
  subtitle?: string;
  icon?: IoniconName;
  badge?: string;
  badgeTone?: 'success' | 'warn' | 'info' | 'muted';
  accent: string;
  subtitleColor: string;
  cardBackground: string;
  cardBorder: string;
  children: React.ReactNode;
}) {
  if (!visible) return null;

  const badgeColors: Record<NonNullable<typeof badgeTone>, { bg: string; fg: string }> = {
    success: { bg: 'rgba(34,197,94,0.16)', fg: '#22c55e' },
    warn:    { bg: 'rgba(245,158,11,0.16)', fg: '#f59e0b' },
    info:    { bg: 'rgba(0,212,255,0.16)',  fg: '#00D4FF' },
    muted:   { bg: 'rgba(148,163,184,0.16)',fg: '#94a3b8' },
  };
  const badgePalette = badge ? badgeColors[badgeTone ?? 'muted'] : null;

  return (
    <View style={[styles.sectionCard, { borderLeftColor: accent, backgroundColor: cardBackground, borderColor: cardBorder }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        accessibilityState={{ expanded: open }}
        onPress={onToggle}
        style={({ pressed }) => [styles.sectionHeader, { opacity: pressed ? 0.8 : 1 }]}
      >
        {icon ? (
          <View style={[styles.sectionIcon, { backgroundColor: `${accent}1f`, borderColor: `${accent}55` }]}>
            <Ionicons name={icon} size={14} color={accent} />
          </View>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, { color: accent }]} numberOfLines={1}>{title}</Text>
            {badgePalette ? (
              <View style={[styles.sectionBadge, { backgroundColor: badgePalette.bg }]}>
                <Text style={[styles.sectionBadgeText, { color: badgePalette.fg }]}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? <Text style={[styles.sectionSubtitle, { color: subtitleColor }]} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={accent} />
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function ThemeCard({ option, active, onPress, desktop }: { option: ThemeOption; active: boolean; desktop: boolean; onPress: () => void }) {
  const { t } = useTranslation();
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setPulse((v) => (v + 1) % 2), 650);
    return () => clearInterval(id);
  }, [active]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${option.label} theme`}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [styles.themeCard, desktop ? styles.themeCardDesktop : styles.themeCardMobile, { backgroundColor: option.background, borderColor: active ? option.accent : option.border, borderWidth: active ? (pulse ? 2.3 : 1.5) : 1, opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.themeSwatch, { backgroundColor: option.accent }]} />
      <Text style={[styles.themeCardText, { color: option.text }]}>{option.label}</Text>
      {active ? <Text style={[styles.check, { color: option.accent }]}>{t('settings.active')}</Text> : null}
    </Pressable>
  );
}

export function SettingsTab({
  palette,
  settings,
  onPatchSettings,
  onExportCsv,
  onClearHistory,
  onHardDeleteHistory,
  onHardDeleteNotes,
  onHardDeleteClipboard,
  onHardDeleteTemplates,
  onClearArchivedNotes,
  onClearUnpinnedNotes,
  lastBackupAt,
  onExportBackup,
  onCopyLogs,
  onExportLogs,
  onOpenBackupImport,
  onRecheckFirebase,
  onSyncNow,
  onLogout,
  syncBusy,
  userEmail,
  userUidPrefix,
  isGuest,
  persistenceMode,
  visibleBarcodeTypes,
  barcodeOutputFormat,
}: {
  palette: Palette;
  settings: AppSettings;
  onPatchSettings: (next: Partial<AppSettings>) => void;
  onExportCsv: () => void;
  onClearHistory: () => void;
  onHardDeleteHistory: () => void;
  onHardDeleteNotes: () => void;
  onHardDeleteClipboard: () => void;
  onHardDeleteTemplates: () => void;
  onClearArchivedNotes: () => void;
  onClearUnpinnedNotes: () => void;
  lastBackupAt?: number | null;
  onExportBackup: () => void;
  onCopyLogs: () => void | Promise<void>;
  onExportLogs: () => void | Promise<void>;
  onOpenBackupImport: () => void;
  onRecheckFirebase: () => void;
  onSyncNow: () => void;
  onLogout: () => void;
  syncBusy: boolean;
  userEmail: string | null;
  userUidPrefix: string | null;
  isGuest: boolean;
  persistenceMode: PersistenceMode;
  visibleBarcodeTypes: string[];
  barcodeOutputFormat: BarcodeFormat;
}) {
  const activeAccent = '#FFD84D';
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const { setThemeName } = useAppTheme();
  const { t } = useTranslation();
  const { toast, show: showToast, hide: hideToast } = useToast();
  const [passPhrase, setPassPhrase] = useState('');
  const [passwordMode, setPasswordMode] = useState<'phrases' | 'seed'>('phrases');
  const [phraseCount, setPhraseCount] = useState(2);
  const [seedText, setSeedText] = useState('Welcome');
  const [installBusy, setInstallBusy] = useState(false);
  const [pwaInstallAvailable, setPwaInstallAvailable] = useState(canInstallPwa());
  const [pwaDiag, setPwaDiag] = useState(getPwaInstallDiagnostics());
  const [groups, setGroups] = useState<SharedNoteGroup[]>([]);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [inviteCodeDraft, setInviteCodeDraft] = useState('');
  const [officeDraft, setOfficeDraft] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewGroupBy, setReviewGroupBy] = useState<'day' | 'week'>('day');
  const [reviewNotes, setReviewNotes] = useState<NoteItem[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewDeleting, setReviewDeleting] = useState(false);
  const [reviewSelected, setReviewSelected] = useState<Set<string>>(new Set());
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [pinModalMode, setPinModalMode] = useState<'setup' | 'unlock'>('setup');
  const [pinFlow, setPinFlow] = useState<'note-secret' | 'set' | 'change-unlock' | 'change-set' | 'remove-unlock' | null>(null);
  const [pendingSecretNoteId, setPendingSecretNoteId] = useState<string | null>(null);
  const [pinExists, setPinExists] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<LogEntry[]>([]);
  const [diagnosticFilter, setDiagnosticFilter] = useState<'all' | LogEntry['level']>('all');
  const [settingsSearch, setSettingsSearch] = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maintenanceSummary, setMaintenanceSummary] = useState<string | null>(null);

  const SECTION_IDS = useMemo<SettingsSectionId[]>(() => [
    'password',
    'theme',
    'scan',
    'notes-features',
    'smart-notes',
    'security',
    'clipboard',
    'shared-groups',
    'pwa',
    'barcode',
    'cleanup',
    'data-sync',
    'health',
    'maintenance',
    'diagnostics',
    'advanced',
  ], []);
  const DEFAULT_OPEN = useMemo<Record<string, boolean>>(() => ({
    scan: true,
    theme: true,
    pwa: Platform.OS === 'web',
  }), []);
  const { state: sectionOpen, toggle: toggleSection, setAll: setAllSections, openCount, total: totalSections } = useSectionState(SECTION_IDS, DEFAULT_OPEN);
  const normalizedSettingsSearch = settingsSearch.trim().toLowerCase();
  const matchedSectionIds = useMemo(() => {
    if (!normalizedSettingsSearch) return SECTION_IDS;
    return SECTION_IDS.filter((id) => `${id} ${SECTION_SEARCH[id]}`.includes(normalizedSettingsSearch));
  }, [SECTION_IDS, normalizedSettingsSearch]);
  const matchesSection = useCallback((id: SettingsSectionId) => matchedSectionIds.includes(id), [matchedSectionIds]);

  useEffect(() => diag.subscribe(setDiagnosticLogs), []);

  const logSettingsAction = useCallback((label: string, data?: Record<string, unknown>) => {
    void diag.info('settings.ui.action', { label, ...data });
  }, []);

  const patchSettingsLogged = useCallback((next: Partial<AppSettings>) => {
    const keys = Object.keys(next);
    void diag.info('settings.patch', { keys });
    onPatchSettings(next);
  }, [onPatchSettings]);

  const toggleSettingsSection = useCallback((id: string) => {
    logSettingsAction('toggle section', { section: id, nextOpen: !sectionOpen[id] });
    toggleSection(id);
  }, [logSettingsAction, sectionOpen, toggleSection]);

  const setAllSectionsLogged = useCallback((open: boolean) => {
    logSettingsAction(open ? 'expand all sections' : 'collapse all sections');
    setAllSections(open);
  }, [logSettingsAction, setAllSections]);

  const runDiagnosticAction = useCallback((label: string, action: () => void | Promise<void>) => {
    void diag.track('settings.diagnostics.action', { label }, action).catch((error) => {
      showToast(`${label} failed: ${String(error)}`, 'error');
    });
  }, [showToast]);

  const filteredDiagnosticLogs = useMemo(() => {
    const source = diagnosticFilter === 'all'
      ? diagnosticLogs
      : diagnosticLogs.filter((entry) => entry.level === diagnosticFilter);
    return source.slice(-80).reverse();
  }, [diagnosticFilter, diagnosticLogs]);

  const diagnosticErrorCount = useMemo(() => diagnosticLogs.filter((entry) => entry.level === 'error').length, [diagnosticLogs]);
  const diagnosticWarnCount = useMemo(() => diagnosticLogs.filter((entry) => entry.level === 'warn').length, [diagnosticLogs]);
  const lastBackupLabel = lastBackupAt ? new Date(lastBackupAt).toLocaleString() : 'No local backup recorded';
  const healthItems = useMemo(() => [
    { label: 'Runtime', value: Platform.OS === 'web' ? 'Web/PWA' : Platform.OS, tone: 'info' as const },
    { label: 'Persistence', value: persistenceMode === 'firebase' ? 'Firebase' : 'Local', tone: persistenceMode === 'firebase' ? 'success' as const : 'muted' as const },
    { label: 'Account', value: isGuest ? 'Guest' : 'Signed in', tone: isGuest ? 'warn' as const : 'success' as const },
    { label: 'Sync', value: syncBusy ? 'Syncing' : 'Idle', tone: syncBusy ? 'info' as const : 'success' as const },
    { label: 'Backup', value: lastBackupLabel, tone: lastBackupAt ? 'success' as const : 'warn' as const },
    { label: 'Logs', value: `${diagnosticLogs.length} events / ${diagnosticErrorCount} errors`, tone: diagnosticErrorCount ? 'warn' as const : 'success' as const },
    { label: 'Barcode types', value: `${visibleBarcodeTypes.length} active`, tone: visibleBarcodeTypes.length ? 'success' as const : 'warn' as const },
  ], [diagnosticErrorCount, diagnosticLogs.length, isGuest, lastBackupAt, lastBackupLabel, persistenceMode, syncBusy, visibleBarcodeTypes.length]);

  const runMaintenanceCheck = useCallback(() => {
    const summary = [
      `${diagnosticLogs.length} log event(s)`,
      `${diagnosticWarnCount} warning(s)`,
      `${diagnosticErrorCount} error(s)`,
      `${visibleBarcodeTypes.length} barcode type(s)`,
      lastBackupAt ? `backup ${new Date(lastBackupAt).toLocaleDateString()}` : 'backup missing',
    ].join(' | ');
    setMaintenanceSummary(summary);
    void diag.info('settings.maintenance.check', { summary });
    showToast('Maintenance check completed', diagnosticErrorCount ? 'info' : 'success');
  }, [diagnosticErrorCount, diagnosticLogs.length, diagnosticWarnCount, lastBackupAt, showToast, visibleBarcodeTypes.length]);

  useEffect(() => {
    if (!normalizedSettingsSearch || matchedSectionIds.length !== 1) return;
    const id = matchedSectionIds[0];
    if (!sectionOpen[id]) toggleSection(id);
  }, [matchedSectionIds, normalizedSettingsSearch, sectionOpen, toggleSection]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => hasPin().then((value) => { if (!cancelled) setPinExists(value); }).catch(() => undefined);
    refresh();
    return () => { cancelled = true; };
  }, []);

  const refreshPinStatus = useCallback(async () => {
    try { setPinExists(await hasPin()); } catch { setPinExists(false); }
  }, []);

  const runDataSyncAction = useCallback((label: string, action: () => void | Promise<void>) => {
    Promise.resolve()
      .then(action)
      .catch((error) => {
        console.error(`Data + Sync action failed: ${label}`, error);
        showToast(`${label} failed`, 'error');
      });
  }, [showToast]);

  const confirmDataSyncAction = useCallback((title: string, message: string, action: () => void | Promise<void>) => {
    const run = () => runDataSyncAction(title, action);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`${title}\n\n${message}`)) run();
      return;
    }
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: run },
    ]);
  }, [runDataSyncAction]);

  const reopenPinModal = useCallback((mode: 'setup' | 'unlock') => {
    setPinModalVisible(false);
    setTimeout(() => {
      setPinModalMode(mode);
      setPinModalVisible(true);
    }, 220);
  }, []);

  const startSetPin = useCallback(() => {
    setPinFlow('set');
    setPinModalMode('setup');
    setPinModalVisible(true);
  }, []);

  const startChangePin = useCallback(() => {
    setPinFlow('change-unlock');
    setPinModalMode('unlock');
    setPinModalVisible(true);
  }, []);

  const startRemovePin = useCallback(() => {
    Alert.alert(
      'Remove PIN',
      'Private notes will lose their PIN protection. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            setPinFlow('remove-unlock');
            setPinModalMode('unlock');
            setPinModalVisible(true);
          },
        },
      ],
    );
  }, []);

  const copyPassword = useCallback(async () => {
    if (!passPhrase) return;
    try {
      await Clipboard.setStringAsync(passPhrase);
      showToast('Password copied', 'success');
    } catch {
      showToast('Copy failed', 'error');
    }
  }, [passPhrase, showToast]);

  const savePasswordAsPrivateNote = useCallback(async () => {
    if (!passPhrase) return;
    try {
      const noteText = `Password: ${passPhrase}`;
      const result = await addRichNoteUnique(noteText, 'work', [], undefined, false, false);
      if (!result.inserted || !result.notes[0]) {
        showToast('Note already exists', 'info');
        return;
      }
      const newNoteId = result.notes[0].id;
      const has = await hasPin();
      if (has) {
        await setNoteSecret(newNoteId, true);
        showToast('Saved as private note', 'success');
      } else {
        setPendingSecretNoteId(newNoteId);
        setPinFlow('note-secret');
        setPinModalMode('setup');
        setPinModalVisible(true);
      }
    } catch {
      showToast('Failed to save note', 'error');
    }
  }, [passPhrase, showToast]);

  const handlePinSuccess = useCallback(async () => {
    const flow = pinFlow;
    setPinModalVisible(false);

    if (flow === 'note-secret') {
      if (pendingSecretNoteId) {
        try {
          await setNoteSecret(pendingSecretNoteId, true);
          showToast('Saved as private note', 'success');
        } catch {
          showToast('Failed to lock note', 'error');
        }
      }
      setPendingSecretNoteId(null);
      setPinFlow(null);
      await refreshPinStatus();
      return;
    }

    if (flow === 'set') {
      showToast('PIN configured', 'success');
      setPinFlow(null);
      await refreshPinStatus();
      return;
    }

    if (flow === 'change-unlock') {
      setPinFlow('change-set');
      reopenPinModal('setup');
      return;
    }

    if (flow === 'change-set') {
      showToast('PIN changed', 'success');
      setPinFlow(null);
      await refreshPinStatus();
      return;
    }

    if (flow === 'remove-unlock') {
      try {
        await clearPin();
        showToast('PIN removed', 'success');
      } catch {
        showToast('Failed to remove PIN', 'error');
      }
      setPinFlow(null);
      await refreshPinStatus();
      return;
    }
  }, [pinFlow, pendingSecretNoteId, refreshPinStatus, reopenPinModal, showToast]);

  const handlePinCancel = useCallback(() => {
    const flow = pinFlow;
    setPinModalVisible(false);
    setPinFlow(null);
    if (flow === 'note-secret') {
      setPendingSecretNoteId(null);
      showToast('Note saved without lock', 'info');
    }
  }, [pinFlow, showToast]);

  const notesFeatures = settings.notesFeatures ?? {
    autoDetectSmartType: true,
    detectMedication: true,
    detectShopping: true,
    detectReminder: true,
    autoSaveDraft: true,
  };

  const patchNotesFeatures = useCallback((partial: Partial<NonNullable<AppSettings['notesFeatures']>>) => {
    patchSettingsLogged({
      notesFeatures: {
        ...notesFeatures,
        ...partial,
      },
    });
  }, [notesFeatures, patchSettingsLogged]);

  const openReviewPanel = useCallback(async () => {
    setReviewOpen(true);
    setReviewLoading(true);
    setReviewSelected(new Set());
    try {
      const all = await loadNotes();
      setReviewNotes(all.filter((n) => !n.deletedAt));
    } catch {
      setReviewNotes([]);
    } finally {
      setReviewLoading(false);
    }
  }, []);

  const deleteReviewSelected = useCallback(async () => {
    const ids = Array.from(reviewSelected);
    if (!ids.length) return;

    const countToDelete = ids.length;
    let successCount = 0;

    for (const id of ids) {
      try {
        await removeNote(id);
        successCount += 1;
      } catch (error) {
        console.error(`Failed to delete note ${id}:`, error);
      }
    }

    // Reload notes from storage to ensure consistency
    try {
      const updated = await loadNotes();
      setReviewNotes(updated.filter((n) => !n.deletedAt && !n.draft));
    } catch (error) {
      console.error('Failed to reload notes after deletion:', error);
      showToast('Failed to refresh notes list', 'error');
      return;
    }

    setReviewSelected(new Set());

    if (successCount === countToDelete) {
      showToast(`Deleted ${countToDelete} note${countToDelete !== 1 ? 's' : ''}`, 'success');
    } else if (successCount > 0) {
      showToast(`Deleted ${successCount} of ${countToDelete} notes`, 'info');
    } else {
      showToast('Failed to delete notes', 'error');
    }
  }, [reviewSelected, showToast]);

  const reviewGroups = useMemo(() => {
    const map = new Map<string, NoteItem[]>();
    for (const note of reviewNotes) {
      const d = new Date(note.updatedAt);
      let key: string;
      if (reviewGroupBy === 'day') {
        key = d.toISOString().slice(0, 10);
      } else {
        const day = d.getDay();
        const monday = new Date(d);
        monday.setDate(d.getDate() - ((day + 6) % 7));
        key = monday.toISOString().slice(0, 10);
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(note);
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [reviewNotes, reviewGroupBy]);

  useEffect(() => subscribePwaInstallAvailability(setPwaInstallAvailable), []);
  useEffect(() => {
    const tick = () => setPwaDiag(getPwaInstallDiagnostics());
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    fetchSharedGroupsForCurrentUser().then(setGroups).catch(() => undefined);
  }, []);

  const themeOptions = useMemo<ThemeOption[]>(() => [
    { key: 'dark', label: 'Enterprise', background: '#0A1740', text: '#FFFFFF', border: 'rgba(255,216,77,0.15)', accent: '#FFD84D' },
    { key: 'light', label: 'Light', background: '#FFFFFF', text: '#111111', border: '#D0D8E8', accent: '#0052CC' },
    { key: 'eu_blue', label: 'Matrix', background: '#020402', text: '#8dff7a', border: '#0f2e10', accent: '#39ff14' },
    { key: 'custom', label: 'Custom', background: '#112244', text: '#00D4FF', border: '#00AACC', accent: '#00D4FF' },
    { key: 'parliament', label: 'Parliament', background: '#2A1245', text: '#FFCC00', border: '#6B3FB5', accent: '#FFCC00' },
    { key: 'noirGraphite', label: 'Noir', background: '#1A1A1A', text: '#FFFFFF', border: '#333333', accent: '#FF6B00' },
    { key: 'midnightSteel', label: 'Midnight', background: '#0F1923', text: '#FFFFFF', border: '#00AACC', accent: '#00D4FF' },
    { key: 'obsidianGold', label: 'Obsidian', background: '#111116', text: '#E0E0E0', border: '#1E1E24', accent: '#C8A96E' },
  ], []);

  const barcodeOptions = useMemo<BarcodeOption[]>(() => [
    { name: 'CODE128', label: 'CODE128', description: 'Office assets, serial numbers, IT labels', hardwareOnly: false },
    { name: 'EAN8', label: 'EAN-8', description: 'Compact hardware tags, peripherals', hardwareOnly: false },
    { name: 'CODE39', label: 'CODE39', description: 'IT systems, legacy printed labels', hardwareOnly: false },
    { name: 'QR', label: 'QR', description: 'URLs, configs, multi-line data', hardwareOnly: false },
    { name: 'EAN13', label: 'EAN-13', description: 'Product inventory and procurement', hardwareOnly: false },
  ], []);

  const generatePassword = () => {
    const currentYear = String(new Date().getFullYear());
    if (passwordMode === 'phrases') {
      const count = Math.max(2, Math.min(8, phraseCount || 2));
      const words = Array.from({ length: count }, () => randomFrom(PASSWORD_WORDS));
      const first = words[0];
      const second = words[1];
      if (count === 2) {
        const simpleFirst = first[0].toUpperCase() + first.slice(1);
        const simpleSecond = second[0].toUpperCase() + second.slice(1);
        setPassPhrase(`${simpleFirst}-${simpleSecond}!${currentYear}`);
        return;
      }
      const shownSecond = stylizeSeed(second);
      const merged = mergeMemorableWords(first, second);
      const extras = words.slice(2).map((word) => word[0].toUpperCase() + word.slice(1)).join('');
      setPassPhrase(`${first[0].toUpperCase()}${first.slice(1)}+${shownSecond[0].toUpperCase()}${shownSecond.slice(1)}=${merged[0].toUpperCase()}${merged.slice(1)}${extras}${randomFrom(SYMBOLS)}${currentYear}`);
      return;
    }
    const cleanSeed = seedText.trim();
    const seed = cleanSeed || 'Welcome';
    const styled = stylizeSeed(seed);
    const suffix = `${randomChars(2, LETTER_POOL.toLowerCase())}${currentYear}`;
    setPassPhrase(`${styled}${suffix}`);
  };

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={styles.scrollOuter} showsVerticalScrollIndicator={false}>
        <View style={styles.container}>
        <View style={styles.header}>
          <Text style={[styles.kicker, { color: activeAccent }]}>{t('settings.headerTitle')}</Text>
          <Text style={[styles.pageTitle, { color: palette.fg }]}>{t('settings.headerConfiguration')}</Text>
          <Text style={[styles.pageSubtitle, { color: palette.muted }]}>{t('settings.headerSubtitle')}</Text>
        </View>

        <View style={[styles.toolbar, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <View style={styles.toolbarLeft}>
            <View style={[styles.toolbarPill, { borderColor: `${activeAccent}55`, backgroundColor: `${activeAccent}14` }]}>
              <Ionicons name={normalizedSettingsSearch ? 'search-outline' : 'options-outline'} size={12} color={activeAccent} />
              <Text style={[styles.toolbarPillText, { color: activeAccent }]}>
                {normalizedSettingsSearch ? `${matchedSectionIds.length} FOUND` : `${openCount}/${totalSections} OPEN`}
              </Text>
            </View>
          </View>
          <View style={styles.toolbarRight}>
            <Pressable
              onPress={() => setAllSectionsLogged(true)}
              style={({ pressed }) => [styles.toolbarBtn, { borderColor: palette.border, opacity: pressed ? 0.75 : 1 }]}
              accessibilityLabel={t('settings.expand')}
            >
              <Ionicons name="chevron-down" size={13} color={palette.fg} />
              <Text style={[styles.toolbarBtnText, { color: palette.fg }]}>{t('settings.expand')}</Text>
            </Pressable>
            <Pressable
              onPress={() => setAllSectionsLogged(false)}
              style={({ pressed }) => [styles.toolbarBtn, { borderColor: palette.border, opacity: pressed ? 0.75 : 1 }]}
              accessibilityLabel={t('settings.collapse')}
            >
              <Ionicons name="chevron-up" size={13} color={palette.fg} />
              <Text style={[styles.toolbarBtnText, { color: palette.fg }]}>{t('settings.collapse')}</Text>
            </Pressable>
          </View>
        </View>

        <View style={[styles.searchBox, { backgroundColor: palette.card, borderColor: palette.border }]}>
          <Ionicons name="search-outline" size={16} color={palette.muted} />
          <TextInput
            value={settingsSearch}
            onChangeText={setSettingsSearch}
            placeholder={t('settings.searchPlaceholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel={t('settings.searchPlaceholder')}
            style={[styles.searchInput, { color: palette.fg }]}
          />
          {settingsSearch ? (
            <Pressable
              onPress={() => setSettingsSearch('')}
              accessibilityRole="button"
              accessibilityLabel={t('settings.searchPlaceholder')}
              hitSlop={8}
              style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
            >
              <Ionicons name="close-circle" size={18} color={palette.muted} />
            </Pressable>
          ) : null}
        </View>

        {normalizedSettingsSearch && matchedSectionIds.length === 0 ? (
          <View style={[styles.emptySearch, { backgroundColor: palette.card, borderColor: palette.border }]}>
            <Ionicons name="search-outline" size={20} color={palette.muted} />
            <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '700' }}>{t('settings.noSettingsFound')}</Text>
            <Text style={{ color: palette.muted, fontSize: 11, textAlign: 'center' }}>{t('settings.noSettingsHint')}</Text>
          </View>
        ) : null}

        <SectionCard
          visible={matchesSection('password')}
          open={sectionOpen['password']}
          onToggle={() => toggleSettingsSection('password')}
          title={t('settings.passwordGenTitle')}
          subtitle={t('settings.passwordGenSubtitle')}
          icon="key-outline"
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={styles.modeRow}>
              {[
                { key: 'phrases', label: 'Phrases' },
                { key: 'seed', label: 'Seed (Welcome)' },
              ].map((mode) => {
                const selected = passwordMode === mode.key;
              return (
                <Pressable key={mode.key} onPress={() => setPasswordMode(mode.key as 'phrases' | 'seed')} style={[styles.modeChip, { borderColor: selected ? activeAccent : palette.border, backgroundColor: selected ? 'rgba(255,216,77,0.16)' : palette.card }]}>
                  <Text style={[styles.modeChipText, { color: selected ? activeAccent : palette.fg }]}>{mode.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {passwordMode === 'phrases' ? (
            <View style={styles.controlStack}>
              <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.phraseCountLabel')}</Text>
              <View style={styles.counterRow}>
                <Pressable onPress={() => setPhraseCount((current) => Math.max(2, current - 1))} style={[styles.counterBtn, { borderColor: palette.border }]}>
                  <Text style={[styles.counterBtnText, { color: palette.fg }]}>-</Text>
                </Pressable>
                <View style={[styles.counterValue, { borderColor: palette.border, backgroundColor: palette.card }]}>
                  <Text style={[styles.counterValueText, { color: palette.fg }]}>{phraseCount}</Text>
                </View>
                <Pressable onPress={() => setPhraseCount((current) => Math.min(8, current + 1))} style={[styles.counterBtn, { borderColor: palette.border }]}>
                  <Text style={[styles.counterBtnText, { color: palette.fg }]}>+</Text>
                </Pressable>
              </View>
              <Text style={[styles.helperLine, { color: palette.muted, marginTop: 0 }]}>Example style: Choco+M!lk=ChocoMilk!2026</Text>
            </View>
          ) : null}
          {passwordMode === 'seed' ? (
            <View style={styles.controlStack}>
              <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.baseWordLabel')}</Text>
              <Text style={[styles.helperLine, { color: palette.muted, marginTop: 0 }]}>{t('settings.baseWordExample')}</Text>
              <TextInput
                style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
                value={seedText}
                onChangeText={setSeedText}
                placeholder={t('settings.baseWordPlaceholder')}
                placeholderTextColor={palette.muted}
                autoCapitalize="words"
              />
            </View>
          ) : null}
          <Pressable onPress={generatePassword} style={[styles.bulkButton, { backgroundColor: activeAccent }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.generate')}</Text></Pressable>
          {passPhrase ? (
            <View style={[styles.passwordResult, { borderColor: palette.border, backgroundColor: palette.card }]}>
              <Text style={[styles.passwordResultText, { color: palette.fg }]} selectable>{passPhrase}</Text>
              <View style={styles.passwordActionsRow}>
                <Pressable
                  onPress={copyPassword}
                  style={({ pressed }) => [styles.passwordActionBtn, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Ionicons name="copy-outline" size={14} color="#111" />
                  <Text style={[styles.passwordActionText, { color: '#111' }]}>{t('settings.copy')}</Text>
                </Pressable>
                <Pressable
                  onPress={savePasswordAsPrivateNote}
                  style={({ pressed }) => [styles.passwordActionBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}
                >
                  <Ionicons name="lock-closed-outline" size={14} color={activeAccent} />
                  <Text style={[styles.passwordActionText, { color: activeAccent }]}>{t('settings.saveAsPrivateNote')}</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </SectionCard>

        <SectionCard
          visible={matchesSection('theme')}
          open={sectionOpen['theme']}
          onToggle={() => toggleSettingsSection('theme')}
          title={t('settings.themeTitle')}
          subtitle={t('settings.themeSubtitle')}
          icon="color-palette-outline"
          badge={themeOptions.find((t) => t.key === settings.theme)?.label.toUpperCase()}
          badgeTone="info"
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={[styles.themeGrid, isDesktop ? styles.themeGridDesktop : null]}> 
            {themeOptions.map((item) => (
              <ThemeCard
                key={item.key}
                option={item}
                active={settings.theme === item.key}
                desktop={isDesktop}
                onPress={() => {
                  patchSettingsLogged({ theme: item.key as SupportedTheme });
                  const mapped: AppThemeName = item.key === 'eu_blue' ? 'euBlue' : (item.key as AppThemeName);
                  setThemeName(mapped);
                }}
              />
            ))}
          </View>
          {settings.theme === 'custom' ? <TextInput style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]} placeholder="#00D4FF" placeholderTextColor={palette.muted} value={settings.customAccent} onChangeText={(value) => patchSettingsLogged({ customAccent: value })} /> : null}
        </SectionCard>

        <SectionCard
          visible={matchesSection('scan')}
          open={sectionOpen['scan']}
          onToggle={() => toggleSettingsSection('scan')}
          title={t('settings.scanOptionsTitle')}
          subtitle={t('settings.scanOptionsSubtitle')}
          icon="scan-outline"
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.autoDetect')}</Text><Switch accessibilityLabel={t('settings.autoDetect')} value={settings.autoDetect} onValueChange={(value) => patchSettingsLogged({ autoDetect: value, scanProfile: value ? 'auto' : settings.scanProfile })} /></View>
          <View style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.openUrl')}</Text><Switch accessibilityLabel={t('settings.openUrl')} value={settings.openUrls ?? true} onValueChange={(value) => patchSettingsLogged({ openUrls: value })} /></View>
          <View style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.ocrCorrection')}</Text><Switch accessibilityLabel={t('settings.ocrCorrection')} value={settings.ocrCorrection} onValueChange={(value) => patchSettingsLogged({ ocrCorrection: value })} /></View>
        </SectionCard>

        <SectionCard
          visible={matchesSection('notes-features')}
          open={sectionOpen['notes-features']}
          onToggle={() => toggleSettingsSection('notes-features')}
          title={t('settings.notesFeaturesTitle')}
          subtitle={t('settings.notesFeaturesSubtitle')}
          icon="document-text-outline"
          badge={notesFeatures.autoDetectSmartType ? 'AUTO' : 'OFF'}
          badgeTone={notesFeatures.autoDetectSmartType ? 'success' : 'muted'}
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.autoDetectSmart')}</Text>
            <Switch
              accessibilityLabel={t('settings.autoDetectSmart')}
              value={notesFeatures.autoDetectSmartType}
              onValueChange={(value) => patchNotesFeatures({ autoDetectSmartType: value })}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: notesFeatures.autoDetectSmartType ? palette.fg : palette.muted }]}>{t('settings.detectMedication')}</Text>
            <Switch
              accessibilityLabel={t('settings.detectMedication')}
              accessibilityState={{ disabled: !notesFeatures.autoDetectSmartType }}
              disabled={!notesFeatures.autoDetectSmartType}
              value={notesFeatures.detectMedication}
              onValueChange={(value) => patchNotesFeatures({ detectMedication: value })}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: notesFeatures.autoDetectSmartType ? palette.fg : palette.muted }]}>{t('settings.detectShopping')}</Text>
            <Switch
              accessibilityLabel={t('settings.detectShopping')}
              accessibilityState={{ disabled: !notesFeatures.autoDetectSmartType }}
              disabled={!notesFeatures.autoDetectSmartType}
              value={notesFeatures.detectShopping}
              onValueChange={(value) => patchNotesFeatures({ detectShopping: value })}
            />
          </View>

          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.appLanguageTitle')}</Text>
          <Text style={[styles.toggleLabel, { color: palette.muted, marginBottom: 6 }]}>
            {t('settings.appLanguageHint')}
          </Text>
          <View style={styles.modeRow}>
            {UI_LANGUAGES.map((code) => {
              const active = settings.uiLanguage === code;
              const label = UI_LANGUAGE_LABELS[code];
              return (
                <Pressable
                  key={code}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('settings.appLanguageTitle')} ${label}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    patchSettingsLogged({ uiLanguage: code });
                    setUiLanguage(code);
                  }}
                  style={[styles.modeChip, { borderColor: active ? activeAccent : palette.border, backgroundColor: active ? 'rgba(255,216,77,0.16)' : palette.card }]}
                >
                  <Text style={[styles.modeChipText, { color: active ? activeAccent : palette.fg }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.shoppingLanguageTitle')}</Text>
          <Text style={[styles.toggleLabel, { color: palette.muted, marginBottom: 6 }]}>
            {t('settings.shoppingLanguageHint')}
          </Text>
          <View style={styles.modeRow}>
            {([
              { code: 'en', label: 'English' },
              { code: 'fr', label: 'Français' },
              { code: 'es', label: 'Español' },
              { code: 'nl', label: 'Nederlands' },
            ] as const).map((option) => {
              const active = settings.shoppingListLanguage === option.code;
              return (
                <Pressable
                  key={option.code}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('settings.shoppingLanguageTitle')} ${option.label}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => patchSettingsLogged({ shoppingListLanguage: option.code })}
                  style={[styles.modeChip, { borderColor: active ? activeAccent : palette.border, backgroundColor: active ? 'rgba(255,216,77,0.16)' : palette.card }]}
                >
                  <Text style={[styles.modeChipText, { color: active ? activeAccent : palette.fg }]}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: notesFeatures.autoDetectSmartType ? palette.fg : palette.muted }]}>{t('settings.detectReminder')}</Text>
            <Switch
              accessibilityLabel={t('settings.detectReminder')}
              accessibilityState={{ disabled: !notesFeatures.autoDetectSmartType }}
              disabled={!notesFeatures.autoDetectSmartType}
              value={notesFeatures.detectReminder}
              onValueChange={(value) => patchNotesFeatures({ detectReminder: value })}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.autoSaveDraft')}</Text>
            <Switch
              accessibilityLabel={t('settings.autoSaveDraft')}
              value={notesFeatures.autoSaveDraft}
              onValueChange={(value) => patchNotesFeatures({ autoSaveDraft: value })}
            />
          </View>
        </SectionCard>

        <SectionCard
          visible={matchesSection('smart-notes')}
          open={sectionOpen['smart-notes']}
          onToggle={() => toggleSettingsSection('smart-notes')}
          title={t('settings.smartNotesTitle')}
          subtitle={t('settings.smartNotesSubtitle')}
          icon="sparkles-outline"
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.ipDetection')}</Text>
            <Switch
              accessibilityLabel={t('settings.ipDetection')}
              value={settings.smartNotes?.ipDetectionEnabled ?? true}
              onValueChange={(value) => patchSettingsLogged({
                smartNotes: {
                  ...settings.smartNotes!,
                  ipDetectionEnabled: value,
                },
              })}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.detectIp')}</Text>
            <Switch
              accessibilityLabel={t('settings.detectIp')}
              value={settings.smartNotes?.detectionEnabled.ip ?? true}
              onValueChange={(value) => patchSettingsLogged({
                smartNotes: {
                  ...settings.smartNotes!,
                  detectionEnabled: {
                    ...settings.smartNotes!.detectionEnabled,
                    ip: value,
                  },
                },
              })}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.detectHostname')}</Text>
            <Switch
              accessibilityLabel={t('settings.detectHostname')}
              value={settings.smartNotes?.detectionEnabled.hostname ?? true}
              onValueChange={(value) => patchSettingsLogged({
                smartNotes: {
                  ...settings.smartNotes!,
                  detectionEnabled: {
                    ...settings.smartNotes!.detectionEnabled,
                    hostname: value,
                  },
                },
              })}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.detectOffice')}</Text>
            <Switch
              accessibilityLabel={t('settings.detectOffice')}
              value={settings.smartNotes?.detectionEnabled.office ?? true}
              onValueChange={(value) => patchSettingsLogged({
                smartNotes: {
                  ...settings.smartNotes!,
                  detectionEnabled: {
                    ...settings.smartNotes!.detectionEnabled,
                    office: value,
                  },
                },
              })}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.detectPi')}</Text>
            <Switch
              accessibilityLabel={t('settings.detectPi')}
              value={settings.smartNotes?.detectionEnabled.asset ?? true}
              onValueChange={(value) => patchSettingsLogged({
                smartNotes: {
                  ...settings.smartNotes!,
                  detectionEnabled: {
                    ...settings.smartNotes!.detectionEnabled,
                    asset: value,
                  },
                },
              })}
            />
          </View>

          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.ipRegex')}</Text>
          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
            value={settings.smartNotes?.regex.ip || ''}
            onChangeText={(value) => patchSettingsLogged({
              smartNotes: {
                ...settings.smartNotes!,
                regex: { ...settings.smartNotes!.regex, ip: value },
              },
            })}
            placeholder={t('settings.ipv4RegexPlaceholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
          />
          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.hostnameRegex')}</Text>
          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
            value={settings.smartNotes?.regex.hostname || ''}
            onChangeText={(value) => patchSettingsLogged({
              smartNotes: {
                ...settings.smartNotes!,
                regex: { ...settings.smartNotes!.regex, hostname: value },
              },
            })}
            placeholder={t('settings.hostnameRegexPlaceholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
          />
          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.piRegex')}</Text>
          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
            value={settings.smartNotes?.regex.pi || ''}
            onChangeText={(value) => patchSettingsLogged({
              smartNotes: {
                ...settings.smartNotes!,
                regex: { ...settings.smartNotes!.regex, pi: value },
              },
            })}
            placeholder={t('settings.piRegexPlaceholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
          />

          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.offices')}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1, borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
              value={officeDraft}
              onChangeText={setOfficeDraft}
              placeholder={t('settings.addOfficePlaceholder')}
              placeholderTextColor={palette.muted}
            />
            <Pressable
              style={[styles.bulkButton, { minWidth: 84, backgroundColor: activeAccent }]}
              onPress={() => {
                const nextOffice = officeDraft.trim();
                if (!nextOffice) return;
                const current = settings.smartNotes?.offices || [];
                if (current.some((entry) => entry.toLowerCase() === nextOffice.toLowerCase())) {
                  setOfficeDraft('');
                  return;
                }
                patchSettingsLogged({
                  smartNotes: {
                    ...settings.smartNotes!,
                    offices: [...current, nextOffice],
                  },
                });
                setOfficeDraft('');
              }}
            >
              <Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.add')}</Text>
            </Pressable>
          </View>
          <View style={styles.modeRow}>
            {(settings.smartNotes?.offices || []).map((office) => (
              <Pressable
                key={office}
                onPress={() => patchSettingsLogged({
                  smartNotes: {
                    ...settings.smartNotes!,
                    offices: (settings.smartNotes?.offices || []).filter((entry) => entry !== office),
                  },
                })}
                style={[styles.modeChip, { borderColor: palette.border, backgroundColor: palette.card }]}
              >
                <Text style={[styles.modeChipText, { color: palette.fg }]}>{office} �</Text>
              </Pressable>
            ))}
          </View>
        </SectionCard>

        <SectionCard
          visible={matchesSection('security')}
          open={sectionOpen['security']}
          onToggle={() => toggleSettingsSection('security')}
          title={t('settings.securityTitle')}
          subtitle={t('settings.securitySubtitle')}
          icon="lock-closed-outline"
          badge={pinExists ? 'CONFIGURED' : 'NOT SET'}
          badgeTone={pinExists ? 'success' : 'warn'}
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={[styles.statusRow, { borderColor: palette.border, backgroundColor: `${palette.bg}80` }]}>
            <Ionicons name={pinExists ? 'shield-checkmark' : 'shield-outline'} size={20} color={pinExists ? '#22c55e' : '#f59e0b'} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.statusTitle, { color: palette.fg }]}>
                {pinExists ? 'Private notes are locked' : 'No PIN configured'}
              </Text>
              <Text style={[styles.statusSubtitle, { color: palette.muted }]}>
                {pinExists ? '6-digit PIN protects every note marked as private.' : 'Set a 6-digit PIN to lock private notes.'}
              </Text>
            </View>
          </View>
          <View style={[styles.bulkGrid, isDesktop ? styles.bulkGridDesktop : null]}>
            {!pinExists ? (
              <Pressable
                onPress={startSetPin}
                style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.setPin')}</Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  onPress={startChangePin}
                  style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.changePin')}</Text>
                </Pressable>
                <Pressable
                  onPress={startRemovePin}
                  style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#b91c1c', opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.removePin')}</Text>
                </Pressable>
              </>
            )}
          </View>
          <Text style={[styles.helperLine, { color: palette.muted }]}>Stored hashed in {Platform.OS === 'web' ? 'AsyncStorage' : 'SecureStore'}. Removing the PIN unlocks all private notes.</Text>
        </SectionCard>

        <SectionCard
          visible={matchesSection('clipboard')}
          open={sectionOpen['clipboard']}
          onToggle={() => toggleSettingsSection('clipboard')}
          title={t('settings.clipboardTitle')}
          subtitle={t('settings.clipboardSubtitle')}
          icon="clipboard-outline"
          badge={settings.clipboardCloudSync ? 'SYNCING' : 'LOCAL'}
          badgeTone={settings.clipboardCloudSync ? 'success' : 'muted'}
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.cloudSync')}</Text>
              <Text style={[styles.toggleHint, { color: palette.muted }]}>{t('settings.cloudSyncHint')}</Text>
            </View>
            <Switch
              accessibilityLabel={t('settings.cloudSync')}
              value={settings.clipboardCloudSync}
              onValueChange={(value) => patchSettingsLogged({ clipboardCloudSync: value })}
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.backgroundCapture')}</Text>
              <Text style={[styles.toggleHint, { color: palette.muted }]}>{t('settings.backgroundCaptureHint')}</Text>
            </View>
            <Switch
              accessibilityLabel={t('settings.backgroundCapture')}
              value={settings.clipboardBackgroundCapture}
              onValueChange={(value) => patchSettingsLogged({ clipboardBackgroundCapture: value })}
            />
          </View>
        </SectionCard>

        <SectionCard
          visible={matchesSection('shared-groups')}
          open={sectionOpen['shared-groups']}
          onToggle={() => toggleSettingsSection('shared-groups')}
          title={t('settings.sharedGroupsTitle')}
          subtitle={t('settings.sharedGroupsSubtitle')}
          icon="people-outline"
          badge={groups.length > 0 ? `${groups.length}` : undefined}
          badgeTone="info"
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1, borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
              placeholder={t('settings.newGroupPlaceholder')}
              placeholderTextColor={palette.muted}
              value={groupNameDraft}
              onChangeText={setGroupNameDraft}
            />
            <Pressable
              style={[styles.bulkButton, { backgroundColor: activeAccent, minWidth: 100 }]}
              onPress={() => createSharedNoteGroup(groupNameDraft).then((g) => { setGroups((current) => [g, ...current]); setGroupNameDraft(''); }).catch(() => undefined)}
            >
              <Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.create')}</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1, borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
              placeholder={t('settings.inviteCodePlaceholder')}
              placeholderTextColor={palette.muted}
              value={inviteCodeDraft}
              onChangeText={setInviteCodeDraft}
              autoCapitalize="characters"
            />
            <Pressable
              style={[styles.bulkButton, { borderWidth: 1, borderColor: palette.border, minWidth: 100 }]}
              onPress={() => joinSharedNoteGroup(inviteCodeDraft).then((g) => { if (!g) return; setGroups((current) => current.some((x) => x.id === g.id) ? current : [g, ...current]); setInviteCodeDraft(''); }).catch(() => undefined)}
            >
              <Text style={[styles.bulkButtonText, { color: palette.fg }]}>{t('settings.join')}</Text>
            </Pressable>
          </View>
          {groups.length ? groups.map((g) => (
            <Text key={g.id} style={[styles.helperLine, { color: palette.muted }]}>
              {g.name} � code: {g.inviteCode} � members: {g.members?.length || 0}
            </Text>
          )) : <Text style={[styles.helperLine, { color: palette.muted }]}>{t('settings.noGroupsYet')}</Text>}
        </SectionCard>

        {Platform.OS === 'web' ? (
          <SectionCard
            visible={matchesSection('pwa')}
            open={sectionOpen['pwa']}
            onToggle={() => toggleSettingsSection('pwa')}
            title={t('settings.pwaTitle')}
            subtitle={t('settings.pwaSubtitle')}
            icon="cloud-download-outline"
            badge={pwaInstallAvailable ? 'READY' : undefined}
            badgeTone="success"
            accent={palette.accent}
            subtitleColor={palette.muted}
            cardBackground={palette.card}
            cardBorder={palette.border}
          >
            <Pressable
              disabled={installBusy}
              onPress={async () => {
                if (pwaInstallAvailable) {
                  setInstallBusy(true);
                  try {
                    const result = await triggerPwaInstall();
                    Alert.alert(result.accepted ? t('settings.installed') : t('settings.installCanceled'), result.accepted ? t('settings.installedBody') : t('settings.installRetryBody'));
                  } finally {
                    setInstallBusy(false);
                  }
                  return;
                }
                const browserSupport = detectBrowserInstallSupport();
                const manualText = getManualInstallInstructions();
                Alert.alert(
                  'Manual install',
                  manualText ||
                    (browserSupport === 'chromium'
                      ? 'Use browser menu (?) > Install app. If it does not appear, refresh and interact with the app for a few seconds.'
                      : 'Use your browser install option (Add to Home screen / Install app).')
                );
              }}
              style={[styles.bulkButton, { backgroundColor: activeAccent, opacity: installBusy ? 0.6 : 1 }]}
            >
              <Text style={[styles.bulkButtonText, { color: '#111' }]}>
                {installBusy ? 'Opening...' : pwaInstallAvailable ? 'Install Web App' : 'Install (Manual)'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                const browserSupport = detectBrowserInstallSupport();
                const guideUrl =
                  browserSupport === 'safari'
                    ? 'https://support.apple.com/guide/safari/ibrw9f78f7fe/mac'
                    : browserSupport === 'firefox'
                      ? 'https://support.mozilla.org/en-US/kb/add-web-page-shortcuts-your-home-screen'
                      : 'https://support.google.com/chrome/answer/9658361';
                void Linking.openURL(guideUrl);
              }}
              style={[styles.bulkButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.border }]}
            >
              <Text style={[styles.bulkButtonText, { color: palette.fg }]}>{t('settings.openInstallGuide')}</Text>
            </Pressable>
            <Text style={[styles.helperLine, { color: palette.muted }]}>
              {pwaDiag.reason}
            </Text>
          </SectionCard>
        ) : null}

        <SectionCard
          visible={matchesSection('barcode')}
          open={sectionOpen['barcode']}
          onToggle={() => toggleSettingsSection('barcode')}
          title={t('settings.barcodeTitle')}
          subtitle={t('settings.barcodeSubtitle')}
          icon="barcode-outline"
          badge={barcodeOutputFormat}
          badgeTone="info"
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={[styles.formatGrid, isDesktop ? styles.formatGridDesktop : null]}> 
            {barcodeOptions.map((format) => {
              const selected = barcodeOutputFormat === format.name;
              return (
                <Pressable key={format.name} onPress={() => { const match = BARCODE_FORMAT_OPTIONS.find((opt) => opt.value === format.name); if (!match || format.hardwareOnly) return; patchSettingsLogged({ barcodeOutputFormat: match.value }); }} style={({ pressed }) => [styles.formatCard, isDesktop ? styles.formatCardDesktop : styles.formatCardMobile, { borderColor: selected ? activeAccent : palette.border, backgroundColor: palette.card, opacity: pressed ? 0.8 : 1 }]}>
                  <Text style={[styles.formatName, { color: palette.fg }]}>{format.label}</Text>
                  <Text style={[styles.formatDescription, { color: palette.muted }]}>{format.description}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.helperLine, { color: palette.muted }]}>Active scan types: {visibleBarcodeTypes.join(', ') || 'none'}</Text>
        </SectionCard>

        <SectionCard
          visible={matchesSection('cleanup')}
          open={sectionOpen['cleanup']}
          onToggle={() => toggleSettingsSection('cleanup')}
          title={t('settings.cleanupTitle')}
          subtitle={t('settings.cleanupSubtitle')}
          icon="trash-outline"
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '600' }}>{t('settings.autoClearNotesOlder')}</Text>
                <Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>{t('settings.pinnedNeverDeleted')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {([0, 30, 90, 180, 365] as const).map((days) => {
                  const active = (settings.notesAutoClearDays ?? 0) === days;
                  const label = days === 0 ? 'Never' : days === 365 ? '1 year' : `${days}d`;
                  return (
                    <Pressable
                      key={days}
                      onPress={() => patchSettingsLogged({ notesAutoClearDays: days })}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: active ? activeAccent : palette.border,
                        backgroundColor: active ? activeAccent : palette.card,
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Text style={{ color: active ? '#111' : palette.muted, fontSize: 12, fontWeight: active ? '800' : '600' }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '600' }}>{t('settings.autoClearHistoryOlder')}</Text>
                <Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>{t('settings.appliesToScanHistory')}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {([0, 30, 90, 180, 365] as const).map((days) => {
                  const active = (settings.historyAutoClearDays ?? 0) === days;
                  const label = days === 0 ? 'Never' : days === 365 ? '1 year' : `${days}d`;
                  return (
                    <Pressable
                      key={days}
                      onPress={() => patchSettingsLogged({ historyAutoClearDays: days })}
                      style={({ pressed }) => ({
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: active ? activeAccent : palette.border,
                        backgroundColor: active ? activeAccent : palette.card,
                        opacity: pressed ? 0.8 : 1,
                      })}
                    >
                      <Text style={{ color: active ? '#111' : palette.muted, fontSize: 12, fontWeight: active ? '800' : '600' }}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.bulkGrid, isDesktop ? styles.bulkGridDesktop : null]}>
              <Pressable
                onPress={() => Alert.alert(t('settings.clearArchivedTitle'), t('settings.clearArchivedBody'), [{ text: t('settings.cancel'), style: 'cancel' }, { text: t('settings.clear'), style: 'destructive', onPress: onClearArchivedNotes }])}
                style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#b45309', opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.clearArchived')}</Text>
              </Pressable>
              <Pressable
                onPress={() => Alert.alert(t('settings.clearUnpinnedTitle'), t('settings.clearUnpinnedBody'), [{ text: t('settings.cancel'), style: 'cancel' }, { text: t('settings.clear'), style: 'destructive', onPress: onClearUnpinnedNotes }])}
                style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#92400e', opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.clearUnpinned')}</Text>
              </Pressable>
            </View>

            {/* Review by date panel */}
            <Pressable
              onPress={() => reviewOpen ? setReviewOpen(false) : openReviewPanel()}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: reviewOpen ? activeAccent : palette.border, backgroundColor: palette.card, opacity: pressed ? 0.8 : 1 })}
            >
              <Ionicons name="calendar-outline" size={16} color={activeAccent} />
              <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '600', flex: 1 }}>{t('settings.reviewNotesByDate')}</Text>
              <Ionicons name={reviewOpen ? 'chevron-up' : 'chevron-down'} size={14} color={palette.muted} />
            </Pressable>

            {reviewOpen ? (
              <View style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 10, overflow: 'hidden' }}>
                {/* Toolbar: group-by + select-all */}
                <View style={{ flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.card }}>
                  {(['day', 'week'] as const).map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => setReviewGroupBy(g)}
                      style={{ paddingVertical: 9, paddingHorizontal: 18, borderRightWidth: 1, borderRightColor: palette.border, backgroundColor: reviewGroupBy === g ? activeAccent : 'transparent' }}
                    >
                      <Text style={{ color: reviewGroupBy === g ? '#111' : palette.muted, fontSize: 12, fontWeight: '700', textTransform: 'capitalize' }}>{g}</Text>
                    </Pressable>
                  ))}
                  <View style={{ flex: 1 }} />
                  {reviewNotes.length > 0 && (
                    <Pressable
                      onPress={() => {
                        const allIds = reviewNotes.map((n) => n.id);
                        const allChosen = allIds.every((id) => reviewSelected.has(id));
                        setReviewSelected(allChosen ? new Set() : new Set(allIds));
                      }}
                      style={{ paddingHorizontal: 12, paddingVertical: 9 }}
                    >
                      <Text style={{ color: activeAccent, fontSize: 12, fontWeight: '700' }}>
                        {reviewNotes.every((n) => reviewSelected.has(n.id)) ? 'Deselect all' : 'Select all'}
                      </Text>
                    </Pressable>
                  )}
                </View>

                {reviewLoading ? (
                  <View style={{ padding: 24, alignItems: 'center' }}>
                    <Text style={{ color: palette.muted, fontSize: 13 }}>Loading notes…</Text>
                  </View>
                ) : reviewGroups.length === 0 ? (
                  <View style={{ padding: 24, alignItems: 'center', gap: 6 }}>
                    <Ionicons name="document-outline" size={28} color={palette.muted} />
                    <Text style={{ color: palette.muted, fontSize: 13 }}>{t('settings.noNotesFound')}</Text>
                  </View>
                ) : (
                  <View>
                    {reviewGroups.map(([groupKey, groupNotes], groupIndex) => {
                      const allSelected = groupNotes.every((n) => reviewSelected.has(n.id));
                      const someSelected = groupNotes.some((n) => reviewSelected.has(n.id));
                      const label = reviewGroupBy === 'day'
                        ? new Date(groupKey + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
                        : `Week of ${new Date(groupKey + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
                      return (
                        <View key={groupKey} style={{ borderBottomWidth: groupIndex < reviewGroups.length - 1 ? 1 : 0, borderBottomColor: palette.border }}>
                          {/* Group header — always visible, tap to select all in group */}
                          <Pressable
                            onPress={() => setReviewSelected((prev) => {
                              const next = new Set(prev);
                              groupNotes.forEach((n) => allSelected ? next.delete(n.id) : next.add(n.id));
                              return next;
                            })}
                            style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, backgroundColor: someSelected ? `${activeAccent}10` : palette.card }}
                          >
                            <View style={{ width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, borderColor: allSelected ? activeAccent : someSelected ? activeAccent : palette.border, backgroundColor: allSelected ? activeAccent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                              {allSelected ? <Ionicons name="checkmark" size={10} color="#111" /> : someSelected ? <View style={{ width: 8, height: 2, backgroundColor: activeAccent }} /> : null}
                            </View>
                            <Text style={{ flex: 1, color: palette.fg, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
                            <Text style={{ color: palette.muted, fontSize: 11 }}>{groupNotes.length} note{groupNotes.length !== 1 ? 's' : ''}</Text>
                          </Pressable>

                          {/* Notes — always visible */}
                          {groupNotes.map((note, noteIndex) => {
                            const selected = reviewSelected.has(note.id);
                            const preview = String(note.title || note.text || '').replace(/\n+/g, ' ').trim().slice(0, 100);
                            return (
                              <Pressable
                                key={note.id}
                                onPress={() => setReviewSelected((prev) => {
                                  const next = new Set(prev);
                                  selected ? next.delete(note.id) : next.add(note.id);
                                  return next;
                                })}
                                style={({ pressed }) => ({
                                  flexDirection: 'row',
                                  alignItems: 'flex-start',
                                  paddingHorizontal: 14,
                                  paddingVertical: 10,
                                  gap: 10,
                                  borderTopWidth: 1,
                                  borderTopColor: palette.border,
                                  backgroundColor: selected ? `${activeAccent}18` : pressed ? `${palette.border}44` : 'transparent',
                                })}
                              >
                                <View style={{ marginTop: 2, width: 16, height: 16, borderRadius: 3, borderWidth: 1.5, borderColor: selected ? activeAccent : palette.border, backgroundColor: selected ? activeAccent : 'transparent', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  {selected ? <Ionicons name="checkmark" size={10} color="#111" /> : null}
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={{ color: selected ? palette.fg : palette.fg, fontSize: 13, fontWeight: '500', lineHeight: 18 }} numberOfLines={3}>
                                    {preview || '(empty note)'}
                                  </Text>
                                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
                                    <Text style={{ color: palette.muted, fontSize: 10 }}>
                                      {new Date(note.updatedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                    {note.pinned ? <Text style={{ color: '#f59e0b', fontSize: 10, fontWeight: '700' }}>pinned</Text> : null}
                                    {note.draft ? <Text style={{ color: '#60a5fa', fontSize: 10, fontWeight: '700' }}>draft</Text> : null}
                                    {note.category !== 'general' ? <Text style={{ color: palette.muted, fontSize: 10 }}>{note.category}</Text> : null}
                                    {note.archived ? <Text style={{ color: palette.muted, fontSize: 10 }}>archived</Text> : null}
                                  </View>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      );
                    })}
                  </View>
                )}

                {/* Action bar */}
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8, borderTopWidth: 1, borderTopColor: palette.border, backgroundColor: palette.card }}>
                  <Text style={{ flex: 1, color: palette.muted, fontSize: 12 }}>
                    {reviewSelected.size > 0 ? `${reviewSelected.size} selected` : `${reviewNotes.length} total`}
                  </Text>
                  {reviewSelected.size > 0 ? (
                    <>
                      <Pressable onPress={() => setReviewSelected(new Set())} style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: palette.border, opacity: pressed ? 0.7 : 1 })}>
                        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600' }}>{t('settings.deselect')}</Text>
                      </Pressable>
                      <Pressable
                        disabled={reviewDeleting}
                        onPress={() => Alert.alert(
                          `Delete ${reviewSelected.size} note${reviewSelected.size !== 1 ? 's' : ''}?`,
                          'This cannot be undone.',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Delete',
                              style: 'destructive',
                              onPress: async () => {
                                setReviewDeleting(true);
                                try {
                                  await deleteReviewSelected();
                                } catch (error) {
                                  console.error('Deletion error:', error);
                                  showToast('Failed to delete notes', 'error');
                                } finally {
                                  setReviewDeleting(false);
                                }
                              },
                            },
                          ]
                        )}
                        style={({ pressed }) => ({ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, backgroundColor: '#ef4444', opacity: reviewDeleting ? 0.6 : pressed ? 0.8 : 1 })}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                          {reviewDeleting ? 'Deleting...' : `Delete ${reviewSelected.size}`}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        </SectionCard>

        <SectionCard
          visible={matchesSection('data-sync')}
          open={sectionOpen['data-sync']}
          onToggle={() => toggleSettingsSection('data-sync')}
          title={t('settings.dataSyncTitle')}
          subtitle={t('settings.dataSyncSubtitle')}
          icon="cloud-upload-outline"
          badge={persistenceMode === 'firebase' ? 'CLOUD' : 'LOCAL'}
          badgeTone={persistenceMode === 'firebase' ? 'success' : 'muted'}
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={[styles.bulkGrid, isDesktop ? styles.bulkGridDesktop : null]}> 
            <Pressable onPress={() => runDataSyncAction('Export CSV', onExportCsv)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.exportCsv')}</Text></Pressable>
            <Pressable onPress={() => runDataSyncAction('Export backup', onExportBackup)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.exportBackup')}</Text></Pressable>
            <Pressable onPress={() => runDataSyncAction('Import', onOpenBackupImport)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.import')}</Text></Pressable>
            <Pressable onPress={() => runDataSyncAction('Recheck Firebase', onRecheckFirebase)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.recheckFirebase')}</Text></Pressable>
            <Pressable disabled={syncBusy} onPress={() => runDataSyncAction('Sync now', onSyncNow)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: syncBusy ? 0.6 : pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{syncBusy ? 'Syncing' : 'Sync now'}</Text></Pressable>
            <Pressable onPress={() => confirmDataSyncAction(t('settings.clearHistory'), 'Are you sure you want to clear all history?', onClearHistory)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#ef4444', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.clearHistory')}</Text></Pressable>
            <Pressable onPress={() => confirmDataSyncAction('Hard delete history', 'Delete all history locally, cache and cloud?', onHardDeleteHistory)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#991b1b', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.hardDeleteHistory')}</Text></Pressable>
            <Pressable onPress={() => confirmDataSyncAction('Hard delete notes', 'Delete all notes locally and in cloud?', onHardDeleteNotes)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#b91c1c', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.hardDeleteNotes')}</Text></Pressable>
            <Pressable onPress={() => confirmDataSyncAction('Hard delete clipboard', 'Delete all clipboard memory locally?', onHardDeleteClipboard)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#b91c1c', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.hardDeleteClipboard')}</Text></Pressable>
            <Pressable onPress={() => confirmDataSyncAction('Hard delete templates', 'Delete all templates locally and in cloud?', onHardDeleteTemplates)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#b91c1c', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.hardDeleteTemplates')}</Text></Pressable>
          </View>
          <Text style={{ color: palette.muted, marginTop: 6 }}>Mode: {isGuest ? 'Guest' : 'Authenticated'} | Persistence: {persistenceMode === 'firebase' ? 'Firebase' : 'Local'}</Text>
          {userEmail ? <Text style={{ color: palette.fg, marginTop: 2 }}>{userEmail}</Text> : null}
        </SectionCard>

        <SectionCard
          visible={matchesSection('health')}
          open={sectionOpen['health']}
          onToggle={() => toggleSettingsSection('health')}
          title={t('settings.healthTitle')}
          subtitle={t('settings.healthSubtitle')}
          icon="pulse-outline"
          badge={diagnosticErrorCount ? `${diagnosticErrorCount} ERRORS` : 'OK'}
          badgeTone={diagnosticErrorCount ? 'warn' : 'success'}
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={[styles.healthGrid, isDesktop ? styles.healthGridDesktop : null]}>
            {healthItems.map((item) => {
              const toneColor = item.tone === 'success' ? '#22c55e' : item.tone === 'warn' ? '#f59e0b' : item.tone === 'info' ? palette.accent : palette.muted;
              return (
                <View key={item.label} style={[styles.healthTile, isDesktop ? styles.healthTileDesktop : null, { borderColor: palette.border, backgroundColor: `${palette.bg}80` }]}>
                  <Text style={[styles.healthLabel, { color: palette.muted }]}>{item.label}</Text>
                  <Text style={[styles.healthValue, { color: toneColor }]} numberOfLines={2}>{item.value}</Text>
                </View>
              );
            })}
          </View>
        </SectionCard>

        <SectionCard
          visible={matchesSection('maintenance')}
          open={sectionOpen['maintenance']}
          onToggle={() => toggleSettingsSection('maintenance')}
          title={t('settings.maintenanceTitle')}
          subtitle={t('settings.maintenanceSubtitle')}
          icon="construct-outline"
          badge={maintenanceMode ? 'ON' : 'OFF'}
          badgeTone={maintenanceMode ? 'warn' : 'muted'}
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.maintenanceMode')}</Text>
              <Text style={[styles.toggleHint, { color: palette.muted }]}>{t('settings.maintenanceModeHint')}</Text>
            </View>
            <Switch
              accessibilityLabel={t('settings.maintenanceMode')}
              value={maintenanceMode}
              onValueChange={(value) => {
                setMaintenanceMode(value);
                void diag.info('settings.maintenance.mode', { enabled: value });
              }}
            />
          </View>

          <View style={[styles.bulkGrid, isDesktop ? styles.bulkGridDesktop : null]}>
            <Pressable onPress={runMaintenanceCheck} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.runCheck')}</Text></Pressable>
            <Pressable onPress={() => runDataSyncAction('Maintenance backup', onExportBackup)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.backupNow')}</Text></Pressable>
            <Pressable disabled={syncBusy} onPress={() => runDataSyncAction('Maintenance sync', onSyncNow)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: syncBusy ? 0.6 : pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{syncBusy ? 'Syncing' : 'Sync now'}</Text></Pressable>
            <Pressable onPress={() => runDataSyncAction('Maintenance Firebase check', onRecheckFirebase)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.firebaseCheck')}</Text></Pressable>
            <Pressable onPress={() => runDiagnosticAction('Maintenance copy logs', onCopyLogs)} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.copyLogs')}</Text></Pressable>
            <Pressable
              onPress={() => runDiagnosticAction('Maintenance clear logs', async () => {
                await diag.clear();
                showToast('Logs cleared', 'success');
              })}
              style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#991b1b', opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.clearLogs')}</Text>
            </Pressable>
          </View>
          {maintenanceSummary ? <Text style={[styles.helperLine, { color: palette.muted }]}>{maintenanceSummary}</Text> : null}
        </SectionCard>

        <SectionCard
          visible={matchesSection('diagnostics')}
          open={sectionOpen['diagnostics']}
          onToggle={() => toggleSettingsSection('diagnostics')}
          title={t('settings.logsTitle')}
          subtitle={t('settings.logsSubtitle')}
          icon="bug-outline"
          badge={`${diagnosticLogs.length} EVENTS`}
          badgeTone={diagnosticLogs.some((entry) => entry.level === 'error') ? 'warn' : 'info'}
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <View style={styles.modeRow}>
            {(['all', 'info', 'warn', 'error'] as const).map((level) => {
              const active = diagnosticFilter === level;
              return (
                <Pressable
                  key={level}
                  onPress={() => {
                    logSettingsAction('filter diagnostics', { level });
                    setDiagnosticFilter(level);
                  }}
                  style={[styles.modeChip, { borderColor: active ? activeAccent : palette.border, backgroundColor: active ? 'rgba(255,216,77,0.16)' : palette.card }]}
                >
                  <Text style={[styles.modeChipText, { color: active ? activeAccent : palette.fg, textTransform: 'uppercase' }]}>{level}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={[styles.bulkGrid, isDesktop ? styles.bulkGridDesktop : null]}>
            <Pressable
              onPress={() => runDiagnosticAction('Copy logs', onCopyLogs)}
              style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.copyLogs')}</Text>
            </Pressable>
            <Pressable
              onPress={() => runDiagnosticAction('Export logs', onExportLogs)}
              style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={[styles.bulkButtonText, { color: '#111' }]}>{t('settings.exportJson')}</Text>
            </Pressable>
            <Pressable
              onPress={() => runDiagnosticAction('Clear logs', async () => {
                await diag.clear();
                showToast('Logs cleared', 'success');
              })}
              style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#991b1b', opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.clearLogs')}</Text>
            </Pressable>
          </View>

          <View style={[styles.logPanel, { borderColor: palette.border, backgroundColor: palette.bg }]}>
            {filteredDiagnosticLogs.length ? (
              filteredDiagnosticLogs.map((entry, index) => {
                const color = entry.level === 'error' ? '#ef4444' : entry.level === 'warn' ? '#f59e0b' : palette.accent;
                const time = new Date(entry.ts).toLocaleTimeString();
                const payload = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
                return (
                  <View key={`${entry.ts}-${index}`} style={[styles.logRow, { borderBottomColor: palette.border }]}>
                    <Text style={[styles.logMeta, { color }]}>{time} [{entry.level.toUpperCase()}]</Text>
                    <Text selectable style={[styles.logText, { color: palette.fg }]}>{entry.event}{payload}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={[styles.helperLine, { color: palette.muted }]}>{t('settings.noDiagnosticsYet')}</Text>
            )}
          </View>
          <Text style={[styles.helperLine, { color: palette.muted }]}>{t('settings.diagnosticsStoredHint')}</Text>
        </SectionCard>

        <SectionCard
          visible={matchesSection('advanced')}
          open={sectionOpen['advanced']}
          onToggle={() => toggleSettingsSection('advanced')}
          title={t('settings.advancedTitle')}
          subtitle={t('settings.advancedSubtitle')}
          icon="construct-outline"
          badge="EXPERT"
          badgeTone="warn"
          accent={palette.accent}
          subtitleColor={palette.muted}
          cardBackground={palette.card}
          cardBorder={palette.border}
        >
          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.piFullPrefix')}</Text>
          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
            value={settings.fullPrefix}
            onChangeText={(value) => patchSettingsLogged({ fullPrefix: value.toUpperCase() })}
            placeholder="02PI20"
            placeholderTextColor={palette.muted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.piShortPrefix')}</Text>
          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
            value={settings.shortPrefix}
            onChangeText={(value) => patchSettingsLogged({ shortPrefix: value.toUpperCase() })}
            placeholder="MUSTBRUN"
            placeholderTextColor={palette.muted}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.serviceNowBaseUrl')}</Text>
          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
            value={settings.serviceNowBaseUrl}
            onChangeText={(value) => patchSettingsLogged({ serviceNowBaseUrl: value.trim() })}
            placeholder={t('settings.serviceNowUrlPlaceholder')}
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={[styles.helperLine, { color: palette.muted, marginTop: 4 }]}>{t('settings.serviceNowHint')}</Text>

          <View style={[styles.divider, { backgroundColor: palette.border }]} />

          <View style={styles.toggleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.showRawText')}</Text>
              <Text style={[styles.toggleHint, { color: palette.muted }]}>{t('settings.showRawTextHint')}</Text>
            </View>
            <Switch
              accessibilityLabel={t('settings.showRawText')}
              value={settings.showRawText}
              onValueChange={(value) => patchSettingsLogged({ showRawText: value })}
            />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.toggleLabel, { color: palette.fg }]}>{t('settings.staySignedIn')}</Text>
              <Text style={[styles.toggleHint, { color: palette.muted }]}>{t('settings.staySignedInHint')}</Text>
            </View>
            <Switch
              accessibilityLabel={t('settings.staySignedIn')}
              value={settings.staySignedIn}
              onValueChange={(value) => patchSettingsLogged({ staySignedIn: value })}
            />
          </View>

          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.laserSpeed')}</Text>
          <View style={styles.modeRow}>
            {(['slow', 'normal', 'fast'] as const).map((speed) => {
              const active = settings.laserSpeed === speed;
              return (
                <Pressable
                  key={speed}
                  onPress={() => patchSettingsLogged({ laserSpeed: speed })}
                  style={[styles.modeChip, { borderColor: active ? activeAccent : palette.border, backgroundColor: active ? 'rgba(255,216,77,0.16)' : palette.card }]}
                >
                  <Text style={[styles.modeChipText, { color: active ? activeAccent : palette.fg, textTransform: 'capitalize' }]}>{speed}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.controlLabel, { color: palette.muted }]}>{t('settings.scanProfile')}</Text>
          <View style={styles.modeRow}>
            {(['auto', 'pi_full', 'pi_short'] as const).map((profile) => {
              const active = settings.scanProfile === profile;
              const label = profile === 'auto' ? 'Auto' : profile === 'pi_full' ? 'PI Full' : 'PI Short';
              return (
                <Pressable
                  key={profile}
                  onPress={() => patchSettingsLogged({ scanProfile: profile, autoDetect: profile === 'auto' })}
                  style={[styles.modeChip, { borderColor: active ? activeAccent : palette.border, backgroundColor: active ? 'rgba(255,216,77,0.16)' : palette.card }]}
                >
                  <Text style={[styles.modeChipText, { color: active ? activeAccent : palette.fg }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        </SectionCard>

        <View style={styles.bottomLogout}>
          <Pressable onPress={onLogout} style={[styles.bulkButton, styles.bottomLogoutBtn, isDesktop ? styles.bottomLogoutBtnDesktop : null, { backgroundColor: palette.accent }]}>
            <Text style={[styles.bulkButtonText, { color: '#fff' }]}>{t('settings.logOff')}</Text>
          </Pressable>
        </View>
        </View>
      </ScrollView>
      <SecretPinModal
        visible={pinModalVisible}
        mode={pinModalMode}
        palette={palette}
        onSuccess={handlePinSuccess}
        onCancel={handlePinCancel}
      />
      <Toast toast={toast} onHide={hideToast} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollOuter: { alignItems: 'center', width: '100%', minWidth: 0 },
  container: { padding: 16, gap: 14, paddingBottom: 160, width: '100%', maxWidth: 1280, minWidth: 0 },
  header: { gap: 8, paddingTop: 6 },
  kicker: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 3, fontFamily: 'monospace' },
  pageTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.6 },
  pageSubtitle: { fontSize: 12, lineHeight: 16 },
  sectionCard: { gap: 12, padding: 14, borderRadius: 14, borderLeftWidth: 3, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionIcon: { width: 28, height: 28, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'monospace' },
  sectionSubtitle: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  sectionBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  sectionBadgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 0.8, fontFamily: 'monospace' },
  sectionBody: { gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: 12 },
  toolbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  toolbarPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  toolbarPillText: { fontSize: 10, fontWeight: '900', letterSpacing: 1, fontFamily: 'monospace' },
  toolbarBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  toolbarBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  searchBox: { minHeight: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchInput: { flex: 1, minWidth: 0, fontSize: 13, paddingVertical: 10 },
  emptySearch: { borderWidth: 1, borderRadius: 12, padding: 16, alignItems: 'center', gap: 8 },
  toggleHint: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12 },
  statusTitle: { fontSize: 13, fontWeight: '700' },
  statusSubtitle: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  healthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%', minWidth: 0 },
  healthGridDesktop: { gap: 10 },
  healthTile: { flexGrow: 1, flexBasis: '100%', minWidth: 0, borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  healthTileDesktop: { flexBasis: '31%' },
  healthLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1, fontFamily: 'monospace' },
  healthValue: { fontSize: 13, fontWeight: '800', lineHeight: 18 },
  divider: { height: 1, marginVertical: 6, opacity: 0.6 },
  chevron: { fontWeight: '800', fontSize: 14 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%', minWidth: 0 },
  themeGridDesktop: { gap: 10 },
  themeCard: { minWidth: 0, flexGrow: 1, minHeight: 76, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', gap: 6, position: 'relative' },
  themeCardDesktop: { flexBasis: '31%' },
  themeCardMobile: { flexBasis: '100%' },
  themeSwatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  themeCardText: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
  check: { position: 'absolute', right: 6, top: 4, fontSize: 9, fontWeight: '900' },
  formatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, width: '100%', minWidth: 0 },
  formatGridDesktop: { gap: 12 },
  formatCard: { minWidth: 0, minHeight: 100, borderWidth: 1, borderRadius: 14, padding: 10, gap: 5, flexGrow: 1 },
  formatCardMobile: { flexBasis: '100%' },
  formatCardDesktop: { flexBasis: '31%' },
  formatName: { fontSize: 12, fontWeight: '900' },
  formatDescription: { fontSize: 11, lineHeight: 15 },
  helperLine: { fontSize: 11, fontFamily: 'monospace', marginTop: 8 },
  logPanel: { borderWidth: 1, borderRadius: 10, maxHeight: 360, overflow: 'hidden' },
  logRow: { paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, gap: 3 },
  logMeta: { fontSize: 10, fontWeight: '900', fontFamily: 'monospace' },
  logText: { fontSize: 11, lineHeight: 15, fontFamily: 'monospace' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44 },
  toggleLabel: { fontSize: 13, fontWeight: '700' },
  bulkActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  bulkGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', width: '100%', minWidth: 0 },
  bulkGridDesktop: { gap: 10 },
  bulkGridItem: { flexGrow: 1, minWidth: 0 },
  bulkGridItemMobile: { flexBasis: '100%' },
  bulkGridItemDesktop: { flexBasis: '31%' },
  bulkButton: { minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  bulkButtonText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  bottomLogout: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.2)' },
  bottomLogoutBtn: { alignSelf: 'stretch' },
  bottomLogoutBtnDesktop: { alignSelf: 'flex-end', minWidth: 220 },
  passwordResult: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  passwordResultText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, lineHeight: 18 },
  passwordActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  passwordActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  passwordActionText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  modeChipText: { fontSize: 11, fontWeight: '800' },
  controlStack: { gap: 8 },
  controlLabel: { fontSize: 12, fontWeight: '700' },
  smallInput: { minWidth: 84, maxWidth: 96, textAlign: 'center' },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  counterBtn: { width: 36, height: 36, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  counterBtnText: { fontSize: 22, fontWeight: '900', lineHeight: 24 },
  counterValue: { minWidth: 56, height: 36, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  counterValueText: { fontSize: 14, fontWeight: '800' },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
});

