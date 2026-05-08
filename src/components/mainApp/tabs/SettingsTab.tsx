import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppSettings, type PersistenceMode } from '../../../types';
import { BARCODE_FORMAT_OPTIONS, type BarcodeFormat } from '../../../core/barcode';
import { canInstallPwa, detectBrowserInstallSupport, getManualInstallInstructions, getPwaInstallDiagnostics, subscribePwaInstallAvailability, triggerPwaInstall } from '../../../core/pwa';
import { createSharedNoteGroup, fetchSharedGroupsForCurrentUser, joinSharedNoteGroup, type SharedNoteGroup } from '../../../core/firebase';
import { useAppTheme } from '../../../constants/theme';
import { loadNotes, removeNote, type NoteItem } from '../../../core/notes';
import { Toast, useToast } from '../../Toast';

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

function SectionCard({ title, subtitle, accent, subtitleColor, cardBackground, cardBorder, children, defaultOpen = false }: { title: string; subtitle?: string; accent: string; subtitleColor: string; cardBackground: string; cardBorder: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={[styles.sectionCard, { borderLeftColor: accent, backgroundColor: cardBackground, borderColor: cardBorder }]}>
      <Pressable onPress={() => setOpen((v) => !v)} style={({ pressed }) => [styles.sectionHeader, { opacity: pressed ? 0.8 : 1 }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: accent }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSubtitle, { color: subtitleColor }]}>{subtitle}</Text> : null}
        </View>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color={accent} />
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function ThemeCard({ option, active, onPress, desktop }: { option: ThemeOption; active: boolean; desktop: boolean; onPress: () => void }) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setPulse((v) => (v + 1) % 2), 650);
    return () => clearInterval(id);
  }, [active]);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.themeCard, desktop ? styles.themeCardDesktop : styles.themeCardMobile, { backgroundColor: option.background, borderColor: active ? option.accent : option.border, borderWidth: active ? (pulse ? 2.3 : 1.5) : 1, opacity: pressed ? 0.85 : 1 }]}>
      <View style={[styles.themeSwatch, { backgroundColor: option.accent }]} />
      <Text style={[styles.themeCardText, { color: option.text }]}>{option.label}</Text>
      {active ? <Text style={[styles.check, { color: option.accent }]}>ACTIVE</Text> : null}
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
  onExportBackup,
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
  onExportBackup: () => void;
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
  const { show: showToast } = useToast();
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
          <Text style={[styles.kicker, { color: activeAccent }]}>SETTINGS</Text>
          <Text style={[styles.pageTitle, { color: palette.fg }]}>Configuration</Text>
          <Text style={[styles.pageSubtitle, { color: palette.muted }]}>Centered and compact configuration workspace.</Text>
        </View>

        <SectionCard title="Password generator" subtitle="Top priority tool." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border} defaultOpen>
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
              <Text style={[styles.controlLabel, { color: palette.muted }]}>Easy-to-remember phrase count (min 2)</Text>
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
              <Text style={[styles.controlLabel, { color: palette.muted }]}>Base word to keep in the generated password</Text>
              <Text style={[styles.helperLine, { color: palette.muted, marginTop: 0 }]}>Example: Welcome to W3lc0mexy2026</Text>
              <TextInput
                style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
                value={seedText}
                onChangeText={setSeedText}
                placeholder="Welcome"
                placeholderTextColor={palette.muted}
                autoCapitalize="words"
              />
            </View>
          ) : null}
          <Pressable onPress={generatePassword} style={[styles.bulkButton, { backgroundColor: activeAccent }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Generate</Text></Pressable>
          {passPhrase ? <View style={[styles.passwordResult, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.passwordResultText, { color: palette.fg }]}>{passPhrase}</Text></View> : null}
        </SectionCard>

        <SectionCard title="Theme selector" subtitle="Animated active border." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border} defaultOpen>
          <View style={[styles.themeGrid, isDesktop ? styles.themeGridDesktop : null]}> 
            {themeOptions.map((item) => (
              <ThemeCard
                key={item.key}
                option={item}
                active={settings.theme === item.key}
                desktop={isDesktop}
                onPress={() => {
                  onPatchSettings({ theme: item.key as SupportedTheme });
                  const mapped: AppThemeName = item.key === 'eu_blue' ? 'euBlue' : (item.key as AppThemeName);
                  setThemeName(mapped);
                }}
              />
            ))}
          </View>
          {settings.theme === 'custom' ? <TextInput style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]} placeholder="#00D4FF" placeholderTextColor={palette.muted} value={settings.customAccent} onChangeText={(value) => onPatchSettings({ customAccent: value })} /> : null}
        </SectionCard>

        <SectionCard title="Scan options" subtitle="Core behavior." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: palette.fg }]}>Auto detect</Text><Switch value={settings.autoDetect} onValueChange={(value) => onPatchSettings({ autoDetect: value, scanProfile: value ? 'auto' : settings.scanProfile })} /></View>
          <View style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: palette.fg }]}>Open URL</Text><Switch value={settings.openUrls ?? true} onValueChange={(value) => onPatchSettings({ openUrls: value })} /></View>
          <View style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: palette.fg }]}>OCR correction</Text><Switch value={settings.ocrCorrection} onValueChange={(value) => onPatchSettings({ ocrCorrection: value })} /></View>
        </SectionCard>

        <SectionCard title="Smart notes" subtitle="Entity detection and card rendering." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border} defaultOpen>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>IP detection</Text>
            <Switch
              value={settings.smartNotes?.ipDetectionEnabled ?? true}
              onValueChange={(value) => onPatchSettings({
                smartNotes: {
                  ...settings.smartNotes!,
                  ipDetectionEnabled: value,
                },
              })}
            />
          </View>
          <View style={styles.toggleRow}>
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>Detect IP</Text>
            <Switch
              value={settings.smartNotes?.detectionEnabled.ip ?? true}
              onValueChange={(value) => onPatchSettings({
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
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>Detect hostname</Text>
            <Switch
              value={settings.smartNotes?.detectionEnabled.hostname ?? true}
              onValueChange={(value) => onPatchSettings({
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
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>Detect office</Text>
            <Switch
              value={settings.smartNotes?.detectionEnabled.office ?? true}
              onValueChange={(value) => onPatchSettings({
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
            <Text style={[styles.toggleLabel, { color: palette.fg }]}>Detect PI</Text>
            <Switch
              value={settings.smartNotes?.detectionEnabled.asset ?? true}
              onValueChange={(value) => onPatchSettings({
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

          <Text style={[styles.controlLabel, { color: palette.muted }]}>IP regex</Text>
          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
            value={settings.smartNotes?.regex.ip || ''}
            onChangeText={(value) => onPatchSettings({
              smartNotes: {
                ...settings.smartNotes!,
                regex: { ...settings.smartNotes!.regex, ip: value },
              },
            })}
            placeholder="IPv4 regex"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
          />
          <Text style={[styles.controlLabel, { color: palette.muted }]}>Hostname regex</Text>
          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
            value={settings.smartNotes?.regex.hostname || ''}
            onChangeText={(value) => onPatchSettings({
              smartNotes: {
                ...settings.smartNotes!,
                regex: { ...settings.smartNotes!.regex, hostname: value },
              },
            })}
            placeholder="Hostname regex"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
          />
          <Text style={[styles.controlLabel, { color: palette.muted }]}>PI regex</Text>
          <TextInput
            style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
            value={settings.smartNotes?.regex.pi || ''}
            onChangeText={(value) => onPatchSettings({
              smartNotes: {
                ...settings.smartNotes!,
                regex: { ...settings.smartNotes!.regex, pi: value },
              },
            })}
            placeholder="PI regex"
            placeholderTextColor={palette.muted}
            autoCapitalize="none"
          />

          <Text style={[styles.controlLabel, { color: palette.muted }]}>Offices</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1, borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
              value={officeDraft}
              onChangeText={setOfficeDraft}
              placeholder="Add office"
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
                onPatchSettings({
                  smartNotes: {
                    ...settings.smartNotes!,
                    offices: [...current, nextOffice],
                  },
                });
                setOfficeDraft('');
              }}
            >
              <Text style={[styles.bulkButtonText, { color: '#111' }]}>Add</Text>
            </Pressable>
          </View>
          <View style={styles.modeRow}>
            {(settings.smartNotes?.offices || []).map((office) => (
              <Pressable
                key={office}
                onPress={() => onPatchSettings({
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

        <SectionCard title="Shared groups" subtitle="Create/join note groups." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1, borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
              placeholder="New group name"
              placeholderTextColor={palette.muted}
              value={groupNameDraft}
              onChangeText={setGroupNameDraft}
            />
            <Pressable
              style={[styles.bulkButton, { backgroundColor: activeAccent, minWidth: 100 }]}
              onPress={() => createSharedNoteGroup(groupNameDraft).then((g) => { setGroups((current) => [g, ...current]); setGroupNameDraft(''); }).catch(() => undefined)}
            >
              <Text style={[styles.bulkButtonText, { color: '#111' }]}>Create</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1, borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
              placeholder="Invite code"
              placeholderTextColor={palette.muted}
              value={inviteCodeDraft}
              onChangeText={setInviteCodeDraft}
              autoCapitalize="characters"
            />
            <Pressable
              style={[styles.bulkButton, { borderWidth: 1, borderColor: palette.border, minWidth: 100 }]}
              onPress={() => joinSharedNoteGroup(inviteCodeDraft).then((g) => { if (!g) return; setGroups((current) => current.some((x) => x.id === g.id) ? current : [g, ...current]); setInviteCodeDraft(''); }).catch(() => undefined)}
            >
              <Text style={[styles.bulkButtonText, { color: palette.fg }]}>Join</Text>
            </Pressable>
          </View>
          {groups.length ? groups.map((g) => (
            <Text key={g.id} style={[styles.helperLine, { color: palette.muted }]}>
              {g.name} � code: {g.inviteCode} � members: {g.members?.length || 0}
            </Text>
          )) : <Text style={[styles.helperLine, { color: palette.muted }]}>No groups yet.</Text>}
        </SectionCard>

        {Platform.OS === 'web' ? (
          <SectionCard title="PWA" subtitle="Install and desktop mode." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border} defaultOpen>
            <Pressable
              disabled={installBusy}
              onPress={async () => {
                if (pwaInstallAvailable) {
                  setInstallBusy(true);
                  try {
                    const result = await triggerPwaInstall();
                    Alert.alert(result.accepted ? 'Installed' : 'Install canceled', result.accepted ? 'The app was added to desktop.' : 'You can retry from this button.');
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
              <Text style={[styles.bulkButtonText, { color: palette.fg }]}>Open install guide</Text>
            </Pressable>
            <Text style={[styles.helperLine, { color: palette.muted }]}>
              {pwaDiag.reason}
            </Text>
          </SectionCard>
        ) : null}

        <SectionCard title="Barcode formats" subtitle="Available formats." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={[styles.formatGrid, isDesktop ? styles.formatGridDesktop : null]}> 
            {barcodeOptions.map((format) => {
              const selected = barcodeOutputFormat === format.name;
              return (
                <Pressable key={format.name} onPress={() => { const match = BARCODE_FORMAT_OPTIONS.find((opt) => opt.value === format.name); if (!match || format.hardwareOnly) return; onPatchSettings({ barcodeOutputFormat: match.value }); }} style={({ pressed }) => [styles.formatCard, isDesktop ? styles.formatCardDesktop : styles.formatCardMobile, { borderColor: selected ? activeAccent : palette.border, backgroundColor: palette.card, opacity: pressed ? 0.8 : 1 }]}>
                  <Text style={[styles.formatName, { color: palette.fg }]}>{format.label}</Text>
                  <Text style={[styles.formatDescription, { color: palette.muted }]}>{format.description}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.helperLine, { color: palette.muted }]}>Active scan types: {visibleBarcodeTypes.join(', ') || 'none'}</Text>
        </SectionCard>

        <SectionCard title="Notes cleanup" subtitle="Auto-clear and bulk cleanup for notes." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '600' }}>Auto-clear notes older than</Text>
                <Text style={{ color: palette.muted, fontSize: 11, marginTop: 2 }}>Pinned notes are never deleted</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {([0, 30, 90, 180, 365] as const).map((days) => {
                  const active = (settings.notesAutoClearDays ?? 0) === days;
                  const label = days === 0 ? 'Never' : days === 365 ? '1 year' : `${days}d`;
                  return (
                    <Pressable
                      key={days}
                      onPress={() => onPatchSettings({ notesAutoClearDays: days })}
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
                onPress={() => Alert.alert('Clear archived notes', 'Delete all archived notes? Pinned notes are kept.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: onClearArchivedNotes }])}
                style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#b45309', opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.bulkButtonText, { color: '#fff' }]}>Clear archived</Text>
              </Pressable>
              <Pressable
                onPress={() => Alert.alert('Clear unpinned notes', 'Delete all notes that are not pinned?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: onClearUnpinnedNotes }])}
                style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#92400e', opacity: pressed ? 0.8 : 1 }]}
              >
                <Text style={[styles.bulkButtonText, { color: '#fff' }]}>Clear unpinned</Text>
              </Pressable>
            </View>

            {/* Review by date panel */}
            <Pressable
              onPress={() => reviewOpen ? setReviewOpen(false) : openReviewPanel()}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: reviewOpen ? activeAccent : palette.border, backgroundColor: palette.card, opacity: pressed ? 0.8 : 1 })}
            >
              <Ionicons name="calendar-outline" size={16} color={activeAccent} />
              <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '600', flex: 1 }}>Review notes by date</Text>
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
                    <Text style={{ color: palette.muted, fontSize: 13 }}>No notes found</Text>
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
                        <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600' }}>Deselect</Text>
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

        <SectionCard title="Data + Sync" subtitle="Backup and synchronization." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={[styles.bulkGrid, isDesktop ? styles.bulkGridDesktop : null]}> 
            <Pressable onPress={onExportCsv} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Export CSV</Text></Pressable>
            <Pressable onPress={onExportBackup} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Export backup</Text></Pressable>
            <Pressable onPress={onOpenBackupImport} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Import</Text></Pressable>
            <Pressable onPress={onRecheckFirebase} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Recheck Firebase</Text></Pressable>
            <Pressable disabled={syncBusy} onPress={onSyncNow} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: activeAccent, opacity: syncBusy ? 0.6 : pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{syncBusy ? 'Syncing' : 'Sync now'}</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Clear history', 'Are you sure you want to clear all history?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: onClearHistory }])} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#ef4444', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Clear history</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Hard delete history', 'Delete all history locally, cache and cloud?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onHardDeleteHistory }])} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#991b1b', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Hard delete history</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Hard delete notes', 'Delete all notes locally and in cloud?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onHardDeleteNotes }])} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#b91c1c', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Hard delete notes</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Hard delete clipboard', 'Delete all clipboard memory locally?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onHardDeleteClipboard }])} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#b91c1c', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Hard delete clipboard</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Hard delete templates', 'Delete all templates locally and in cloud?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onHardDeleteTemplates }])} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, isDesktop ? styles.bulkGridItemDesktop : styles.bulkGridItemMobile, { backgroundColor: '#b91c1c', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Hard delete templates</Text></Pressable>
          </View>
          <Text style={{ color: palette.muted, marginTop: 6 }}>Mode: {isGuest ? 'Guest' : 'Authenticated'} | Persistence: {persistenceMode === 'firebase' ? 'Firebase' : 'Local'}</Text>
          {userEmail ? <Text style={{ color: palette.fg, marginTop: 2 }}>{userEmail}</Text> : null}
        </SectionCard>

        <View style={styles.bottomLogout}>
          <Pressable onPress={onLogout} style={[styles.bulkButton, styles.bottomLogoutBtn, isDesktop ? styles.bottomLogoutBtnDesktop : null, { backgroundColor: palette.accent }]}>
            <Text style={[styles.bulkButtonText, { color: '#fff' }]}>Log off</Text>
          </Pressable>
        </View>
        </View>
      </ScrollView>
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
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'monospace' },
  sectionSubtitle: { fontSize: 11, lineHeight: 15 },
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




