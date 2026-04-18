/**
 * ShoppingListBlock.tsx
 * Interactive shopping-list view rendered inside NoteCard.
 * Handles: check/uncheck, inline editing of label/qty/unit,
 * add item, delete item, and "edit raw text" escape hatch.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ShoppingItem, ShoppingListModel, shoppingListToText } from '../core/shoppingList';

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
  chipBorder: string;
};

// ─── Theme constants ──────────────────────────────────────────────────────────

const CART_COLOR   = '#22C55E';   // green accent for shopping
const DONE_BG      = 'rgba(34,197,94,0.08)';
const DONE_BORDER  = 'rgba(34,197,94,0.25)';

// ─── Single item row ──────────────────────────────────────────────────────────

function ItemRow({
  item,
  palette,
  onToggle,
  onUpdate,
  onDelete,
}: {
  item: ShoppingItem;
  palette: Palette;
  onToggle: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ShoppingItem>) => void;
  onDelete: (id: string) => void;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleCheck = useCallback(() => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.08, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1,    duration: 120, useNativeDriver: true }),
    ]).start();
    onToggle(item.id);
  }, [item.id, onToggle, scaleAnim]);

  const isDone = item.checked;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingVertical: 6,
          paddingHorizontal: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: isDone ? DONE_BORDER : palette.border,
          backgroundColor: isDone ? DONE_BG : 'transparent',
          marginBottom: 4,
        }}
      >
        {/* Checkbox */}
        <Pressable
          onPress={handleCheck}
          hitSlop={10}
          style={{
            width: 20,
            height: 20,
            borderRadius: 6,
            borderWidth: 2,
            borderColor: isDone ? CART_COLOR : palette.textDim,
            backgroundColor: isDone ? CART_COLOR : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {isDone ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
        </Pressable>

        {/* Label */}
        <TextInput
          value={item.label}
          onChangeText={(v) => onUpdate(item.id, { label: v })}
          style={{
            flex: 1,
            color: isDone ? palette.textMuted : palette.textBody,
            fontSize: 13,
            lineHeight: 19,
            textDecorationLine: isDone ? 'line-through' : 'none',
            opacity: isDone ? 0.6 : 1,
            paddingVertical: 0,
            minHeight: 22,
          }}
          multiline={false}
          returnKeyType="done"
          placeholder="Item name"
          placeholderTextColor={palette.textMuted}
        />

        {/* Quantity */}
        <TextInput
          value={item.quantity}
          onChangeText={(v) => onUpdate(item.id, { quantity: v })}
          style={{
            width: 40,
            color: isDone ? palette.textMuted : CART_COLOR,
            fontSize: 13,
            fontWeight: '700',
            textAlign: 'right',
            opacity: isDone ? 0.5 : 1,
            paddingVertical: 0,
            minHeight: 22,
          }}
          keyboardType="decimal-pad"
          returnKeyType="done"
          placeholder="qty"
          placeholderTextColor={palette.textMuted}
        />

        {/* Unit */}
        <TextInput
          value={item.unit}
          onChangeText={(v) => onUpdate(item.id, { unit: v })}
          style={{
            width: 44,
            color: isDone ? palette.textMuted : palette.textDim,
            fontSize: 11,
            fontWeight: '600',
            opacity: isDone ? 0.5 : 1,
            paddingVertical: 0,
            minHeight: 22,
          }}
          autoCapitalize="none"
          returnKeyType="done"
          placeholder="unit"
          placeholderTextColor={palette.textMuted}
        />

        {/* Delete */}
        <Pressable
          onPress={() => onDelete(item.id)}
          hitSlop={10}
          style={({ pressed }) => ({
            opacity: pressed ? 0.5 : 0.65,
            paddingLeft: 2,
          })}
        >
          <Ionicons name="close-circle-outline" size={16} color={palette.textDim} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ done, total, palette }: { done: number; total: number; palette: Palette }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="cart-outline" size={13} color={CART_COLOR} />
          <Text style={{ color: CART_COLOR, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 }}>
            SHOPPING LIST
          </Text>
        </View>
        <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '600' }}>
          {done}/{total} bought
        </Text>
      </View>

      {/* Bar track */}
      <View style={{ height: 4, borderRadius: 99, backgroundColor: `${CART_COLOR}22`, overflow: 'hidden' }}>
        <View
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: 99,
            backgroundColor: CART_COLOR,
          }}
        />
      </View>
    </View>
  );
}

// ─── Main block ───────────────────────────────────────────────────────────────

