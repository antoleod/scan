import React, { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Palette = {
  bg: string;
  fg: string;
  accent: string;
  muted: string;
  card: string;
  border: string;
};

interface MenuItem {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}

export function ProfileMenu({
  visible,
  email,
  palette,
  onClose,
  menuItems,
}: {
  visible: boolean;
  email: string;
  palette: Palette;
  onClose: () => void;
  menuItems: MenuItem[];
}) {
  const handleMenuPress = (onPress: () => void) => {
    onPress();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.3)' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            position: 'absolute',
            top: 56,
            right: 16,
            backgroundColor: palette.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.border,
            minWidth: 200,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 4,
          }}
        >
          {/* Header */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border }}>
            <Text style={{ color: palette.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase' }}>Account</Text>
            <Text style={{ color: palette.fg, fontSize: 13, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
              {email}
            </Text>
          </View>

          {/* Menu items */}
          <View>
            {menuItems.map((item, index) => (
              <Pressable
                key={index}
                onPress={() => handleMenuPress(item.onPress)}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  backgroundColor: pressed ? `${palette.accent}15` : 'transparent',
                  borderBottomWidth: index < menuItems.length - 1 ? 1 : 0,
                  borderBottomColor: palette.border,
                })}
              >
                <Ionicons name={item.icon} size={18} color={item.destructive ? '#ef4444' : palette.muted} />
                <Text style={{ color: item.destructive ? '#ef4444' : palette.fg, fontSize: 13, fontWeight: '500', flex: 1 }}>
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
