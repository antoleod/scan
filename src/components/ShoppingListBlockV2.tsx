/**
 * ShoppingListBlockV2.tsx
 * Clean, category-grouped shopping list with intelligent UI.
 *
 * Features:
 * - Compact category headers with item count
 * - No reorder arrows (hidden unless editing)
 * - Badges for tags (école, bio, fresh, etc.)
 * - Simplified toolbar (Add + Copy, rest in menu)
 * - Quick quantity editor (bottom sheet)
 * - Responsive mobile-first design
 */

import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import {
  ShoppingItemV2,
  ShoppingListV2,
  parseShoppingListV2,
  getCategoryLabel,
  getCategoryEmoji,
  shoppingListV2ToText,
  GroceryCategory,
  AppLanguage,
  createShoppingItemFromCatalog,
  inferCategoryFromText,
} from '../core/shoppingListV2';
import { findGroceryById } from '../utils/groceryDetection';
import { loadFavorites, saveFavorites, loadQtyMemory, saveQtyMemory, FavoriteItem } from '../core/shoppingStorage';
import { SHOPPING_TEMPLATES, ShoppingTemplate } from '../core/shoppingTemplates';
import { GROCERY_CATALOG } from '../data/groceryCatalog';

type Palette = {
  bg: string;
  accent: string;
  border: string;
  surface: string;
  surfaceAlt: string;
  textBody: string;
  textDim: string;
  textMuted: string;
  textPrimary: string;
};

const CART = '#22C55E';
const DONE_BG = 'rgba(34,197,94,0.08)';
const DONE_BORDER = 'rgba(34,197,94,0.25)';

// ─── Category Header ─────────────────────────────────────────────────────

function CategoryHeader({
  category,
  count,
  emoji,
  label,
  palette,
}: {
  category: GroceryCategory;
  count: number;
  emoji: string;
  label: string;
  palette: Palette;
}) {
  if (count === 0) return null;

  return (
    <View
      style={{
        marginTop: 8,
        marginBottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 2,
      }}
    >
      <Text style={{ fontSize: 14 }}>{emoji}</Text>
      <Text
        style={{
          flex: 1,
          fontSize: 10,
          fontWeight: '700',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          color: palette.textDim,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          paddingHorizontal: 6,
          paddingVertical: 1,
          borderRadius: 999,
          backgroundColor: `${CART}15`,
          borderWidth: 1,
          borderColor: `${CART}30`,
        }}
      >
        <Text style={{ fontSize: 9, fontWeight: '700', color: CART }}>
          {count}
        </Text>
      </View>
    </View>
  );
}

// ─── Item Row (compact) ──────────────────────────────────────────────────

