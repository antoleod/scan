/**
 * LanguagePicker.tsx
 * Reusable EN/ES/FR/NL chip selector for the UI language. Used by the register
 * form and the first-run guest language prompt. Changing the selection updates
 * i18next live; persisting it to AppSettings is the caller's responsibility.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { setUiLanguage } from '../i18n';
import { UI_LANGUAGES, UI_LANGUAGE_LABELS, type UiLanguage } from '../i18n/languages';

interface LanguagePickerProps {
  value: UiLanguage;
  onChange: (language: UiLanguage) => void;
  accentColor: string;
  textColor: string;
  borderColor: string;
  surfaceColor: string;
}

export function LanguagePicker({
  value,
  onChange,
  accentColor,
  textColor,
  borderColor,
  surfaceColor,
}: LanguagePickerProps) {
  return (
    <View style={styles.row}>
      {UI_LANGUAGES.map((code) => {
        const active = value === code;
        return (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityLabel={UI_LANGUAGE_LABELS[code]}
            accessibilityState={{ selected: active }}
            onPress={() => {
              setUiLanguage(code);
              onChange(code);
            }}
            style={[
              styles.chip,
              {
                borderColor: active ? accentColor : borderColor,
                backgroundColor: active ? `${accentColor}28` : surfaceColor,
              },
            ]}
          >
            <Text style={[styles.chipText, { color: active ? accentColor : textColor }]}>
              {UI_LANGUAGE_LABELS[code]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: '800' },
});
