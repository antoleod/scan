import React, { forwardRef, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, Text, TextInput, useWindowDimensions, View } from 'react-native';
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
  onTakePhoto: () => void;
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
      onTakePhoto,
      onPasteImage,
      onSave,
      onSetCategory,
      generating,
    },
    ref
  ) {
    const [inputHeight, setInputHeight] = useState(96);
    const [pickerVisible, setPickerVisible] = useState(false);
    const [hoveredAction, setHoveredAction] = useState<string | null>(null);
    const { width } = useWindowDimensions();
    const isCompact = width < 520;

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
      { key: 'camera', label: 'Camera', icon: 'camera-outline' as const, action: onTakePhoto, active: false },
      { key: 'photo', label: 'Gallery', icon: 'image-outline' as const, action: onAddImage, active: draftImages.length > 0 },
      { key: 'paste', label: 'Paste', icon: 'clipboard-text-outline' as const, action: onPasteImage, active: false },
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
            gap: isCompact ? 10 : 16,
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {actionItems.map((item) => {
              const active = item.active;
              return (
                <View key={item.key} style={{ alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                  {hoveredAction === item.key ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: -30,
                        left: '50%',
                        transform: [{ translateX: -34 }],
                        minWidth: 68,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 8,
                        backgroundColor: '#111111',
                        borderWidth: 1,
                        borderColor: palette.chipBorder,
                        zIndex: 20,
                      }}
                    >
                      <Text style={{ color: palette.textBody, fontSize: 11, fontWeight: '600', textAlign: 'center' }}>{item.label}</Text>
                    </View>
                  ) : null}
                  <Pressable
                    accessibilityLabel={item.label}
                    onPress={item.action}
                    hitSlop={6}
                    onHoverIn={() => setHoveredAction(item.key)}
                    onHoverOut={() => setHoveredAction((current) => (current === item.key ? null : current))}
                    style={({ pressed }) => ({
                      width: isCompact ? 36 : 38,
                      height: isCompact ? 36 : 38,
                      borderRadius: 10,
                      backgroundColor: palette.surfaceAlt,
                      borderWidth: 1,
                      borderColor: active ? palette.accent : palette.chipBorder,
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: pressed ? 0.84 : 1,
                    })}
                  >
                    <MaterialCommunityIcons name={item.icon} size={isCompact ? 17 : 18} color={active ? palette.accent : palette.textDim} />
                  </Pressable>
                </View>
              );
            })}
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

      </View>
    );
  }
);
