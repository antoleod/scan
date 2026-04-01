import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  PanResponder,
  Pressable,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import type { BarcodeType } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

import { AppSettings, BootStatus, PersistenceMode, ScanRecord, ScanState, TemplateRule } from '../types';
import { defaultSettings, loadSettings, saveSettings } from '../core/settings';
import { addHistoryUnique, clearHistory, loadHistory, saveHistory, historyKey, normalizeHistoryType, createHistoryId } from '../core/history';
import { loadTemplates, saveTemplate, saveTemplates } from '../core/templates';
import { addPendingCapture, loadPendingCaptures, removePendingCapture, updatePendingCapture, type PendingCaptureRecord } from '../core/captures';
import { diag } from '../core/diagnostics';
import { lightThemes, themes, ThemeName } from '../theme/theme';
import { SCAN_BARCODE_TYPES, type CodeType, normalizeCodeValue } from '../core/codeStrategy';
import {
  initFirebaseRuntime,
  recheckFirebaseRuntime,
  syncNotesWithFirebase,
  syncScansWithFirebase,
} from '../core/firebase';
import { IMAGE_SCAN_BARCODE_TYPES, buildScanRecord, processScanInput } from '../core/scanPipeline';
import { ensureNfcReady, readNfcPayload } from '../core/nfc';
import { applyImportedBackup, buildBackupBundle, parseBackupBundle, serializeBackupBundle } from '../core/backup';
import { playSuccessfulScanFeedback } from '../core/feedback';
import { useAuth } from '../auth/useAuth';
import { AppHeader } from '../components/mainApp/AppHeader';
import { BarcodeModal } from '../components/mainApp/BarcodeModal';
import { BottomTabs } from '../components/mainApp/BottomTabs';
import { BackupImportModal } from '../components/mainApp/BackupImportModal';
import { OfficeScanModal } from '../components/mainApp/OfficeScanModal';
import { HistoryDateModal } from '../components/mainApp/HistoryDateModal';
import { HistoryItemModal } from '../components/mainApp/HistoryItemModal';
import { HistoryTab } from '../components/mainApp/tabs/HistoryTab';
import { NotesTab } from '../components/mainApp/tabs/NotesTab';
import { QrModal } from '../components/mainApp/QrModal';
import { ScanTab } from '../components/mainApp/tabs/ScanTab';
import { SelectionFooter } from '../components/mainApp/SelectionFooter';
import { SettingsTab } from '../components/mainApp/tabs/SettingsTab';
import { loadNotes as loadWorkNotes, loadTemplates as loadNoteTemplates, saveNotes as saveWorkNotes, saveTemplates as saveNoteTemplates } from '../core/notes';

type Tab = 'scan' | 'history' | 'notes' | 'settings';
type ManualItemType = 'PI' | 'OFFICE' | 'OTHER';
type DateFilter = 'ALL' | 'TODAY' | 'WEEK' | 'MONTH';
type EntryDraftSnapshot = {
  mode: 'add' | 'edit';
  type: ManualItemType;
  value: string;
  label: string;
  ticket: string;
  notes: string;
  office: string;
  editId: string | null;
};

function visibleScanType(type: string) {
  return normalizeHistoryType(type);
}

const SCAN_TUNING = {
  duplicateWindowMs: 350,
  cooldownAfterUrlMs: 850,
  cooldownAfterInvalidMs: 500,
  cooldownAfterDuplicateMs: 500,
  cooldownAfterSuccessMs: 700,
};

class SimpleErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    diag.error('ui.error', { message: String(error) });
  }

  render() {
    if (this.state.error) {
      return (
        <SafeAreaView style={[styles.safe, styles.center]}>
          <Text style={{ fontWeight: '800', marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ textAlign: 'center', paddingHorizontal: 16 }}>{String(this.state.error.message)}</Text>
          <Pressable
            style={[styles.btn, { marginTop: 12, backgroundColor: '#0f82f8' }]}
            onPress={() => this.setState({ error: null })}
          >
            <Text style={styles.btnText}>Retry</Text>
          </Pressable>
        </SafeAreaView>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  const { user, isGuest, logout } = useAuth();
  const { height, width } = useWindowDimensions();
  const [bootStatus, setBootStatus] = useState<BootStatus>('booting');
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>('local');
  const [activeTab, setActiveTab] = useState<Tab>('scan');
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [history, setHistory] = useState<ScanRecord[]>([]);
  const [templates, setTemplates] = useState<TemplateRule[]>([]);
  const [pendingCaptures, setPendingCaptures] = useState<PendingCaptureRecord[]>([]);
  const [query, setQuery] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL');
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrData, setQrData] = useState('');
  const [barcodeModalVisible, setBarcodeModalVisible] = useState(false);
  const [barcodeData, setBarcodeData] = useState('');
  const [dateModalVisible, setDateModalVisible] = useState(false);
  const [entryModalVisible, setEntryModalVisible] = useState(false);
  const [entryMode, setEntryMode] = useState<'add' | 'edit'>('add');
  const [entryType, setEntryType] = useState<ManualItemType>('PI');
  const [entryValue, setEntryValue] = useState('');
  const [entryLabel, setEntryLabel] = useState('');
  const [entryTicket, setEntryTicket] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [entryOffice, setEntryOffice] = useState('');
  const [entryEditId, setEntryEditId] = useState<string | null>(null);
  const [officeScanVisible, setOfficeScanVisible] = useState(false);
  const [barcodeModalCodeType, setBarcodeModalCodeType] = useState<CodeType | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<{ type: 'success' | 'duplicate' | 'error'; message: string } | null>(null);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [cameraReady, setCameraReady] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [manualCaptureBusy, setManualCaptureBusy] = useState(false);
  const [nfcReady, setNfcReady] = useState(false);
  const [nfcBusy, setNfcBusy] = useState(false);
  const [backupImportVisible, setBackupImportVisible] = useState(false);
  const [backupImportText, setBackupImportText] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);

  const scanBusyRef = useRef(false);
  const lastPayloadRef = useRef<{ value: string; ts: number }>({ value: '', ts: 0 });
  const scanCooldownRef = useRef(0);
  const scanTimersRef = useRef<{ detecting: ReturnType<typeof setTimeout> | null; timeout: ReturnType<typeof setTimeout> | null; resume: ReturnType<typeof setTimeout> | null }>({
    detecting: null,
    timeout: null,
    resume: null,
  });
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const laserAnim = useRef(new Animated.Value(0)).current;
  const entryDraftRef = useRef<EntryDraftSnapshot | null>(null);
  const entryOpenLockRef = useRef(false);

  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const isCompactLayout = width < 390 || height < 780;

  const palette = useMemo(() => {
    const themeName = (settings.theme || 'dark') as ThemeName;
    const base = themes[themeName] || themes.dark;
    const accent = settings.customAccent || base.accent;
    return { ...base, accent };
  }, [settings]);
  const activeTheme = (settings.theme || 'dark') as ThemeName;
  const isLightTheme = lightThemes.includes(activeTheme);

  const LASER_SPEEDS = useMemo(() => ({
    slow: 3000,
    normal: 2200,
    fast: 1200,
  }), []);

  const laserDuration = useMemo(() => {
    const speed = settings.laserSpeed || 'normal';
    return LASER_SPEEDS[speed as keyof typeof LASER_SPEEDS] || LASER_SPEEDS.normal;
  }, [settings, LASER_SPEEDS]);

  function clearScanTimers() {
    if (scanTimersRef.current.detecting) {
      clearTimeout(scanTimersRef.current.detecting);
      scanTimersRef.current.detecting = null;
    }
    if (scanTimersRef.current.timeout) {
      clearTimeout(scanTimersRef.current.timeout);
      scanTimersRef.current.timeout = null;
    }
    if (scanTimersRef.current.resume) {
      clearTimeout(scanTimersRef.current.resume);
      scanTimersRef.current.resume = null;
    }
  }

  function scheduleScannerSession() {
    clearScanTimers();
    if (activeTab !== 'scan' || bootStatus !== 'ready' || !cameraPermission?.granted || !cameraReady) {
      setScanState('idle');
      return;
    }

    setScanState('scanning');
    const detectingTimer = setTimeout(() => {
      setScanState((current) => (current === 'scanning' ? 'detecting' : current));
    }, 700);
    const timeoutTimer = setTimeout(() => {
      setScanState((current) => {
        if (current === 'success') return current;
        return 'timeout';
      });
      setTimeout(() => {
        setScanState((current) => (current === 'timeout' ? 'manual_capture_ready' : current));
      }, 120);
    }, 2500);

    scanTimersRef.current.detecting = detectingTimer;
    scanTimersRef.current.timeout = timeoutTimer;
  }

  function restartScannerSessionSoon(delay = 900) {
    if (scanTimersRef.current.resume) {
      clearTimeout(scanTimersRef.current.resume);
    }
    scanTimersRef.current.resume = setTimeout(() => {
      setScanState('scanning');
      scheduleScannerSession();
    }, delay);
  }

  useEffect(() => {
    (async () => {
      const timeoutMs = 6000;
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('boot-timeout')), timeoutMs));
      try {
        let [loadedSettings, loadedHistory, loadedTemplates, loadedCaptures] = await Promise.race([
          Promise.all([loadSettings(), loadHistory(), loadTemplates(), loadPendingCaptures()]),
          timeout,
        ]);

        loadedSettings = loadedSettings || defaultSettings;
        let finalHistory = loadedHistory || [];
        const clearDays = loadedSettings.historyAutoClearDays;
        if (clearDays && clearDays > 0) {
          const cutoff = Date.now() - clearDays * 24 * 60 * 60 * 1000;
          const newHistory = finalHistory.filter((item) => new Date(item.date).getTime() >= cutoff);
          if (newHistory.length < finalHistory.length) {
            finalHistory = newHistory;
            await saveHistory(finalHistory);
            await diag.info('history.autoclear', { removed: finalHistory.length - newHistory.length, kept: newHistory.length });
          }
        }

        setSettings(loadedSettings);
        setHistory(finalHistory);
        setTemplates(loadedTemplates || []);
        setPendingCaptures(loadedCaptures || []);

        const rt = await Promise.race([initFirebaseRuntime(), timeout]);
        setPersistenceMode(rt.enabled ? 'firebase' : 'local');

        await diag.info('boot.ready', { mode: rt.enabled ? 'firebase' : 'local' });
        setBootStatus('ready');
      } catch (error) {
        await diag.error('boot.error', { message: String(error) });
        // En m�viles lentos preferimos levantar en modo local aun si falla boot.
        setSettings(defaultSettings);
        setHistory([]);
        setTemplates([]);
        setPersistenceMode('local');
        setBootStatus('ready');
      }
    })();
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const ready = await ensureNfcReady();
      if (mounted) {
        setNfcReady(ready);
      }
    })();

    return () => {
      mounted = false;
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    if (activeTab === 'scan' && cameraPermission?.granted) {
      animation = Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 1,
            duration: laserDuration,
            useNativeDriver: false, // 'top' is not supported by native driver
            easing: Easing.inOut(Easing.quad),
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: laserDuration,
            useNativeDriver: false,
            easing: Easing.inOut(Easing.quad),
          }),
        ])
      );
      animation.start();
    }
    return () => {
      animation?.stop();
      laserAnim.setValue(0);
    };
  }, [activeTab, cameraPermission?.granted, laserAnim, laserDuration]);

  useEffect(() => {
    scheduleScannerSession();
    return () => clearScanTimers();
    // We intentionally restart the scan timing whenever the camera becomes available
    // or the user returns to the scan tab.
  }, [activeTab, bootStatus, cameraPermission?.granted, cameraReady]);

  async function patchSettings(next: Partial<AppSettings>) {
    const merged = { ...settings, ...next };
    setSettings(merged);
    await saveSettings(merged);
  }

  function toggleSelection(id: string) {
    const next = new Set(selection);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelection(next);
  }

  function handleLongPress(id: string) {
    if (selection.size === 0) {
      toggleSelection(id);
    }
  }

  function handleDateFilterChange(next: DateFilter) {
    setSelectedDate(null);
    setDateFilter(next);
  }

  async function handleShare() {
    const itemsToShare = history.filter((item) => selection.has(item.id));
    if (itemsToShare.length === 0) return;

    const dataToShare = JSON.stringify(
      itemsToShare.map((item) => ({ c: item.codeNormalized, t: visibleScanType(item.type), d: item.date }))
    );

    Alert.alert(
      'Share Selection',
      `Share ${itemsToShare.length} item(s)`,
      [
        { text: 'Generate QR Code', onPress: () => showQrCode(dataToShare) },
        { text: 'Share as Text', onPress: () => shareAsText(dataToShare) },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  async function shareAsText(text: string) {
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) {
          await navigator.share({ text });
        } else {
          await Clipboard.setStringAsync(text);
          Alert.alert('Share', 'Text copied to clipboard');
        }
        setSelection(new Set());
        return;
      }

      const path = `${FileSystem.cacheDirectory}oryxen_share_${Date.now()}.txt`;
      await FileSystem.writeAsStringAsync(path, text);
      await Sharing.shareAsync(path, { mimeType: 'text/plain' });
      setSelection(new Set());
    } catch (error) {
      Alert.alert('Share Error', String(error));
    }
  }

  function showQrCode(data: string) {
    setQrData(data);
    setQrModalVisible(true);
  }

  const showFeedback = (type: 'success' | 'duplicate' | 'error', message: string) => {
    if (feedbackTimerRef.current) {
      clearTimeout(feedbackTimerRef.current);
    }
    setScanFeedback({ type, message });
    feedbackTimerRef.current = setTimeout(() => setScanFeedback(null), 1800);
  };

  async function triggerSuccessfulFeedback() {
    await playSuccessfulScanFeedback();
  }

  async function processIncomingScan(raw: string, source: ScanRecord['source']) {
    if (scanBusyRef.current) return;
    if (source === 'camera' && Date.now() < scanCooldownRef.current) return;
    scanBusyRef.current = true;

    try {
      const payload = String(raw || '').trim();
      if (!payload) return;

      if (source === 'paste') {
        const entries = payload
          .split(/[\r\n,]+/g)
          .map((item) => item.trim())
          .filter(Boolean);

        const isPiValue = (value: string) => /^02PI\d+/i.test(value.replace(/\s+/g, ''));
        const isOfficeValue = (value: string) => /^[A-Z0-9-]{3,}$/i.test(value) && !isPiValue(value) && !/^(RITM|REQ|INC|SCTASK)\d+/i.test(value);

        if (entries.length === 2 && isPiValue(entries[0]) && isOfficeValue(entries[1])) {
          const built = buildScanRecord(entries[0], source, settings, templates);
          if (built) {
            const record = {
              ...built.record,
              customLabel: built.record.customLabel || 'EP inventory',
              officeCode: entries[1],
            };
            const result = await addHistoryUnique(record);
            if (result.inserted) {
              setHistory(result.history);
              showFeedback('success', record.codeNormalized);
              Alert.alert('Paste processed', 'Saved 1 item with office code.');
            } else {
              Alert.alert('Paste processed', 'This item already exists in history.');
            }
            return;
          }
        }

        if (entries.length > 1) {
          const allPis = entries.every((entry) => isPiValue(entry));
          if (allPis) {
            const saved: string[] = [];
            let duplicates = 0;
            let invalid = 0;

            for (const entry of entries) {
              const outcome = await processScanInput(entry, source, settings, templates);
              if (outcome.status === 'saved') {
                saved.push(outcome.record.codeNormalized);
              } else if (outcome.status === 'duplicate') {
                duplicates += 1;
              } else if (outcome.status === 'invalid') {
                invalid += 1;
              }
            }

            if (saved.length > 0) {
              const latestHistory = await loadHistory();
              setHistory(latestHistory);
              showFeedback('success', `Saved ${saved.length} item(s)`);
            }

            const parts = [`Saved ${saved.length} item(s)`];
            if (duplicates > 0) parts.push(`${duplicates} duplicate(s)`);
            if (invalid > 0) parts.push(`${invalid} invalid`);
            Alert.alert('Paste processed', parts.join(' · '));
            return;
          }
        }
      }

      const openUrls = settings.openUrls ?? true;
      const isUrl = payload.startsWith('http://') || payload.startsWith('https://');
      if (openUrls && isUrl && (source === 'camera' || source === 'image' || source === 'nfc')) {
        lastPayloadRef.current = { value: payload, ts: Date.now() };

        Alert.alert('Link Detected', `The scanned value contains a URL. Do you want to open it?\n\n${payload}`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Open',
            onPress: async () => {
              try {
                const supported = await Linking.canOpenURL(payload);
                if (supported) {
                  await Linking.openURL(payload);
                  await diag.info('url.opened', { url: payload });
                } else {
                  Alert.alert('Error', `Cannot open this URL: ${payload}`);
                }
              } catch (e) {
                await diag.error('url.open.error', { message: String(e), url: payload });
                Alert.alert('Error', `Could not open the link: ${String(e)}`);
              }
            },
          },
        ]);

        scanCooldownRef.current = Date.now() + SCAN_TUNING.cooldownAfterUrlMs;
        clearScanTimers();
        restartScannerSessionSoon();
        return;
      }

      const now = Date.now();
      if (lastPayloadRef.current.value === payload && now - lastPayloadRef.current.ts < SCAN_TUNING.duplicateWindowMs) return;
      lastPayloadRef.current = { value: payload, ts: now };

      const outcome = await processScanInput(payload, source, settings, templates);

      if (outcome.status === 'empty') {
        return;
      }
      if (outcome.status === 'invalid') {
        setScanState('error');
        scanCooldownRef.current = Date.now() + SCAN_TUNING.cooldownAfterInvalidMs;
        clearScanTimers();
        restartScannerSessionSoon(1000);
        showFeedback('error', 'Invalid PI format');
        return;
      }
      if (outcome.status === 'duplicate') {
        scanCooldownRef.current = Date.now() + SCAN_TUNING.cooldownAfterDuplicateMs;
        clearScanTimers();
        restartScannerSessionSoon(900);
        showFeedback('duplicate', outcome.message);
        return;
      }

      clearScanTimers();
      setScanState('success');
      scanCooldownRef.current = Date.now() + SCAN_TUNING.cooldownAfterSuccessMs;
      setHistory(outcome.history);
      await triggerSuccessfulFeedback();
      showFeedback('success', outcome.record.codeNormalized);
      await diag.info('scan.saved', { type: outcome.record.type, source: outcome.record.source });
      restartScannerSessionSoon(1100);
    } finally {
      scanBusyRef.current = false;
    }
  }
  async function importBackupJson(raw: string, label = 'backup'): Promise<boolean> {
    const bundle = parseBackupBundle(raw);
    if (!bundle) return false;

    if (backupBusy) return true;
    setBackupBusy(true);

    try {
      const merged = applyImportedBackup({ settings, templates, history }, bundle);

      setSettings(merged.settings);
      setTemplates(merged.templates);
      setHistory(merged.history);

      await saveSettings(merged.settings);
      await saveTemplates(merged.templates);
      await saveHistory(merged.history);

      setBackupImportVisible(false);
      setBackupImportText('');

      Alert.alert(
        'Import complete',
        `Settings restored. ${merged.addedHistory} history item(s) added, ${merged.skippedHistory} duplicate(s) skipped.`
      );
      await diag.info('backup.import.ok', {
        label,
        addedHistory: merged.addedHistory,
        skippedHistory: merged.skippedHistory,
      });
      return true;
    } catch (error) {
      Alert.alert('Import error', String(error));
      await diag.error('backup.import.error', { message: String(error), label });
      return true;
    } finally {
      setBackupBusy(false);
    }
  }

  async function onBarCodeScanned(data: string) {
    // Intentamos detectar si es un backup JSON primero.
    if (data.startsWith('{') || data.startsWith('[')) {
      const handled = await importBackupJson(data, 'qr');
      if (handled) return;
    }
    await processIncomingScan(data, 'camera');
  }

  async function scanFromImage() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets[0]?.uri) return;

    try {
      const results = await scanFromURLAsync(res.assets[0].uri, [...IMAGE_SCAN_BARCODE_TYPES]);
      const payload = results.find((item) => String(item.data || '').trim())?.data;
      if (!payload) {
        Alert.alert('No result', 'No code detected in the image.');
        return;
      }
      await processIncomingScan(payload, 'image');
    } catch (error) {
      await diag.warn('image.scan.error', { message: String(error) });
      Alert.alert('Error', 'Could not scan the image.');
    }
  }

  async function takePictureAndScan() {
    if (!cameraRef.current) return;

    setManualCaptureBusy(true);
    setScanState('saving_photo');

    try {
      const picture = await cameraRef.current.takePictureAsync({
        quality: 0.65,
        base64: false,
        exif: false,
        skipProcessing: true,
        shutterSound: false,
      });

      if (!picture?.uri) {
        throw new Error('Could not take picture.');
      }

      const results = await scanFromURLAsync(picture.uri, [...IMAGE_SCAN_BARCODE_TYPES]);
      const payload = results.find((item) => String(item.data || '').trim())?.data;
      const expectedType = results[0]?.type === 'qr' ? 'QR' : results.length > 0 ? 'BARCODE' : 'unknown';

      const { capture, items } = await addPendingCapture({
        uri: picture.uri,
        expectedType,
      });
      setPendingCaptures(items);

      if (payload) {
        await updatePendingCapture(capture.id, {
          extractedText: String(payload),
          scanStatus: 'saved',
        });
        setPendingCaptures(await loadPendingCaptures());
      }

      setScanState('saved');
      scanCooldownRef.current = Date.now() + 1200;
      restartScannerSessionSoon(1300);
      showFeedback('success', payload ? 'Photo saved and extracted' : 'Photo saved locally');
    } catch (error) {
      setScanState('error');
      await diag.warn('capture.save.error', { message: String(error) });
      Alert.alert('Error', `Could not save the photo: ${String(error)}`);
      restartScannerSessionSoon(1000);
    } finally {
      setManualCaptureBusy(false);
    }
  }

  async function processPendingCapture(item: PendingCaptureRecord) {
    if (manualCaptureBusy) return;
    setManualCaptureBusy(true);
    setScanState('saving_photo');

    try {
      const results = await scanFromURLAsync(item.uri, [...IMAGE_SCAN_BARCODE_TYPES]);
      const payload = results.find((entry) => String(entry.data || '').trim())?.data;
      if (!payload) {
        await updatePendingCapture(item.id, { scanStatus: 'error' });
        setPendingCaptures(await loadPendingCaptures());
        setScanState('error');
        Alert.alert('No result', 'No code detected in the saved photo.');
        return;
      }

      await processIncomingScan(payload, 'image');
      await updatePendingCapture(item.id, {
        scanStatus: 'saved',
        extractedText: String(payload),
      });
      setPendingCaptures(await loadPendingCaptures());
      setScanState('saved');
      restartScannerSessionSoon(900);
    } catch (error) {
      await diag.warn('capture.process.error', { message: String(error), id: item.id });
      setScanState('error');
      Alert.alert('Error', `Could not process the saved photo: ${String(error)}`);
    } finally {
      setManualCaptureBusy(false);
      restartScannerSessionSoon(1100);
    }
  }

  async function deletePendingCapture(itemId: string) {
    const next = await removePendingCapture(itemId);
    setPendingCaptures(next);
  }
  async function scanFromNfc() {
    const ready = nfcReady || (await ensureNfcReady());
    setNfcReady(ready);
    if (!ready) {
      Alert.alert('NFC', 'NFC needs a supported device/browser. On Android app builds it works with native NFC; on web it depends on Web NFC support.');
      return;
    }

    if (nfcBusy) return;
    setNfcBusy(true);

    try {
      const payload = await readNfcPayload();
      if (!payload) {
        Alert.alert('NFC', 'No NFC payload was read.');
        return;
      }

      await processIncomingScan(payload, 'nfc');
    } catch (error) {
      await diag.warn('nfc.scan.error', { message: String(error) });
      Alert.alert('NFC error', String(error));
    } finally {
      setNfcBusy(false);
    }
  }

  async function exportCsv() {
    const header = 'id,code,type,label,ticketNumber,officeCode,profile,piMode,source,date,status,used,structuredFields';
    const rows = history.map((h) => [
      h.id,
      h.codeNormalized,
      visibleScanType(h.type),
      h.customLabel || '',
      h.ticketNumber || '',
      h.officeCode || '',
      h.profileId,
      h.piMode,
      h.source,
      h.date,
      h.status,
      h.used,
      JSON.stringify(h.structuredFields),
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header, ...rows].join('\n');

    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `oryxen_export_${Date.now()}.csv`;
      link.click();
      return;
    }

    const path = `${FileSystem.cacheDirectory}oryxen_export_${Date.now()}.csv`;
    await FileSystem.writeAsStringAsync(path, csv);
    await Sharing.shareAsync(path, { mimeType: 'text/csv' });
  }

  async function copyTextToClipboard(text: string, okMessage: string) {
    await Clipboard.setStringAsync(text);
    const readBack = await Clipboard.getStringAsync();
    if ((readBack || '').trim() !== (text || '').trim() && Platform.OS === 'web' && typeof window !== 'undefined') {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `clipboard-hardcopy-${Date.now()}.txt`;
      link.click();
      URL.revokeObjectURL(url);
    }
    Alert.alert('Clipboard', okMessage);
  }

  async function exportBackup() {
    const bundle = buildBackupBundle({ settings, templates, history });
    const json = serializeBackupBundle(bundle);

    if (Platform.OS === 'web') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `oryxen_backup_${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
      await copyTextToClipboard(json, 'Backup JSON copied to clipboard');
      return;
    }

    const path = `${FileSystem.cacheDirectory}oryxen_backup_${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(path, json);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(path, { mimeType: 'application/json' });
    } else {
      await copyTextToClipboard(json, 'Backup JSON copied to clipboard');
    }
  }

  async function importBackupFromClipboard() {
    try {
      const text = await Clipboard.getStringAsync();
      if (!text.trim()) {
        Alert.alert('Import backup', 'Clipboard is empty.');
        return;
      }
      const handled = await importBackupJson(text, 'clipboard');
      if (!handled) {
        Alert.alert('Import backup', 'Clipboard does not contain a valid backup JSON.');
      }
    } catch (error) {
      Alert.alert('Import backup', String(error));
    }
  }

  async function runBackupImport() {
    const text = backupImportText.trim();
    if (!text) {
      Alert.alert('Import backup', 'Paste the backup JSON first.');
      return;
    }

    const handled = await importBackupJson(text, 'manual');
    if (!handled) {
      Alert.alert('Import backup', 'The provided text is not a valid backup JSON.');
    }
  }

  async function copyLogs() {
    const text = await diag.getText();
    await Clipboard.setStringAsync(text || 'No logs');
    Alert.alert('Logs', 'Copied to clipboard');
  }

  async function exportLogs() {
    if (Platform.OS === 'web') {
      const json = await diag.getJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `oryxen_logs_${Date.now()}.json`;
      link.click();
      return;
    }

    const path = `${FileSystem.cacheDirectory}oryxen_logs_${Date.now()}.json`;
    await FileSystem.writeAsStringAsync(path, await diag.getJson());
    await Sharing.shareAsync(path, { mimeType: 'application/json' });
  }

  async function recheckFirebase() {
    try {
      const rt = await recheckFirebaseRuntime();
      setPersistenceMode(rt.enabled ? 'firebase' : 'local');
      Alert.alert('Firebase', rt.enabled ? 'Configuration detected' : 'No configuration, local mode');
    } catch (error) {
      Alert.alert('Firebase', `Error recheck: ${String(error)}`);
    }
  }

  async function syncNow(showAlert = true) {
    if (syncBusy || !user) return;

    setSyncBusy(true);
    try {
      const result = await syncScansWithFirebase(history);
      const localKeys = new Set(history.map((x) => historyKey(x)));
      const merged = history.map((x) => (x.status === 'pending' ? { ...x, status: 'sent' as const } : x));
      for (const scan of result.server) {
        const key = historyKey(scan);
        if (!localKeys.has(key)) merged.push(scan);
      }
      setHistory(merged);
      await saveHistory(merged);

      const localNotes = await loadWorkNotes();
      const localNoteTemplates = await loadNoteTemplates();
      const notesSync = await syncNotesWithFirebase(localNotes, localNoteTemplates);
      await saveWorkNotes(notesSync.serverNotes);
      await saveNoteTemplates(notesSync.serverTemplates);

      await diag.info('firebase.sync.ok', { pushed: result.pushed, total: merged.length });
      if (showAlert) {
        Alert.alert(
          'Sync',
          `OK. scans pushed=${result.pushed}, scans total=${merged.length}, notes=${notesSync.serverNotes.length}, templates=${notesSync.serverTemplates.length}`
        );
      }
    } catch (error) {
      await diag.error('firebase.sync.error', { message: String(error) });
      if (showAlert) Alert.alert('Sync error', String(error));
    } finally {
      setSyncBusy(false);
    }
  }

  useEffect(() => {
    if (!user || persistenceMode !== 'firebase') return;
    if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = setTimeout(() => {
      syncNow(false).catch(() => undefined);
    }, 1400);
  }, [history, user, persistenceMode]);

  async function clearAllHistory() {
    Alert.alert('Confirm', 'Clear local history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          await clearHistory();
          setHistory([]);
          await diag.info('history.cleared');
        },
      },
    ]);
  }

  function resetEntryModal() {
    setEntryModalVisible(false);
    setEntryMode('add');
    setEntryType('PI');
    setEntryValue('');
    setEntryLabel('');
    setEntryTicket('');
    setEntryNotes('');
    setEntryOffice('');
    setEntryEditId(null);
    entryDraftRef.current = null;
  }

  function buildEntrySnapshot(nextMode: 'add' | 'edit', nextType: ManualItemType, nextValue: string, nextLabel: string, nextTicket: string, nextNotes: string, nextOffice: string, nextEditId: string | null): EntryDraftSnapshot {
    return {
      mode: nextMode,
      type: nextType,
      value: nextValue.trim(),
      label: nextLabel.trim(),
      ticket: nextTicket.trim(),
      notes: nextNotes.trim(),
      office: nextOffice.trim(),
      editId: nextEditId,
    };
  }

  function hasEntryDraftChanges() {
    if (!entryModalVisible) return false;
    const baseline = entryDraftRef.current;
    if (!baseline) return false;
    const current = buildEntrySnapshot(entryMode, entryType, entryValue, entryLabel, entryTicket, entryNotes, entryOffice, entryEditId);
    return (
      baseline.mode !== current.mode ||
      baseline.type !== current.type ||
      baseline.value !== current.value ||
      baseline.label !== current.label ||
      baseline.ticket !== current.ticket ||
      baseline.notes !== current.notes ||
      baseline.office !== current.office ||
      baseline.editId !== current.editId
    );
  }

  function requestCloseEntryModal() {
    if (!hasEntryDraftChanges()) {
      resetEntryModal();
      return;
    }

    Alert.alert('Unsaved changes', 'Do you want to save before closing?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => resetEntryModal() },
      { text: 'Save', onPress: () => { saveEntryRecord('none').catch(() => undefined); } },
    ]);
  }

  function openManualEntryModal() {
    setEntryMode('add');
    setEntryType('PI');
    setEntryValue('');
    setEntryLabel('');
    setEntryTicket('');
    setEntryNotes('');
    setEntryOffice('');
    setEntryEditId(null);
    entryDraftRef.current = buildEntrySnapshot('add', 'PI', '', '', '', '', '', null);
    setEntryModalVisible(true);
  }

  function openEditItemModal(item: ScanRecord) {
    if (entryOpenLockRef.current) return;
    entryOpenLockRef.current = true;
    setTimeout(() => {
      entryOpenLockRef.current = false;
    }, 260);

    const selected = {
      ...item,
      structuredFields: { ...(item.structuredFields || {}) },
    };
    const visibleType = visibleScanType(item.type);
    const inferredType: ManualItemType =
      selected.codeType === 'office' || visibleType === 'OFFICE'
        ? 'OFFICE'
        : selected.codeType === 'pi' || visibleType === 'PI'
          ? 'PI'
          : 'OTHER';
    setEntryModalVisible(false);
    setEntryMode('edit');
    setEntryType(inferredType);
    setEntryValue(selected.codeNormalized);
    setEntryLabel(selected.label || selected.customLabel || '');
    setEntryTicket(selected.ticketNumber || '');
    setEntryOffice(selected.officeCode || '');
    setEntryNotes(selected.notes || '');
    setEntryEditId(selected.id);
    entryDraftRef.current = buildEntrySnapshot(
      'edit',
      inferredType,
      selected.codeNormalized,
      selected.label || selected.customLabel || '',
      selected.ticketNumber || '',
      selected.notes || '',
      selected.officeCode || '',
      selected.id
    );
    setTimeout(() => setEntryModalVisible(true), 0);
  }

  function buildManualHistoryRecord(value: string, type: ManualItemType): ScanRecord {
    const now = new Date().toISOString();
    const normalizedType = type === 'PI' ? 'PI' : type === 'OFFICE' ? 'OFFICE' : 'OTHER';
    const codeValue = normalizeCodeValue(value);
    const officeCode = entryOffice.trim() || (type === 'OFFICE' ? codeValue : '');
    return {
      id: createHistoryId('manual'),
      codeOriginal: value,
      codeNormalized: codeValue,
      type: normalizedType,
      codeValue,
      codeFormat: 'code128',
      codeType: type === 'PI' ? 'pi' : type === 'OFFICE' ? 'office' : 'other',
      label: entryLabel.trim() || undefined,
      notes: entryNotes.trim() || undefined,
      customLabel: entryLabel.trim() || undefined,
      ticketNumber: entryTicket.trim() || undefined,
      officeCode: officeCode || undefined,
      hasQr: type === 'OFFICE',
      profileId: 'manual',
      piMode: 'N/A',
      source: 'manual',
      structuredFields: {},
      createdAt: now,
      updatedAt: now,
      date: now,
      status: 'pending',
      used: false,
      dateUsed: null,
    };
  }

  function openBarcodePreview(value: string, codeType: CodeType = 'other') {
    setBarcodeData(value);
    setBarcodeModalCodeType(codeType);
    setBarcodeModalVisible(true);
  }

  function openOfficeScan() {
    setOfficeScanVisible(true);
  }

  function handleOfficeScanned(value: string) {
    setEntryOffice(value.trim());
    setOfficeScanVisible(false);
  }

  function openQrPreview(value: string) {
    setQrData(value);
    setQrModalVisible(true);
  }

  async function saveEntryRecord(afterSave: 'none' | 'barcode' | 'qr' = 'none') {
    const value = entryValue.trim();
    if (!value) {
      Alert.alert('Item', 'Value is required.');
      return;
    }

    if (entryMode === 'add') {
      const record = buildManualHistoryRecord(value, entryType);
      const result = await addHistoryUnique(record);
      if (!result.inserted) {
        Alert.alert('Item', 'This item already exists in history.');
        return;
      }
      setHistory(result.history);
      await diag.info('history.manual.added', { type: record.type, source: record.source });
      if (afterSave === 'barcode') {
        openBarcodePreview(record.codeNormalized, record.codeType || 'other');
      } else if (afterSave === 'qr') {
        if (record.codeType === 'office') {
          openBarcodePreview(record.codeNormalized, 'office');
        } else {
          openQrPreview(record.codeNormalized);
        }
      }
    } else if (entryEditId) {
      const next: ScanRecord[] = history.map((item) =>
        item.id === entryEditId
          ? {
              ...item,
              codeOriginal: value,
              codeNormalized: normalizeCodeValue(value),
              codeValue: normalizeCodeValue(value),
              codeFormat: 'code128' as const,
              codeType: entryType === 'PI' ? 'pi' : entryType === 'OFFICE' ? 'office' : 'other',
              label: entryLabel.trim() || undefined,
              notes: entryNotes.trim() || undefined,
              customLabel: entryLabel.trim() || undefined,
              ticketNumber: entryTicket.trim() || undefined,
              officeCode: (entryOffice.trim() || (entryType === 'OFFICE' ? value : '')) || undefined,
              hasQr: entryType === 'OFFICE',
              updatedAt: new Date().toISOString(),
              date: new Date().toISOString(),
            }
          : item
      );
      setHistory(next);
      await saveHistory(next);
    }

    resetEntryModal();
  }

  async function deleteHistoryItem(item: ScanRecord) {
    const next = history.filter((entry) => entry.id !== item.id);
    setHistory(next);
    setSelection((current) => {
      const nextSelection = new Set(current);
      nextSelection.delete(item.id);
      return nextSelection;
    });
    await saveHistory(next);
  }

  async function toggleUsed(id: string) {
    const next = history.map((item) =>
      item.id === id
        ? item.used
          ? { ...item, used: false, dateUsed: null }
          : { ...item, used: true, dateUsed: new Date().toISOString() }
        : item
    );
    setHistory(next);
    await saveHistory(next);
  }

  async function markSelectedUsed() {
    if (selection.size === 0) return;

    const next = history.map((item) =>
      selection.has(item.id) && !item.used
        ? { ...item, used: true, dateUsed: new Date().toISOString() }
        : item
    );
    setHistory(next);
    await saveHistory(next);
    setSelection(new Set());
  }

  const filteredHistory = useMemo(() => {
    const filtered = history.filter((x) => {
      const itemType = visibleScanType(x.type);
      const matchesQuery =
        x.codeNormalized.toLowerCase().includes(query.toLowerCase()) ||
        itemType.toLowerCase().includes(query.toLowerCase()) ||
        (x.notes || '').toLowerCase().includes(query.toLowerCase()) ||
        (x.customLabel || '').toLowerCase().includes(query.toLowerCase()) ||
        (x.ticketNumber || '').toLowerCase().includes(query.toLowerCase()) ||
        (x.officeCode || '').toLowerCase().includes(query.toLowerCase());
      const matchesType = filterType === 'ALL' || itemType === filterType;

      let matchesDate = true;
      if (selectedDate) {
        matchesDate = new Date(x.date).toDateString() === selectedDate.toDateString();
      } else if (dateFilter !== 'ALL') {
        const itemDate = new Date(x.date);
        const now = new Date();
        if (dateFilter === 'TODAY') {
          matchesDate = itemDate.toDateString() === now.toDateString();
        } else if (dateFilter === 'WEEK') {
          matchesDate = itemDate.getTime() > now.getTime() - 7 * 24 * 60 * 60 * 1000;
        } else if (dateFilter === 'MONTH') {
          matchesDate = itemDate.getTime() > now.getTime() - 30 * 24 * 60 * 60 * 1000;
        }
      }

      return matchesQuery && matchesType && matchesDate;
    });
    // Sort by most recent first
    return filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, query, filterType, dateFilter, selectedDate]);

  const cameraBarcodeTypes = useMemo(() => {
    const enabledTypes = settings.barcodeTypes || SCAN_BARCODE_TYPES;
    // Ensure at least one type is active for the scanner to work.
    return enabledTypes.length > 0 ? enabledTypes : SCAN_BARCODE_TYPES;
  }, [settings.barcodeTypes]);

  const statusChip = persistenceMode === 'local'
    ? isGuest
      ? 'Guest mode (local)'
      : 'Local mode'
    : user
      ? `Firebase (${user.email || 'user'})`
      : 'Firebase guest';
  const selectedDateLabel = selectedDate ? selectedDate.toLocaleDateString() : null;
  const tabOrder: Tab[] = ['scan', 'history', 'notes', 'settings'];

  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Platform.OS !== 'web' && false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (Platform.OS === 'web') return false;
          const isHorizontal = Math.abs(gestureState.dx) > 28 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.2;
          return isHorizontal;
        },
        onPanResponderRelease: (_, gestureState) => {
          const currentIndex = tabOrder.indexOf(activeTab);
          if (currentIndex < 0) return;
          if (gestureState.dx < -50 && currentIndex < tabOrder.length - 1) {
            setActiveTab(tabOrder[currentIndex + 1]);
          } else if (gestureState.dx > 50 && currentIndex > 0) {
            setActiveTab(tabOrder[currentIndex - 1]);
          }
        },
      }),
    [activeTab]
  );

  const content = (
    <SafeAreaView style={[styles.safe, { backgroundColor: palette.bg }]}>
      <StatusBar barStyle={isLightTheme ? 'dark-content' : 'light-content'} />
      <AppHeader
        palette={palette}
        statusChip={statusChip}
        autoDetectLabel={settings.autoDetect ? 'AUTO' : settings.scanProfile.toUpperCase()}
        compact={isCompactLayout}
        themeName={activeTheme}
      />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={isCompactLayout ? 6 : 0}
      >
        <View style={styles.tabViewport} {...swipeResponder.panHandlers}>
        {bootStatus !== 'ready' ? (
          <View style={styles.center}><Text style={{ color: palette.fg }}>{bootStatus === 'booting' ? 'Loading...' : 'Boot error'}</Text></View>
        ) : activeTab === 'scan' ? (
          <ScanTab
            palette={palette}
            isCompactLayout={isCompactLayout}
            cameraPermissionGranted={cameraPermission?.granted}
            requestCameraPermission={() => requestCameraPermission()}
            cameraRef={cameraRef}
            cameraBarcodeTypes={cameraBarcodeTypes}
            scanFeedback={scanFeedback}
            onScanFromImage={scanFromImage}
            onTakePicture={takePictureAndScan}
            onScanFromNfc={scanFromNfc}
            nfcBusy={nfcBusy}
            nfcReady={nfcReady}
            scanState={scanState}
            showManualCapture={scanState === 'timeout' || scanState === 'manual_capture_ready' || scanState === 'saving_photo'}
            manualCaptureBusy={manualCaptureBusy}
            cameraActive={activeTab === 'scan' && bootStatus === 'ready' && Boolean(cameraPermission?.granted)}
            torchEnabled={torchEnabled}
            onToggleTorch={() => setTorchEnabled((value) => !value)}
            onCameraReady={() => setCameraReady(true)}
            laserAnim={laserAnim}
            laserDuration={laserDuration}
            onBarcodeScanned={(data) => {
              onBarCodeScanned(data).catch((e) => {
                diag.error('scan.handler.unhandled', { message: String(e) });
              });
            }}
          />
        ) : activeTab === 'history' ? (
          <HistoryTab
            palette={palette}
            filteredHistory={filteredHistory}
            query={query}
            filterType={filterType}
            dateFilter={dateFilter}
            selection={selection}
            selectedDateLabel={selectedDateLabel}
            onQueryChange={setQuery}
            onFilterTypeChange={setFilterType}
            onDateFilterChange={handleDateFilterChange}
            onOpenDatePicker={() => setDateModalVisible(true)}
            onToggleSelection={toggleSelection}
            onLongPressSelection={handleLongPress}
            onToggleUsed={toggleUsed}
            onEditItem={openEditItemModal}
            onDeleteItem={deleteHistoryItem}
            onOpenBarcode={openBarcodePreview}
            visibleScanType={visibleScanType}
          />
        ) : activeTab === 'notes' ? (
          <NotesTab palette={palette} />
        ) : (
          <SettingsTab
            palette={palette}
            settings={settings}
            onPatchSettings={patchSettings}
            onExportCsv={exportCsv}
            onClearHistory={clearAllHistory}
            onExportBackup={exportBackup}
            onOpenBackupImport={() => setBackupImportVisible(true)}
            onRecheckFirebase={recheckFirebase}
            onSyncNow={syncNow}
            onLogout={logout}
            syncBusy={syncBusy}
            userEmail={user?.email || null}
            userUidPrefix={user ? user.uid.substring(0, 8) : null}
            isGuest={isGuest}
            persistenceMode={persistenceMode}
            visibleBarcodeTypes={SCAN_BARCODE_TYPES}
            barcodeOutputFormat={settings.barcodeOutputFormat}
          />
        )}
        </View>
      </KeyboardAvoidingView>

      <BarcodeModal
        visible={barcodeModalVisible}
        data={barcodeData}
        width={width}
        palette={{ bg: palette.bg, card: palette.card, fg: palette.fg, muted: palette.muted, border: palette.border, accent: palette.accent }}
        preferredFormat={settings.barcodeOutputFormat}
        codeType={barcodeModalCodeType || undefined}
        onClose={() => {
          setBarcodeModalVisible(false);
          setBarcodeModalCodeType(null);
        }}
      />
      <QrModal visible={qrModalVisible} data={qrData} width={width} palette={{ card: palette.card, bg: palette.bg, fg: palette.fg, muted: palette.muted, border: palette.border }} onClose={() => setQrModalVisible(false)} />
      <HistoryDateModal
        visible={dateModalVisible}
        value={selectedDate}
        palette={{ bg: palette.bg, card: palette.card, fg: palette.fg, muted: palette.muted, border: palette.border, accent: palette.accent }}
        onApply={(date) => {
          setSelectedDate(date);
          setDateFilter('ALL');
          setDateModalVisible(false);
        }}
        onClear={() => {
          setSelectedDate(null);
          setDateModalVisible(false);
        }}
        onClose={() => setDateModalVisible(false)}
      />
      <HistoryItemModal
        key={`${entryMode}-${entryEditId || 'new'}`}
        visible={entryModalVisible}
        mode={entryMode}
        value={entryValue}
        type={entryType}
        customLabel={entryLabel}
        ticketNumber={entryTicket}
        officeCode={entryOffice}
        notes={entryNotes}
        palette={{ bg: palette.bg, card: palette.card, fg: palette.fg, muted: palette.muted, border: palette.border, accent: palette.accent }}
        onClose={requestCloseEntryModal}
        onChangeValue={setEntryValue}
        onChangeType={setEntryType}
        onChangeLabel={setEntryLabel}
        onChangeTicket={setEntryTicket}
        onChangeOffice={setEntryOffice}
        onChangeNotes={setEntryNotes}
        onScanOffice={openOfficeScan}
        onSave={() => saveEntryRecord('none')}
        onSaveBarcode={entryMode === 'add' ? () => saveEntryRecord('barcode') : undefined}
        onSaveQr={entryMode === 'add' ? () => saveEntryRecord('qr') : undefined}
      />
      <OfficeScanModal
        visible={officeScanVisible}
        palette={{ bg: palette.bg, card: palette.card, fg: palette.fg, muted: palette.muted, border: palette.border, accent: palette.accent }}
        cameraPermissionGranted={cameraPermission?.granted}
        requestCameraPermission={() => requestCameraPermission()}
        cameraBarcodeTypes={cameraBarcodeTypes}
        onClose={() => setOfficeScanVisible(false)}
        onDetected={handleOfficeScanned}
      />
      <BackupImportModal
        visible={backupImportVisible}
        text={backupImportText}
        busy={backupBusy}
        palette={{ bg: palette.bg, card: palette.card, fg: palette.fg, muted: palette.muted, border: palette.border }}
        onTextChange={setBackupImportText}
        onPasteClipboard={importBackupFromClipboard}
        onImport={runBackupImport}
        onClose={() => setBackupImportVisible(false)}
      />
      <SelectionFooter
        count={selection.size}
        palette={{ accent: palette.accent, card: palette.card, border: palette.border, fg: palette.fg }}
        onClear={() => setSelection(new Set())}
        onMarkUsed={markSelectedUsed}
        onShare={handleShare}
      />
      <BottomTabs
        activeTab={activeTab}
        palette={{ accent: palette.accent, muted: palette.muted, card: palette.card, border: palette.border }}
        onChangeTab={setActiveTab}
        onAddPress={openManualEntryModal}
      />
    </SafeAreaView>
  );

  return (
    <SimpleErrorBoundary>
      {content}
    </SimpleErrorBoundary>
  );
}

