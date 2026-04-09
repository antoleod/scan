import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCtrlEnterSave } from '../hooks/useCtrlEnterSave';

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

    // Ctrl+Enter / Cmd+Enter → save (only when there's something to save)
    useCtrlEnterSave(onSave, Boolean(draftText.trim() || draftImages.length > 0));

    useEffect(() => {
      if (!draftText.trim()) {
        setInputHeight(96);
      }
    }, [draftText]);

    const activeGroupLabel = useMemo(() => {
      if (activeGroupId === 'personal') return 'Personal';
      return groups.find((group) => group.id === activeGroupId)?.name || 'Personal';
    }, [activeGroupId, groups]);

    const actionItems = [
      { key: 'photo', label: 'Photo', icon: 'image-outline' as const, action: onAddImage, active: draftImages.length > 0 },
      { key: 'paste', label: 'Paste', icon: 'clipboard-text-outline' as const, action: onPasteImage, active: false },
      { key: 'save', label: 'Save', icon: 'content-save-outline' as const, action: onSave, active: false },
      { key: 'generate', label: 'Generate', icon: 'auto-fix' as const, action: onGenerate, active: false },
    ];

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
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }} contentContainerStyle={{ gap: 12, paddingRight: 8 }}>
          {actionItems.map((item) => {
            const active = item.active || (item.key === 'generate' && generating);
            return (
              <Pressable
                key={item.key}
                onPress={item.action}
                hitSlop={8}
                style={({ pressed }) => ({
                  alignItems: 'center',
                  gap: 4,
                  minWidth: 56,
                  opacity: pressed ? 0.84 : 1,
                })}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    backgroundColor: active ? '#1A0A00' : palette.surfaceAlt,
                    borderWidth: 1,
                    borderColor: active ? palette.accent : palette.chipBorder,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={20}
                    color={active ? palette.accent : palette.textDim}
                  />
                </View>
                <Text style={{ color: active ? palette.accent : palette.textDim, fontSize: 10, fontWeight: '400' }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    );
  }
);
