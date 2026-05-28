/**
 * LanguagePromptModal.tsx
 * First-run language chooser shown the very first time the app is used without
 * an account (guest). Persists the choice to AppSettings + marks it as chosen so
 * it never appears again. Reuses LanguagePicker for the chip selection.
 */
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAppTheme } from '../constants/theme';
import i18n, { markUiLanguageChosen } from '../i18n';
import { normalizeUiLanguage, type UiLanguage } from '../i18n/languages';
import { loadSettings, saveSettings } from '../core/settings';
import { LanguagePicker } from './LanguagePicker';

interface LanguagePromptModalProps {
  visible: boolean;
  onDone: () => void;
}

export function LanguagePromptModal({ visible, onDone }: LanguagePromptModalProps) {
  const { t } = useTranslation();
  const { theme } = useAppTheme();
  const [language, setLanguage] = useState<UiLanguage>(() => normalizeUiLanguage(i18n.language));

  const handleContinue = async () => {
    try {
      const prev = await loadSettings();
      await saveSettings({ ...prev, uiLanguage: language });
    } catch {
      // Non-critical: live i18next language already applied via the picker.
    }
    await markUiLanguageChosen();
    onDone();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDone}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }]}>{t('language.chooseTitle')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>{t('language.chooseSubtitle')}</Text>

          <View style={styles.pickerWrap}>
            <LanguagePicker
              value={language}
              onChange={setLanguage}
              accentColor={theme.secondary}
              textColor={theme.textSecondary}
              borderColor={theme.border}
              surfaceColor={theme.inputBg}
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('language.continue')}
            onPress={handleContinue}
            style={[styles.button, { backgroundColor: theme.secondary }]}
          >
            <Text style={[styles.buttonText, { color: theme.primary }]}>{t('language.continue')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: 16, borderWidth: 1, padding: 22, gap: 14 },
  title: { fontSize: 20, fontWeight: '800', letterSpacing: 0.3 },
  subtitle: { fontSize: 13, lineHeight: 18 },
  pickerWrap: { marginVertical: 6 },
  button: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonText: { fontSize: 15, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
});