function ItemRowV2({
  item,
  palette,
  onToggle,
  onDelete,
  onEditQty,
  onUpdateName,
  onToggleFavorite,
  onUpdateNote,
  editMode,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  item: ShoppingItemV2;
  palette: Palette;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onEditQty: (id: string) => void;
  onUpdateName: (id: string, name: string) => void;
  onToggleFavorite: (id: string) => void;
  onUpdateNote: (id: string, note: string) => void;
  editMode: boolean;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const done = item.checked ?? false;
  const [nameEdit, setNameEdit] = useState(item.name);
  const [noteEdit, setNoteEdit] = useState(item.note || '');

  // Get suggested quantity from catalog
  const suggestedQty = useMemo(() => {
    if (item.catalogId && !item.quantity) {
      const catalog = findGroceryById(item.catalogId);
      return catalog?.defaultQuantity || null;
    }
    return null;
  }, [item.catalogId, item.quantity]);

  const handleCheck = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.07, duration: 70, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 110, useNativeDriver: true }),
    ]).start();
    onToggle(item.id);
  }, [item.id, onToggle, scale]);

  const handleNameBlur = useCallback(() => {
    if (nameEdit.trim() !== item.name) {
      onUpdateName(item.id, nameEdit.trim());
    } else {
      setNameEdit(item.name);
    }
  }, [item.id, item.name, nameEdit, onUpdateName]);

  const handleNoteBlur = useCallback(() => {
    if (noteEdit.trim() !== (item.note || '')) {
      onUpdateNote(item.id, noteEdit.trim());
    } else {
      setNoteEdit(item.note || '');
    }
  }, [item.id, item.note, noteEdit, onUpdateNote]);

  return (
    <Animated.View style={{ transform: [{ scale }], marginBottom: 4 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 5,
          paddingHorizontal: 8,
          borderRadius: 7,
          borderWidth: 1,
          borderColor: done ? DONE_BORDER : palette.border,
          backgroundColor: done ? DONE_BG : 'transparent',
        }}
      >
        {/* Reorder arrows (edit mode only) */}
        {editMode && (
          <View style={{ gap: 1 }}>
            <Pressable
              onPress={() => onMoveUp?.(item.id)}
              hitSlop={6}
              style={{ opacity: canMoveUp ? 0.7 : 0.2 }}
              disabled={!canMoveUp}
            >
              <Ionicons name="chevron-up" size={10} color={palette.textDim} />
            </Pressable>
            <Pressable
              onPress={() => onMoveDown?.(item.id)}
              hitSlop={6}
              style={{ opacity: canMoveDown ? 0.7 : 0.2 }}
              disabled={!canMoveDown}
            >
              <Ionicons name="chevron-down" size={10} color={palette.textDim} />
            </Pressable>
          </View>
        )}

        {/* Checkbox */}
        <Pressable
          onPress={handleCheck}
          hitSlop={10}
          style={{
            width: 16,
            height: 16,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: done ? CART : palette.textDim,
            backgroundColor: done ? CART : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {done ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
        </Pressable>

        {/* Label + Tags + Suggested Qty */}
          <View style={{ flex: 1, gap: 2 }}>
          {editMode ? (
            <TextInput
              value={nameEdit}
              onChangeText={setNameEdit}
              onBlur={handleNameBlur}
              placeholder="Item name"
              autoFocus
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: palette.textBody,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: CART,
                paddingHorizontal: 8,
                paddingVertical: 4,
              }}
            />
          ) : (
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: done ? palette.textMuted : palette.textBody,
                textDecorationLine: done ? 'line-through' : 'none',
                opacity: done ? 0.55 : 1,
              }}
              numberOfLines={1}
            >
              {item.name}
            </Text>
          )}

          {/* Tag badges + Suggested quantity */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
            {item.tags.map((tag) => (
              <View
                key={tag}
                style={{
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  borderRadius: 4,
                  backgroundColor: `${palette.accent}20`,
                  borderWidth: 0.5,
                  borderColor: `${palette.accent}40`,
                }}
              >
                <Text
                  style={{
                    fontSize: 8,
                    fontWeight: '600',
                    color: palette.accent,
                    textTransform: 'lowercase',
                  }}
                >
                  {tag}
                </Text>
              </View>
            ))}

            {/* Suggested quantity button */}
            {suggestedQty && (
              <Pressable
                onPress={() => {
                  onEditQty(item.id);
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 5,
                  paddingVertical: 1,
                  borderRadius: 4,
                  backgroundColor: pressed ? '#FCD34D22' : '#FCD34D0d',
                  borderWidth: 0.5,
                  borderColor: '#FCD34D44',
                })}
              >
                <Text
                  style={{
                    fontSize: 8,
                    fontWeight: '500',
                    color: '#D97706',
                    textTransform: 'lowercase',
                  }}
                >
                  suggested: {suggestedQty}
                </Text>
              </Pressable>
            )}
          </View>
        </View>

        {/* Quantity + Unit (only if present) */}
        {(item.quantity || item.unit) && (
          <Pressable
            onPress={() => onEditQty(item.id)}
            style={({ pressed }) => ({
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: pressed ? CART : `${CART}40`,
              backgroundColor: pressed ? `${CART}15` : `${CART}08`,
            })}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: CART,
                opacity: done ? 0.5 : 1,
              }}
            >
              {item.quantity}
              {item.unit ? ` ${item.unit}` : ''}
            </Text>
          </Pressable>
        )}

        {/* Star button (favorite) */}
        <Pressable
          onPress={() => onToggleFavorite(item.id)}
          hitSlop={10}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 0.7 })}
        >
          <Ionicons
            name={item.isFavorite ? 'star' : 'star-outline'}
            size={14}
            color={item.isFavorite ? '#FCD34D' : palette.textDim}
          />
        </Pressable>

        {/* Delete button */}
        {editMode && (
          <Pressable
            onPress={() => onDelete(item.id)}
            hitSlop={10}
            style={({ pressed }) => ({ opacity: pressed ? 0.4 : 0.6 })}
          >
            <Ionicons name="close-circle-outline" size={14} color={palette.textDim} />
          </Pressable>
        )}
      </View>

      {/* Note section (edit mode or when note exists) */}
      {editMode && (
        <TextInput
          value={noteEdit}
          onChangeText={setNoteEdit}
          onBlur={handleNoteBlur}
          placeholder="Add a note..."
          style={{
            fontSize: 11,
            fontWeight: '500',
            color: palette.textDim,
            marginTop: 6,
            marginBottom: 4,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: `${palette.accent}40`,
            paddingHorizontal: 8,
            paddingVertical: 4,
            backgroundColor: `${palette.accent}08`,
          }}
        />
      )}
      {!editMode && item.note && (
        <Text style={{ fontSize: 10, fontStyle: 'italic', color: palette.textMuted, marginTop: 4 }}>
          📝 {item.note}
        </Text>
      )}
    </Animated.View>
  );
}

// ─── Quick Quantity Editor (Bottom Sheet) ─────────────────────────────────

