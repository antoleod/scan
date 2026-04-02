import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AppSettings, type PersistenceMode } from '../../../types';
import { BARCODE_FORMAT_OPTIONS, type BarcodeFormat } from '../../../core/barcode';
import { canInstallPwa, subscribePwaInstallAvailability, triggerPwaInstall } from '../../../core/pwa';
import { useAppTheme } from '../../../constants/theme';

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

const PASSWORD_WORDS = ['amber', 'cactus', 'signal', 'orbit', 'raven', 'velvet', 'anchor', 'matrix', 'ember', 'breeze', 'atlas', 'comet', 'lumen', 'solace', 'harbor', 'zenith', 'pixel', 'vector'];

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

function ThemeCard({ option, active, onPress }: { option: ThemeOption; active: boolean; onPress: () => void }) {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setPulse((v) => (v + 1) % 2), 650);
    return () => clearInterval(id);
  }, [active]);

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.themeCard, { backgroundColor: option.background, borderColor: active ? option.accent : option.border, borderWidth: active ? (pulse ? 2.3 : 1.5) : 1, opacity: pressed ? 0.85 : 1 }]}>
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
  const { setThemeName } = useAppTheme();
  const [bulkInput, setBulkInput] = useState('');
  const [passPhrase, setPassPhrase] = useState('');
  const [installBusy, setInstallBusy] = useState(false);
  const [pwaInstallAvailable, setPwaInstallAvailable] = useState(canInstallPwa());
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => subscribePwaInstallAvailability(setPwaInstallAvailable), []);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    setIsInstalled(window.matchMedia('(display-mode: standalone)').matches);
    const onInstall = () => setIsInstalled(true);
    window.addEventListener('appinstalled', onInstall);
    return () => window.removeEventListener('appinstalled', onInstall);
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

  const bulkPreview = useMemo(() => Array.from(new Set(bulkInput.split(/[\n\r,;\t]+/g).map((v) => v.trim()).filter(Boolean))), [bulkInput]);

  const generatePassword = () => {
    const base = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
    setPassPhrase(`${base}${Math.floor(10 + Math.random() * 90)}!`);
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
          <Pressable onPress={generatePassword} style={[styles.bulkButton, { backgroundColor: activeAccent }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Generate</Text></Pressable>
          {passPhrase ? <View style={[styles.passwordResult, { borderColor: palette.border, backgroundColor: palette.card }]}><Text style={[styles.passwordResultText, { color: palette.fg }]}>{passPhrase}</Text></View> : null}
        </SectionCard>

        <SectionCard title="Theme selector" subtitle="Animated active border." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border} defaultOpen>
          <View style={styles.themeGrid}>
            {themeOptions.map((item) => (
              <ThemeCard
                key={item.key}
                option={item}
                active={settings.theme === item.key}
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
                const browser = typeof navigator !== 'undefined' ? (navigator.userAgent || '').toLowerCase() : '';
                const isChromeEdge = browser.includes('chrome') || browser.includes('edg');
                Alert.alert(
                  'Manual install',
                  isChromeEdge
                    ? 'Use browser menu (⋮) > Install app. If it does not appear, refresh and interact with the app for a few seconds.'
                    : 'Use your browser install option (Add to Home screen / Install app). Chrome or Edge on desktop gives the best support.'
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
                void Linking.openURL('https://support.google.com/chrome/answer/9658361');
              }}
              style={[styles.bulkButton, { backgroundColor: 'transparent', borderWidth: 1, borderColor: palette.border }]}
            >
              <Text style={[styles.bulkButtonText, { color: palette.fg }]}>Open install guide</Text>
            </Pressable>
            <Text style={[styles.helperLine, { color: palette.muted }]}>
              {isInstalled
                ? 'PWA appears installed in this browser profile.'
                : pwaInstallAvailable
                  ? 'Installer ready in this browser session.'
                  : 'Auto prompt not available; use manual install from browser menu.'}
            </Text>
          </SectionCard>
        ) : null}

        <SectionCard title="Barcode formats" subtitle="Available formats." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={styles.formatGrid}>
            {barcodeOptions.map((format) => {
              const selected = barcodeOutputFormat === format.name;
              return (
                <Pressable key={format.name} onPress={() => { const match = BARCODE_FORMAT_OPTIONS.find((opt) => opt.value === format.name); if (!match || format.hardwareOnly) return; onPatchSettings({ barcodeOutputFormat: match.value }); }} style={({ pressed }) => [styles.formatCard, { borderColor: selected ? activeAccent : palette.border, backgroundColor: palette.card, opacity: pressed ? 0.8 : 1 }]}>
                  <Text style={[styles.formatName, { color: palette.fg }]}>{format.label}</Text>
                  <Text style={[styles.formatDescription, { color: palette.muted }]}>{format.description}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.helperLine, { color: palette.muted }]}>Active scan types: {visibleBarcodeTypes.join(', ') || 'none'}</Text>
        </SectionCard>

        <SectionCard title="Data + Sync" subtitle="Backup and synchronization." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={styles.bulkGrid}>
            <Pressable onPress={onExportCsv} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Export CSV</Text></Pressable>
            <Pressable onPress={onExportBackup} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Export backup</Text></Pressable>
            <Pressable onPress={onOpenBackupImport} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Import</Text></Pressable>
            <Pressable onPress={onRecheckFirebase} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, { backgroundColor: activeAccent, opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Recheck Firebase</Text></Pressable>
            <Pressable disabled={syncBusy} onPress={onSyncNow} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, { backgroundColor: activeAccent, opacity: syncBusy ? 0.6 : pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{syncBusy ? 'Syncing' : 'Sync now'}</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Clear history', 'Are you sure you want to clear all history?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: onClearHistory }])} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, { backgroundColor: '#ef4444', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Clear history</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Hard delete history', 'Delete all history locally, cache and cloud?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onHardDeleteHistory }])} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, { backgroundColor: '#991b1b', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Hard delete history</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Hard delete notes', 'Delete all notes locally and in cloud?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onHardDeleteNotes }])} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, { backgroundColor: '#b91c1c', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Hard delete notes</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Hard delete clipboard', 'Delete all clipboard memory locally?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onHardDeleteClipboard }])} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, { backgroundColor: '#b91c1c', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Hard delete clipboard</Text></Pressable>
            <Pressable onPress={() => Alert.alert('Hard delete templates', 'Delete all templates locally and in cloud?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: onHardDeleteTemplates }])} style={({ pressed }) => [styles.bulkButton, styles.bulkGridItem, { backgroundColor: '#b91c1c', opacity: pressed ? 0.8 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Hard delete templates</Text></Pressable>
          </View>
          <Text style={{ color: palette.muted, marginTop: 6 }}>Mode: {isGuest ? 'Guest' : 'Authenticated'} | Persistence: {persistenceMode === 'firebase' ? 'Firebase' : 'Local'}</Text>
          {userEmail ? <Text style={{ color: palette.fg, marginTop: 2 }}>{userEmail}</Text> : null}
        </SectionCard>

        <View style={styles.bottomLogout}>
          <Pressable onPress={onLogout} style={[styles.bulkButton, styles.bottomLogoutBtn, { backgroundColor: palette.accent }]}>
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
  scrollOuter: { alignItems: 'center' },
  container: { padding: 16, gap: 14, paddingBottom: 120, width: '100%', maxWidth: 960 },
  header: { gap: 8, paddingTop: 6 },
  kicker: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 3, fontFamily: 'monospace' },
  pageTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.6 },
  pageSubtitle: { fontSize: 12, lineHeight: 16 },
  sectionCard: { gap: 12, padding: 14, borderRadius: 12, borderLeftWidth: 3, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'monospace' },
  sectionSubtitle: { fontSize: 11, lineHeight: 15 },
  chevron: { fontWeight: '800', fontSize: 14 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeCard: { minWidth: 68, flexGrow: 1, minHeight: 70, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', gap: 6, position: 'relative' },
  themeSwatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  themeCardText: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
  check: { position: 'absolute', right: 6, top: 4, fontSize: 9, fontWeight: '900' },
  formatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  formatCard: { flexBasis: '48%', minWidth: 130, borderWidth: 1, borderRadius: 14, padding: 10, gap: 5 },
  formatName: { fontSize: 12, fontWeight: '900' },
  formatDescription: { fontSize: 11, lineHeight: 15 },
  helperLine: { fontSize: 11, fontFamily: 'monospace', marginTop: 8 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 13, fontWeight: '700' },
  bulkActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  bulkGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  bulkGridItem: { flexBasis: '48%', flexGrow: 1, minWidth: 120 },
  bulkButton: { minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  bulkButtonText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  bottomLogout: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(148,163,184,0.2)' },
  bottomLogoutBtn: { alignSelf: 'stretch' },
  passwordResult: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  passwordResultText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, lineHeight: 18 },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
});
