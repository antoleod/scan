import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
  Platform,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useAppTheme } from '../constants/theme';
import { WorkflowMetadata } from '../core/notes';

interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

interface ShoppingWorkflowModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (metadata: WorkflowMetadata) => void;
  initialItems?: string[];
}

export function ShoppingWorkflowModal({
  visible,
  onClose,
  onSave,
  initialItems = [],
}: ShoppingWorkflowModalProps) {
  const { theme } = useAppTheme();
  const [items, setItems] = useState<ChecklistItem[]>(
    initialItems.map((text, idx) => ({
      id: `item_${idx}_${Date.now()}`,
      text,
      completed: false,
    }))
  );
  const [newItemText, setNewItemText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setItems(
      initialItems.map((text, idx) => ({
        id: `item_${idx}_${Date.now()}`,
        text,
        completed: false,
      })),
    );
    setNewItemText('');
  }, [initialItems, visible]);

  const handleAddItem = () => {
    if (!newItemText.trim()) return;
    setItems([
      ...items,
      {
        id: `item_${Date.now()}_${Math.random()}`,
        text: newItemText.trim(),
        completed: false,
      },
    ]);
    setNewItemText('');
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter(item => item.id !== id));
  };

  const handleToggleItem = (id: string) => {
    setItems(
      items.map(item =>
        item.id === id ? { ...item, completed: !item.completed } : item
      )
    );
  };

  const handleSave = async () => {
    if (items.length === 0) return;

    setIsLoading(true);
    try {
      const metadata: WorkflowMetadata = {
        checklistItems: items,
        extractedFromText: true,
      };
      onSave(metadata);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Ionicons name="chevron-back" size={24} color={theme.secondary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Shopping Checklist</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.intro}>
            <Text style={[styles.introTitle, { color: theme.text }]}>
              Review your shopping list
            </Text>
            <Text style={[styles.introText, { color: theme.textSecondary }]}>
              Add anything else you want to attach before creating it.
            </Text>
          </View>

          {/* Items list */}
          <View style={styles.itemsContainer}>
            {items.map(item => (
              <View key={item.id} style={[styles.itemRow, { backgroundColor: theme.surface }]}>
                <Pressable
                  onPress={() => handleToggleItem(item.id)}
                  style={styles.checkboxArea}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: theme.border,
                        backgroundColor: item.completed ? theme.secondary + '80' : 'transparent',
                      },
                    ]}
                  >
                    {item.completed && (
                      <Ionicons name="checkmark" size={16} color={theme.primary} />
                    )}
                  </View>
                </Pressable>
                <Text
                  style={[
                    styles.itemText,
                    {
                      color: item.completed ? theme.textSecondary : theme.text,
                      textDecorationLine: item.completed ? 'line-through' : 'none',
                    },
                  ]}
                >
                  {item.text}
                </Text>
                <Pressable onPress={() => handleRemoveItem(item.id)} style={styles.deleteButton}>
                  <Ionicons name="trash-outline" size={18} color={theme.error} />
                </Pressable>
              </View>
            ))}
          </View>

          {/* Add new item */}
          <View style={[styles.addItemSection, { backgroundColor: theme.surface }]}>
            <TextInput
              value={newItemText}
              onChangeText={setNewItemText}
              placeholder="Add item to list..."
              placeholderTextColor={theme.textSecondary}
              style={[
                styles.addItemInput,
                {
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                  color: theme.text,
                },
              ]}
              onSubmitEditing={handleAddItem}
            />
            <Pressable
              onPress={handleAddItem}
              disabled={!newItemText.trim()}
              style={[
                styles.addButton,
                {
                  backgroundColor: theme.secondary,
                  opacity: newItemText.trim() ? 1 : 0.4,
                },
              ]}
            >
              <Ionicons name="add" size={20} color={theme.primary} />
            </Pressable>
          </View>

          {/* Info */}
          <View style={styles.info}>
            <Text style={[styles.infoText, { color: theme.textSecondary }]}>
              {items.filter(i => i.completed).length} of {items.length} items completed
            </Text>
          </View>
        </ScrollView>

        {/* Footer buttons */}
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Pressable
            onPress={onClose}
            style={[styles.button, { borderColor: theme.border }]}
          >
            <Text style={[styles.buttonText, { color: theme.text }]}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleSave}
            disabled={items.length === 0 || isLoading}
            style={[
              styles.button,
              styles.primaryButton,
              {
                backgroundColor: theme.secondary,
                opacity: items.length > 0 && !isLoading ? 1 : 0.5,
              },
            ]}
          >
            {isLoading ? (
              <ActivityIndicator color={theme.primary} />
            ) : (
              <Text style={[styles.buttonText, { color: theme.primary }]}>Create</Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    flex: 1,
  },
  intro: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 4,
  },
  introTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  introText: {
    fontSize: 12,
    lineHeight: 16,
  },
  itemsContainer: {
    padding: 12,
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  checkboxArea: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  deleteButton: {
    padding: 8,
  },
  addItemSection: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  addItemInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  infoText: {
    fontSize: 12,
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  primaryButton: {
    borderWidth: 0,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
