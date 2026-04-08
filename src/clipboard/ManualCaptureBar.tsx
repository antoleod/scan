import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';

type Props = {
  permState: 'granted' | 'denied' | 'prompt' | 'unsupported';
  onCaptureNow: () => Promise<void> | void;
  onPasteText: (text: string) => Promise<void> | void;
  onImportScreenshot: (dataUrl: string) => Promise<void> | void;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('file-read-failed'));
    reader.readAsDataURL(file);
  });
}

export function ManualCaptureBar({ permState, onCaptureNow, onPasteText, onImportScreenshot }: Props) {
  const [pasteHint, setPasteHint] = useState('Paste clipboard text here');
  const [pasteValue, setPasteValue] = useState('');
  const hiddenInputRef = useRef<TextInput | null>(null);

  async function handleImportScreenshot() {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      await new Promise<void>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';
        input.onchange = async () => {
          try {
            const file = input.files?.[0];
            if (!file) return resolve();
            const dataUrl = await fileToDataUrl(file);
            if (dataUrl) await onImportScreenshot(dataUrl);
          } finally {
            document.body.removeChild(input);
            resolve();
          }
        };
        document.body.appendChild(input);
        input.click();
      });
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      base64: true,
    });
    if (picked.canceled || !picked.assets?.length) return;
    const asset = picked.assets[0];
    let dataUrl = asset.base64 ? `data:${asset.mimeType || 'image/png'};base64,${asset.base64}` : '';
    if (!dataUrl && asset.uri) {
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      if (base64) dataUrl = `data:${asset.mimeType || 'image/png'};base64,${base64}`;
    }
    if (dataUrl) await onImportScreenshot(dataUrl);
  }

  return (
    <View style={styles.shell}>
      <View style={styles.row}>
        <Pressable style={styles.button} onPress={() => void onCaptureNow()}>
          <Text style={styles.buttonText}>Capture clipboard now</Text>
        </Pressable>
        <Pressable style={styles.buttonSecondary} onPress={() => void handleImportScreenshot()}>
          <Text style={styles.buttonSecondaryText}>Import screenshot</Text>
        </Pressable>
      </View>
      {permState !== 'granted' ? (
        <>
          <Pressable
            style={styles.buttonSecondary}
            onPress={() => hiddenInputRef.current?.focus()}
          >
            <Text style={styles.buttonSecondaryText}>Paste to capture</Text>
          </Pressable>
          <Text style={styles.helper}>Firefox and Safari require a manual action to read the clipboard</Text>
        </>
      ) : null}
      <TextInput
        ref={hiddenInputRef}
        value={pasteValue}
        onChangeText={(text) => {
          const value = String(text || '').trim();
          setPasteValue(text);
          if (!value) return;
          void onPasteText(value);
          setPasteHint('Captured. Paste again if needed');
          setPasteValue('');
        }}
        placeholder={pasteHint}
        placeholderTextColor="#94a3b8"
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        textAlignVertical="top"
        style={styles.hiddenInput}
        caretHidden
      />
    </View>
  );
}

export default ManualCaptureBar;

const styles = StyleSheet.create({
  shell: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  button: {
    flexGrow: 1,
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f82f8',
  },
  buttonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  buttonSecondary: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.38)',
  },
  buttonSecondaryText: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '800',
  },
  helper: {
    fontSize: 11,
    lineHeight: 16,
    color: '#94a3b8',
  },
  hiddenInput: {
    position: 'absolute',
    left: -9999,
    top: 0,
    width: 1,
    height: 1,
    opacity: 0,
  },
});
