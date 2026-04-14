/**
 * NoteOcrModal — pick an image, extract text via Tesseract OCR, choose which
 * entities to include, then create a note.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

import { detectNoteEntities } from '../core/smartNotes';
import { defaultSettings } from '../core/settings';
import type { AppSettings } from '../types';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
  surface?: string;
  textBody?: string;
  textDim?: string;
};

type FieldKey = 'rawText' | 'pi' | 'hostname' | 'ip' | 'office';

interface FieldState {
  rawText: boolean;
  pi: boolean;
  hostname: boolean;
  ip: boolean;
  office: boolean;
}

interface Props {
  visible: boolean;
  palette: Palette;
  settings?: AppSettings;
  onClose: () => void;
  onCreateNote: (text: string) => void;
}

const FIELD_LABELS: { key: FieldKey; label: string; icon: string }[] = [
  { key: 'rawText', label: 'Raw text (full OCR output)', icon: 'document-text-outline' },
  { key: 'pi', label: 'PI codes', icon: 'barcode-outline' },
  { key: 'hostname', label: 'Hostnames', icon: 'server-outline' },
  { key: 'ip', label: 'IP addresses', icon: 'wifi-outline' },
  { key: 'office', label: 'Office codes', icon: 'business-outline' },
];

function buildNoteFromFields(rawText: string, fields: FieldState, settings: AppSettings): string {
  const entities = detectNoteEntities(rawText, settings);
  const parts: string[] = [];

  if (fields.rawText) {
    parts.push(rawText.trim());
  }

  const extras: string[] = [];
  if (fields.pi && entities.pi.length > 0) {
    extras.push(`PI: ${entities.pi.join(', ')}`);
  }
  if (fields.hostname && entities.hostname.length > 0) {
    extras.push(`Hostname: ${entities.hostname.join(', ')}`);
  }
  if (fields.ip && entities.ip.length > 0) {
    extras.push(`IP: ${entities.ip.join(', ')}`);
  }
  if (fields.office && entities.office.length > 0) {
    extras.push(`Office: ${entities.office.join(', ')}`);
  }

  if (extras.length > 0 && !fields.rawText) {
    parts.push(...extras);
  } else if (extras.length > 0 && fields.rawText) {
    parts.push('\n---');
    parts.push(...extras);
  }

  return parts.join('\n').trim();
}

/** Load Tesseract worker lazily (tree-shaken, runs only when needed). */
async function runOcr(imageUri: string, onProgress?: (p: number) => void): Promise<string> {
  // On web the URI is a data URL or object URL — Tesseract accepts both.
  // On native Tesseract.js is not fully supported, so we return a placeholder.
  if (Platform.OS !== 'web') {
    return '(OCR is only supported on web)';
  }
  // @ts-ignore — tesseract.js uses CJS/ESM interop that TS may not resolve
  const Tesseract = await import('tesseract.js');
  const createWorker = Tesseract.createWorker ?? Tesseract.default?.createWorker;
  if (!createWorker) throw new Error('Tesseract not available');

  const worker = await createWorker('eng+spa', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100));
    },
  });

  const { data } = await worker.recognize(imageUri);
  await worker.terminate();
  return data.text ?? '';
}

/** Pick an image and return its URI (data URL on web). */
async function pickImage(): Promise<string | null> {
  if (Platform.OS === 'web') {
    // On web use a file input for the cleanest UX (no permission prompt needed).
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }
  // Native: use ImagePicker
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    base64: false,
  });
  if (result.canceled || !result.assets?.[0]?.uri) return null;
  return result.assets[0].uri;
}

