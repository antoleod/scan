import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

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

type NoteCategory = 'general' | 'work';

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
  onAddImage: () => void;
  onPasteImage: () => void;
  onSave: () => void;
  onSetCategory: (category: NoteCategory) => void;
  generating?: boolean;
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
      onAddImage,
      onPasteImage,
      onSave,
      onSetCategory,
      generating,
    },
    ref
  ) {
    const [inputHeight, setInputHeight] = useState(96);
    const [pickerVisible, setPickerVisible] = useState(false);

    useEffect(() => {
      if (!draftText.trim()) {
        setInputHeight(96);
      }
    }, [draftText]);

    const activeGroupLabel = useMemo(() => {
      if (activeGroupId === 'personal') return 'Personal';
      return groups.find((group) => group.id === activeGroupId)?.name || 'Personal';
    }, [activeGroupId, groups]);

    return (
      <View style={{ width: '100%' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <Text style={{ color: palette.textMuted, fontSize: 12, fontWeight: '500' }}>Group:</Text>
            <Pressable
              onPress={() => setPickerVisible(true)}
              hitSlop={8}
              style={({ pressed }) => ({
                height: 28,
                paddingHorizontal: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: '#333333',
                backgroundColor: palette.surfaceAlt,
                justifyContent: 'center',
                opacity: pressed ? 0.82 : 1,
                minWidth: 0,
              })}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ color: palette.textBody, fontSize: 13, fontWeight: '500' }} numberOfLines={1}>
                  {activeGroupLabel}
                </Text>
                <Ionicons name="chevron-down" size={13} color={palette.textMuted} />
              </View>
            </Pressable>
          </View>

          <Pressable
            onPress={onGenerate}
            disabled={generating}
            style={({ pressed }) => ({
              height: 32,
              paddingHorizontal: 12,
              borderRadius: 8,
              backgroundColor: palette.surfaceAlt,
              borderWidth: 1,
              borderColor: palette.surfaceAlt,
              justifyContent: 'center',
              opacity: pressed || generating ? 0.84 : 1,
            })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles-outline" size={15} color={palette.accent} />
              <Text style={{ color: palette.accent, fontSize: 13, fontWeight: '600' }}>{generating ? 'Analyzing...' : 'Generate'}</Text>
            </View>
          </Pressable>
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
                padding: 14,
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
          ref={ref}
          value={draftText}
          onChangeText={onChangeText}
          multiline
          placeholder="Type here. Auto-save is always on."
          placeholderTextColor={palette.textMuted}
          onContentSizeChange={(event) => {
            const nextHeight = Math.max(96, Math.min(200, event.nativeEvent.contentSize.height + 24));
            setInputHeight(nextHeight);
          }}
          style={{
            marginTop: 12,
            minHeight: 96,
            height: inputHeight,
            maxHeight: 200,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: palette.surface,
            paddingHorizontal: 12,
            paddingVertical: 12,
            color: palette.textBody,
            fontSize: 14,
            lineHeight: 21,
            textAlignVertical: 'top',
          }}
        />

        <View style={{ marginTop: 10, flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {([
            { key: 'general', label: 'General' },
            { key: 'work', label: 'Work' },
          ] as const).map((item) => {
            const active = activeCategory === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => onSetCategory(item.key)}
                hitSlop={6}
                style={({ pressed }) => ({
                  height: 32,
                  paddingHorizontal: 14,
                  borderRadius: 99,
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: active ? palette.accent : palette.chipBorder,
                  backgroundColor: active ? palette.accent : palette.surfaceAlt,
                  opacity: pressed ? 0.84 : 1,
                })}
              >
                <Text style={{ color: active ? '#000000' : palette.textMuted, fontSize: 12, fontWeight: active ? '600' : '500' }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}

          {[
            { key: 'photo', icon: 'image-outline' as const, action: onAddImage, active: draftImages.length > 0 },
            { key: 'clipboard', icon: 'clipboard-outline' as const, action: onPasteImage, active: false },
            { key: 'save', icon: 'save-outline' as const, action: onSave, active: false },
          ].map((item) => {
            const active = item.active;
            return (
              <Pressable
                key={item.key}
                onPress={item.action}
                hitSlop={6}
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: active ? palette.accent : palette.chipBorder,
                  backgroundColor: palette.surfaceAlt,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.84 : 1,
                })}
              >
                <Ionicons name={item.icon} size={15} color={active ? palette.accent : palette.textDim} />
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }
);
