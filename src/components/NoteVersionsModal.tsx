import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NoteItem, SimpleNoteVersion } from '../core/notes';
import { NoteVersion } from '../types/NoteVersion';

// Union type to handle both old and new version formats
type AnyNoteVersion = SimpleNoteVersion | NoteVersion;

interface NoteVersionsModalProps {
  note: NoteItem | null;
  isOpen: boolean;
  onClose: () => void;
  onRestore: (versionId: string) => void;
  onBranch: (versionId: string) => void;
  onPreview?: (version: AnyNoteVersion) => void;
}

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
};

export function NoteVersionsModal({
  note,
  isOpen,
  onClose,
  onRestore,
  onBranch,
  onPreview,
}: NoteVersionsModalProps) {
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  // Fallback palette (will be overridden by proper implementation)
  const palette: Palette = {
    bg: '#ffffff',
    accent: '#2563eb',
    border: '#e5e7eb',
    surface: '#f9fafb',
    surfaceAlt: '#f3f4f6',
    textBody: '#1f2937',
    textDim: '#6b7280',
    textMuted: '#9ca3af',
    textPrimary: '#000000',
  };

  if (!note || !note.versions || note.versions.length === 0) {
    return null;
  }

  // Helper to get version number (handles both old and new formats)
  const getVersionNumber = (v: any) => {
    if ('versionNumber' in v) return v.versionNumber;
    return note.versions!.indexOf(v) + 1;
  };

  const sortedVersions = [...(note.versions as AnyNoteVersion[])].sort(
    (a, b) => getVersionNumber(a) - getVersionNumber(b)
  );
  const currentVersion = sortedVersions[sortedVersions.length - 1] as AnyNoteVersion;
  const previousVersions = sortedVersions.slice(0, -1);

  const handleRestoreConfirm = (versionId: string) => {
    onRestore(versionId);
    setShowRestoreConfirm(null);
    onClose();
  };

  const handleBranch = (versionId: string) => {
    onBranch(versionId);
    onClose();
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
        <View
          style={{
            flex: 1,
            marginTop: '10%',
            marginHorizontal: '5%',
            backgroundColor: palette.bg,
            borderRadius: 20,
            overflow: 'hidden',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 16,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: palette.border,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: palette.textBody }}>
              Version History
            </Text>
            <Pressable onPress={onClose} hitSlop={8} style={{ padding: 8 }}>
              <Ionicons name="close" size={20} color={palette.textDim} />
            </Pressable>
          </View>

          {/* Content */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
            {/* Current Version */}
            {currentVersion && (
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: palette.textMuted, textTransform: 'uppercase' }}>
                  Current Version
                </Text>
                <VersionCard
                  version={currentVersion}
                  palette={palette}
                  isCurrent
                  onPreview={onPreview}
                  onBranch={handleBranch}
                />
              </View>
            )}

            {/* Previous Versions */}
            {previousVersions.length > 0 && (
              <View style={{ gap: 12 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: palette.textMuted, textTransform: 'uppercase' }}>
                  Previous Versions
                </Text>
                <View style={{ gap: 8 }}>
                  {previousVersions
                    .sort((a, b) => getVersionNumber(b) - getVersionNumber(a))
                    .map((version) => (
                      <VersionCard
                        key={version.id}
                        version={version}
                        palette={palette}
                        isCurrent={false}
                        onPreview={onPreview}
                        onRestore={() => setShowRestoreConfirm(version.id)}
                        onBranch={handleBranch}
                      />
                    ))}
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Restore Confirmation Modal */}
      <Modal
        visible={showRestoreConfirm !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
      >
        <Pressable
          onPress={() => setShowRestoreConfirm(null)}
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: 12, paddingBottom: 18 }}
        >
          <Pressable
            onPress={() => undefined}
            style={{ backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 20, padding: 20, gap: 16 }}
          >
            <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 99, backgroundColor: palette.border }} />
            <Text style={{ color: palette.textBody, fontSize: 15, fontWeight: '600', textAlign: 'center' }}>
              Restore to this version?
            </Text>
            <Text style={{ color: palette.textMuted, fontSize: 13, textAlign: 'center' }}>
              Your current version will be saved as a new snapshot.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                onPress={() => setShowRestoreConfirm(null)}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: palette.textBody, fontSize: 13, fontWeight: '600' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => showRestoreConfirm && handleRestoreConfirm(showRestoreConfirm)}
                style={{ flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Restore</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

interface VersionCardProps {
  version: AnyNoteVersion;
  palette: Palette;
  isCurrent?: boolean;
  onPreview?: (version: AnyNoteVersion) => void;
  onRestore?: () => void;
  onBranch: (versionId: string) => void;
}

function VersionCard({
  version,
  palette,
  isCurrent = false,
  onPreview,
  onRestore,
  onBranch,
}: VersionCardProps) {
  // Handle both old (number) and new (string) createdAt formats
  const createdAtTime = typeof version.createdAt === 'number'
    ? version.createdAt
    : new Date(version.createdAt).getTime();
  const createdDate = new Date(createdAtTime);
  const timeStr = createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = createdDate.toLocaleDateString();

  // Get version number (handle both formats)
  const versionNumber = ('versionNumber' in version) ? version.versionNumber : 0;

  // Get reason label (handle both formats)
  const reason = ('reason' in version) ? version.reason : 'edited';
  const reasonLabel = {
    created: '📝 Created',
    edited: '✏️ Edited',
    color_changed: '🎨 Color Changed',
    duplicated: '📋 Duplicated',
    renewed: '🔄 Renewed',
    merged: '🔗 Merged',
    branched: '🌿 Branched',
    workflow_converted: '⚙️ Workflow Converted',
    restored: '↩️ Restored',
  }[reason] || reason;

  // Get change summary (handle both formats)
  const changeSummary = ('changeSummary' in version) ? version.changeSummary : undefined;

  const textPreview = version.text.split('\n')[0].substring(0, 80) || '(empty)';

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: isCurrent ? palette.accent : palette.border,
        borderRadius: 12,
        padding: 12,
        backgroundColor: isCurrent ? `${palette.accent}08` : palette.surface,
        gap: 8,
      }}
    >
      {/* Version number and reason */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: palette.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>v{versionNumber}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.textBody, fontSize: 12, fontWeight: '600' }}>{reasonLabel}</Text>
            {changeSummary && (
              <Text style={{ color: palette.textMuted, fontSize: 11, marginTop: 2 }}>{changeSummary}</Text>
            )}
          </View>
        </View>
        {isCurrent && (
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 4,
              backgroundColor: palette.accent,
              borderRadius: 4,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>CURRENT</Text>
          </View>
        )}
      </View>

      {/* Date/time */}
      <Text style={{ color: palette.textMuted, fontSize: 10 }}>
        {dateStr} at {timeStr}
      </Text>

      {/* Text preview */}
      <View
        style={{
          borderRadius: 8,
          backgroundColor: palette.surfaceAlt,
          padding: 8,
        }}
      >
        <Text style={{ color: palette.textBody, fontSize: 11, lineHeight: 16 }} numberOfLines={2}>
          {textPreview}
        </Text>
      </View>

      {/* Actions */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        {onPreview && (
          <Pressable
            onPress={() => onPreview(version)}
            style={({ pressed }) => ({
              flex: 1,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: pressed ? palette.surfaceAlt : 'transparent',
              alignItems: 'center',
            })}
          >
            <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600' }}>Preview</Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => onBranch(version.id)}
          style={({ pressed }) => ({
            flex: 1,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: pressed ? palette.surfaceAlt : 'transparent',
            alignItems: 'center',
          })}
        >
          <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600' }}>Branch</Text>
        </Pressable>
        {!isCurrent && onRestore && (
          <Pressable
            onPress={onRestore}
            style={({ pressed }) => ({
              flex: 1,
              paddingHorizontal: 10,
              paddingVertical: 8,
              borderRadius: 8,
              backgroundColor: pressed ? `${palette.accent}80` : palette.accent,
              alignItems: 'center',
            })}
          >
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '600' }}>Restore</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
