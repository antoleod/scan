import React, { useMemo, useState, useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
  Linking,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../constants/theme';
import { WorkflowMetadata } from '../core/notes';
import { detectMedicationFromText, MedicationDetectionResult } from '../utils/medicationProfiles';
import { findEuMedicationProfile, getEuMedicationProfiles } from '../data/medicationProfiles';
import type { EuMedicationProfile } from '../types/medicationProfiles';

interface MedicationWorkflowModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (metadata: WorkflowMetadata) => void;
  initialData?: {
    medicationName?: string;
    doseText?: string;
    takenAtText?: string;
    reason?: string;
  };
  originalNoteText?: string;
}

export function MedicationWorkflowModal({
  visible,
  onClose,
  onSave,
  initialData,
  originalNoteText,
}: MedicationWorkflowModalProps) {
  const { theme } = useAppTheme();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const reminderOptions = [2, 4, 6, 8, 24];
  const medicationProfiles = useMemo(() => getEuMedicationProfiles(), []);

  const buildDefaultTakenAtText = () => {
    const now = new Date();
    return now.toLocaleString();
  };

  const [medicationName, setMedicationName] = useState(initialData?.medicationName || '');
  const [doseText, setDoseText] = useState(initialData?.doseText || '');
  const [takenAtText, setTakenAtText] = useState(initialData?.takenAtText || buildDefaultTakenAtText());
  const [reason, setReason] = useState(initialData?.reason || '');
  const [symptomLevel, setSymptomLevel] = useState('5');
  const [selectedFollowUpHours, setSelectedFollowUpHours] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [detectedMedication, setDetectedMedication] = useState<MedicationDetectionResult | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<EuMedicationProfile | null>(null);
  const [doseTouched, setDoseTouched] = useState(false);
  const [medicationListVisible, setMedicationListVisible] = useState(false);
  const [medicationSearch, setMedicationSearch] = useState('');
  const [calendarDate, setCalendarDate] = useState(() => {
    const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  });
  const [selectedDayOffset, setSelectedDayOffset] = useState(0);
  const [selectedHour, setSelectedHour] = useState<number | null>(null);

  const formatCalendarDate = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  };

  const followUpLabel = selectedFollowUpHours === 24 ? 'tomorrow' : `in ${selectedFollowUpHours}h`;
  const parsedCalendarDate = useMemo(() => {
    const parsed = new Date(calendarDate.replace(' ', 'T')).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }, [calendarDate]);
  const profileIntervalWarning = Boolean(
    selectedProfile?.minIntervalHours &&
    selectedFollowUpHours < selectedProfile.minIntervalHours,
  );
  const filteredMedicationProfiles = useMemo(() => {
    const q = medicationSearch.trim().toLowerCase();
    if (!q) return medicationProfiles;
    return medicationProfiles.filter((profile) =>
      `${profile.displayName} ${profile.activeSubstance} ${profile.aliases.join(' ')}`
        .toLowerCase()
        .includes(q),
    );
  }, [medicationProfiles, medicationSearch]);

  const setFollowUpHours = (hours: number) => {
    setSelectedFollowUpHours(hours);
    setCalendarDate(formatCalendarDate(new Date(Date.now() + hours * 60 * 60 * 1000)));
  };

  const applyProfile = (profile: EuMedicationProfile | null, options?: { forceDose?: boolean }) => {
    setSelectedProfile(profile);
    if (!profile) {
      if (!doseTouched) setDoseText('');
      return;
    }
    if ((options?.forceDose || !doseTouched) && !doseText.trim() && profile.defaultDoseLabel) {
      setDoseText(profile.defaultDoseLabel);
    }
    if (profile.recommendedFollowUpHours) {
      setFollowUpHours(profile.recommendedFollowUpHours);
    }
  };

  const handleMedicationNameChange = (value: string) => {
    setMedicationName(value);
    applyProfile(findEuMedicationProfile(value));
  };

  const selectMedication = (profile: EuMedicationProfile) => {
    setMedicationName(profile.displayName);
    setMedicationSearch('');
    setMedicationListVisible(false);
    setDoseTouched(false);
    setDoseText(profile.defaultDoseLabel || '');
    applyProfile(profile, { forceDose: true });
  };

  // Detect medication from original note text when modal opens
  useEffect(() => {
    if (visible && originalNoteText) {
      const detection = detectMedicationFromText(originalNoteText);
      if (detection) {
        setDetectedMedication(detection);
        // Pre-fill fields from detection
        setMedicationName(detection.detectedName || initialData?.medicationName || '');
        setDoseText(detection.detectedDose || initialData?.doseText || '');
        setTakenAtText(detection.detectedTime || initialData?.takenAtText || buildDefaultTakenAtText());
        setReason(detection.detectedReason || initialData?.reason || '');

        // Adjust follow-up options based on medication profile
        const profile = detection.profile;
        if (profile.usualFollowUpOptionsHours && profile.usualFollowUpOptionsHours.length > 0) {
          setFollowUpHours(profile.preferredFollowUpHours || 2);
        }
      }
    }
    if (visible && !originalNoteText) {
      setMedicationName(initialData?.medicationName || '');
      setDoseText(initialData?.doseText || '');
      setTakenAtText(initialData?.takenAtText || buildDefaultTakenAtText());
      setReason(initialData?.reason || '');
    }
  }, [visible, originalNoteText, initialData]);

  useEffect(() => {
    if (!visible) return;
    const profile = findEuMedicationProfile(medicationName);
    applyProfile(profile);
  }, [visible, medicationName]);

  const handleSave = async () => {
    if (!medicationName.trim()) return;
    if (!parsedCalendarDate) {
      Alert.alert('Invalid date', 'Use format YYYY-MM-DD HH:mm.');
      return;
    }

    setIsLoading(true);
    try {
      const metadata: WorkflowMetadata = {
        medicationName: medicationName.trim(),
        doseText: doseText.trim() || undefined,
        takenAtText: takenAtText.trim() || undefined,
        reason: reason.trim() || undefined,
        symptomLevel: parseInt(symptomLevel, 10),
        followUpLabel,
        followUpAt: parsedCalendarDate,
        extractedFromText: true,
      };

      onSave(metadata);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const openGoogleCalendarNow = async (start: number) => {
    const med = medicationName.trim();
    if (!med) return;
    const end = start + 30 * 60 * 1000;
    const toGcal = (ms: number) => {
      const d = new Date(ms);
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mi = String(d.getUTCMinutes()).padStart(2, '0');
      const ss = String(d.getUTCSeconds()).padStart(2, '0');
      return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
    };
    const details = [
      `Medication: ${selectedProfile?.displayName || med}`,
      doseText.trim() ? `Dose: ${doseText.trim()}` : '',
      takenAtText.trim() ? `Time taken: ${takenAtText.trim()}` : '',
      `Feeling: ${symptomLevel}/10`,
      reason.trim() ? `Reason: ${reason.trim()}` : '',
      `Follow-up date/time: ${calendarDate}`,
      '',
      'Guidance:',
      selectedProfile?.defaultDoseLabel ? `Suggested dose: ${selectedProfile.defaultDoseLabel}` : '',
      selectedProfile?.recommendedFollowUpHours ? `Recommended follow-up: ${selectedProfile.recommendedFollowUpHours}h` : '',
      selectedProfile?.minIntervalHours ? `Minimum interval: ${selectedProfile.minIntervalHours}h` : '',
      selectedProfile?.maxDailyDoseLabel ? `Daily max: ${selectedProfile.maxDailyDoseLabel}` : '',
      '',
      'Safety:',
      selectedProfile?.safetyNote || 'No medication profile found. Verify with prescription, leaflet, doctor, or pharmacist.',
      'Verify with your prescription, leaflet, doctor, or pharmacist before taking anything else.',
    ].filter(Boolean).join('\n');
    const url =
      `https://calendar.google.com/calendar/render?action=TEMPLATE` +
      `&text=${encodeURIComponent(`Medication follow-up: ${selectedProfile?.displayName || med}`)}` +
      `&dates=${toGcal(start)}/${toGcal(end)}` +
      `&details=${encodeURIComponent(details)}`;
    await Linking.openURL(url);
  };

  const openGoogleCalendar = async () => {
    if (!parsedCalendarDate) {
      Alert.alert('Invalid date', 'Use format YYYY-MM-DD HH:mm.');
      return;
    }
    if (parsedCalendarDate < Date.now()) {
      Alert.alert(
        'Follow-up date is in the past',
        'This follow-up date is in the past. Do you still want to add it to Google Calendar?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Add anyway', onPress: () => { void openGoogleCalendarNow(parsedCalendarDate); } },
        ],
      );
      return;
    }
    await openGoogleCalendarNow(parsedCalendarDate);
  };

  const applyMiniCalendarSelection = (dayOffset: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, 0, 0, 0);
    setCalendarDate(formatCalendarDate(d));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="chevron-back" size={24} color={theme.secondary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Medication Follow-up</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            isDesktop && styles.contentContainerDesktop,
          ]}
          keyboardShouldPersistTaps="handled"
          centerContent={isDesktop}
        >
          {/* Medication name */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Medication name *</Text>
            <View style={styles.inputRow}>
              <TextInput
                value={medicationName}
                onChangeText={handleMedicationNameChange}
                placeholder="e.g., Dafalgan"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  styles.inputFlex,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    color: theme.text,
                  },
                ]}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open medications list"
                onPress={() => setMedicationListVisible(true)}
                style={[styles.iconButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
              >
                <Ionicons name="list-outline" size={18} color={theme.secondary} />
                <Text style={[styles.iconButtonText, { color: theme.secondary }]}>List</Text>
              </Pressable>
            </View>
            {!selectedProfile && medicationName.trim() ? (
              <Text style={[styles.warningText, { color: '#ffaa00' }]}>
                No medication profile found. Verify with prescription, leaflet, doctor, or pharmacist.
              </Text>
            ) : null}
          </View>

          {/* Dose */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Dose (optional)</Text>
            <TextInput
              value={doseText}
              onChangeText={(value) => {
                setDoseTouched(true);
                setDoseText(value);
              }}
              placeholder="e.g., 400mg, 1 tablet"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  color: theme.text,
                },
              ]}
            />
            {selectedProfile ? (
              <View style={{ gap: 8 }}>
                <Text style={[styles.reminderNote, { color: theme.textSecondary }]}>
                  Suggested: {selectedProfile.defaultDoseLabel || 'verify leaflet'}
                </Text>
                <View style={styles.optionGrid}>
                  {selectedProfile.doseOptions.map((dose) => {
                    const active = doseText.trim().toLowerCase() === dose.toLowerCase();
                    return (
                      <Pressable
                        key={dose}
                        onPress={() => {
                          setDoseTouched(true);
                          setDoseText(dose);
                        }}
                        style={[
                          styles.optionButton,
                          {
                            backgroundColor: active ? theme.secondary + '80' : theme.surface,
                            borderColor: active ? theme.secondary : theme.border,
                          },
                        ]}
                      >
                        <Text style={[styles.optionButtonText, { color: active ? theme.secondary : theme.text }]}>{dose}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          {selectedProfile ? (
            <View style={[styles.profileCard, { backgroundColor: theme.secondary + '10', borderColor: theme.secondary + '40' }]}>
              <Text style={[styles.profileTitle, { color: theme.secondary }]}>{selectedProfile.displayName}</Text>
              <Text style={[styles.safetyText, { color: theme.text }]}>Suggested dose: {selectedProfile.defaultDoseLabel || 'Verify leaflet'}</Text>
              <Text style={[styles.safetyText, { color: theme.text }]}>Recommended follow-up: {selectedProfile.recommendedFollowUpHours || '?'}h</Text>
              <Text style={[styles.safetyText, { color: theme.text }]}>Minimum interval: {selectedProfile.minIntervalHours || '?'}h</Text>
              <Text style={[styles.safetyText, { color: theme.text }]}>Daily max: {selectedProfile.maxDailyDoseLabel || 'Verify leaflet/doctor'}</Text>
              <Text style={[styles.safetyText, { color: theme.text }]}>{selectedProfile.safetyNote}</Text>
            </View>
          ) : null}

          {/* Time taken */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Time taken (optional)</Text>
            <TextInput
              value={takenAtText}
              onChangeText={setTakenAtText}
              placeholder="e.g., 08:00, 8am"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  color: theme.text,
                },
              ]}
            />
          </View>

          {/* Reason */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Reason (optional)</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="e.g., for sore throat"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  color: theme.text,
                },
              ]}
            />
          </View>

          {/* Symptom level */}
          <View style={styles.section}>
            <View style={styles.labelRow}>
              <Text style={[styles.label, { color: theme.secondary }]}>How do you feel? (optional)</Text>
              <Text style={[styles.levelValue, { color: theme.secondary }]}>{symptomLevel}/10</Text>
            </View>
            <View style={styles.levelSlider}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
                <Pressable
                  key={num}
                  onPress={() => setSymptomLevel(String(num))}
                  style={[
                    styles.levelButton,
                    {
                      backgroundColor:
                        parseInt(symptomLevel, 10) === num ? theme.secondary + '80' : theme.surface,
                      borderColor: parseInt(symptomLevel, 10) === num ? theme.secondary : theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.levelButtonText, { color: theme.text }]}>{num}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Prescription warning (if applicable) */}
          {detectedMedication?.profile.requiresDoctor && (
            <View
              style={[
                styles.warningNote,
                { backgroundColor: '#ff6b6b20', borderColor: '#ff6b6b40' },
              ]}
            >
              <Ionicons name="alert-circle" size={16} color="#ff6b6b" />
              <Text style={[styles.safetyText, { color: theme.text }]}>
                {detectedMedication.profile.maxDailyDoseLabel}
              </Text>
            </View>
          )}

          {/* Red flag warning (if keywords detected) */}
          {detectedMedication?.hasRedFlagKeywords && (
            <View
              style={[
                styles.warningNote,
                { backgroundColor: '#ffaa0020', borderColor: '#ffaa0040' },
              ]}
            >
              <Ionicons name="warning" size={16} color="#ffaa00" />
              <Text style={[styles.safetyText, { color: theme.text }]}>
                Your note mentions symptoms that need immediate medical attention. Please consult a healthcare professional.
              </Text>
            </View>
          )}

          {/* Follow-up reminder */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Follow-up reminder</Text>
            <View style={styles.optionGrid}>
              {reminderOptions.map((hours) => {
                const option = hours === 24 ? 'tomorrow' : `in ${hours}h`;
                const active = selectedFollowUpHours === hours;
                const recommended = selectedProfile?.recommendedFollowUpHours === hours;
                return (
                  <Pressable
                    key={option}
                    onPress={() => setFollowUpHours(hours)}
                    style={[
                      styles.optionButton,
                      {
                        backgroundColor: active ? theme.secondary + '80' : theme.surface,
                        borderColor: active || recommended ? theme.secondary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        { color: active || recommended ? theme.secondary : theme.text },
                      ]}
                    >
                      {recommended ? `${option} *` : option}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {profileIntervalWarning ? (
              <Text style={[styles.warningText, { color: '#ffaa00' }]}>
                This is earlier than the minimum interval in the medication profile. Please verify your prescription/leaflet before taking anything else.
              </Text>
            ) : null}
            <Text style={[styles.reminderNote, { color: theme.textSecondary }]}>
              Reminder: "Check how you feel before taking anything else."
            </Text>
            <TextInput
              value={calendarDate}
              onChangeText={setCalendarDate}
              placeholder="YYYY-MM-DD HH:mm"
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.input,
                {
                  marginTop: 8,
                  borderColor: theme.border,
                  backgroundColor: theme.surface,
                  color: theme.text,
                },
              ]}
            />
            {!parsedCalendarDate ? (
              <Text style={[styles.warningText, { color: '#ff6b6b' }]}>Invalid date. Use YYYY-MM-DD HH:mm.</Text>
            ) : null}
            <View style={{ marginTop: 10, gap: 8 }}>
              <Text style={[styles.label, { color: theme.secondary }]}>Quick schedule</Text>
              <View style={styles.optionGrid}>
                {[0, 1, 2, 3].map((offset) => {
                  const base = new Date();
                  base.setDate(base.getDate() + offset);
                  const label = offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : base.toLocaleDateString();
                  const active = selectedDayOffset === offset;
                  return (
                    <Pressable
                      key={`day_${offset}`}
                      onPress={() => {
                        setSelectedDayOffset(offset);
                        if (selectedHour !== null) applyMiniCalendarSelection(offset, selectedHour);
                      }}
                      style={[
                        styles.optionButton,
                        {
                          backgroundColor: active ? theme.secondary + '80' : theme.surface,
                          borderColor: active ? theme.secondary : theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.optionButtonText, { color: active ? theme.secondary : theme.text }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.optionGrid}>
                {[8, 12, 16, 20].map((hour) => {
                  const active = selectedHour === hour;
                  return (
                    <Pressable
                      key={`hour_${hour}`}
                      onPress={() => {
                        setSelectedHour(hour);
                        applyMiniCalendarSelection(selectedDayOffset, hour);
                      }}
                      style={[
                        styles.optionButton,
                        {
                          backgroundColor: active ? theme.secondary + '80' : theme.surface,
                          borderColor: active ? theme.secondary : theme.border,
                        },
                      ]}
                    >
                      <Text style={[styles.optionButtonText, { color: active ? theme.secondary : theme.text }]}>{`${String(hour).padStart(2, '0')}:00`}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Pressable
              onPress={openGoogleCalendar}
              style={[
                styles.optionButton,
                { marginTop: 8, borderColor: theme.secondary, backgroundColor: theme.secondary + '20' },
              ]}
            >
              <Text style={[styles.optionButtonText, { color: theme.secondary }]}>Add to Google Calendar</Text>
            </Pressable>
          </View>

          {/* Safety notes from medication profile */}
          {detectedMedication?.profile.safetyNotes && detectedMedication.profile.safetyNotes.length > 0 && !selectedProfile && (
            <View style={styles.section}>
              <Text style={[styles.label, { color: theme.secondary }]}>Safety notes</Text>
              <Text style={[styles.reminderNote, { color: theme.textSecondary }]}>
                EU guide: {detectedMedication.profile.defaultDoseLabel} • Interval {detectedMedication.profile.minIntervalHours ?? '?'}h • {detectedMedication.profile.maxDailyDoseLabel}
              </Text>
              {detectedMedication.profile.safetyNotes.map((note, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.safetyNote,
                    { backgroundColor: theme.secondary + '10', borderColor: theme.secondary + '40' },
                  ]}
                >
                  <Ionicons name="shield-checkmark" size={14} color={theme.secondary} style={{ marginTop: 2 }} />
                  <Text style={[styles.safetyText, { color: theme.text, fontSize: 11 }]}>
                    {note}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* General verification note */}
          <View
            style={[
              styles.safetyNote,
              { backgroundColor: theme.secondary + '10', borderColor: theme.secondary + '40' },
            ]}
          >
            <Ionicons name="shield-checkmark" size={16} color={theme.secondary} />
            <Text style={[styles.safetyText, { color: theme.text }]}>
              Verify with your prescription, leaflet, doctor, or pharmacist before taking anything else.
            </Text>
          </View>
        </ScrollView>

        <Modal
          visible={medicationListVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setMedicationListVisible(false)}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setMedicationListVisible(false)}>
            <Pressable
              onPress={() => undefined}
              style={[
                styles.medicationPicker,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.border,
                  width: isDesktop ? 480 : '92%',
                },
              ]}
            >
              <View style={styles.pickerHeader}>
                <Text style={[styles.headerTitle, { color: theme.text }]}>Medications</Text>
                <Pressable onPress={() => setMedicationListVisible(false)} style={styles.closeButton}>
                  <Ionicons name="close" size={20} color={theme.secondary} />
                </Pressable>
              </View>
              <TextInput
                autoFocus
                value={medicationSearch}
                onChangeText={setMedicationSearch}
                placeholder="Search medication..."
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.input,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.surface,
                    color: theme.text,
                    marginBottom: 8,
                  },
                ]}
              />
              <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                {filteredMedicationProfiles.map((profile) => (
                  <Pressable
                    key={profile.id}
                    onPress={() => selectMedication(profile)}
                    style={({ pressed }) => [
                      styles.medicationListItem,
                      {
                        borderColor: theme.border,
                        backgroundColor: pressed ? theme.secondary + '12' : theme.surface,
                      },
                    ]}
                  >
                    <Text style={[styles.profileTitle, { color: theme.text }]}>{profile.displayName}</Text>
                    <Text style={[styles.safetyText, { color: theme.textSecondary }]}>
                      {profile.activeSubstance} - {profile.defaultDoseLabel || 'dose varies'} - follow-up {profile.recommendedFollowUpHours || '?'}h
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Footer buttons */}
        <View style={[
          styles.footer,
          { borderTopColor: theme.border },
          isDesktop && styles.footerDesktop,
        ]}>
          <Pressable
            onPress={onClose}
            style={[
              styles.button,
              { borderColor: theme.border },
              isDesktop && styles.buttonDesktop,
            ]}
          >
            <Text style={[styles.buttonText, { color: theme.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={!medicationName.trim() || isLoading}
            style={[
              styles.button,
              styles.primaryButton,
              {
                backgroundColor: theme.secondary,
                opacity: !medicationName.trim() || isLoading ? 0.5 : 1,
              },
              isDesktop && styles.buttonDesktop,
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.primary }]}>Create</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 20,
  },
  contentContainerDesktop: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    maxWidth: 540,
    marginHorizontal: 'auto',
    width: '100%',
  },
  section: {
    gap: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inputFlex: {
    flex: 1,
  },
  iconButton: {
    minHeight: 42,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  levelValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  levelSlider: {
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  levelButton: {
    width: '18%',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 40,
  },
  levelButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  optionGrid: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  optionButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  reminderNote: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 8,
    lineHeight: 16,
  },
  warningText: {
    fontSize: 12,
    lineHeight: 16,
  },
  profileCard: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  profileTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  warningNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  safetyText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  footerDesktop: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    justifyContent: 'center',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  buttonDesktop: {
    flex: 0,
    minWidth: 120,
    paddingHorizontal: 24,
  },
  primaryButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    padding: 16,
  },
  medicationPicker: {
    maxHeight: '78%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  medicationListItem: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 2,
  },
});