function QtyEditorSheet({
  item,
  visible,
  palette,
  onClose,
  onSave,
  initialQtyOverride,
  initialUnitOverride,
}: {
  item: ShoppingItemV2 | null;
  visible: boolean;
  palette: Palette;
  onClose: () => void;
  onSave: (qty?: number, unit?: string) => void;
  initialQtyOverride?: number;
  initialUnitOverride?: string;
}) {
  const [qty, setQty] = useState(item?.quantity?.toString() || '');
  const [unit, setUnit] = useState(item?.unit || '');

  useEffect(() => {
    if (initialQtyOverride !== undefined) {
      setQty(initialQtyOverride.toString());
    } else {
      setQty(item?.quantity?.toString() || '');
    }

    if (initialUnitOverride !== undefined) {
      setUnit(initialUnitOverride);
    } else {
      setUnit(item?.unit || '');
    }
  }, [item?.id]);

  const units = ['unit', 'g', 'kg', 'ml', 'L', 'pack'];

  // Compute quantity shortcuts based on unit
  const shortcuts = useMemo(() => {
    const shortcutMap: Record<string, Array<{ label: string; qty: number; unit: string }>> = {
      unit: [
        { label: '1', qty: 1, unit: 'unit' },
        { label: '2', qty: 2, unit: 'unit' },
        { label: '3', qty: 3, unit: 'unit' },
        { label: '4', qty: 4, unit: 'unit' },
        { label: '6', qty: 6, unit: 'unit' },
        { label: '12', qty: 12, unit: 'unit' },
      ],
      g: [
        { label: '100g', qty: 100, unit: 'g' },
        { label: '200g', qty: 200, unit: 'g' },
        { label: '500g', qty: 500, unit: 'g' },
      ],
      kg: [
        { label: '0.5kg', qty: 0.5, unit: 'kg' },
        { label: '1kg', qty: 1, unit: 'kg' },
        { label: '2kg', qty: 2, unit: 'kg' },
      ],
      ml: [
        { label: '100ml', qty: 100, unit: 'ml' },
        { label: '250ml', qty: 250, unit: 'ml' },
        { label: '500ml', qty: 500, unit: 'ml' },
      ],
      L: [
        { label: '0.5L', qty: 0.5, unit: 'L' },
        { label: '1L', qty: 1, unit: 'L' },
        { label: '2L', qty: 2, unit: 'L' },
      ],
      pack: [
        { label: '1', qty: 1, unit: 'pack' },
        { label: '2', qty: 2, unit: 'pack' },
        { label: '3', qty: 3, unit: 'pack' },
      ],
    };
    return shortcutMap[unit] || shortcutMap.unit;
  }, [unit]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            backgroundColor: palette.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            padding: 20,
            gap: 16,
            paddingBottom: 32,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: '700',
                color: palette.textBody,
              }}
            >
              {item?.name}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={20} color={palette.textDim} />
            </Pressable>
          </View>

          {/* Quantity Input */}
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'uppercase',
                color: palette.textDim,
              }}
            >
              Quantity
            </Text>
            <TextInput
              value={qty}
              onChangeText={setQty}
              keyboardType="decimal-pad"
              placeholder="e.g., 3"
              style={{
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 10,
                fontSize: 14,
                color: palette.textBody,
              }}
            />
          </View>

          {/* Quantity Shortcuts */}
          <View style={{ gap: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'uppercase',
                color: palette.textDim,
              }}
            >
              Quick shortcuts
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6 }}
            >
              {shortcuts.map((shortcut) => (
                <Pressable
                  key={shortcut.label}
                  onPress={() => {
                    setQty(shortcut.qty.toString());
                    setUnit(shortcut.unit);
                  }}
                  style={({ pressed: isPressed }) => ({
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: isPressed ? CART : palette.border,
                    backgroundColor: isPressed ? `${CART}15` : palette.surfaceAlt,
                  })}
                >
                  {({ pressed: isPressed }) => (
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: isPressed ? CART : palette.textBody,
                      }}
                    >
                      {shortcut.label}
                    </Text>
                  )}
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Unit Picker */}
          <View style={{ gap: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                textTransform: 'uppercase',
                color: palette.textDim,
              }}
            >
              Unit
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8 }}
            >
              {units.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => setUnit(u)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor: unit === u ? CART : palette.border,
                    backgroundColor: unit === u ? `${CART}15` : pressed ? palette.surfaceAlt : 'transparent',
                  })}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: unit === u ? CART : palette.textDim,
                    }}
                  >
                    {u}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable
              onPress={() => {
                setQty('');
                setUnit('');
                onSave(undefined, undefined);
              }}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: palette.border,
                alignItems: 'center',
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: palette.textBody }}>
                Clear
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                onSave(
                  qty ? parseFloat(qty) : undefined,
                  unit || undefined
                )
              }
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: CART,
                alignItems: 'center',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#fff' }}>
                Save
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Menu (secondary actions) ────────────────────────────────────────────

