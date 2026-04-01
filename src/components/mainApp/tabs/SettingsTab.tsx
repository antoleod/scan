import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AppSettings } from '../../../types';
import { BARCODE_FORMAT_OPTIONS, type BarcodeFormat } from '../../../core/barcode';
import { useAppTheme } from '../../../constants/theme';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

type ThemeOption = {
  key: 'dark' | 'light' | 'eu_blue' | 'custom' | 'parliament' | 'noirGraphite' | 'midnightSteel' | 'obsidianGold';
  label: string;
  background: string;
  text: string;
  border: string;
  accent: string;
  supported: boolean;
};

type BarcodeOption = {
  name: string;
  label: string;
  description: string;
  hardwareOnly: boolean;
};
type SupportedTheme = AppSettings['theme'];
type AppThemeName = 'euBlue' | 'dark' | 'light' | 'parliament' | 'custom' | 'noirGraphite' | 'midnightSteel' | 'obsidianGold';

const PASSWORD_WORDS = ['amber', 'cactus', 'signal', 'orbit', 'raven', 'velvet', 'anchor', 'matrix', 'ember', 'breeze', 'atlas', 'comet', 'lumen', 'solace', 'harbor', 'zenith', 'pixel', 'vector'];
const PASSWORD_PHRASE_WORDS = ['one', 'two', 'sun', 'moon', 'play', 'win', 'glow', 'spark', 'night', 'day', 'stone', 'flow', 'north', 'east'];

function SectionCard({
  title,
  subtitle,
  accent,
  subtitleColor,
  cardBackground,
  cardBorder,
  children,
  defaultOpen = false,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  subtitleColor: string;
  cardBackground: string;
  cardBorder: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={[styles.sectionCard, { borderLeftColor: accent, backgroundColor: cardBackground, borderColor: cardBorder }]}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sectionTitle, { color: accent }]}>{title}</Text>
          {subtitle ? <Text style={[styles.sectionSubtitle, { color: subtitleColor }]}>{subtitle}</Text> : null}
        </View>
        <Text style={[styles.chevron, { color: accent }]}>{open ? 'v' : '>'}</Text>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function ThemeCard({ option, active, onPress }: { option: ThemeOption; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!option.supported}
      style={[
        styles.themeCard,
        { backgroundColor: option.background, borderColor: active ? option.accent : option.border, opacity: option.supported ? 1 : 0.45 },
        active && { shadowOpacity: 0.35, shadowRadius: 8, elevation: 4 },
      ]}
    >
      <View style={[styles.themeSwatch, { backgroundColor: option.accent }]} />
      <Text style={[styles.themeCardText, { color: option.text }]}>{option.label}</Text>
      {!option.supported ? <Text style={[styles.themeBadge, { color: option.text }]}>preview</Text> : null}
      {active ? <Text style={[styles.check, { color: option.accent }]}>OK</Text> : null}
    </Pressable>
  );
}

