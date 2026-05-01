import React, { useState } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../constants/theme';
import { WorkflowMetadata } from '../core/notes';

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
}

export function MedicationWorkflowModal({
  visible,
  onClose,
  onSave,
  initialData,
}: MedicationWorkflowModalProps) {
  const { theme } = useAppTheme();
  const [medicationName, setMedicationName] = useState(initialData?.medicationName || '');
  const [doseText, setDoseText] = useState(initialData?.doseText || '');
  const [takenAtText, setTakenAtText] = useState(initialData?.takenAtText || '');
  const [reason, setReason] = useState(initialData?.reason || '');
  const [symptomLevel, setSymptomLevel] = useState('5');
  const [followUpLabel, setFollowUpLabel] = useState('in 2h');
  const [isLoading, setIsLoading] = useState(false);

  const handleSave = async () => {
    if (!medicationName.trim()) return;

    setIsLoading(true);
    try {
      const followUpOptions: Record<string, number> = {
        'in 2h': 2 * 60 * 60 * 1000,
        'in 4h': 4 * 60 * 60 * 1000,
        'in 6h': 6 * 60 * 60 * 1000,
        'in 8h': 8 * 60 * 60 * 1000,
        tomorrow: 24 * 60 * 60 * 1000,
      };

      const metadata: WorkflowMetadata = {
        medicationName: medicationName.trim(),
        doseText: doseText.trim() || undefined,
        takenAtText: takenAtText.trim() || undefined,
        reason: reason.trim() || undefined,
        symptomLevel: parseInt(symptomLevel, 10),
        followUpLabel,
        followUpAt: Date.now() + (followUpOptions[followUpLabel] || 2 * 60 * 60 * 1000),
        extractedFromText: true,
      };

      onSave(metadata);
    } finally {
      setIsLoading(false);
    }
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
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
        >
          {/* Medication name */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Medication name *</Text>
            <TextInput
              value={medicationName}
              onChangeText={setMedicationName}
              placeholder="e.g., Dafalgan"
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

          {/* Dose */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Dose (optional)</Text>
            <TextInput
              value={doseText}
              onChangeText={setDoseText}
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
          </View>

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

          {/* Follow-up reminder */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.secondary }]}>Follow-up reminder</Text>
            <View style={styles.optionGrid}>
              {['in 2h', 'in 4h', 'in 6h', 'in 8h', 'tomorrow'].map(option => (
                <Pressable
                  key={option}
                  onPress={() => setFollowUpLabel(option)}
                  style={[
                    styles.optionButton,
                    {
                      backgroundColor: followUpLabel === option ? theme.secondary + '80' : theme.surface,
                      borderColor: followUpLabel === option ? theme.secondary : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.optionButtonText,
                      { color: followUpLabel === option ? theme.secondary : theme.text },
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={[styles.reminderNote, { color: theme.textSecondary }]}>
              Reminder: "Check how you feel before taking anything else."
            </Text>
          </View>

          {/* Safety note */}
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

        {/* Footer buttons */}
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Pressable
            onPress={onClose}
            style={[styles.button, { borderColor: theme.border }]}
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
  section: {
    gap: 6,
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
  safetyNote: {
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
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  primaryButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
