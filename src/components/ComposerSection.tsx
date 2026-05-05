import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCtrlEnterSave } from '../hooks/useCtrlEnterSave';
import { NoteComposerOcrPreview } from './NoteComposerOcrPreview';
import { QuickTemplatesModal } from './QuickTemplatesModal';
import { safeText } from '../utils/groceryDetection';
import { analyzeShoppingListCandidate, type ShoppingListCandidateAnalysis } from '../core/shoppingList';
import { detectSmartWorkflow } from '../core/smartNoteWorkflows';
import { ThemedActionIconButton } from './ThemedActionIconButton';

type Palette = {
  bg: string;
  accent: string;
  border: string;
  surface: string;
  surfaceAlt: string;
  textBody: string;
  textDim: string;
  textMuted: string;
  chipBorder: string;
  textPrimary: string;
};

type SharedGroup = {
  id: string;
  name: string;
};

type NoteCategory = 'general' | 'work' | 'health' | 'shopping';

export const ComposerSection = forwardRef<TextInput, {
  palette: Palette;
  activeGroupId: string;
  groups: SharedGroup[];
  draftText: string;
  draftImages: string[];
  activeCategory: NoteCategory;
  onChangeGroup: (groupId: string) => void;
  onChangeText: (value: string) => void;
  onGenerate: () => void;
  onOcr?: () => void;
  onAddImage: () => void;
  onTakePhoto: () => void;
  onPasteImage: () => void;
  onSave: () => void;
  onSetCategory: (category: NoteCategory) => void;
  onQuickTemplateMedication?: (medication: string) => void;
  onQuickTemplateShopping?: (items: string) => void;
  onQuickTemplateReminder?: () => void;
  onConvertShoppingCandidate?: (analysis: ShoppingListCandidateAnalysis) => void;
  onRemoveImage?: (index: number) => void;
  onOcrAppendText?: (text: string) => void;
  onOcrReplaceText?: (text: string) => void;
  generating?: boolean;
  isSecret?: boolean;
  onToggleSecret?: () => void;
  onLongPressSecret?: () => void;
  autoSaveStatus?: 'idle' | 'saving' | 'saved';
}>(
  function ComposerSection(
    {
      palette,
      activeGroupId,
      groups,
      draftText,
      draftImages,
      activeCategory,
      onChangeGroup,
      onChangeText,
      onGenerate,
      onOcr,
      onAddImage,
      onTakePhoto,
      onPasteImage,
      onSave,
      onSetCategory,
      onQuickTemplateMedication,
      onQuickTemplateShopping,
      onQuickTemplateReminder,
      onConvertShoppingCandidate,
      onRemoveImage,
      onOcrAppendText,
      onOcrReplaceText,
      generating,
      isSecret,
      onToggleSecret,
      onLongPressSecret,
      autoSaveStatus,
    },
    ref
  ) {
    const draftTextValue = typeof draftText === 'string' ? draftText : '';
    const [inputHeight, setInputHeight] = useState(68);
    const [pickerVisible, setPickerVisible] = useState(false);
    const [mediaPickerVisible, setMediaPickerVisible] = useState(false);
    const [hoveredAction, setHoveredAction] = useState<string | null>(null);
    const [templatesModalVisible, setTemplatesModalVisible] = useState(false);
    const [dictationMessage, setDictationMessage] = useState<string | null>(null);
    const localInputRef = useRef<TextInput | null>(null);
    const [shoppingAnalysis, setShoppingAnalysis] = useState<ShoppingListCandidateAnalysis | null>(null);
    const [dismissedShoppingSignature, setDismissedShoppingSignature] = useState<string | null>(null);
    const { width } = useWindowDimensions();
    const isCompact = width < 520;
    const shoppingSignature = useMemo(() => safeText(draftTextValue).toLowerCase().replace(/\s+/g, ' ').trim(), [draftTextValue]);
    const showShoppingSuggestion = Boolean(
      shoppingAnalysis?.isCandidate
      && shoppingSignature
      && shoppingSignature !== dismissedShoppingSignature
      && onConvertShoppingCandidate,
    );
    const contextualWorkflow = useMemo(() => detectSmartWorkflow(draftTextValue), [draftTextValue]);
    const showContextualActions = Boolean(draftTextValue.trim().length >= 6 && contextualWorkflow.type !== 'none' && contextualWorkflow.confidence >= 0.65);

    // Ctrl+Enter / Cmd+Enter → save (only when there's something to save)
    useCtrlEnterSave(onSave, Boolean(draftTextValue.trim() || draftImages.length > 0));

    useEffect(() => {
      if (!draftTextValue.trim()) {
        setInputHeight(68);
      }
    }, [draftTextValue]);

    useEffect(() => {
      const timer = setTimeout(() => {
        const analysis = analyzeShoppingListCandidate(draftTextValue);
        setShoppingAnalysis(analysis.isCandidate ? analysis : null);
      }, 400);
      return () => clearTimeout(timer);
    }, [draftTextValue]);

    const activeGroupLabel = useMemo(() => {
      if (activeGroupId === 'personal') return 'Personal';
      return groups.find((group) => group.id === activeGroupId)?.name || 'Personal';
    }, [activeGroupId, groups]);

    const startDictation = () => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') {
        setDictationMessage('Voice dictation is not available in this browser. You can use your device keyboard microphone.');
        localInputRef.current?.focus();
        return;
      }
      const SpeechRecognition = (window as unknown as {
        SpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
          onerror: (() => void) | null;
          start: () => void;
        };
        webkitSpeechRecognition?: new () => {
          lang: string;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
          onerror: (() => void) | null;
          start: () => void;
        };
      }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setDictationMessage('Voice dictation is not available in this browser. You can use your device keyboard microphone.');
        return;
      }

      try {
        const recognition = new SpeechRecognition();
        recognition.lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event: any) => {
          const transcript = safeText(event.results?.[0]?.[0]?.transcript).trim();
          if (!transcript) return;
          onChangeText(draftTextValue.trim() ? `${draftTextValue}\n${transcript}` : transcript);
        };
        recognition.onerror = () => setDictationMessage('Voice dictation is not available in this browser. You can use your device keyboard microphone.');
        recognition.start();
      } catch {
        setDictationMessage('Voice dictation is not available in this browser. You can use your device keyboard microphone.');
      }
    };

    const actionItems = [
      { key: 'media', label: 'Photo', icon: 'camera-plus-outline' as const, action: () => setMediaPickerVisible(true), active: draftImages.length > 0 },
      { key: 'paste', label: 'Paste', icon: 'clipboard-text-outline' as const, action: onPasteImage, active: false },
      { key: 'dictation', label: 'Dictate', icon: 'microphone-outline' as const, action: startDictation, active: false },
      { key: 'ocr', label: 'OCR', icon: 'text-recognition' as const, action: onOcr ?? (() => {}), active: false },
      { key: 'templates', label: 'Templates', icon: 'layers-outline' as const, action: () => setTemplatesModalVisible(true), active: false },
      { key: 'save', label: 'Save', icon: 'content-save-outline' as const, action: onSave, active: false },
      { key: 'generate', label: 'Generate', icon: 'auto-fix' as const, action: onGenerate, active: Boolean(generating) },
    ];

    return (
      <View style={{ width: '100%' }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: isCompact ? 8 : 12,
            minWidth: 0,
          }}
        >
          <Pressable
            onPress={() => setPickerVisible(true)}
            hitSlop={8}
              style={({ pressed }) => ({
                height: 40,
                paddingHorizontal: 12,
                borderRadius: 10,
              borderWidth: 1,
              borderColor: palette.chipBorder,
              backgroundColor: palette.surfaceAlt,
              justifyContent: 'center',
              opacity: pressed ? 0.82 : 1,
              minWidth: 0,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: palette.textBody, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                Group: {activeGroupLabel}
              </Text>
              <Ionicons name="chevron-down" size={13} color={palette.textMuted} />
            </View>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {([
              { key: 'general', label: 'General' },
              { key: 'work', label: 'Work' },
            ] as const).map((item, index) => {
              const active = activeCategory === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => onSetCategory(item.key)}
                  hitSlop={6}
                  style={({ pressed }) => ({
                    height: 40,
                    minWidth: isCompact ? 72 : 84,
                    paddingHorizontal: isCompact ? 12 : 14,
                    justifyContent: 'center',
                    alignItems: 'center',
                    borderTopLeftRadius: index === 0 ? 10 : 0,
                    borderBottomLeftRadius: index === 0 ? 10 : 0,
                    borderTopRightRadius: index === 1 ? 10 : 0,
                    borderBottomRightRadius: index === 1 ? 10 : 0,
                    borderWidth: 1,
                    borderColor: active ? palette.accent : palette.chipBorder,
                    backgroundColor: active ? palette.accent : palette.surfaceAlt,
                    opacity: pressed ? 0.88 : 1,
                    marginLeft: index === 0 ? 0 : -1,
                  })}
                >
                  <Text style={{ color: active ? '#111111' : palette.textMuted, fontSize: 12, fontWeight: active ? '700' : '600' }}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {autoSaveStatus === 'saving' ? (
              <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '500' }}>Saving…</Text>
            ) : autoSaveStatus === 'saved' ? (
              <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '500' }}>Saved</Text>
            ) : null}

            {onToggleSecret && (
              <Pressable
                onPress={onToggleSecret}
                onLongPress={onLongPressSecret}
                delayLongPress={3000}
                hitSlop={6}
                style={({ pressed }) => ({
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSecret ? '#F59E0B22' : 'transparent',
                  borderWidth: 1,
                  borderColor: isSecret ? '#F59E0Bcc' : palette.chipBorder,
                  opacity: pressed ? 0.6 : 1,
                  transform: [{ scale: pressed ? 0.92 : 1 }],
                })}
              >
                <Ionicons name={isSecret ? 'lock-closed' : 'lock-open-outline'} size={16} color="#F59E0B" />
              </Pressable>
            )}
          </View>
        </View>

        <Modal animationType="fade" transparent visible={pickerVisible} onRequestClose={() => setPickerVisible(false)} statusBarTranslucent>
          <Pressable
            onPress={() => setPickerVisible(false)}
            style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingHorizontal: 12, paddingBottom: 18 }}
          >
            <Pressable
              onPress={() => undefined}
              style={{
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: 20,
                padding: 12,
                gap: 8,
              }}
            >
              <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 99, backgroundColor: palette.chipBorder }} />
              <Pressable
                onPress={() => {
                  onChangeGroup('personal');
                  setPickerVisible(false);
                }}
                style={{ minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 }}
              >
                <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '500' }}>Personal</Text>
              </Pressable>
              {groups.map((group) => (
                <Pressable
                  key={group.id}
                  onPress={() => {
                    onChangeGroup(group.id);
                    setPickerVisible(false);
                  }}
                  style={{ minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 }}
                >
                  <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '500' }}>{group.name}</Text>
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        <TextInput
          ref={(node) => {
            localInputRef.current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          value={draftTextValue}
          onChangeText={onChangeText}
          onKeyPress={(event) => {
            if (Platform.OS !== 'web') return;
            const nativeEvent = event.nativeEvent as { key?: string; ctrlKey?: boolean; metaKey?: boolean };
            if ((nativeEvent.ctrlKey || nativeEvent.metaKey) && nativeEvent.key === 'Enter') {
              event.preventDefault?.();
              onSave();
            }
          }}
          multiline
          placeholder="Type here. Auto-save is always on."
          placeholderTextColor={palette.textMuted}
          onContentSizeChange={(event) => {
            const nextHeight = Math.max(68, Math.min(160, event.nativeEvent.contentSize.height + 20));
            setInputHeight(nextHeight);
          }}
          style={{
            marginTop: 8,
            minHeight: 68,
            height: inputHeight,
            maxHeight: 160,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
            paddingHorizontal: 12,
            paddingVertical: 10,
            color: palette.textBody,
            fontSize: 14,
            lineHeight: 21,
            textAlignVertical: 'top',
          }}
        />

        {showShoppingSuggestion ? (
          <View style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: `${palette.accent}66`, backgroundColor: `${palette.accent}12`, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Ionicons name="cart-outline" size={15} color={palette.accent} />
            <Text style={{ color: palette.textBody, fontSize: 12, fontWeight: '600', flex: 1, minWidth: 170 }}>Looks like a shopping list. Convert it?</Text>
            <Pressable onPress={() => shoppingAnalysis && onConvertShoppingCandidate?.(shoppingAnalysis)} style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: palette.accent, justifyContent: 'center', opacity: pressed ? 0.82 : 1 })}>
              <Text style={{ color: '#000', fontSize: 12, fontWeight: '800' }}>Convert</Text>
            </Pressable>
            <Pressable onPress={() => setDismissedShoppingSignature(shoppingSignature)} style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: palette.border, justifyContent: 'center', opacity: pressed ? 0.82 : 1 })}>
              <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '700' }}>Keep as note</Text>
            </Pressable>
          </View>
        ) : null}

        {showContextualActions ? (
          <View style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '700' }}>Suggested</Text>
            {contextualWorkflow.type === 'medication' ? (
              <Pressable onPress={() => setTemplatesModalVisible(true)} style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#4DA3FF22', justifyContent: 'center', opacity: pressed ? 0.82 : 1 })}>
                <Text style={{ color: '#4DA3FF', fontSize: 12, fontWeight: '700' }}>Open Medication Template</Text>
              </Pressable>
            ) : null}
            {contextualWorkflow.type === 'shopping' ? (
              <Pressable
                onPress={() => shoppingAnalysis && onConvertShoppingCandidate?.(shoppingAnalysis)}
                style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#22c55e22', justifyContent: 'center', opacity: pressed ? 0.82 : 1 })}
              >
                <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '700' }}>Convert to Shopping</Text>
              </Pressable>
            ) : null}
            {contextualWorkflow.type === 'reminder' ? (
              <Pressable onPress={() => onQuickTemplateReminder?.()} style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#f59e0b22', justifyContent: 'center', opacity: pressed ? 0.82 : 1 })}>
                <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700' }}>Create Reminder</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {dictationMessage ? (
          <Pressable onPress={() => setDictationMessage(null)} style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt }}>
            <Text style={{ color: palette.textMuted, fontSize: 12 }}>{dictationMessage}</Text>
          </Pressable>
        ) : null}

        <Modal animationType="fade" transparent visible={mediaPickerVisible} onRequestClose={() => setMediaPickerVisible(false)} statusBarTranslucent>
          <Pressable
            onPress={() => setMediaPickerVisible(false)}
            style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.5)', paddingHorizontal: 12, paddingBottom: 18 }}
          >
            <Pressable
              onPress={() => undefined}
              style={{
                backgroundColor: palette.surface,
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: 20,
                padding: 12,
                gap: 8,
              }}
            >
              <View style={{ alignSelf: 'center', width: 42, height: 4, borderRadius: 99, backgroundColor: palette.chipBorder }} />
              <Pressable
                onPress={() => {
                  setMediaPickerVisible(false);
                  onTakePhoto();
                }}
                style={{ minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 }}
              >
                <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '500' }}>Take photo</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMediaPickerVisible(false);
                  onAddImage();
                }}
                style={{ minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 }}
              >
                <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '500' }}>Choose from gallery</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {draftImages.length > 0 && draftImages[0] && (
          <NoteComposerOcrPreview
            imageUri={draftImages[0]}
            noteText={draftTextValue}
            onAppendText={(text) => {
              onOcrAppendText?.(text);
              onRemoveImage?.(0);
            }}
            onReplaceText={(text) => {
              onOcrReplaceText?.(text);
              onRemoveImage?.(0);
            }}
            onDismiss={() => onRemoveImage?.(0)}
          />
        )}

        {/* Quick Templates Modal */}
        <QuickTemplatesModal
          visible={templatesModalVisible}
          currentNoteText={draftTextValue}
          palette={palette}
          onClose={() => setTemplatesModalVisible(false)}
          onSelectMedication={(med) => {
            if (!med || typeof med !== 'string') return;
            if (onQuickTemplateMedication) {
              onQuickTemplateMedication(med);
              return;
            }
            const newText = draftTextValue ? `${draftTextValue}\n${med}` : med;
            onChangeText(newText);
          }}
          onSelectShoppingItem={(item) => {
            if (!item || typeof item !== 'string') return;
            if (onQuickTemplateShopping) {
              onQuickTemplateShopping(item);
              return;
            }
            onChangeText(item);
          }}
        />

      </View>
    );
  }
);
