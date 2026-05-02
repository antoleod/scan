import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
    reason?: string;
  };
}

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : value == null ? '' : String(value);
}

function formatDateInput(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

export function MedicationWorkflowModal({ visible, onClose, onSave, initialData }: MedicationWorkflowModalProps) {
  const { theme } = useAppTheme();
  const [entries, setEntries] = useState<MedicationEntry[]>([]);
  const [takenAtText, setTakenAtText] = useState(formatDateInput(new Date()));
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
    setTakenAtText(safeText(initialData?.takenAtText) || formatDateInput(new Date()));
    setReason(safeText(initialData?.reason));
    setFeeling('5');
  }, [visible, initialData]);

  useEffect(() => {
    if (!visible) return;
    const timer = setInterval(() => setNowTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [visible]);

  const summaries = useMemo(() => {
    const takenMs = new Date(takenAtText.replace(' ', 'T')).getTime();
    return entries.map((entry) => {
      const profile = findEuMedicationProfile(entry.name);
      const hasInterval = Boolean(profile?.recommendedFollowUpHours);
      const nextSuggestedAt = hasInterval && Number.isFinite(takenMs)
        ? takenMs + Number(profile?.recommendedFollowUpHours || 0) * 60 * 60 * 1000
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
  }, [entries, takenAtText, nowTick]);

  const handleSave = async () => {
    if (!entries.length || entries.some((entry) => !safeText(entry.name).trim())) return;
    setIsLoading(true);
    try {
      const takenAtMs = new Date(takenAtText.replace(' ', 'T')).getTime();
      const medications = summaries.map((entry) => ({
        name: entry.name.trim(),
        dose: safeText(entry.doseText).trim() || undefined,
        takenAt: Number.isFinite(takenAtMs) ? new Date(takenAtMs).toISOString() : undefined,
        nextSuggestedAt: entry.nextSuggestedAt ? new Date(entry.nextSuggestedAt).toISOString() : undefined,
        recommendedIntervalHours: entry.profile?.recommendedFollowUpHours,
        minimumIntervalHours: entry.profile?.minIntervalHours,
        safetyNote: entry.profile?.safetyNote || 'Verify with leaflet, prescription, doctor or pharmacist.',
        followPrescription: !entry.nextSuggestedAt,
      }));

      const payload = {
        medicationName: medications[0]?.name,
        doseText: medications[0]?.dose,
        takenAtText,
        reason: safeText(reason).trim() || undefined,
        symptomLevel: Number.parseInt(feeling, 10) || 5,
        followUpLabel: medications.length > 1 ? `${medications.length} meds` : (medications[0]?.nextSuggestedAt ? 'next suggested' : 'follow prescription'),
        extractedFromText: false,
        medications,
      } as WorkflowMetadata;

      onSave(payload);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

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
            <TextInput value={takenAtText} onChangeText={setTakenAtText} placeholder="YYYY-MM-DD HH:mm" placeholderTextColor={theme.textSecondary} style={[styles.input, { borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]} />
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
  feelRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  feelBtn: { minWidth: 28, height: 28, borderWidth: 1, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  disclaimer: { marginTop: 4, fontSize: 11, lineHeight: 15 },
  footer: { flexDirection: 'row', gap: 10, borderTopWidth: 1, padding: 14 },
  button: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontSize: 13, fontWeight: '700' },
});
