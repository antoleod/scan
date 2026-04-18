/**
 * ShoppingListBlock.tsx
 * Interactive shopping-list renderer inside NoteCard.
 *
 * Features:
 *   - Check / uncheck items (spring animation)
 *   - Inline editing: label, quantity, unit, price
 *   - Move item up / down (reorder)
 *   - Add new item
 *   - Delete item with undo (last deleted restored in 4 s)
 *   - Clear done (remove all checked items)
 *   - Reset all (uncheck everything)
 *   - Toggle price column + running subtotal
 *   - Share list as plain text (via Clipboard / Web Share API)
 *   - Edit raw text escape hatch
 *   - Progress bar + bought counter
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const CART   = '#22C55E';
const DONE_BG     = 'rgba(34,197,94,0.08)';
const DONE_BORDER = 'rgba(34,197,94,0.25)';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildShareText(items: ShoppingItem[], showPrice: boolean): string {
  const lines = items.map((it) => {
    const qty  = it.quantity ? ` — ${it.quantity}${it.unit ? ' ' + it.unit : ''}` : '';
    const price = showPrice && it.price ? ` (${it.price})` : '';
    const done = it.checked ? '✓ ' : '○ ';
    return `${done}${it.label}${qty}${price}`;
  });
  return lines.join('\n');
}

async function shareText(text: string) {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) {
    try { await navigator.share({ text }); return; } catch { /* fall through */ }
  }
  try { await Clipboard.setStringAsync(text); } catch { /* ignore */ }
}

// ─── Price-extended item type ─────────────────────────────────────────────────
// We extend ShoppingItem with an optional `price` field stored in-component.
type ExtItem = ShoppingItem & { price?: string };

// ─── Single item row ──────────────────────────────────────────────────────────

