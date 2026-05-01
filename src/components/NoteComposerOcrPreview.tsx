import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { extractTextFromImage, isImageDataUrl } from '../core/ocr';
import { useAppTheme } from '../constants/theme';

interface NoteComposerOcrPreviewProps {
  imageUri: string;
  noteText: string;
  onAppendText: (text: string) => void;
  onReplaceText: (text: string) => void;
  onDismiss: () => void;
}

export function NoteComposerOcrPreview({
  imageUri,
  noteText,
  onAppendText,
  onReplaceText,
  onDismiss,
}: NoteComposerOcrPreviewProps) {
  const { theme } = useAppTheme();
  const [ocrText, setOcrText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleExtractText = async () => {
    if (!isImageDataUrl(imageUri)) return;

    setLoading(true);
    setError(null);
    try {
      const result = await extractTextFromImage(imageUri, {
        onProgress: (progress) => {
          // Progress tracking can be used if needed
        },
      });
      setOcrText(result.text);
      setShowPreview(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'OCR failed';
      setError(
        message === 'OCR is currently only available on web/PWA'
          ? 'OCR is available on web. Try uploading the image on the web version.'
          : 'Could not read text from this image. Try a clearer photo or crop the image.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAppend = () => {
    if (!ocrText) return;
    const separator = noteText.trim() ? '\n\n--- Extracted text ---\n' : '';
    onAppendText(separator + ocrText);
    setShowPreview(false);
  };

  const handleReplace = () => {
    if (!ocrText) return;
    if (noteText.trim()) {
      Alert.alert(
        'Replace note?',
        'This will replace your current text with the extracted text.',
        [
          { text: 'Cancel', onPress: () => {}, style: 'cancel' },
          { text: 'Replace', onPress: () => onReplaceText(ocrText), style: 'destructive' },
        ]
      );
    } else {
      onReplaceText(ocrText);
    }
  };

  const handleCopy = async () => {
    if (!ocrText) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(ocrText);
        Alert.alert('Copied', 'Text copied to clipboard');
      } catch {
        Alert.alert('Error', 'Failed to copy text');
      }
    }
  };

  // Show image preview with extract button
  if (!showPreview) {
    return (
      <View style={[styles.previewContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {isImageDataUrl(imageUri) && (
          <>
            <Image
              source={{ uri: imageUri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
            <View style={styles.imageOverlay}>
              <Pressable
                onPress={handleExtractText}
                disabled={loading}
                style={[
                  styles.extractButton,
                  {
                    backgroundColor: theme.secondary,
                    opacity: loading ? 0.6 : 1,
                  },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={16} color={theme.primary} />
                    <Text style={[styles.extractButtonText, { color: theme.primary }]}>
                      {loading ? 'Extracting...' : 'Extract text'}
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </>
        )}
        {error && (
          <Text style={[styles.errorText, { color: theme.error }]}>
            {error}
          </Text>
        )}
        <Pressable onPress={onDismiss} style={styles.removeButton}>
          <Ionicons name="close-circle-outline" size={20} color={theme.textSecondary} />
          <Text style={[styles.removeButtonText, { color: theme.textSecondary }]}>
            Remove image
          </Text>
        </Pressable>
      </View>
    );
  }

  // Show OCR result preview with actions
  return (
    <View style={[styles.resultContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.resultHeader, { borderBottomColor: theme.border }]}>
        <View style={styles.resultTitleArea}>
          <Text style={[styles.resultTitle, { color: theme.text }]}>Text extracted from image</Text>
          <Text style={[styles.resultSubtitle, { color: theme.textSecondary }]}>
            {ocrText?.length ?? 0} characters
          </Text>
        </View>
        <Pressable onPress={() => setShowPreview(false)} style={styles.closeButton}>
          <Ionicons name="chevron-up" size={20} color={theme.secondary} />
        </Pressable>
      </View>

      <ScrollView style={styles.textPreview} scrollEnabled>
        <Text style={[styles.previewText, { color: theme.text }]}>
          {ocrText}
        </Text>
      </ScrollView>

      <View style={[styles.actionButtons, { borderTopColor: theme.border }]}>
        <Pressable
          onPress={handleAppend}
          style={[styles.button, styles.primaryButton, { backgroundColor: theme.secondary }]}
        >
          <Ionicons name="add-circle-outline" size={16} color={theme.primary} />
          <Text style={[styles.buttonText, { color: theme.primary }]}>Append to note</Text>
        </Pressable>
        <Pressable
          onPress={handleReplace}
          style={[styles.button, { borderColor: theme.border }]}
        >
          <Ionicons name="swap-horizontal-outline" size={16} color={theme.secondary} />
          <Text style={[styles.buttonText, { color: theme.secondary }]}>Replace note</Text>
        </Pressable>
        <Pressable
          onPress={handleCopy}
          style={[styles.button, { borderColor: theme.border }]}
        >
          <Ionicons name="copy-outline" size={16} color={theme.text} />
          <Text style={[styles.buttonText, { color: theme.text }]}>Copy</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewContainer: {
    borderWidth: 1,
    borderRadius: 12,
    marginVertical: 8,
    padding: 8,
    gap: 8,
  },
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  imageOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  extractButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  extractButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    lineHeight: 16,
    marginHorizontal: 8,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  removeButtonText: {
    fontSize: 12,
  },
  resultContainer: {
    borderWidth: 1,
    borderRadius: 12,
    marginVertical: 8,
    maxHeight: 300,
    overflow: 'hidden',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  resultTitleArea: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 2,
  },
  resultSubtitle: {
    fontSize: 11,
  },
  closeButton: {
    padding: 6,
  },
  textPreview: {
    maxHeight: 150,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  previewText: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  primaryButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