function MenuButton({
  palette,
  onShare,
  onEditRaw,
  onReset,
  onClearDone,
  onLoadTemplate,
  hasChecked,
}: {
  palette: Palette;
  onShare: () => void;
  onEditRaw: () => void;
  onReset: () => void;
  onClearDone: () => void;
  onLoadTemplate: () => void;
  hasChecked: boolean;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setShowMenu(!showMenu)}
        accessibilityRole="button"
        accessibilityLabel="Open shopping list actions"
        accessibilityState={{ expanded: showMenu }}
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          borderRadius: 8,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Ionicons name="ellipsis-vertical" size={16} color={palette.textDim} />
      </Pressable>

      {showMenu && (
        <View
          style={{
            position: 'absolute',
            top: 40,
            right: 0,
            backgroundColor: palette.surface,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: palette.border,
            overflow: 'hidden',
            minWidth: 140,
            zIndex: 100,
          }}
        >
          <MenuItem
            icon="share-social-outline"
            label="Share list"
            onPress={() => {
              setShowMenu(false);
              onShare();
            }}
          />
          <MenuItem
            icon="code-outline"
            label="Edit raw"
            onPress={() => {
              setShowMenu(false);
              onEditRaw();
            }}
          />
          <MenuItem
            icon="layers-outline"
            label="Load template"
            onPress={() => {
              setShowMenu(false);
              onLoadTemplate();
            }}
          />
          {hasChecked && (
            <MenuItem
              icon="refresh-outline"
              label="Reset all"
              onPress={() => {
                setShowMenu(false);
                onReset();
              }}
            />
          )}
        </View>
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  color = '#666',
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        backgroundColor: pressed ? 'rgba(0,0,0,0.05)' : 'transparent',
      })}
    >
      <Ionicons name={icon} size={12} color={color} />
      <Text style={{ fontSize: 12, fontWeight: '500', color }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── Template Picker Modal ───────────────────────────────────────────────

function TemplatePickerModal({
  visible,
  palette,
  onClose,
  onSelect,
}: {
  visible: boolean;
  palette: Palette;
  onClose: () => void;
  onSelect: (template: ShoppingTemplate) => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: 16,
        }}
      >
        <View
          style={{
            backgroundColor: palette.surface,
            borderRadius: 16,
            padding: 20,
            gap: 12,
            maxWidth: 400,
          }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: palette.textBody }}>
              Load Template
            </Text>
            <Pressable onPress={onClose} hitSlop={6}>
              <Ionicons name="close" size={20} color={palette.textDim} />
            </Pressable>
          </View>

          {SHOPPING_TEMPLATES.map((template) => (
            <Pressable
              key={template.id}
              onPress={() => {
                onSelect(template);
                onClose();
              }}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: 12,
                paddingVertical: 12,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: pressed ? palette.surfaceAlt : 'transparent',
              })}
            >
              <Text style={{ fontSize: 28 }}>{template.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: palette.textBody }}>
                  {template.label}
                </Text>
                <Text style={{ fontSize: 11, color: palette.textDim, marginTop: 2 }}>
                  {template.items.length} items
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

// ─── Duplicate Warning Banner ────────────────────────────────────────────

function DuplicateWarningBanner({
  item,
  palette,
  onAddAnyway,
  onUpdateQty,
  onCancel,
}: {
  item: ShoppingItemV2;
  palette: Palette;
  onAddAnyway: () => void;
  onUpdateQty: () => void;
  onCancel: () => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 4,
        marginVertical: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#F59E0B44',
        backgroundColor: '#F59E0B0d',
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 12, fontWeight: '600', color: palette.textBody }}>
        "{item.name}" already in the list
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onAddAnyway}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 8,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: palette.border,
            alignItems: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: palette.textBody }}>
            Add anyway
          </Text>
        </Pressable>
        <Pressable
          onPress={onUpdateQty}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 8,
            borderRadius: 6,
            backgroundColor: '#F59E0B22',
            alignItems: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: '#D97706' }}>
            Update qty
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── All Done Banner ─────────────────────────────────────────────────────