export function NoteOcrModal({ visible, palette, settings, onClose, onCreateNote }: Props) {
  const resolvedSettings = settings ?? defaultSettings;
  const bg = palette.bg;
  const fg = palette.fg;
  const accent = palette.accent;
  const muted = palette.muted;
  const card = palette.card ?? (palette as any).surface ?? '#1e1e1e';
  const border = palette.border;

  const [step, setStep] = useState<'idle' | 'ocr' | 'review'>('idle');
  const [progress, setProgress] = useState(0);
  const [rawText, setRawText] = useState('');
  const [editedText, setEditedText] = useState('');
  const [fields, setFields] = useState<FieldState>({
    rawText: true,
    pi: true,
    hostname: true,
    ip: true,
    office: true,
  });
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef(false);

  const reset = useCallback(() => {
    setStep('idle');
    setProgress(0);
    setRawText('');
    setEditedText('');
    setError(null);
    setFields({ rawText: true, pi: true, hostname: true, ip: true, office: true });
    abortRef.current = false;
  }, []);

  const handleClose = useCallback(() => {
    abortRef.current = true;
    reset();
    onClose();
  }, [reset, onClose]);

  const runOcrFromUri = useCallback(async (uri: string) => {
    setError(null);
    setStep('ocr');
    setProgress(0);
    abortRef.current = false;
    try {
      const text = await runOcr(uri, (p) => {
        if (!abortRef.current) setProgress(p);
      });
      if (abortRef.current) return;
      setRawText(text);
      setEditedText(text);
      setStep('review');
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
      setStep('idle');
    }
  }, []);

  const handlePickImage = useCallback(async () => {
    const uri = await pickImage();
    if (!uri) return;
    await runOcrFromUri(uri);
  }, [runOcrFromUri]);

  const handlePasteFromClipboard = useCallback(async () => {
    setError(null);
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.read) {
        setError('Clipboard image paste is not supported in this browser.');
        return;
      }
      const items = await navigator.clipboard.read();
      let dataUrl: string | null = null;
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith('image/'));
        if (!imageType) continue;
        const blob = await item.getType(imageType);
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result ?? ''));
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        break;
      }
      if (!dataUrl) {
        setError('No image found in clipboard. Copy an image first.');
        return;
      }
      await runOcrFromUri(dataUrl);
    } catch (err) {
      setError(String((err as Error)?.message ?? err));
    }
  }, [runOcrFromUri]);

  const toggleField = useCallback((key: FieldKey) => {
    setFields((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const handleCreate = useCallback(() => {
    const noteText = buildNoteFromFields(editedText, fields, resolvedSettings);
    if (!noteText.trim()) return;
    onCreateNote(noteText);
    reset();
    onClose();
  }, [editedText, fields, resolvedSettings, onCreateNote, reset, onClose]);

  const entities = detectNoteEntities(editedText, resolvedSettings);
  const entityCounts: Record<FieldKey, number> = {
    rawText: editedText.split('\n').filter(Boolean).length,
    pi: entities.pi.length,
    hostname: entities.hostname.length,
    ip: entities.ip.length,
    office: entities.office.length,
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={[s.overlay]}>
        <View style={[s.sheet, { backgroundColor: bg, borderColor: border }]}>
          {/* Header */}
          <View style={[s.header, { borderBottomColor: border }]}>
            <View style={s.headerLeft}>
              <Ionicons name="scan-outline" size={20} color={accent} />
              <Text style={[s.title, { color: fg }]}>OCR — Image to Note</Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={muted} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {/* ── IDLE ── */}
            {step === 'idle' && (
              <View style={s.center}>
                <Ionicons name="image-outline" size={56} color={muted} />
                <Text style={[s.hint, { color: muted }]}>Pick an image or paste from clipboard to extract text with OCR</Text>
                {error && (
                  <Text style={[s.errorText, { color: '#f87171' }]}>{error}</Text>
                )}
                <Pressable style={[s.btn, { backgroundColor: accent }]} onPress={handlePickImage}>
                  <Ionicons name="folder-open-outline" size={18} color="#fff" />
                  <Text style={s.btnText}>Choose Image</Text>
                </Pressable>
                <Pressable style={[s.btnOutline, { borderColor: border, minWidth: 160 }]} onPress={handlePasteFromClipboard}>
                  <Ionicons name="clipboard-outline" size={16} color={muted} />
                  <Text style={[s.btnOutlineText, { color: muted }]}>Paste from Clipboard</Text>
                </Pressable>
              </View>
            )}

            {/* ── OCR RUNNING ── */}
            {step === 'ocr' && (
              <View style={s.center}>
                <ActivityIndicator size="large" color={accent} />
                <Text style={[s.hint, { color: muted }]}>Extracting text… {progress}%</Text>
                <View style={[s.progressBar, { borderColor: border }]}>
                  <View style={[s.progressFill, { backgroundColor: accent, width: `${progress}%` as any }]} />
                </View>
                <Pressable style={[s.btnOutline, { borderColor: border }]} onPress={() => { abortRef.current = true; setStep('idle'); }}>
                  <Text style={[s.btnOutlineText, { color: muted }]}>Cancel</Text>
                </Pressable>
              </View>
            )}

            {/* ── REVIEW ── */}
            {step === 'review' && (
              <View style={s.reviewContainer}>
                {/* Extracted text (editable) */}
                <Text style={[s.sectionLabel, { color: muted }]}>EXTRACTED TEXT</Text>
                <TextInput
                  style={[s.textArea, { backgroundColor: card, color: fg, borderColor: border }]}
                  value={editedText}
                  onChangeText={setEditedText}
                  multiline
                  scrollEnabled
                  placeholderTextColor={muted}
                  placeholder="No text detected…"
                />

                {/* Field selector */}
                <Text style={[s.sectionLabel, { color: muted, marginTop: 16 }]}>INCLUDE IN NOTE</Text>
                {FIELD_LABELS.map(({ key, label, icon }) => {
                  const count = entityCounts[key];
                  const disabled = key !== 'rawText' && count === 0;
                  return (
                    <Pressable
                      key={key}
                      style={[s.fieldRow, { backgroundColor: card, borderColor: border, opacity: disabled ? 0.4 : 1 }]}
                      onPress={() => !disabled && toggleField(key)}
                      disabled={disabled}
                    >
                      <View style={[s.checkbox, { borderColor: fields[key] && !disabled ? accent : border, backgroundColor: fields[key] && !disabled ? accent : 'transparent' }]}>
                        {fields[key] && !disabled && <Ionicons name="checkmark" size={13} color="#fff" />}
                      </View>
                      <Ionicons name={icon as any} size={16} color={fields[key] && !disabled ? accent : muted} style={{ marginRight: 6 }} />
                      <Text style={[s.fieldLabel, { color: fields[key] && !disabled ? fg : muted, flex: 1 }]}>{label}</Text>
                      {key !== 'rawText' && count > 0 && (
                        <View style={[s.countBadge, { backgroundColor: accent + '33' }]}>
                          <Text style={[s.countText, { color: accent }]}>{count}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}

                {/* Preview */}
                {(() => {
                  const preview = buildNoteFromFields(editedText, fields, resolvedSettings);
                  if (!preview) return null;
                  return (
                    <>
                      <Text style={[s.sectionLabel, { color: muted, marginTop: 16 }]}>PREVIEW</Text>
                      <View style={[s.previewBox, { backgroundColor: card, borderColor: border }]}>
                        <Text style={[s.previewText, { color: fg }]}>{preview}</Text>
                      </View>
                    </>
                  );
                })()}

                {/* Actions */}
                <View style={s.actions}>
                  <Pressable style={[s.btnOutline, { borderColor: border, flex: 1 }]} onPress={() => { setStep('idle'); setRawText(''); setEditedText(''); }}>
                    <Ionicons name="refresh-outline" size={16} color={muted} />
                    <Text style={[s.btnOutlineText, { color: muted }]}>Re-pick</Text>
                  </Pressable>
                  <Pressable
                    style={[s.btn, { backgroundColor: accent, flex: 2 }]}
                    onPress={handleCreate}
                    disabled={!buildNoteFromFields(editedText, fields, resolvedSettings).trim()}
                  >
                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                    <Text style={s.btnText}>Create Note</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '92%',
    minHeight: 380,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 16, fontWeight: '700' },
  body: { padding: 20, flexGrow: 1 },
  center: { alignItems: 'center', gap: 16, paddingVertical: 24 },
  hint: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  errorText: { fontSize: 13, textAlign: 'center' },
  progressBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    borderWidth: 1,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 3 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: 'center',
    minWidth: 160,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  btnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
  },
  btnOutlineText: { fontWeight: '600', fontSize: 14 },
  reviewContainer: { gap: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 13,
    lineHeight: 20,
    minHeight: 120,
    maxHeight: 200,
    textAlignVertical: 'top',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: { fontSize: 14 },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  countText: { fontSize: 12, fontWeight: '700' },
  previewBox: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    maxHeight: 140,
  },
  previewText: { fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
});
