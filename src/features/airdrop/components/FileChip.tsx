import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { Palette } from '../../../theme/theme';
import { formatBytes } from '../utils/format';

/** Pick an icon that hints at the file kind from its MIME type / name. */
export function iconForFile(mimeType?: string, name?: string): keyof typeof Ionicons.glyphMap {
  const m = (mimeType || '').toLowerCase();
  const ext = (name || '').toLowerCase().split('.').pop() || '';
  if (m.startsWith('image/')) return 'image-outline';
  if (m.startsWith('video/')) return 'videocam-outline';
  if (m.startsWith('audio/')) return 'musical-notes-outline';
  if (m === 'application/pdf' || ext === 'pdf') return 'document-text-outline';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive-outline';
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return 'document-text-outline';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'grid-outline';
  return 'document-outline';
}

/** Compact card showing the selected/incoming file's name, size and type. */
export function FileChip({
  palette,
  name,
  size,
  mimeType,
}: {
  palette: Palette;
  name: string;
  size: number;
  mimeType?: string;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        borderRadius: 16,
        backgroundColor: palette.card,
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.accent + '18',
          borderWidth: 1,
          borderColor: palette.accent + '33',
        }}
      >
        <Ionicons name={iconForFile(mimeType, name)} size={22} color={palette.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: palette.fg, fontSize: 14, fontWeight: '800' }} numberOfLines={1}>
          {name}
        </Text>
        <Text style={{ color: palette.muted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
          {formatBytes(size)}
          {mimeType ? ` · ${mimeType}` : ''}
        </Text>
      </View>
    </View>
  );
}
