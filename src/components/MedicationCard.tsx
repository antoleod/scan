import React, { useEffect, useRef, useState } from 'react';
import { Text, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { WorkflowMetadata, WorkflowStatus } from '../core/notes';

type Palette = {
  bg: string;
  accent: string;
  border: string;
  surface: string;
  surfaceAlt: string;
  textBody: string;
  textDim: string;
  textMuted: string;
  textPrimary: string;
  chipBorder: string;
};

interface MedicationCardProps {
  metadata?: WorkflowMetadata;
  workflowStatus?: WorkflowStatus;
  palette: Palette;
  onComplete?: () => void;
  onDismiss?: () => void;
}

function formatElapsed(takenAt: number | undefined): string {
  if (!takenAt) return '';
  const ms = Date.now() - takenAt;
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h ago`;
  if (hours > 0) return `${hours}h ${mins % 60}m ago`;
  return `${mins}m ago`;
}

function formatCountdown(followUpAt: number | undefined): string {
  if (!followUpAt) return '';
  const ms = followUpAt - Date.now();
  if (ms <= 0) return 'Overdue';

  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `in ${days}d ${hours % 24}h`;
  if (hours > 0) return `in ${hours}h ${mins % 60}m`;
  return `in ${mins}m`;
}

export function MedicationCard({
  metadata,
  workflowStatus,
  palette,
  onComplete,
  onDismiss,
}: MedicationCardProps) {
  const [elapsed, setElapsed] = useState('');
  const [countdown, setCountdown] = useState('');
  const tickRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const updateDisplay = () => {
      setElapsed(formatElapsed(metadata?.takenAt));
      setCountdown(formatCountdown(metadata?.followUpAt));
    };

    updateDisplay();
    tickRef.current = setInterval(updateDisplay, 60_000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [metadata?.takenAt, metadata?.followUpAt]);

  const medName = metadata?.medicationName || 'Medication';
  const doseText = metadata?.doseText || '';
  const reason = metadata?.reason;
  const safetyNotes = metadata ? [] : []; // Placeholder for future profile-based safety notes

  if (workflowStatus === 'completed') {
    return (
      <View
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#22c55e44',
          backgroundColor: '#22c55e12',
          padding: 12,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="checkmark-circle" size={20} color="#22c55e" />
          <Text style={{ color: '#22c55e', fontSize: 14, fontWeight: '700' }}>
            Completed ✓
          </Text>
        </View>
        <Text style={{ color: palette.textMuted, fontSize: 12 }}>
          {medName} — Good job staying on track!
        </Text>
      </View>
    );
  }

  if (workflowStatus === 'dismissed') {
    return (
      <View style={{ opacity: 0.5 }}>
        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: `${palette.border}44`,
            backgroundColor: palette.surface,
            padding: 12,
            gap: 8,
          }}
        >
          <Text style={{ color: palette.textMuted, fontSize: 12 }}>
            📋 Dismissed
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#4DA3FF44',
        backgroundColor: '#0F1A2E',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: 0.5,
          borderBottomColor: '#4DA3FF22',
          gap: 8,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Ionicons name="medkit" size={18} color="#4DA3FF" />
          <Text style={{ color: '#4DA3FF', fontSize: 14, fontWeight: '700', flex: 1 }}>
            {medName.toUpperCase()}
          </Text>
        </View>
        {doseText && (
          <View
            style={{
              borderRadius: 6,
              backgroundColor: '#4DA3FF18',
              borderWidth: 0.5,
              borderColor: '#4DA3FF44',
              paddingHorizontal: 6,
              paddingVertical: 2,
            }}
          >
            <Text style={{ color: '#4DA3FF', fontSize: 11, fontWeight: '600' }}>
              {doseText}
            </Text>
          </View>
        )}
      </View>

      {/* Status & Countdown */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 6 }}>
        {elapsed && (
          <Text style={{ color: palette.textDim, fontSize: 12 }}>
            💊 Taken {elapsed}
          </Text>
        )}
        {countdown && (
          <Text style={{ color: countdown.includes('Overdue') ? '#ef4444' : palette.textDim, fontSize: 12 }}>
            ⏱ Next check {countdown}
          </Text>
        )}
        {reason && (
          <Text style={{ color: palette.textMuted, fontSize: 12, fontStyle: 'italic' }}>
            Reason: {reason}
          </Text>
        )}
      </View>

      {/* Safety notes (if any) */}
      {safetyNotes.length > 0 && (
        <View style={{ paddingHorizontal: 12, paddingTop: 8, gap: 4 }}>
          {safetyNotes.map((note, i) => (
            <View
              key={i}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 6,
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 6,
                backgroundColor: '#f59e0b18',
                borderWidth: 0.5,
                borderColor: '#f59e0b44',
              }}
            >
              <Ionicons name="warning" size={12} color="#f59e0b" style={{ marginTop: 2 }} />
              <Text style={{ color: '#f59e0b', fontSize: 11, flex: 1 }}>
                {note}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Action buttons */}
      <View
        style={{
          flexDirection: 'row',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderTopWidth: 0.5,
          borderTopColor: '#4DA3FF22',
        }}
      >
        <Pressable
          onPress={onComplete}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 40,
            borderRadius: 8,
            backgroundColor: pressed ? '#22c55ecc' : '#22c55e',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="checkmark" size={14} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>
              Complete
            </Text>
          </View>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 40,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: pressed ? `${palette.textDim}12` : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="close" size={14} color={palette.textDim} />
            <Text style={{ color: palette.textDim, fontSize: 12, fontWeight: '600' }}>
              Dismiss
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}