export function ShoppingListBlock({
  model,
  palette,
  expanded,
  onRawTextChange,
}: {
  model: ShoppingListModel;
  palette: Palette;
  expanded: boolean;
  /** Called whenever items change so the parent can persist the updated text. */
  onRawTextChange: (newText: string) => void;
}) {
  const [items, setItems] = useState<ShoppingItem[]>(model.items);
  const [showRaw, setShowRaw] = useState(false);
  const [rawDraft, setRawDraft] = useState(model.rawText);

  // Keep items in sync when the model changes from outside (e.g., note save)
  const prevRawRef = useRef(model.rawText);
  if (model.rawText !== prevRawRef.current) {
    prevRawRef.current = model.rawText;
    setItems(model.items);
    setRawDraft(model.rawText);
  }

  // ── Mutation helpers ───────────────────────────────────────────────────────

  const pushChange = useCallback((next: ShoppingItem[]) => {
    setItems(next);
    onRawTextChange(shoppingListToText(next));
  }, [onRawTextChange]);

  const handleToggle = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.map((it) => it.id === id ? { ...it, checked: !it.checked } : it);
      onRawTextChange(shoppingListToText(next));
      return next;
    });
  }, [onRawTextChange]);

  const handleUpdate = useCallback((id: string, patch: Partial<ShoppingItem>) => {
    setItems((prev) => {
      const next = prev.map((it) => it.id === id ? { ...it, ...patch } : it);
      onRawTextChange(shoppingListToText(next));
      return next;
    });
  }, [onRawTextChange]);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => {
      const next = prev.filter((it) => it.id !== id);
      onRawTextChange(shoppingListToText(next));
      return next;
    });
  }, [onRawTextChange]);

  const handleAdd = useCallback(() => {
    const newItem: ShoppingItem = {
      id: `sl_new_${Date.now()}`,
      label: '',
      quantity: '',
      unit: '',
      checked: false,
      rawLine: '',
    };
    pushChange([...items, newItem]);
  }, [items, pushChange]);

  // ── Raw text editor ────────────────────────────────────────────────────────

  if (showRaw) {
    return (
      <View style={{ gap: 8 }}>
        <ProgressBar done={items.filter((i) => i.checked).length} total={items.length} palette={palette} />
        <TextInput
          value={rawDraft}
          onChangeText={setRawDraft}
          multiline
          autoFocus
          style={{
            borderWidth: 1,
            borderColor: `${CART_COLOR}55`,
            borderRadius: 10,
            backgroundColor: palette.bg,
            color: palette.textBody,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 13,
            lineHeight: 20,
            textAlignVertical: 'top',
            minHeight: 80,
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            onPress={() => setShowRaw(false)}
            style={{ flex: 1, minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: palette.textBody, fontSize: 12, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              onRawTextChange(rawDraft);
              setShowRaw(false);
            }}
            style={{ flex: 1, minHeight: 36, borderRadius: 8, backgroundColor: CART_COLOR, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Apply</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Checklist view ─────────────────────────────────────────────────────────

  const done = items.filter((i) => i.checked).length;
  const visibleItems = expanded ? items : items.slice(0, 7);
  const hidden = items.length - visibleItems.length;

  return (
    <View style={{ gap: 8 }}>
      <ProgressBar done={done} total={items.length} palette={palette} />

      {/* Item rows */}
      <View>
        {visibleItems.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            palette={palette}
            onToggle={handleToggle}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
          />
        ))}
        {hidden > 0 && (
          <Text style={{ color: palette.textMuted, fontSize: 11, paddingVertical: 2, paddingHorizontal: 4 }}>
            +{hidden} more (expand to see all)
          </Text>
        )}
      </View>

      {/* Add item + edit raw row */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
        <Pressable
          onPress={handleAdd}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: `${CART_COLOR}55`,
            backgroundColor: pressed ? `${CART_COLOR}20` : `${CART_COLOR}10`,
          })}
        >
          <Ionicons name="add-circle-outline" size={14} color={CART_COLOR} />
          <Text style={{ color: CART_COLOR, fontSize: 11, fontWeight: '700' }}>Add item</Text>
        </Pressable>

        <Pressable
          onPress={() => { setRawDraft(shoppingListToText(items)); setShowRaw(true); }}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.border,
            backgroundColor: pressed ? `${palette.textDim}18` : 'transparent',
          })}
        >
          <Ionicons name="code-outline" size={13} color={palette.textDim} />
          <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '600' }}>Edit raw</Text>
        </Pressable>
      </View>
    </View>
  );
}