function AllDoneBanner({
  palette,
  onKeepList,
  onClearDone,
}: {
  palette: Palette;
  onKeepList: () => void;
  onClearDone: () => void;
}) {
  return (
    <View
      style={{
        marginHorizontal: 4,
        marginVertical: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: `${CART}44`,
        backgroundColor: `${CART}0d`,
        gap: 8,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: palette.textBody }}>
        🎉 All done! Empty cart?
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onKeepList}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 8,
            borderRadius: 6,
            borderWidth: 1,
            borderColor: palette.border,
            alignItems: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 11, fontWeight: '600', color: palette.textBody }}>
            Keep list
          </Text>
        </Pressable>
        <Pressable
          onPress={onClearDone}
          style={({ pressed }) => ({
            flex: 1,
            paddingVertical: 8,
            borderRadius: 6,
            backgroundColor: `${CART}22`,
            alignItems: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: CART }}>
            Clear done
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

interface ShoppingListBlockV2Props {
  model: ShoppingListV2;
  palette: Palette;
  onRawTextChange: (newText: string) => void;
}

export function ShoppingListBlockV2({
  model,
  palette,
  onRawTextChange,
}: ShoppingListBlockV2Props) {
  const [items, setItems] = useState<ShoppingItemV2[]>(model.items);
  const [editMode, setEditMode] = useState(false);
  const [qtyEditorItem, setQtyEditorItem] = useState<ShoppingItemV2 | null>(null);
  const [qtyEditorVisible, setQtyEditorVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [addInputVisible, setAddInputVisible] = useState(false);
  const [addInputText, setAddInputText] = useState('');
  const [addSuggestions, setAddSuggestions] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [qtyMemory, setQtyMemory] = useState<Record<string, { qty: number; unit: string }>>({});
  const [templateModalVisible, setTemplateModalVisible] = useState(false);
  const [rawEditorVisible, setRawEditorVisible] = useState(false);
  const [rawEditorText, setRawEditorText] = useState('');
  const [allDoneBannerVisible, setAllDoneBannerVisible] = useState(false);
  const [duplicateWarning, setDuplicateWarning] = useState<ShoppingItemV2 | null>(null);
  const [qtyEditorInitialQty, setQtyEditorInitialQty] = useState<number | undefined>();
  const [qtyEditorInitialUnit, setQtyEditorInitialUnit] = useState<string | undefined>();
  const pendingAddItem = useRef<ShoppingItemV2 | null>(null);
  const addInputTimeout = useRef<NodeJS.Timeout | null>(null);

  // Load favorites and qty memory on mount
  useEffect(() => {
    loadFavorites().then((favs) => {
      setFavorites(favs);
      // Re-hydrate isFavorite on items
      setItems((prev) =>
        prev.map((it) =>
          it.catalogId && favs.some((f) => f.catalogId === it.catalogId)
            ? { ...it, isFavorite: true }
            : it
        )
      );
    });
    loadQtyMemory().then(setQtyMemory);
  }, []);

  // Auto-show all-done banner when all items checked
  useEffect(() => {
    const total = items.length;
    setAllDoneBannerVisible(total > 0 && items.every((i) => i.checked));
  }, [items]);

  const handleToggle = useCallback(
    (id: string) => {
      const next = items.map((it) =>
        it.id === id ? { ...it, checked: !it.checked } : it
      );
      setItems(next);
      onRawTextChange(shoppingListV2ToText(next));
    },
    [items, onRawTextChange]
  );

  const handleDelete = useCallback(
    (id: string) => {
      const next = items.filter((it) => it.id !== id);
      setItems(next);
      onRawTextChange(shoppingListV2ToText(next));
    },
    [items, onRawTextChange]
  );

  const handleEditQty = useCallback((id: string) => {
    const item = items.find((it) => it.id === id);
    if (item) {
      setQtyEditorItem(item);
      // Pre-fill from qtyMemory if available
      if (item.catalogId && qtyMemory[item.catalogId]) {
        const memory = qtyMemory[item.catalogId];
        setQtyEditorInitialQty(memory.qty);
        setQtyEditorInitialUnit(memory.unit);
      } else {
        setQtyEditorInitialQty(undefined);
        setQtyEditorInitialUnit(undefined);
      }
      setQtyEditorVisible(true);
    }
  }, [items, qtyMemory]);

  const handleSaveQty = useCallback(
    (qty?: number, unit?: string) => {
      if (!qtyEditorItem) return;

      const next = items.map((it) =>
        it.id === qtyEditorItem.id
          ? { ...it, quantity: qty, unit }
          : it
      );
      setItems(next);
      onRawTextChange(shoppingListV2ToText(next));

      // Save to qty memory if catalogId exists
      if (qtyEditorItem.catalogId && qty !== undefined && unit) {
        const newMemory = { ...qtyMemory, [qtyEditorItem.catalogId]: { qty, unit } };
        setQtyMemory(newMemory);
        void saveQtyMemory(newMemory);
      }

      setQtyEditorVisible(false);
      setQtyEditorItem(null);
      setQtyEditorInitialQty(undefined);
      setQtyEditorInitialUnit(undefined);
    },
    [items, qtyEditorItem, onRawTextChange, qtyMemory]
  );

  const handleMoveUp = useCallback(
    (id: string) => {
      const idx = items.findIndex((it) => it.id === id);
      if (idx <= 0) return;
      const next = [...items];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      setItems(next);
      onRawTextChange(shoppingListV2ToText(next));
    },
    [items, onRawTextChange]
  );

  const handleMoveDown = useCallback(
    (id: string) => {
      const idx = items.findIndex((it) => it.id === id);
      if (idx < 0 || idx >= items.length - 1) return;
      const next = [...items];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      setItems(next);
      onRawTextChange(shoppingListV2ToText(next));
    },
    [items, onRawTextChange]
  );

  const handleClearDone = useCallback(() => {
    const next = items.filter((it) => !it.checked);
    setItems(next);
    onRawTextChange(shoppingListV2ToText(next));
  }, [items, onRawTextChange]);

  const handleOpenRawEditor = useCallback(() => {
    setRawEditorText(shoppingListV2ToText(items));
    setRawEditorVisible(true);
  }, [items]);

  const handleSaveRawEditor = useCallback(() => {
    const parsed = parseShoppingListV2(rawEditorText, model.language);
    setItems(parsed.items);
    onRawTextChange(shoppingListV2ToText(parsed.items));
    setRawEditorVisible(false);
  }, [model.language, onRawTextChange, rawEditorText]);

  const handleResetAll = useCallback(() => {
    const next = items.map((it) => ({ ...it, checked: false }));
    setItems(next);
    onRawTextChange(shoppingListV2ToText(next));
  }, [items, onRawTextChange]);

  const handleUpdateName = useCallback(
    (id: string, name: string) => {
      const next = items.map((it) =>
        it.id === id ? { ...it, name } : it
      );
      setItems(next);
      onRawTextChange(shoppingListV2ToText(next));
    },
    [items, onRawTextChange]
  );

  // Filter items by search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;

    const query = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      const nameMatch = item.name.toLowerCase().includes(query);
      const tagMatch = item.tags.some((tag) => tag.toLowerCase().includes(query));
      const categoryLabel = getCategoryLabel(item.category, model.language).toLowerCase();
      const categoryMatch = categoryLabel.includes(query);
      return nameMatch || tagMatch || categoryMatch;
    });
  }, [items, searchQuery, model.language]);

  // Build filtered grouped by category
  const filteredGrouped = useMemo(() => {
    const grouped: Record<GroceryCategory, ShoppingItemV2[]> = {
      fruits: [],
      vegetables: [],
      meat: [],
      fish: [],
      dairy: [],
      bakery: [],
      drinks: [],
      pantry: [],
      frozen: [],
      snacks: [],
      baby_school: [],
      household: [],
      hygiene: [],
      other: [],
    };
    filteredItems.forEach((item) => {
      if (grouped[item.category]) {
        grouped[item.category].push(item);
      }
    });
    return grouped;
  }, [filteredItems]);

  const handleToggleFavorite = useCallback(
    (id: string) => {
      const item = items.find((it) => it.id === id);
      if (!item || !item.catalogId) return;

      const next = items.map((it) => (it.id === id ? { ...it, isFavorite: !it.isFavorite } : it));
      setItems(next);
      onRawTextChange(shoppingListV2ToText(next));

      // Update favorites list
      const isFav = !item.isFavorite;
      let newFavs = [...favorites];
      if (isFav) {
        newFavs.push({
          catalogId: item.catalogId,
          name: item.name,
          category: item.category,
        });
      } else {
        newFavs = newFavs.filter((f) => f.catalogId !== item.catalogId);
      }
      setFavorites(newFavs);
      void saveFavorites(newFavs);
    },
    [items, favorites, onRawTextChange]
  );

  const handleUpdateNote = useCallback(
    (id: string, note: string) => {
      const next = items.map((it) => (it.id === id ? { ...it, note: note || undefined } : it));
      setItems(next);
      onRawTextChange(shoppingListV2ToText(next));
    },
    [items, onRawTextChange]
  );

  const handleAddInputChange = useCallback((text: string) => {
    setAddInputText(text);

    if (addInputTimeout.current) {
      clearTimeout(addInputTimeout.current);
    }

    if (!text.trim()) {
      setAddSuggestions([]);
      return;
    }

    addInputTimeout.current = setTimeout(() => {
      const query = text.trim().toLowerCase();
      const filtered = GROCERY_CATALOG.filter((item) => {
        const names = [...(item.names[model.language] || []), ...(item.names.en || [])];
        return names.some((name) => name.toLowerCase().includes(query));
      }).slice(0, 6);
      setAddSuggestions(filtered);
    }, 150);
  }, [model.language]);

  const checkDuplicate = (name: string): ShoppingItemV2 | null => {
    const normalized = name.toLowerCase().trim();
    return items.find((it) => it.name.toLowerCase().includes(normalized) || normalized.includes(it.name.toLowerCase())) || null;
  };

  const handleSelectSuggestion = useCallback(
    (catalogItem: any) => {
      const newItem = createShoppingItemFromCatalog(catalogItem.id, model.language);
      if (!newItem) return;

      const dup = checkDuplicate(newItem.name);
      if (dup) {
        setDuplicateWarning(dup);
        pendingAddItem.current = newItem;
        return;
      }

      setItems((prev) => [...prev, newItem]);
      onRawTextChange(shoppingListV2ToText([...items, newItem]));
      setAddInputText('');
      setAddSuggestions([]);
      setAddInputVisible(false);
    },
    [items, model.language, onRawTextChange]
  );

  const handleAddInputSubmit = useCallback(() => {
    const name = addInputText.trim();
    if (!name) {
      setAddInputVisible(false);
      return;
    }

    const dup = checkDuplicate(name);
    if (dup) {
      setDuplicateWarning(dup);
      pendingAddItem.current = {
        id: `sl2_new_${Date.now()}`,
        name,
        category: inferCategoryFromText(name, model.language),
        tags: [],
        confidence: 0.8,
        originalText: name,
      };
      return;
    }

    const newItem: ShoppingItemV2 = {
      id: `sl2_new_${Date.now()}`,
      name,
      category: inferCategoryFromText(name, model.language),
      tags: [],
      confidence: 0.8,
      originalText: name,
    };

    setItems((prev) => [...prev, newItem]);
    onRawTextChange(shoppingListV2ToText([...items, newItem]));
    setAddInputText('');
    setAddSuggestions([]);
    setAddInputVisible(false);
  }, [addInputText, items, model.language, onRawTextChange]);

  const handleLoadTemplate = useCallback(
    (template: ShoppingTemplate) => {
      const newItems = template.items
        .map((itemSpec) => {
          const dup = items.some((it) => it.name.toLowerCase() === itemSpec.name.toLowerCase());
          if (dup) return null;

          if (itemSpec.catalogId) {
            const item = createShoppingItemFromCatalog(itemSpec.catalogId, model.language);
            if (item && itemSpec.quantity) item.quantity = itemSpec.quantity;
            if (item && itemSpec.unit) item.unit = itemSpec.unit;
            return item;
          }

          return {
            id: `sl2_new_${Date.now()}_${Math.random()}`,
            name: itemSpec.name,
            category: itemSpec.category,
            tags: [],
            confidence: 0.8,
            originalText: itemSpec.name,
            quantity: itemSpec.quantity,
            unit: itemSpec.unit,
          };
        })
        .filter((it): it is ShoppingItemV2 => it !== null);

      const combined = [...items, ...newItems];
      setItems(combined);
      onRawTextChange(shoppingListV2ToText(combined));
    },
    [items, model.language, onRawTextChange]
  );

  const handleShare = useCallback(async () => {
    const text = items
      .map((item) => {
        const checked = item.checked ? '✓ ' : '○ ';
        let line = `${checked}${item.name}`;
        if (item.quantity && item.unit) {
          line += ` — ${item.quantity} ${item.unit}`;
        } else if (item.quantity) {
          line += ` — ${item.quantity}`;
        }
        if (item.tags.length > 0) {
          line += ` [${item.tags.join(', ')}]`;
        }
        return line;
      })
      .join('\n');

    try {
      if (Platform.OS === 'web' && navigator.share) {
        await navigator.share({ text });
      } else {
        await Clipboard.setStringAsync(text);
      }
    } catch {
      // silent fail
    }
  }, [items]);

  const done = filteredItems.filter((i) => i.checked).length;
  const total = filteredItems.length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const hasChecked = done > 0;
  const compactMode = items.length > 6;
  const listMaxHeight = compactMode ? 400 : undefined;

  return (
    <View style={{ gap: 8 }}>
      {/* Favorites Quick-Add Chips */}
      {favorites.length > 0 && (
        <View style={{ paddingHorizontal: 4 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            {favorites.map((fav) => (
              <Pressable
                key={fav.catalogId}
                onPress={() => {
                  const item = createShoppingItemFromCatalog(fav.catalogId, model.language);
                  if (item) {
                    setItems((prev) => [...prev, item]);
                    onRawTextChange(shoppingListV2ToText([...items, item]));
                  }
                }}
                style={({ pressed }) => ({
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: `${CART}44`,
                  backgroundColor: pressed ? `${CART}22` : `${CART}0e`,
                })}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: CART,
                  }}
                >
                  ⭐ {fav.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Header with progress + inline action icons */}
      <View style={{ gap: 6 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 2,
          }}
        >
          {/* Left: cart icon + title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="cart-outline" size={13} color={CART} />
            <Text
              style={{
                fontSize: 10,
                fontWeight: '800',
                letterSpacing: 0.5,
                color: CART,
              }}
            >
              SHOPPING LIST
            </Text>
          </View>

          {/* Right: inline action icons + count */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {/* Add */}
            <Pressable
              onPress={() => setAddInputVisible(!addInputVisible)}
              hitSlop={8}
              style={{ opacity: addInputVisible ? 1 : 0.75 }}
            >
              <Ionicons
                name="add-circle-outline"
                size={15}
                color={addInputVisible ? CART : palette.textDim}
              />
            </Pressable>

            {/* Arrange / reorder */}
            <Pressable
              onPress={() => setEditMode(!editMode)}
              hitSlop={8}
              style={{ opacity: editMode ? 1 : 0.75 }}
            >
              <Ionicons
                name={editMode ? 'checkmark-done' : 'swap-vertical-outline'}
                size={15}
                color={editMode ? CART : palette.textDim}
              />
            </Pressable>

            {/* Search toggle */}
            <Pressable
              onPress={() => {
                setSearchVisible(v => !v);
                if (searchVisible) setSearchQuery('');
              }}
              hitSlop={8}
              style={{ opacity: searchVisible ? 1 : 0.75 }}
            >
              <Ionicons
                name="search-outline"
                size={14}
                color={searchVisible ? CART : palette.textDim}
              />
            </Pressable>

            {/* Menu */}
            <MenuButton
              palette={palette}
              onShare={handleShare}
              onEditRaw={handleOpenRawEditor}
              onReset={handleResetAll}
              onClearDone={handleClearDone}
              onLoadTemplate={() => setTemplateModalVisible(true)}
              hasChecked={hasChecked}
            />

            <Text style={{ fontSize: 10, fontWeight: '600', color: palette.textDim }}>
              {done}/{total}
            </Text>
          </View>
        </View>

        <View
          style={{
            height: 3,
            borderRadius: 99,
            backgroundColor: `${CART}22`,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${pct}%`,
              height: '100%',
              borderRadius: 99,
              backgroundColor: CART,
            }}
          />
        </View>
      </View>

      {/* Search bar — only visible when toggled */}
      {searchVisible && (
        <View style={{ paddingHorizontal: 2 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.surfaceAlt,
            }}
          >
            <Ionicons name="search-outline" size={12} color={palette.textDim} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search items, tags, category..."
              placeholderTextColor={palette.textMuted}
              autoFocus
              style={{
                flex: 1,
                fontSize: 12,
                color: palette.textBody,
                padding: 0,
              }}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={6}>
                <Ionicons name="close-circle" size={12} color={palette.textDim} />
              </Pressable>
            )}
          </View>
        </View>
      )}

      {/* Add Item Input + Suggestions */}
      {addInputVisible && (
        <View style={{ paddingHorizontal: 4, gap: 6 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: CART,
              backgroundColor: `${CART}0e`,
            }}
          >
            <Ionicons name="add-circle-outline" size={14} color={CART} />
            <TextInput
              value={addInputText}
              onChangeText={handleAddInputChange}
              onSubmitEditing={handleAddInputSubmit}
              placeholder="Type item name..."
              placeholderTextColor={palette.textMuted}
              autoFocus
              style={{
                flex: 1,
                fontSize: 13,
                color: palette.textBody,
                padding: 0,
              }}
            />
            {addInputText.length > 0 && (
              <Pressable onPress={() => { setAddInputText(''); setAddSuggestions([]); }} hitSlop={6}>
                <Ionicons name="close-circle" size={14} color={palette.textDim} />
              </Pressable>
            )}
          </View>

          {/* Suggestions */}
          {addSuggestions.length > 0 && (
            <View
              style={{
                borderRadius: 8,
                borderWidth: 1,
                borderColor: palette.border,
                backgroundColor: palette.surface,
                overflow: 'hidden',
              }}
            >
              {addSuggestions.map((item, idx) => (
                <Pressable
                  key={item.id}
                  onPress={() => handleSelectSuggestion(item)}
                  style={({ pressed }) => ({
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderBottomWidth: idx < addSuggestions.length - 1 ? 1 : 0,
                    borderBottomColor: palette.border,
                    backgroundColor: pressed ? palette.surfaceAlt : 'transparent',
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 16 }}>{getCategoryEmoji(item.category)}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '500', color: palette.textBody }}>
                      {item.names[model.language]?.[0] || item.names.en?.[0]}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Duplicate Warning Banner */}
      {duplicateWarning && (
        <DuplicateWarningBanner
          item={duplicateWarning}
          palette={palette}
          onAddAnyway={() => {
            if (pendingAddItem.current) {
              setItems((prev) => [...prev, pendingAddItem.current!]);
              onRawTextChange(shoppingListV2ToText([...items, pendingAddItem.current!]));
            }
            setDuplicateWarning(null);
            pendingAddItem.current = null;
            setAddInputText('');
            setAddInputVisible(false);
          }}
          onUpdateQty={() => {
            setDuplicateWarning(null);
            pendingAddItem.current = null;
            handleEditQty(duplicateWarning.id);
          }}
          onCancel={() => {
            setDuplicateWarning(null);
            pendingAddItem.current = null;
          }}
        />
      )}

      {/* All Done Banner */}
      {allDoneBannerVisible && (
        <AllDoneBanner
          palette={palette}
          onKeepList={() => setAllDoneBannerVisible(false)}
          onClearDone={handleClearDone}
        />
      )}

      {/* Items by category */}
      <ScrollView
        showsVerticalScrollIndicator={compactMode}
        scrollEnabled={compactMode}
        nestedScrollEnabled
        style={listMaxHeight ? { maxHeight: listMaxHeight } : undefined}
      >
        {searchQuery.length > 0 && total === 0 ? (
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 30,
              gap: 8,
            }}
          >
            <Ionicons name="search-outline" size={28} color={palette.textDim} />
            <Text style={{ fontSize: 12, color: palette.textDim }}>
              No items match "{searchQuery}"
            </Text>
          </View>
        ) : (
          Object.entries(filteredGrouped).map(([categoryKey, categoryItems]) => {
            if (categoryItems.length === 0) return null;
            const category = categoryKey as GroceryCategory;

            return (
              <View key={category}>
                <CategoryHeader
                  category={category}
                  count={categoryItems.length}
                  emoji={getCategoryEmoji(category)}
                  label={getCategoryLabel(category, model.language)}
                  palette={palette}
                />
                {categoryItems.map((item, idx) => (
                  <ItemRowV2
                    key={item.id}
                    item={item}
                    palette={palette}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onEditQty={handleEditQty}
                    onUpdateName={handleUpdateName}
                    onToggleFavorite={handleToggleFavorite}
                    onUpdateNote={handleUpdateNote}
                    editMode={editMode}
                    onMoveUp={handleMoveUp}
                    onMoveDown={handleMoveDown}
                    canMoveUp={idx > 0}
                    canMoveDown={idx < categoryItems.length - 1}
                  />
                ))}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Quantity editor sheet */}
      <QtyEditorSheet
        item={qtyEditorItem}
        visible={qtyEditorVisible}
        palette={palette}
        onClose={() => setQtyEditorVisible(false)}
        onSave={handleSaveQty}
        initialQtyOverride={qtyEditorInitialQty}
        initialUnitOverride={qtyEditorInitialUnit}
      />

      {/* Template picker modal */}
      <TemplatePickerModal
        visible={templateModalVisible}
        palette={palette}
        onClose={() => setTemplateModalVisible(false)}
        onSelect={handleLoadTemplate}
      />

      <Modal visible={rawEditorVisible} transparent animationType="fade" onRequestClose={() => setRawEditorVisible(false)}>
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.5)',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: palette.surface,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: palette.border,
              padding: 16,
              gap: 12,
              maxWidth: 520,
              width: '100%',
              alignSelf: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ color: palette.textBody, fontSize: 16, fontWeight: '700' }}>Edit raw list</Text>
              <Pressable
                onPress={() => setRawEditorVisible(false)}
                accessibilityRole="button"
                accessibilityLabel="Close raw list editor"
                hitSlop={8}
              >
                <Ionicons name="close" size={20} color={palette.textDim} />
              </Pressable>
            </View>
            <TextInput
              value={rawEditorText}
              onChangeText={setRawEditorText}
              multiline
              autoFocus={Platform.OS === 'web'}
              placeholder="One item per line"
              placeholderTextColor={palette.textDim}
              style={{
                minHeight: 180,
                maxHeight: 340,
                borderWidth: 1,
                borderColor: palette.border,
                borderRadius: 12,
                color: palette.textBody,
                backgroundColor: palette.surfaceAlt,
                paddingHorizontal: 12,
                paddingVertical: 10,
                textAlignVertical: 'top',
                fontSize: 13,
                lineHeight: 18,
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                onPress={() => setRawEditorVisible(false)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: palette.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.75 : 1,
                })}
              >
                <Text style={{ color: palette.textBody, fontSize: 12, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveRawEditor}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 10,
                  backgroundColor: CART,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.82 : 1,
                })}
              >
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>Apply</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