export function SettingsTab({
  palette,
  settings,
  onPatchSettings,
  onExportCsv,
  onClearHistory,
  onExportBackup,
  onOpenBackupImport,
  onRecheckFirebase,
  onSyncNow,
  onLogout,
  syncBusy,
  userEmail,
  userUidPrefix,
  isGuest,
  visibleBarcodeTypes,
  barcodeOutputFormat,
}: {
  palette: Palette;
  settings: AppSettings;
  onPatchSettings: (next: Partial<AppSettings>) => void;
  onExportCsv: () => void;
  onClearHistory: () => void;
  onExportBackup: () => void;
  onOpenBackupImport: () => void;
  onRecheckFirebase: () => void;
  onSyncNow: () => void;
  onLogout: () => void;
  syncBusy: boolean;
  userEmail: string | null;
  userUidPrefix: string | null;
  isGuest: boolean;
  visibleBarcodeTypes: string[];
  barcodeOutputFormat: BarcodeFormat;
}) {
  const activeAccent = '#FFD84D';
  const { setThemeName } = useAppTheme();
  const [bulkInput, setBulkInput] = useState('');
  const [serviceNow, setServiceNow] = useState({
    baseUrl: settings.serviceNowBaseUrl || 'https://company.service-now.com',
    tablePath: '/api/now/table/incident',
    callerQuery: 'active=true^ORDERBYDESCsys_created_on',
  });
  const [passMode, setPassMode] = useState<'short' | 'phrase'>('short');
  const [passWords, setPassWords] = useState(3);
  const [passPhrase, setPassPhrase] = useState('');

  const themeOptions = useMemo<ThemeOption[]>(
    () => [
      { key: 'dark', label: 'Enterprise', background: '#0A1740', text: '#FFFFFF', border: 'rgba(255,216,77,0.15)', accent: '#FFD84D', supported: true },
      { key: 'light', label: 'Light', background: '#FFFFFF', text: '#111111', border: '#D0D8E8', accent: '#0052CC', supported: true },
      { key: 'eu_blue', label: 'EU Blue', background: '#0052CC', text: '#FFCC00', border: '#FFCC00', accent: '#FFCC00', supported: true },
      { key: 'custom', label: 'Custom', background: '#112244', text: '#00D4FF', border: '#00AACC', accent: '#00D4FF', supported: true },
      { key: 'parliament', label: 'Parliament', background: '#2A1245', text: '#FFCC00', border: '#6B3FB5', accent: '#FFCC00', supported: true },
      { key: 'noirGraphite', label: 'Noir', background: '#1A1A1A', text: '#FFFFFF', border: '#333333', accent: '#FF6B00', supported: true },
      { key: 'midnightSteel', label: 'Midnight', background: '#0F1923', text: '#FFFFFF', border: '#00AACC', accent: '#00D4FF', supported: true },
      { key: 'obsidianGold', label: 'Obsidian', background: '#111116', text: '#E0E0E0', border: '#1E1E24', accent: '#C8A96E', supported: true },
    ],
    []
  );

  const barcodeOptions = useMemo<BarcodeOption[]>(
    () => [
      { name: 'CODE128', label: 'CODE128', description: 'Office assets, serial numbers, IT labels', hardwareOnly: false },
      { name: 'EAN8', label: 'EAN-8', description: 'Compact hardware tags, peripherals', hardwareOnly: false },
      { name: 'CODE39', label: 'CODE39', description: 'IT systems, legacy printed labels', hardwareOnly: false },
      { name: 'QR', label: 'QR', description: 'URLs, configs, multi-line data', hardwareOnly: false },
      { name: 'EAN13', label: 'EAN-13', description: 'Product inventory and procurement', hardwareOnly: false },
      { name: 'DATA MATRIX', label: 'DATA MATRIX', description: 'PCB and micro-labels', hardwareOnly: true },
      { name: 'PDF417', label: 'PDF417', description: 'Asset passports and docs', hardwareOnly: true },
      { name: 'AZTEC', label: 'AZTEC', description: 'Tickets and access control', hardwareOnly: true },
    ],
    []
  );

  const bulkPreview = useMemo(() => {
    const items = bulkInput.split(/[\n\r,;\t]+/g).map((v) => v.trim()).filter(Boolean);
    return Array.from(new Set(items));
  }, [bulkInput]);

  const generatePassword = () => {
    if (passMode === 'short') {
      const base = PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
      const digit = String(Math.floor(1 + Math.random() * 9));
      const symbol = ['!', '@', '#'][Math.floor(Math.random() * 3)];
      setPassPhrase(`${base}${digit}${symbol}${Math.floor(10 + Math.random() * 90)}`);
      return;
    }

    const words = Array.from({ length: Math.max(2, passWords) }, (_, index) => {
      const pool = index % 2 === 0 ? PASSWORD_PHRASE_WORDS : PASSWORD_WORDS;
      return pool[Math.floor(Math.random() * pool.length)];
    });
    const sep = ['+', '-', '='][Math.floor(Math.random() * 3)];
    const digit = String(Math.floor(1 + Math.random() * 9));
    setPassPhrase(`${words.join(sep)}${sep}${digit}!`);
  };

  const passStrength = useMemo(() => {
    if (!passPhrase) return { label: 'No phrase yet', level: 0, color: palette.muted };
    const score = Math.min(5, Math.floor(passPhrase.length / 4));
    if (score >= 4) return { label: 'Strong', level: 5, color: '#34C759' };
    if (score >= 2) return { label: 'Good', level: 3, color: activeAccent };
    return { label: 'Weak', level: 1, color: '#FF6B6B' };
  }, [activeAccent, passPhrase, palette.muted]);

  return (
    <View style={[styles.screen, { backgroundColor: palette.bg }]}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.kicker, { color: activeAccent }]}>SETTINGS</Text>
          <Text style={[styles.pageTitle, { color: palette.fg }]}>Configuration</Text>
          <Text style={[styles.pageSubtitle, { color: palette.muted }]}>Pick a complete visual theme and tune integrations.</Text>
        </View>

        <SectionCard title="Theme options" subtitle="Same catalog as BarraV2." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border} defaultOpen>
          <View style={styles.themeGrid}>
            {themeOptions.map((item) => (
              <ThemeCard
                key={item.key}
                option={item}
                active={settings.theme === item.key}
                onPress={() => {
                  if (!item.supported) return;
                  onPatchSettings({ theme: item.key as SupportedTheme });
                  const mapped: AppThemeName = item.key === 'eu_blue' ? 'euBlue' : (item.key as AppThemeName);
                  setThemeName(mapped);
                }}
              />
            ))}
          </View>
          {settings.theme === 'custom' ? (
            <TextInput
              style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]}
              placeholder="#00D4FF"
              placeholderTextColor={palette.muted}
              value={settings.customAccent}
              onChangeText={(value) => onPatchSettings({ customAccent: value })}
            />
          ) : null}
        </SectionCard>

        <SectionCard title="Barcode formats" subtitle="Default and hardware-only matrix." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={styles.formatGrid}>
            {barcodeOptions.map((format) => {
              const selected = barcodeOutputFormat === format.name;
              return (
                <Pressable
                  key={format.name}
                  onPress={() => {
                    const match = BARCODE_FORMAT_OPTIONS.find((opt) => opt.value === format.name);
                    if (!match || format.hardwareOnly) return;
                    onPatchSettings({ barcodeOutputFormat: match.value });
                  }}
                  style={[styles.formatCard, { borderColor: selected ? activeAccent : palette.border, backgroundColor: palette.card, opacity: format.hardwareOnly ? 0.45 : 1 }]}
                >
                  <Text style={[styles.formatName, { color: palette.fg }]}>{format.label}</Text>
                  <Text style={[styles.formatDescription, { color: palette.muted }]}>{format.description}</Text>
                  <Text style={[styles.formatBadge, { color: format.hardwareOnly ? '#f59e0b' : '#34C759' }]}>{format.hardwareOnly ? 'Hardware only' : 'Available'}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.helperLine, { color: palette.muted }]}>Active scan types: {visibleBarcodeTypes.join(', ') || 'none'}</Text>
        </SectionCard>

        <SectionCard title="Scan options" subtitle="Demo controls for realistic behavior." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: palette.fg }]}>Auto detect</Text><Switch value={settings.autoDetect} onValueChange={(value) => onPatchSettings({ autoDetect: value, scanProfile: value ? 'auto' : settings.scanProfile })} /></View>
          <View style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: palette.fg }]}>Open URL</Text><Switch value={settings.openUrls ?? true} onValueChange={(value) => onPatchSettings({ openUrls: value })} /></View>
          <View style={styles.toggleRow}><Text style={[styles.toggleLabel, { color: palette.fg }]}>OCR correction</Text><Switch value={settings.ocrCorrection} onValueChange={(value) => onPatchSettings({ ocrCorrection: value })} /></View>
        </SectionCard>

        <SectionCard title="Bulk import" subtitle="Paste list (one per line, comma or tab)." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <TextInput
            multiline
            value={bulkInput}
            onChangeText={setBulkInput}
            placeholder="PI-1001&#10;PI-1002&#10;PI-1003"
            placeholderTextColor={palette.muted}
            style={[styles.bulkInput, { backgroundColor: palette.card, borderColor: palette.border, color: palette.fg }]}
          />
          <View style={styles.bulkActions}>
            <Pressable onPress={onOpenBackupImport} style={[styles.bulkButton, { backgroundColor: activeAccent }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Import</Text></Pressable>
          </View>
          {bulkPreview.length ? (
            <View style={[styles.bulkPreview, { borderColor: palette.border, backgroundColor: palette.card }]}>
              <Text style={[styles.bulkPreviewLabel, { color: palette.muted }]}>Preview ({bulkPreview.length})</Text>
              <Text style={[styles.bulkPreviewText, { color: palette.fg }]} numberOfLines={3}>{bulkPreview.slice(0, 8).join(' · ')}{bulkPreview.length > 8 ? ' ...' : ''}</Text>
            </View>
          ) : null}
        </SectionCard>

        <SectionCard title="Data + Sync" subtitle="Export and cloud sync actions." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={styles.bulkActions}>
            <Pressable onPress={onExportCsv} style={[styles.bulkButton, { backgroundColor: activeAccent }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Export CSV</Text></Pressable>
            <Pressable onPress={onExportBackup} style={[styles.bulkButton, { backgroundColor: activeAccent }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Export backup</Text></Pressable>
            <Pressable onPress={onRecheckFirebase} style={[styles.bulkButton, { backgroundColor: activeAccent }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Recheck Firebase</Text></Pressable>
            <Pressable disabled={syncBusy} onPress={onSyncNow} style={[styles.bulkButton, { backgroundColor: activeAccent, opacity: syncBusy ? 0.6 : 1 }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>{syncBusy ? 'Syncing' : 'Sync now'}</Text></Pressable>
          </View>
        </SectionCard>

        <SectionCard title="Password generator" subtitle="Simple words, stronger structure." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={styles.passwordModeRow}>
            <Pressable onPress={() => setPassMode('short')} style={[styles.passwordModeButton, { borderColor: palette.border }, passMode === 'short' && styles.passwordModeButtonActive]}>
              <Text style={[styles.passwordModeText, { color: passMode === 'short' ? '#111' : palette.fg }]}>Short</Text>
            </Pressable>
            <Pressable onPress={() => setPassMode('phrase')} style={[styles.passwordModeButton, { borderColor: palette.border }, passMode === 'phrase' && styles.passwordModeButtonActive]}>
              <Text style={[styles.passwordModeText, { color: passMode === 'phrase' ? '#111' : palette.fg }]}>Phrase</Text>
            </Pressable>
          </View>
          {passMode === 'phrase' ? (
            <View style={styles.passwordControlRow}>
              <Pressable onPress={() => setPassWords((prev) => Math.max(2, prev - 1))} style={[styles.passwordStepButton, { borderColor: palette.border }]}><Text style={{ color: palette.fg }}>-</Text></Pressable>
              <Text style={[styles.passwordStepValue, { color: palette.fg }]}>{passWords} words</Text>
              <Pressable onPress={() => setPassWords((prev) => Math.min(6, prev + 1))} style={[styles.passwordStepButton, { borderColor: palette.border }]}><Text style={{ color: palette.fg }}>+</Text></Pressable>
            </View>
          ) : null}
          <Pressable onPress={generatePassword} style={[styles.bulkButton, { backgroundColor: activeAccent }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Generate</Text></Pressable>
          {passPhrase ? (
            <View style={[styles.passwordResult, { borderColor: palette.border, backgroundColor: palette.card }]}>
              <Text style={[styles.passwordResultText, { color: palette.fg }]}>{passPhrase}</Text>
              <View style={styles.strengthRow}>
                <View style={[styles.strengthBar, { backgroundColor: palette.border }]}>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <View key={index} style={[styles.strengthSegment, { backgroundColor: index < passStrength.level ? passStrength.color : 'transparent', borderColor: index < passStrength.level ? passStrength.color : palette.border }]} />
                  ))}
                </View>
                <Text style={[styles.strengthLabel, { color: passStrength.color }]}>{passStrength.label}</Text>
              </View>
            </View>
          ) : null}
        </SectionCard>

        <SectionCard title="ServiceNow" subtitle="Editable links and query fragments." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: activeAccent }]}>Instance URL</Text>
            <TextInput style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]} value={serviceNow.baseUrl} onChangeText={(text) => setServiceNow((prev) => ({ ...prev, baseUrl: text }))} />
          </View>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: activeAccent }]}>Table path</Text>
            <TextInput style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]} value={serviceNow.tablePath} onChangeText={(text) => setServiceNow((prev) => ({ ...prev, tablePath: text }))} />
          </View>
          <View style={styles.field}>
            <Text style={[styles.fieldLabel, { color: activeAccent }]}>Caller query</Text>
            <TextInput style={[styles.input, { borderColor: palette.border, color: palette.fg, backgroundColor: palette.card }]} value={serviceNow.callerQuery} onChangeText={(text) => setServiceNow((prev) => ({ ...prev, callerQuery: text }))} />
          </View>
          <Pressable onPress={() => onPatchSettings({ serviceNowBaseUrl: serviceNow.baseUrl })} style={[styles.bulkButton, { backgroundColor: activeAccent }]}>
            <Text style={[styles.bulkButtonText, { color: '#111' }]}>Apply ServiceNow</Text>
          </Pressable>
        </SectionCard>

        <SectionCard title="Privacy + Security" subtitle="No secrets are hardcoded in the app bundle." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <Text style={{ color: palette.muted }}>Firebase config source: runtime only (`/__/firebase/init.json` or `window.__BARRA_FIREBASE_CONFIG__`).</Text>
          <Text style={{ color: palette.muted, marginTop: 4 }}>Session mode: {isGuest ? 'Local only (guest)' : 'Authenticated cloud sync'}</Text>
          <View style={styles.bulkActions}>
            <Pressable onPress={onRecheckFirebase} style={[styles.bulkButton, { backgroundColor: activeAccent }]}><Text style={[styles.bulkButtonText, { color: '#111' }]}>Validate runtime config</Text></Pressable>
          </View>
        </SectionCard>

        <SectionCard title="Account" subtitle="Current session." accent={palette.accent} subtitleColor={palette.muted} cardBackground={palette.card} cardBorder={palette.border}>
          <Text style={{ color: palette.muted }}>Mode: {isGuest ? 'Guest' : 'Authenticated'}</Text>
          {userEmail ? <Text style={{ color: palette.fg, marginTop: 4 }}>{userEmail}</Text> : null}
          {userUidPrefix ? <Text style={{ color: palette.muted }}>UID: {userUidPrefix}...</Text> : null}
          <View style={styles.bulkActions}>
            <Pressable onPress={onClearHistory} style={[styles.bulkButton, { backgroundColor: '#ef4444' }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Clear history</Text></Pressable>
            <Pressable onPress={onLogout} style={[styles.bulkButton, { backgroundColor: palette.accent }]}><Text style={[styles.bulkButtonText, { color: '#fff' }]}>Logout</Text></Pressable>
          </View>
        </SectionCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { padding: 16, gap: 14, paddingBottom: 120 },
  header: { gap: 8, paddingTop: 6, position: 'relative' },
  kicker: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 3, fontFamily: 'monospace' },
  pageTitle: { fontSize: 22, fontWeight: '900', letterSpacing: -0.6 },
  pageSubtitle: { fontSize: 12, lineHeight: 16 },
  sectionCard: { gap: 12, padding: 14, borderRadius: 12, borderLeftWidth: 3, borderWidth: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: 'monospace' },
  sectionSubtitle: { fontSize: 11, lineHeight: 15 },
  chevron: { fontWeight: '800', fontSize: 14 },
  themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  themeCard: { minWidth: 68, flexGrow: 1, minHeight: 70, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', gap: 6, position: 'relative', overflow: 'hidden' },
  themeSwatch: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  themeCardText: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
  themeBadge: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  check: { position: 'absolute', right: 6, top: 4, fontSize: 11, fontWeight: '900' },
  formatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  formatCard: { flexBasis: '48%', minWidth: 130, borderWidth: 1, borderRadius: 14, padding: 10, gap: 5 },
  formatName: { fontSize: 12, fontWeight: '900' },
  formatDescription: { fontSize: 11, lineHeight: 15 },
  formatBadge: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.7 },
  helperLine: { fontSize: 11, fontFamily: 'monospace', marginTop: 8 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 13, fontWeight: '700' },
  bulkInput: { minHeight: 110, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, lineHeight: 18, textAlignVertical: 'top' },
  bulkActions: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  bulkButton: { minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  bulkButtonText: { fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  bulkPreview: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  bulkPreviewLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 },
  bulkPreviewText: { fontSize: 11, lineHeight: 16 },
  passwordModeRow: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  passwordModeButton: { minHeight: 34, minWidth: 88, borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  passwordModeButtonActive: { backgroundColor: '#FFD84D', borderColor: '#FFD84D' },
  passwordModeText: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  passwordControlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  passwordStepButton: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  passwordStepValue: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  passwordResult: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  passwordResultText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4, lineHeight: 18 },
  strengthRow: { gap: 6 },
  strengthBar: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 999, borderWidth: 1 },
  strengthSegment: { flex: 1, height: 8, borderRadius: 999, borderWidth: 1 },
  strengthLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  field: { gap: 6 },
  fieldLabel: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 2, fontFamily: 'monospace' },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
});