export default function MainAppScreen() {
  return <MainApp />;
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    borderBottomWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandBlock: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.8, marginBottom: 2 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  logoShell: {
    borderWidth: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  logoHalo: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 18,
    transform: [{ rotate: '12deg' }],
  },
  logoCore: {
    width: '72%',
    height: '72%',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  logoBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  logoBar: { width: 4, borderRadius: 99 },
  logoBarThin: { width: 2, borderRadius: 99, opacity: 0.9 },
  content: { flex: 1 },
  screen: { flex: 1, width: '100%', maxWidth: '100%', padding: 12, gap: 10, overflow: 'hidden' },
  tabViewport: { flex: 1, width: '100%', maxWidth: '100%', overflow: 'hidden' },
  settingsContent: { width: '100%', paddingBottom: 24, overflow: 'hidden' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cameraContainer: { flex: 1, borderRadius: 16, overflow: 'hidden' },
  camera: { flex: 1, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  cameraCompact: { minHeight: 260 },
  rowButtons: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'transparent' },
  btnContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
  smallBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  actionBtn: { minWidth: 120 },
  inlineAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, marginTop: 10 },
  pasteInput: { minHeight: 110 },
  backupInput: { minHeight: 180 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 4, marginTop: 10 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  listContent: { paddingBottom: 18 },
  historyItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  code: { fontSize: 16, fontWeight: '800' },
  sectionTitle: { fontSize: 14, fontWeight: '700' },
  footer: { borderTopWidth: 1, paddingHorizontal: 8, paddingVertical: 8, flexDirection: 'row' },
  footerBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  footerBtnInner: { alignItems: 'center', justifyContent: 'center', gap: 5 },
  selectionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  selectionBtn: {
    padding: 8,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalView: {
    margin: 20,
    borderRadius: 20,
    padding: 25,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  qrContainer: {
    padding: 16,
    backgroundColor: 'white',
    borderRadius: 8,
  },
  backupModal: {
    width: '92%',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  disabledBtn: {
    opacity: 0.5,
  },
  scanNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  scanNoticeSuccess: {
    backgroundColor: 'rgba(34, 197, 94, 0.95)',
  },
  scanNoticeDuplicate: {
    backgroundColor: 'rgba(245, 158, 11, 0.95)',
  },
  scanNoticeError: {
    backgroundColor: 'rgba(220, 38, 38, 0.95)',
  },
  scanNoticeText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  laser: {
    position: 'absolute',
    left: '5%',
    right: '5%',
    height: 2,
    backgroundColor: '#ff3333',
    borderRadius: 2,
    shadowColor: '#ff3333',
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  viewfinderContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  viewfinderTop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewfinderMiddle: {
    height: '30%',
    flexDirection: 'row',
  },
  viewfinderSide: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  viewfinderCenter: {
    width: '80%',
    borderColor: 'rgba(255,255,255,0.7)',
    borderWidth: 2,
    borderRadius: 16,
  },
  viewfinderBottom: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 24,
  },
  viewfinderText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

