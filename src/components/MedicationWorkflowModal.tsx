import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../constants/theme';
import { WorkflowMetadata } from '../core/notes';
import { findEuMedicationProfile } from '../data/medicationProfiles';

type MedicationEntry = {
  name: string;
  doseText: string;
};

interface MedicationWorkflowModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (metadata: WorkflowMetadata) => void;
  initialData?: {
    medicationName?: string;
    medicationNames?: string[];
    doseText?: string;
    takenAtText?: string;
    takenAt?: number;
    reason?: string;
  };
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

// "YYYY-MM-DDTHH:MM" — accepted by <input type="datetime-local"> (no seconds)
function dateToInputValue(date: Date): string {
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function parseInputValue(value: string): number | undefined {
  if (!value) return undefined;
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : undefined;
}

function parseLooseDateTime(value: string): number | undefined {
  if (!value) return undefined;
  const direct = new Date(value).getTime();
  if (Number.isFinite(direct)) return direct;
  const swapped = new Date(value.replace(' ', 'T')).getTime();
  return Number.isFinite(swapped) ? swapped : undefined;
}

function formatDisplay(ts: number): string {
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

// ── Cross-platform datetime picker ───────────────────────────────────────
function DateTimeField({
  value,
  onChange,
  background,
  border,
  text,
}: {
  value: number;
  onChange: (next: number) => void;
  background: string;
  border: string;
  text: string;
}) {
  if (Platform.OS === 'web') {
    // Use a native HTML datetime-local input — best UX in browsers.
    const inputValue = dateToInputValue(new Date(value));
    return React.createElement('input', {
      type: 'datetime-local',
      value: inputValue,
      onChange: (e: { target: { value: string } }) => {
        const next = parseInputValue(e.target.value);
        if (typeof next === 'number') onChange(next);
      },
      style: {
        height: 42,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: border,
        backgroundColor: background,
        color: text,
        borderRadius: 8,
        paddingLeft: 10,
        paddingRight: 10,
        fontSize: 13,
        fontFamily: 'inherit',
        outline: 'none',
        boxSizing: 'border-box',
        width: '100%',
      },
    });
  }
  // Native fallback: text input that accepts "YYYY-MM-DD HH:mm"
  const [draft, setDraft] = useState(formatDisplay(value));
  useEffect(() => { setDraft(formatDisplay(value)); }, [value]);
  return (
    <TextInput
      value={draft}
      onChangeText={(text) => {
        setDraft(text);
        const next = parseLooseDateTime(text);
        if (typeof next === 'number') onChange(next);
      }}
      placeholder="YYYY-MM-DD HH:mm"
      style={{ minHeight: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 13, borderColor: border, backgroundColor: background, color: text }}
    />
  );
}

export function MedicationWorkflowModal({ visible, onClose, onSave, initialData }: MedicationWorkflowModalProps) {
  const { theme } = useAppTheme();
  const [entries, setEntries] = useState<MedicationEntry[]>([]);
  const [takenAtMs, setTakenAtMs] = useState<number>(Date.now());
  const [reason, setReason] = useState('');
  const [feeling, setFeeling] = useState('5');
  const [isLoading, setIsLoading] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  useEffect(() => {
    if (!visible) return;
    const inputNames = Array.isArray(initialData?.medicationNames) && initialData?.medicationNames.length
      ? initialData.medicationNames
      : [safeText(initialData?.medicationName)].filter(Boolean);
    const uniqueNames = Array.from(new Set(inputNames.map((name) => safeText(name).trim()).filter(Boolean)));
    setEntries(uniqueNames.map((name) => ({ name, doseText: safeText(initialData?.doseText) })));

    const seed = typeof initialData?.takenAt === 'number'
      ? initialData.takenAt
      : parseLooseDateTime(safeText(initialData?.takenAtText));
    setTakenAtMs(typeof seed === 'number' ? seed : Date.now());
    setReason(safeText(initialData?.reason));
    setFeeling('5');
  }, [visible, initialData]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [visible]);

  const summaries = useMemo(() => {
    const takenMs = takenAtMs;
    return entries.map((entry) => {
      const profile = findEuMedicationProfile(entry.name);
      const interval = Number(profile?.recommendedFollowUpHours);
      const hasInterval = Number.isFinite(interval) && interval > 0;
      const nextSuggestedAt = hasInterval && Number.isFinite(takenMs)
        ? takenMs + interval * 60 * 60 * 1000
        : null;
      return {
        ...entry,
        profile,
        nextSuggestedAt,
        statusText: nextSuggestedAt
          ? `Next suggested ${new Date(nextSuggestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
          : 'Follow prescription schedule',
        timerText: nextSuggestedAt
          ? (() => {
            const delta = nextSuggestedAt - nowTick;
            if (Math.abs(delta) < 5 * 60 * 1000) return 'Due now';
            if (delta < 0) return `Past due ${Math.floor(Math.abs(delta) / 3600000)}h`;
            const h = Math.floor(delta / 3600000);
            const m = Math.floor((delta % 3600000) / 60000);
            return `Next in ${h}h ${m}m`;
          })()
          : 'Follow prescription',
      };
    });
  }, [entries, takenAtMs, nowTick]);

  const handleSave = async () => {
    if (!entries.length || entries.some((entry) => !safeText(entry.name).trim())) return;
    setIsLoading(true);
    try {
      const takenAtIso = new Date(takenAtMs).toISOString();
      const medications = summaries.map((entry) => ({
        name: entry.name.trim(),
        dose: safeText(entry.doseText).trim() || undefined,
        takenAt: takenAtMs,                       // ms epoch (preferred)
        lastTakenAt: takenAtMs,
        lastActionAt: takenAtMs,
        takenAtIso,                                // ISO for legacy consumers
        nextSuggestedAt: entry.nextSuggestedAt ? entry.nextSuggestedAt : undefined,
        recommendedIntervalHours: entry.profile?.recommendedFollowUpHours,
        minimumIntervalHours: entry.profile?.minIntervalHours,
        safetyNote: entry.profile?.safetyNote,
        followPrescription: !entry.nextSuggestedAt,
        status: 'active' as const,
      }));

      const payload: WorkflowMetadata & { medications: typeof medications } = {
        medicationName: medications[0]?.name,
        doseText: medications[0]?.dose,
        takenAt: takenAtMs,
        takenAtText: formatDisplay(takenAtMs),
        reason: safeText(reason).trim() || undefined,
        symptomLevel: Number.parseInt(feeling, 10) || 5,
        followUpAt: medications[0]?.nextSuggestedAt,
        followUpLabel: medications.length > 1
          ? `${medications.length} meds`
          : (medications[0]?.nextSuggestedAt ? 'next suggested' : 'follow prescription'),
        extractedFromText: false,
        medications,
      };

      onSave(payload);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  // Quick-set buttons — set takenAt to "now" or "X hours ago"
  const quickPresets: Array<{ label: string; offsetMs: number }> = [
    { label: 'Now',    offsetMs: 0 },
    { label: '1h ago', offsetMs: 1 * 3_600_000 },
    { label: '4h ago', offsetMs: 4 * 3_600_000 },
    { label: '6h ago', offsetMs: 6 * 3_600_000 },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={onClose} style={styles.closeButton}><Ionicons name="close" size={22} color={theme.secondary} /></Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Medication Follow-up</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
          {summaries.map((entry, index) => (
            <View key={`${entry.name}_${index}`} style={[styles.medRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
              <Text style={[styles.medName, { color: theme.text }]} numberOfLines={1}>{entry.name}</Text>
              <TextInput
                value={entry.doseText}
                onChangeText={(value) => setEntries((prev) => prev.map((item, i) => i === index ? { ...item, doseText: value } : item))}
                placeholder={entry.profile?.defaultDoseLabel || 'Dose (optional)'}
                placeholderTextColor={theme.textSecondary}
                style={[styles.doseInput, { borderColor: theme.border, backgroundColor: theme.background, color: theme.text }]}
              />
              <Text style={[styles.nextText, { color: theme.secondary }]}>{entry.statusText}</Text>
              <Text style={[styles.timerText, { color: theme.textSecondary }]}>{entry.timerText}</Text>
            </View>
          ))}

          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Taken at</Text>
            <DateTimeField
              value={takenAtMs}
              onChange={setTakenAtMs}
              background={theme.surface}
              border={theme.border}
              text={theme.text}
            />
            <View style={styles.quickRow}>
              {quickPresets.map((preset) => (
                <Pressable
                  key={preset.label}
                  onPress={() => setTakenAtMs(Date.now() - preset.offsetMs)}
                  style={[styles.quickBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                >
                  <Text style={{ color: theme.text, fontSize: 11, fontWeight: '600' }}>{preset.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Reason (optional)</Text>
            <TextInput value={reason} onChangeText={setReason} placeholder="Optional" placeholderTextColor={theme.textSecondary} style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]} />
          </View>

          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Feeling (optional)</Text>
            <View style={styles.feelRow}>
              {[1,2,3,4,5,6,7,8,9,10].map((n) => (
                <Pressable key={n} onPress={() => setFeeling(String(n))} style={[styles.feelBtn, { borderColor: feeling === String(n) ? theme.secondary : theme.border, backgroundColor: feeling === String(n) ? `${theme.secondary}44` : theme.surface }]}>
                  <Text style={{ color: theme.text, fontSize: 11 }}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>Verify with leaflet, prescription, doctor or pharmacist.</Text>
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Pressable onPress={onClose} style={[styles.button, { borderColor: theme.border }]}><Text style={[styles.buttonText, { color: theme.text }]}>Cancel</Text></Pressable>
          <Pressable onPress={handleSave} disabled={isLoading || !entries.length} style={[styles.button, { backgroundColor: theme.secondary, borderColor: theme.secondary, opacity: isLoading || !entries.length ? 0.5 : 1 }]}>
            {isLoading ? <ActivityIndicator color={theme.primary} /> : <Text style={[styles.buttonText, { color: theme.primary }]}>Create follow-up</Text>}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700' },
  content: { flex: 1 },
  contentContainer: { padding: 14, gap: 10 },
  medRow: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  medName: { fontSize: 14, fontWeight: '700' },
  doseInput: { minHeight: 38, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 13 },
  nextText: { fontSize: 12, fontWeight: '600' },
  timerText: { fontSize: 11 },
  section: { gap: 6 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  input: { minHeight: 42, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, fontSize: 13 },
  quickRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  quickBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, minHeight: 32, alignItems: 'center', justifyContent: 'center' },
  feelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  feelBtn: { minWidth: 28, height: 28, borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  disclaimer: { marginTop: 4, fontSize: 11, lineHeight: 15 },
  footer: { flexDirection: 'row', gap: 10, borderTopWidth: 1, padding: 14 },
  button: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 13, fontWeight: '700' },
});
