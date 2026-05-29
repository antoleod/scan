import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useCtrlEnterSave } from '../hooks/useCtrlEnterSave';
import { QuickTemplatesModal } from './QuickTemplatesModal';
import { safeText } from '../utils/groceryDetection';
import { analyzeShoppingListCandidate, type ShoppingListCandidateAnalysis } from '../core/shoppingList';
import { detectSmartWorkflow } from '../core/smartNoteWorkflows';
import { detectSmartNoteLabel, getSmartNoteLabelMeta, type SmartNoteLabel } from '../core/noteIntelligence';
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
  activeSmartLabel?: SmartNoteLabel | null;
  onChangeGroup: (groupId: string) => void;
  onChangeText: (value: string) => void;
  onGenerate: () => void;
  onOcr: () => void;
  onAddImage: () => void;
  onTakePhoto: () => void;
  onPasteImage: () => void;
  onSave: () => void;
  onSetCategory: (category: NoteCategory) => void;
  onSetSmartLabel?: (label: SmartNoteLabel | null) => void;
  onQuickTemplateMedication?: (medication: string) => void;
  onQuickTemplateShopping?: (items: string) => void;
  onQuickTemplateReminder?: () => void;
  onConvertShoppingCandidate?: (analysis?: ShoppingListCandidateAnalysis) => void;
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
      activeSmartLabel,
      onChangeGroup,
      onChangeText,
      onGenerate,
      onOcr,
      onAddImage,
      onTakePhoto,
      onPasteImage,
      onSave,
      onSetCategory,
      onSetSmartLabel,
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
    const { t } = useTranslation();
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
    const [viewingImage, setViewingImage] = useState<string | null>(null);
    const { width, height: windowHeight } = useWindowDimensions();
    const isCompact = width < 520;
    const maxInputHeight = Math.min(Math.max(160, Math.floor(windowHeight * 0.35)), 420);
    const shoppingSignature = useMemo(() => safeText(draftTextValue).toLowerCase().replace(/\s+/g, ' ').trim(), [draftTextValue]);
    const showShoppingSuggestion = Boolean(
      shoppingAnalysis?.isCandidate
      && shoppingSignature
      && shoppingSignature !== dismissedShoppingSignature
      && onConvertShoppingCandidate,
    );
    const contextualWorkflow = useMemo(() => detectSmartWorkflow(draftTextValue), [draftTextValue]);
    const smartLabelDetection = useMemo(() => detectSmartNoteLabel(draftTextValue), [draftTextValue]);
    const resolvedSmartLabel = activeSmartLabel || smartLabelDetection.label;
    const smartLabelMeta = getSmartNoteLabelMeta(resolvedSmartLabel);
    const showSmartLabelSuggestion = Boolean(
      onSetSmartLabel
      && draftTextValue.trim().length >= 6
      && smartLabelDetection.label !== 'general'
      && !activeSmartLabel
      && smartLabelDetection.confidence < 0.76,
    );
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

    const startDictation = async () => {
      if (Platform.OS !== 'web' || typeof window === 'undefined') {
        setDictationMessage('Voice dictation is only available in supported web browsers. Use your keyboard microphone here.');
        localInputRef.current?.focus();
        return;
      }
      const SpeechRecognition = (window as unknown as {
        SpeechRecognition?: new () => {
          lang: string;
          continuous: boolean;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
          onstart?: (() => void) | null;
          onend?: (() => void) | null;
          onerror: ((event: { error?: string }) => void) | null;
          start: () => void;
        };
        webkitSpeechRecognition?: new () => {
          lang: string;
          continuous: boolean;
          interimResults: boolean;
          maxAlternatives: number;
          onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
          onstart?: (() => void) | null;
          onend?: (() => void) | null;
          onerror: ((event: { error?: string }) => void) | null;
          start: () => void;
        };
      }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: new () => any }).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setDictationMessage('Voice dictation needs Chrome or Edge on web. You can still use your device keyboard microphone.');
        localInputRef.current?.focus();
        return;
      }

      if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) {
        setDictationMessage('Voice dictation needs HTTPS or localhost to access the microphone.');
        localInputRef.current?.focus();
        return;
      }

      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((track) => track.stop());
        }

        const recognition = new SpeechRecognition();
        const browserLang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'es-ES';
        recognition.lang = browserLang;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        let heardSpeech = false;
        let hadError = false;
        let stopped = false;
        const stop = () => { if (!stopped) { stopped = true; try { recognition.stop(); } catch { /* ignore */ } } };
        recognition.onstart = () => setDictationMessage('🎙 Escuchando… habla ahora');
        recognition.onresult = (event: any) => {
          // Collect all final segments
          let finalText = '';
          let interimText = '';
          for (let i = 0; i < event.results.length; i++) {
            const result = event.results[i];
            const t = safeText(result?.[0]?.transcript);
            if (result.isFinal) { finalText += (finalText ? ' ' : '') + t; }
            else { interimText += t; }
          }
          if (interimText) {
            setDictationMessage(`🎙 ${interimText}`);
          }
          if (finalText) {
            heardSpeech = true;
            onChangeText(draftTextValue.trim() ? `${draftTextValue}\n${finalText.trim()}` : finalText.trim());
            setDictationMessage(null);
            stop();
          }
        };
        recognition.onerror = (event: { error?: string }) => {
          hadError = true;
          const error = event.error || 'unknown';
          if (error === 'not-allowed' || error === 'service-not-allowed') {
            setDictationMessage('Micrófono bloqueado. Permite el acceso al micrófono en el navegador.');
            return;
          }
          if (error === 'audio-capture') {
            setDictationMessage('No se detectó micrófono. Verifica tu dispositivo de audio.');
            return;
          }
          if (error === 'no-speech') {
            setDictationMessage('No se detectó voz. Pulsa Dictar y habla más cerca del micrófono.');
            return;
          }
          if (error === 'network') {
            setDictationMessage('Servicio de voz no disponible. Verifica la conexión e intenta de nuevo.');
            return;
          }
          if (error !== 'aborted') {
            setDictationMessage(`Dictado detenido: ${error}.`);
          }
        };
        recognition.onend = () => {
          if (!heardSpeech && !hadError) {
            setDictationMessage('No se detectó voz. Pulsa Dictar y habla más cerca del micrófono.');
          }
        };
        recognition.start();
      } catch (error) {
        const name = error instanceof Error ? error.name : '';
        if (name === 'NotAllowedError' || name === 'SecurityError') {
          setDictationMessage('Microphone permission is blocked. Allow microphone access in the browser and try again.');
        } else {
          setDictationMessage('Voice dictation could not start. Use Chrome or Edge, then allow microphone access.');
        }
        localInputRef.current?.focus();
      }
    };

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
            accessibilityRole="button"
            accessibilityLabel={t('composer.groupPickerA11y', { group: activeGroupLabel })}
            hitSlop={8}
              style={({ pressed }) => ({
                height: 44,
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
                {t('composer.personal') === activeGroupLabel ? t('composer.personal') : activeGroupLabel}
              </Text>
              <Ionicons name="chevron-down" size={13} color={palette.textMuted} />
            </View>
          </Pressable>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {([
              { key: 'general' as const, label: t('composer.categoryGeneral') },
              { key: 'work' as const, label: t('composer.categoryWork') },
            ]).map((item, index) => {
              const active = activeCategory === item.key;
              return (
                <Pressable
                  key={item.key}
                  onPress={() => onSetCategory(item.key)}
                  accessibilityRole="button"
                  accessibilityLabel={t('composer.categoryA11y', { category: item.label })}
                  accessibilityState={{ selected: active }}
                  hitSlop={6}
                  style={({ pressed }) => ({
                    height: 44,
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {autoSaveStatus === 'saving' ? (
              <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '500', marginRight: 4 }}>{t('composer.saving')}</Text>
            ) : autoSaveStatus === 'saved' ? (
              <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '500', marginRight: 4 }}>{t('composer.saved')}</Text>
            ) : null}

            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {hoveredAction === 'media' && (
                <View pointerEvents="none" style={{ position: 'absolute', top: -30, left: '50%', transform: [{ translateX: -34 }], minWidth: 68, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#111111', borderWidth: 1, borderColor: palette.chipBorder, zIndex: 20 }}>
                  <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{t('composer.photo')}</Text>
                </View>
              )}
              <ThemedActionIconButton icon="camera-plus-outline" label={t('composer.photo')} accentColor="#FF6B35" active={draftImages.length > 0} onPress={() => setMediaPickerVisible(true)} onHoverIn={() => setHoveredAction('media')} onHoverOut={() => setHoveredAction((current) => (current === 'media' ? null : current))} palette={palette} compact={isCompact} entranceDelay={0} />
            </View>

            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {hoveredAction === 'paste' && (
                <View pointerEvents="none" style={{ position: 'absolute', top: -30, left: '50%', transform: [{ translateX: -34 }], minWidth: 68, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#111111', borderWidth: 1, borderColor: palette.chipBorder, zIndex: 20 }}>
                  <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{t('composer.paste')}</Text>
                </View>
              )}
              <ThemedActionIconButton icon="clipboard-text-outline" label={t('composer.paste')} accentColor="#F59E0B" onPress={onPasteImage} onHoverIn={() => setHoveredAction('paste')} onHoverOut={() => setHoveredAction((current) => (current === 'paste' ? null : current))} palette={palette} compact={isCompact} entranceDelay={40} />
            </View>

            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {hoveredAction === 'dictation' && (
                <View pointerEvents="none" style={{ position: 'absolute', top: -30, left: '50%', transform: [{ translateX: -34 }], minWidth: 68, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#111111', borderWidth: 1, borderColor: palette.chipBorder, zIndex: 20 }}>
                  <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{t('composer.dictate')}</Text>
                </View>
              )}
              <ThemedActionIconButton icon="microphone-outline" label={t('composer.dictate')} accentColor="#00D4FF" onPress={startDictation} onHoverIn={() => setHoveredAction('dictation')} onHoverOut={() => setHoveredAction((current) => (current === 'dictation' ? null : current))} palette={palette} compact={isCompact} entranceDelay={80} />
            </View>

            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {hoveredAction === 'ocr' && (
                <View pointerEvents="none" style={{ position: 'absolute', top: -30, left: '50%', transform: [{ translateX: -34 }], minWidth: 68, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#111111', borderWidth: 1, borderColor: palette.chipBorder, zIndex: 20 }}>
                  <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{t('composer.ocr')}</Text>
                </View>
              )}
              <ThemedActionIconButton icon="text-recognition" label={t('composer.ocr')} accentColor="#4DA3FF" onPress={onOcr} onHoverIn={() => setHoveredAction('ocr')} onHoverOut={() => setHoveredAction((current) => (current === 'ocr' ? null : current))} palette={palette} compact={isCompact} entranceDelay={120} />
            </View>

            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {hoveredAction === 'templates' && (
                <View pointerEvents="none" style={{ position: 'absolute', top: -30, left: '50%', transform: [{ translateX: -34 }], minWidth: 68, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#111111', borderWidth: 1, borderColor: palette.chipBorder, zIndex: 20 }}>
                  <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{t('composer.templates')}</Text>
                </View>
              )}
              <ThemedActionIconButton icon="layers-outline" label={t('composer.templates')} accentColor="#A855F7" onPress={() => setTemplatesModalVisible(true)} onHoverIn={() => setHoveredAction('templates')} onHoverOut={() => setHoveredAction((current) => (current === 'templates' ? null : current))} palette={palette} compact={isCompact} entranceDelay={160} />
            </View>

            {onToggleSecret && (
              <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {hoveredAction === 'secret' && (
                  <View pointerEvents="none" style={{ position: 'absolute', top: -30, left: '50%', transform: [{ translateX: -34 }], minWidth: 68, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#111111', borderWidth: 1, borderColor: palette.chipBorder, zIndex: 20 }}>
                    <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{isSecret ? t('composer.secretUnlock') : t('composer.secretLock')}</Text>
                  </View>
                )}
                <ThemedActionIconButton
                  icon={isSecret ? 'lock' : 'lock-open-outline'}
                  label={isSecret ? t('composer.secretUnlock') : t('composer.secretLock')}
                  accentColor="#F59E0B"
                  active={!!isSecret}
                  onPress={onToggleSecret}
                  onLongPress={onLongPressSecret}
                  delayLongPress={3000}
                  onHoverIn={() => setHoveredAction('secret')}
                  onHoverOut={() => setHoveredAction((current) => (current === 'secret' ? null : current))}
                  palette={palette}
                  compact={isCompact}
                  entranceDelay={180}
                />
              </View>
            )}

            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {hoveredAction === 'save' && (
                <View pointerEvents="none" style={{ position: 'absolute', top: -30, left: '50%', transform: [{ translateX: -34 }], minWidth: 68, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#111111', borderWidth: 1, borderColor: palette.chipBorder, zIndex: 20 }}>
                  <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{t('composer.save')}</Text>
                </View>
              )}
              <ThemedActionIconButton icon="content-save-outline" label={t('composer.save')} accentColor="#7CFF6B" onPress={onSave} onHoverIn={() => setHoveredAction('save')} onHoverOut={() => setHoveredAction((current) => (current === 'save' ? null : current))} palette={palette} compact={isCompact} entranceDelay={200} />
            </View>

            <View style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {hoveredAction === 'generate' && (
                <View pointerEvents="none" style={{ position: 'absolute', top: -30, left: '50%', transform: [{ translateX: -34 }], minWidth: 68, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#111111', borderWidth: 1, borderColor: palette.chipBorder, zIndex: 20 }}>
                  <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{t('composer.generate')}</Text>
                </View>
              )}
              <ThemedActionIconButton icon="auto-fix" label={t('composer.generate')} accentColor="#EC4899" active={Boolean(generating)} onPress={onGenerate} onHoverIn={() => setHoveredAction('generate')} onHoverOut={() => setHoveredAction((current) => (current === 'generate' ? null : current))} palette={palette} compact={isCompact} entranceDelay={240} />
            </View>
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
                <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '500' }}>{t('composer.personal')}</Text>
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
          placeholder={t('composer.typeHerePlaceholder')}
          placeholderTextColor={palette.textMuted}
          onContentSizeChange={(event) => {
            const nextHeight = Math.max(68, Math.min(maxInputHeight, event.nativeEvent.contentSize.height + 20));
            setInputHeight(nextHeight);
          }}
          style={{
            marginTop: 8,
            minHeight: 68,
            height: inputHeight,
            maxHeight: maxInputHeight,
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

        {draftTextValue.length > 0 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 2, marginTop: 2 }}>
            <Text style={{ fontSize: 11, color: draftTextValue.length > 800 ? palette.accent : palette.textMuted }}>
              {draftTextValue.length < 1000
                ? `${draftTextValue.length} chars`
                : `${(draftTextValue.length / 1000).toFixed(1)}k chars`}
              {' · '}
              {draftTextValue.trim().split(/\n/).length} {draftTextValue.trim().split(/\n/).length === 1 ? 'line' : 'lines'}
            </Text>
          </View>
        ) : null}

        {showShoppingSuggestion ? (
          <View style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: `${palette.accent}66`, backgroundColor: `${palette.accent}12`, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Ionicons name="cart-outline" size={15} color={palette.accent} />
            <Text style={{ color: palette.textBody, fontSize: 12, fontWeight: '600', flex: 1, minWidth: 170 }}>{t('composer.looksLikeShopping')}</Text>
            <Pressable onPress={() => shoppingAnalysis && onConvertShoppingCandidate?.(shoppingAnalysis)} style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, backgroundColor: palette.accent, justifyContent: 'center', opacity: pressed ? 0.82 : 1 })}>
              <Text style={{ color: '#000', fontSize: 12, fontWeight: '800' }}>{t('composer.convert')}</Text>
            </Pressable>
            <Pressable onPress={() => setDismissedShoppingSignature(shoppingSignature)} style={({ pressed }) => ({ minHeight: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: palette.border, justifyContent: 'center', opacity: pressed ? 0.82 : 1 })}>
              <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '700' }}>{t('composer.keepAsNote')}</Text>
            </Pressable>
          </View>
        ) : null}

        {showContextualActions ? (
          <View style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surfaceAlt, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '700' }}>{t('composer.suggested')}</Text>
            {contextualWorkflow.type === 'medication' ? (
              <Pressable onPress={() => setTemplatesModalVisible(true)} style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#4DA3FF22', justifyContent: 'center', opacity: pressed ? 0.82 : 1 })}>
                <Text style={{ color: '#4DA3FF', fontSize: 12, fontWeight: '700' }}>{t('composer.openMedicationTemplate')}</Text>
              </Pressable>
            ) : null}
            {contextualWorkflow.type === 'shopping' ? (
              <Pressable
                onPress={() => onConvertShoppingCandidate?.(shoppingAnalysis || undefined)}
                style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#22c55e22', justifyContent: 'center', opacity: pressed ? 0.82 : 1 })}
              >
                <Text style={{ color: '#22c55e', fontSize: 12, fontWeight: '700' }}>{t('composer.convertToShopping')}</Text>
              </Pressable>
            ) : null}
            {contextualWorkflow.type === 'reminder' ? (
              <Pressable onPress={() => onQuickTemplateReminder?.()} style={({ pressed }) => ({ minHeight: 32, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#f59e0b22', justifyContent: 'center', opacity: pressed ? 0.82 : 1 })}>
                <Text style={{ color: '#f59e0b', fontSize: 12, fontWeight: '700' }}>{t('composer.createReminder')}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {draftTextValue.trim().length >= 6 && resolvedSmartLabel !== 'general' ? (
          <View style={{ marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: `${smartLabelMeta.color}55`, backgroundColor: `${smartLabelMeta.color}12`, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ color: smartLabelMeta.color, fontSize: 12, fontWeight: '800' }}>{smartLabelMeta.title}</Text>
            <Text style={{ color: palette.textMuted, fontSize: 12, flex: 1, minWidth: 160 }}>
              {showSmartLabelSuggestion ? 'Suggested label. Choose another if needed.' : 'Smart label will be saved with this note.'}
            </Text>
            {showSmartLabelSuggestion ? ([smartLabelDetection.label, ...smartLabelDetection.alternatives, 'general'] as SmartNoteLabel[]).map((label) => {
              const meta = getSmartNoteLabelMeta(label);
              return (
                <Pressable key={label} onPress={() => onSetSmartLabel?.(label)} style={({ pressed }) => ({ minHeight: 30, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: `${meta.color}66`, justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
                  <Text style={{ color: meta.color, fontSize: 11, fontWeight: '800' }}>{meta.title}</Text>
                </Pressable>
              );
            }) : activeSmartLabel ? (
              <Pressable onPress={() => onSetSmartLabel?.(null)} style={({ pressed }) => ({ minHeight: 30, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: palette.border, justifyContent: 'center', opacity: pressed ? 0.75 : 1 })}>
                <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: '800' }}>{t('composer.auto')}</Text>
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
                <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '500' }}>{t('composer.takePhoto')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setMediaPickerVisible(false);
                  onAddImage();
                }}
                style={{ minHeight: 44, justifyContent: 'center', borderRadius: 12, paddingHorizontal: 12 }}
              >
                <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '500' }}>{t('composer.chooseFromGallery')}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {draftImages.length > 0 && (
          <View style={{ marginTop: 8, gap: 4 }}>
            <Text style={{ fontSize: 11, color: palette.textMuted, fontWeight: '600', marginBottom: 2 }}>
              {draftImages.length} attachment{draftImages.length !== 1 ? 's' : ''}
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {draftImages.map((uri, index) => (
                  <View
                    key={index}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      borderWidth: 1,
                      borderColor: palette.border,
                      borderRadius: 10,
                      backgroundColor: palette.surface,
                      padding: 6,
                    }}
                  >
                    <Pressable onPress={() => setViewingImage(uri)} hitSlop={4}>
                      <Image
                        source={{ uri }}
                        style={{ width: 44, height: 44, borderRadius: 6 }}
                        resizeMode="cover"
                      />
                    </Pressable>
                    <View style={{ gap: 4 }}>
                      <Pressable
                        onPress={() => setViewingImage(uri)}
                        style={({ pressed }) => ({
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 6,
                          backgroundColor: `${palette.accent}22`,
                          opacity: pressed ? 0.75 : 1,
                        })}
                      >
                        <Text style={{ color: palette.accent, fontSize: 11, fontWeight: '700' }}>{t('composer.viewImage')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onRemoveImage?.(index)}
                        style={({ pressed }) => ({
                          paddingHorizontal: 10,
                          paddingVertical: 5,
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: palette.border,
                          opacity: pressed ? 0.75 : 1,
                        })}
                      >
                        <Text style={{ color: palette.textMuted, fontSize: 11, fontWeight: '600' }}>{t('composer.remove')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <Modal
          visible={Boolean(viewingImage)}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setViewingImage(null)}
        >
          <Pressable
            onPress={() => setViewingImage(null)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', alignItems: 'center' }}
          >
            <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 680, padding: 16 }}>
              {viewingImage ? (
                <Image
                  source={{ uri: viewingImage }}
                  style={{ width: '100%', aspectRatio: 1, borderRadius: 12, maxHeight: 520 }}
                  resizeMode="contain"
                />
              ) : null}
              <Pressable
                onPress={() => setViewingImage(null)}
                style={({ pressed }) => ({
                  marginTop: 16,
                  alignSelf: 'center',
                  paddingHorizontal: 24,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: palette.surface,
                  borderWidth: 1,
                  borderColor: palette.border,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Text style={{ color: palette.textBody, fontSize: 13, fontWeight: '700' }}>{t('composer.close')}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

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