function ItemRow({
  item,
  index,
  total,
  showPrice,
  palette,
  onToggle,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  item: ExtItem;
  index: number;
  total: number;
  showPrice: boolean;
  palette: Palette;
  onToggle: (id: string) => void;
  onUpdate: (id: string, patch: Partial<ExtItem>) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handleCheck = useCallback(() => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 1.07, duration: 70, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1,    duration: 110, useNativeDriver: true }),
    ]).start();
    onToggle(item.id);
  }, [item.id, onToggle, scale]);

  const done = item.checked;

  return (
    <Animated.View style={{ transform: [{ scale }], marginBottom: 4 }}>
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: done ? DONE_BORDER : palette.border,
        backgroundColor: done ? DONE_BG : 'transparent',
      }}>

        {/* Reorder arrows */}
        <View style={{ gap: 1 }}>
          <Pressable onPress={() => onMoveUp(item.id)} hitSlop={6} style={{ opacity: index === 0 ? 0.2 : 0.7 }} disabled={index === 0}>
            <Ionicons name="chevron-up" size={11} color={palette.textDim} />
          </Pressable>
          <Pressable onPress={() => onMoveDown(item.id)} hitSlop={6} style={{ opacity: index >= total - 1 ? 0.2 : 0.7 }} disabled={index >= total - 1}>
            <Ionicons name="chevron-down" size={11} color={palette.textDim} />
          </Pressable>
        </View>

        {/* Checkbox */}
        <Pressable
          onPress={handleCheck}
          hitSlop={10}
          style={{
            width: 20, height: 20, borderRadius: 6,
            borderWidth: 2,
            borderColor: done ? CART : palette.textDim,
            backgroundColor: done ? CART : 'transparent',
            alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          {done ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}
        </Pressable>

        {/* Label */}
        <TextInput
          value={item.label}
          onChangeText={(v) => onUpdate(item.id, { label: v })}
          style={{
            flex: 1,
            color: done ? palette.textMuted : palette.textBody,
            fontSize: 13,
            lineHeight: 19,
            textDecorationLine: done ? 'line-through' : 'none',
            opacity: done ? 0.55 : 1,
            paddingVertical: 0,
            minHeight: 22,
          }}
          multiline={false}
          returnKeyType="done"
          placeholder="Item name"
          placeholderTextColor={palette.textMuted}
        />

        {/* Qty */}
        <TextInput
          value={item.quantity}
          onChangeText={(v) => onUpdate(item.id, { quantity: v })}
          style={{ width: 38, color: done ? palette.textMuted : CART, fontSize: 12, fontWeight: '700', textAlign: 'right', opacity: done ? 0.45 : 1, paddingVertical: 0, minHeight: 22 }}
          keyboardType="decimal-pad"
          returnKeyType="done"
          placeholder="qty"
          placeholderTextColor={palette.textMuted}
        />

        {/* Unit */}
        <TextInput
          value={item.unit}
          onChangeText={(v) => onUpdate(item.id, { unit: v })}
          style={{ width: 40, color: done ? palette.textMuted : palette.textDim, fontSize: 11, fontWeight: '600', opacity: done ? 0.45 : 1, paddingVertical: 0, minHeight: 22 }}
          autoCapitalize="none"
          returnKeyType="done"
          placeholder="unit"
          placeholderTextColor={palette.textMuted}
        />

        {/* Price (optional) */}
        {showPrice ? (
          <TextInput
            value={item.price ?? ''}
            onChangeText={(v) => onUpdate(item.id, { price: v })}
            style={{ width: 46, color: done ? palette.textMuted : '#F59E0B', fontSize: 11, fontWeight: '700', textAlign: 'right', opacity: done ? 0.45 : 1, paddingVertical: 0, minHeight: 22 }}
            keyboardType="decimal-pad"
            returnKeyType="done"
            placeholder="€"
            placeholderTextColor={palette.textMuted}
          />
        ) : null}

        {/* Delete */}
        <Pressable onPress={() => onDelete(item.id)} hitSlop={10} style={({ pressed }) => ({ opacity: pressed ? 0.4 : 0.6, paddingLeft: 2 })}>
          <Ionicons name="close-circle-outline" size={16} color={palette.textDim} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ─── Progress bar + header ────────────────────────────────────────────────────

function Header({
  done, total, subtotal, showPrice, palette,
}: { done: number; total: number; subtotal: number | null; showPrice: boolean; palette: Palette }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return (
    <View style={{ gap: 5 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Ionicons name="cart-outline" size={14} color={CART} />
          <Text style={{ color: CART, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>SHOPPING LIST</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {showPrice && subtotal !== null && subtotal > 0 ? (
            <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>
              Σ {subtotal.toFixed(2)} €
            </Text>
          ) : null}
          <Text style={{ color: palette.textDim, fontSize: 11, fontWeight: '600' }}>
            {done}/{total} bought
          </Text>
        </View>
      </View>
      {/* Track */}
      <View style={{ height: 4, borderRadius: 99, backgroundColor: `${CART}22`, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 99, backgroundColor: CART }} />
      </View>
    </View>
  );
}

// ─── Toolbar pill ─────────────────────────────────────────────────────────────

function Pill({
  icon, label, color, onPress, disabled,
}: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; color: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 9, paddingVertical: 5,
        borderRadius: 999, borderWidth: 1,
        borderColor: `${color}44`,
        backgroundColor: pressed ? `${color}22` : `${color}0e`,
        opacity: disabled ? 0.35 : 1,
      })}
    >
      <Ionicons name={icon} size={12} color={color} />
      <Text style={{ color, fontSize: 10, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ShoppingListBlock({
  model,
  palette,
  expanded,
  onRawTextChange,
}: {
  model: ShoppingListModel;
  palette: Palette;
  expanded: boolean;
  onRawTextChange: (newText: string) => void;
}) {
  const [items, setItems]       = useState<ExtItem[]>(model.items);
  const [showRaw, setShowRaw]   = useState(false);
  const [rawDraft, setRawDraft] = useState(model.rawText);
  const [showPrice, setShowPrice] = useState(false);
  const [undoItem, setUndoItem] = useState<{ item: ExtItem; index: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep in sync with external model rebuild (e.g., after note save)
  const prevRawRef = useRef(model.rawText);
  if (model.rawText !== prevRawRef.current) {
    prevRawRef.current = model.rawText;
    setItems(model.items);
    setRawDraft(model.rawText);
  }

  // ── Mutation helpers ───────────────────────────────────────────────────────

  const push = useCallback((next: ExtItem[]) => {
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

  const handleUpdate = useCallback((id: string, patch: Partial<ExtItem>) => {
    setItems((prev) => {
      const next = prev.map((it) => it.id === id ? { ...it, ...patch } : it);
      onRawTextChange(shoppingListToText(next));
      return next;
    });
  }, [onRawTextChange]);

  const handleDelete = useCallback((id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx === -1) return prev;
      const deleted = prev[idx];
      // Stage undo
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setUndoItem({ item: deleted, index: idx });
      undoTimerRef.current = setTimeout(() => setUndoItem(null), 4000);
      const next = prev.filter((it) => it.id !== id);
      onRawTextChange(shoppingListToText(next));
      return next;
    });
  }, [onRawTextChange]);

  const handleUndo = useCallback(() => {
    if (!undoItem) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setItems((prev) => {
      const next = [...prev];
      next.splice(undoItem.index, 0, undoItem.item);
      onRawTextChange(shoppingListToText(next));
      return next;
    });
    setUndoItem(null);
  }, [undoItem, onRawTextChange]);

  const handleMoveUp = useCallback((id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      onRawTextChange(shoppingListToText(next));
      return next;
    });
  }, [onRawTextChange]);

  const handleMoveDown = useCallback((id: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((it) => it.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      onRawTextChange(shoppingListToText(next));
      return next;
    });
  }, [onRawTextChange]);

  const handleAdd = useCallback(() => {
    const newItem: ExtItem = {
      id: `sl_new_${Date.now()}`,
      label: '', quantity: '', unit: '', checked: false, rawLine: '',
    };
    push([...items, newItem]);
  }, [items, push]);

  const handleClearDone = useCallback(() => {
    const next = items.filter((it) => !it.checked);
    push(next);
  }, [items, push]);

  const handleResetAll = useCallback(() => {
    const next = items.map((it) => ({ ...it, checked: false }));
    push(next);
  }, [items, push]);

  const handleShare = useCallback(async () => {
    const text = buildShareText(items, showPrice);
    await shareText(text);
  }, [items, showPrice]);

  // ── Subtotal ───────────────────────────────────────────────────────────────

  const subtotal = showPrice
    ? items.reduce((sum, it) => {
        const p = parseFloat((it.price ?? '').replace(',', '.'));
        return sum + (isNaN(p) ? 0 : p);
      }, 0)
    : null;

  // ── Raw text editor ────────────────────────────────────────────────────────

  if (showRaw) {
    return (
      <View style={{ gap: 8 }}>
        <Header done={items.filter((i) => i.checked).length} total={items.length} subtotal={subtotal} showPrice={showPrice} palette={palette} />
        <TextInput
          value={rawDraft}
          onChangeText={setRawDraft}
          multiline autoFocus
          style={{
            borderWidth: 1, borderColor: `${CART}55`, borderRadius: 10,
            backgroundColor: palette.bg, color: palette.textBody,
            paddingHorizontal: 12, paddingVertical: 10,
            fontSize: 13, lineHeight: 20, textAlignVertical: 'top', minHeight: 80,
          }}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable onPress={() => setShowRaw(false)}
            style={{ flex: 1, minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: palette.textBody, fontSize: 12, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
          <Pressable onPress={() => { onRawTextChange(rawDraft); setShowRaw(false); }}
            style={{ flex: 1, minHeight: 36, borderRadius: 8, backgroundColor: CART, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>Apply</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Checklist view ─────────────────────────────────────────────────────────

  const done     = items.filter((i) => i.checked).length;
  const visible  = expanded ? items : items.slice(0, 7);
  const hidden   = items.length - visible.length;
  const hasDone  = done > 0;

  return (
    <View style={{ gap: 8 }}>
      <Header done={done} total={items.length} subtotal={subtotal} showPrice={showPrice} palette={palette} />

      {/* Item rows */}
      <View>
        {visible.map((item, index) => (
          <ItemRow
            key={item.id}
            item={item}
            index={index}
            total={visible.length}
            showPrice={showPrice}
            palette={palette}
            onToggle={handleToggle}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
        ))}
        {hidden > 0 ? (
          <Text style={{ color: palette.textMuted, fontSize: 11, paddingLeft: 4 }}>
            +{hidden} more (expand to see all)
          </Text>
        ) : null}
      </View>

      {/* Undo bar */}
      {undoItem ? (
        <Pressable
          onPress={handleUndo}
          style={({ pressed }) => ({
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
            borderWidth: 1, borderColor: '#F59E0B44',
            backgroundColor: pressed ? '#F59E0B18' : '#F59E0B0c',
          })}
        >
          <Text style={{ color: '#F59E0B', fontSize: 12, flex: 1 }} numberOfLines={1}>
            {`"${undoItem.item.label || 'Item'}" deleted`}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="arrow-undo-outline" size={13} color="#F59E0B" />
            <Text style={{ color: '#F59E0B', fontSize: 11, fontWeight: '700' }}>Undo</Text>
          </View>
        </Pressable>
      ) : null}

      {/* Toolbar — row 1: add + price toggle + edit raw */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 }}>
        <Pill icon="add-circle-outline"  label="Add item"     color={CART}       onPress={handleAdd} />
        <Pill icon="pricetag-outline"    label={showPrice ? 'Hide prices' : 'Prices'} color="#F59E0B" onPress={() => setShowPrice((v) => !v)} />
        <Pill icon="share-social-outline" label="Share list"  color="#7C3AED"    onPress={() => handleShare()} />
        <Pill icon="code-outline"        label="Edit raw"     color={palette.textDim} onPress={() => { setRawDraft(shoppingListToText(items)); setShowRaw(true); }} />
      </View>

      {/* Toolbar — row 2: reset / clear done (only when relevant) */}
      {(hasDone) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
          <Pill icon="refresh-outline"   label="Reset all"   color="#0EA5E9" onPress={handleResetAll} />
          <Pill icon="trash-outline"     label="Clear done"  color="#EF4444" onPress={handleClearDone} disabled={!hasDone} />
        </View>
      ) : null}
    </View>
  );
}
