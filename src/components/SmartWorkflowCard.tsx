import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { SmartWorkflowDetection, SmartWorkflowType } from '../core/smartNoteWorkflows';
import { useAppTheme } from '../constants/theme';

interface SmartWorkflowCardProps {
  detection: SmartWorkflowDetection | null;
  onDismiss: () => void;
  onCreateWorkflow: (type: SmartWorkflowType) => void;
  onKeepAsNote: () => void;
}

export function SmartWorkflowCard({
  detection,
  onDismiss,
  onCreateWorkflow,
  onKeepAsNote,
}: SmartWorkflowCardProps) {
  const { theme } = useAppTheme();

  if (!detection || detection.type === 'none') {
    return null;
  }

  const getIconName = () => {
    switch (detection.type) {
      case 'medication':
        return 'medical';
      case 'shopping':
        return 'cart';
      case 'reminder':
        return 'notifications';
      case 'task':
        return 'checkmark-circle';
      default:
        return 'bulb';
    }
  };

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      style={[styles.container, { backgroundColor: theme.surface }]}
    >
      <View style={[styles.card, { borderColor: theme.secondary + '40', backgroundColor: theme.surface }]}>
        {/* Header with icon and title */}
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: theme.secondary + '20' }]}>
            <Ionicons name={getIconName()} size={20} color={theme.secondary} />
          </View>
          <View style={styles.titleArea}>
            <Text style={[styles.title, { color: theme.text }]}>{detection.title}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{detection.reason}</Text>
          </View>
          <Pressable onPress={onDismiss} style={styles.closeButton}>
            <Ionicons name="close" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        {/* Action buttons */}
        <View style={styles.buttonGroup}>
          <Pressable
            onPress={() => onCreateWorkflow(detection.type)}
            style={[styles.button, styles.primaryButton, { backgroundColor: theme.secondary }]}
          >
            <Text style={[styles.buttonText, { color: theme.primary }]}>
              {detection.type === 'medication' ? 'Create follow-up' : 'Create workflow'}
            </Text>
          </Pressable>
          <Pressable
            onPress={onKeepAsNote}
            style={[styles.button, styles.secondaryButton, { borderColor: theme.border }]}
          >
            <Text style={[styles.buttonText, { color: theme.textSecondary }]}>Keep as note</Text>
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 12,
    marginVertical: 8,
    borderRadius: 12,
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  titleArea: {
    flex: 1,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGroup: {
    gap: 8,
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    // backgroundColor set dynamically
  },
  secondaryButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
