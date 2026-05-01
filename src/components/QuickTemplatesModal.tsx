import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EU_MEDICATIONS } from '../core/euMedicationDatabase';
import { loadShoppingLists, saveShoppingList, deleteShoppingList, type ShoppingList } from '../core/shoppingListHistory';
import { getGroceryDisplayName, type GroceryCatalogItem } from '../data/groceryCatalog';
import { findDuplicateGrocery, formatGroceryItemForInsert, safeText, searchGroceryCatalog } from '../utils/groceryDetection';

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
};

type Tab = 'medications' | 'shopping';

export function QuickTemplatesModal({
  visible,
  palette,
  onClose,
  onSelectMedication,
  onSelectShoppingItem,
  currentNoteText,
}: {
  visible: boolean;
  palette: Palette;
  onClose: () => void;
  onSelectMedication: (medication: string) => void;
  onSelectShoppingItem: (item: string) => void;
  currentNoteText?: string;
}) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const columns = isDesktop && width >= 1320 ? 3 : isDesktop ? 2 : 1;
  const language = useMemo(() => {
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language.slice(0, 2);
    return 'en';
  }, []);

  const [activeTab, setActiveTab] = useState<Tab>('medications');
  const [searchText, setSearchText] = useState('');
  const [selectedMeds, setSelectedMeds] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [shoppingItemQuantities, setShoppingItemQuantities] = useState<Record<string, string>>({});
  const [shoppingHistory, setShoppingHistory] = useState<ShoppingList[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    loadShoppingLists().then(setShoppingHistory).catch(() => undefined);
  }, [visible]);

  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 2200);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const COMMON_MEDS = ['paracetamol', 'ibuprofen', 'dafalgan', 'omeprazole', 'amoxicillin'];

  const filteredMeds = useMemo(() => {
    const searchValue = safeText(searchText);
    if (!searchValue.trim()) {
      return [...EU_MEDICATIONS].sort((a, b) => {
        const aCommon = COMMON_MEDS.includes(a.id) ? 0 : 1;
        const bCommon = COMMON_MEDS.includes(b.id) ? 0 : 1;
        return aCommon - bCommon;
      });
    }
    const query = searchValue.toLowerCase();
    return EU_MEDICATIONS.filter((med) =>
      med.names.some((name) => name.toLowerCase().includes(query)) || med.id.toLowerCase().includes(query),
    );
  }, [searchText]);

  const filteredItems = useMemo(() => searchGroceryCatalog(searchText, language), [searchText, language]);

  const handleMedicationToggle = (medName: string) => {
    const newSet = new Set(selectedMeds);
    if (newSet.has(medName)) newSet.delete(medName);
    else newSet.add(medName);
    setSelectedMeds(newSet);
  };

  const handleAddMedications = () => {
    if (selectedMeds.size === 0) return;
    onSelectMedication(Array.from(selectedMeds).join(', '));
    setSelectedMeds(new Set());
    onClose();
  };

  const handleShoppingToggle = (item: GroceryCatalogItem) => {
    const newSet = new Set(selectedItems);
    const nextQuantities = { ...shoppingItemQuantities };
    if (newSet.has(item.id)) {
      newSet.delete(item.id);
      delete nextQuantities[item.id];
    } else {
      newSet.add(item.id);
      nextQuantities[item.id] = item.defaultQuantity || '';
    }
    setSelectedItems(newSet);
    setShoppingItemQuantities(nextQuantities);
  };

  const handleAddItems = async () => {
    const items = Array.from(selectedItems)
      .map((id) => filteredItems.find((item) => item.id === id))
      .filter((item): item is GroceryCatalogItem => Boolean(item));
    if (items.length === 0) return;

    const currentText = safeText(currentNoteText);
    const duplicate = items.find((item) => findDuplicateGrocery(currentText, item));
    if (duplicate) {
      setToastMessage(`${getGroceryDisplayName(duplicate, language)} is already in this note.`);
      return;
    }

    const formatted = items
      .map((item) => formatGroceryItemForInsert(item, language, shoppingItemQuantities[item.id] || item.defaultQuantity))
      .join('\n');
    const nextText = currentText.trim() ? `${currentText}\n${formatted}` : formatted;

    saveShoppingList(items.map((item) => getGroceryDisplayName(item, language))).catch(() => undefined);
    onSelectShoppingItem(nextText);
    setSelectedItems(new Set());
    setShoppingItemQuantities({});
    setShowHistory(false);
    onClose();
  };

  const handleReuseList = (list: ShoppingList) => {
    const next = new Set<string>();
    const qty: Record<string, string> = {};
    for (const saved of list.items) {
      const item = searchGroceryCatalog(saved, language)[0];
      if (item) {
        next.add(item.id);
        qty[item.id] = item.defaultQuantity || '';
      }
    }
    setSelectedItems(next);
    setShoppingItemQuantities(qty);
    setShowHistory(false);
  };

  const handleDeleteList = async (id: string) => {
    await deleteShoppingList(id).catch(() => undefined);
    loadShoppingLists().then(setShoppingHistory).catch(() => undefined);
  };

  const modalWidth = isDesktop ? Math.min(width * 0.96, 1040) : '100%';

  return (
    <Modal visible={visible} transparent animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: isDesktop ? 'center' : 'flex-end', alignItems: isDesktop ? 'center' : 'stretch' }}>
        <Pressable style={{ flex: 1, width: '100%' }} onPress={onClose} />
        <View style={{ width: modalWidth, maxHeight: isDesktop ? '85%' : '88%', borderRadius: isDesktop ? 20 : 0, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: palette.bg, borderWidth: isDesktop ? 1 : 0, borderTopWidth: 1, borderColor: palette.border, overflow: 'hidden' }}>
          <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: palette.textBody }}>Quick Templates</Text>
              <Pressable onPress={onClose} hitSlop={8}><Ionicons name="close" size={24} color={palette.textDim} /></Pressable>
            </View>
          </View>

          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: palette.border }}>
            {([{ key: 'medications', label: 'Medicamentos' }, { key: 'shopping', label: 'Shopping' }] as const).map((tab) => (
              <Pressable key={tab.key} onPress={() => { setActiveTab(tab.key); setSearchText(''); }} style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: activeTab === tab.key ? 2 : 0, borderBottomColor: activeTab === tab.key ? palette.accent : 'transparent' }}>
                <Text style={{ fontSize: 14, fontWeight: activeTab === tab.key ? '700' : '500', color: activeTab === tab.key ? palette.accent : palette.textMuted }}>{tab.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: palette.border, backgroundColor: palette.bg }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="search" size={16} color={palette.textDim} style={{ position: 'absolute', left: 10, zIndex: 1 }} />
              <TextInput placeholder={activeTab === 'medications' ? 'Search medications...' : 'Search item, category, kg, école...'} placeholderTextColor={palette.textMuted} value={searchText} onChangeText={setSearchText} style={{ flex: 1, paddingLeft: 36, paddingRight: 34, paddingVertical: 8, borderWidth: 1, borderColor: palette.border, borderRadius: 8, backgroundColor: palette.surface, color: palette.textBody, fontSize: 14 }} />
              {safeText(searchText).length > 0 ? <Pressable onPress={() => setSearchText('')} style={{ position: 'absolute', right: 8, zIndex: 2, padding: 6 }}><Ionicons name="close-circle" size={16} color={palette.textDim} /></Pressable> : null}
            </View>
            {activeTab === 'shopping' && shoppingHistory.length > 0 ? (
              <Pressable onPress={() => setShowHistory(!showHistory)} style={{ marginTop: 8, minHeight: 36, borderRadius: 8, borderWidth: 1, borderColor: showHistory ? palette.accent : palette.border, backgroundColor: showHistory ? `${palette.accent}20` : palette.surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name={showHistory ? 'chevron-up' : 'chevron-down'} size={16} color={showHistory ? palette.accent : palette.textMuted} />
                <Text style={{ color: showHistory ? palette.accent : palette.textBody, fontSize: 12, fontWeight: '600' }}>Recent Lists ({shoppingHistory.length})</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 8 }}>
            {activeTab === 'medications' ? (
              <View style={{ gap: 6 }}>
                {filteredMeds.map((med) => {
                  const isSelected = selectedMeds.has(med.names[0]);
                  return (
                    <Pressable key={med.id} onPress={() => handleMedicationToggle(med.names[0])} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: isSelected ? `${palette.accent}30` : pressed ? palette.surfaceAlt : palette.surface, borderWidth: 1, borderColor: isSelected ? palette.accent : palette.border })}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{med.names[0]}</Text>
                        {med.names.length > 1 ? <Text style={{ color: palette.textMuted, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{med.names.slice(1, 3).join(', ')}</Text> : null}
                      </View>
                      <Ionicons name={isSelected ? 'checkmark-circle' : 'add-circle-outline'} size={18} color={isSelected ? palette.accent : palette.textDim} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <View style={{ gap: 10 }}>
                {showHistory ? shoppingHistory.map((list) => (
                  <Pressable key={list.id} onPress={() => handleReuseList(list)} style={{ padding: 10, borderRadius: 10, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={{ flex: 1 }}><Text style={{ color: palette.textBody, fontWeight: '600' }}>{list.name}</Text><Text style={{ color: palette.textMuted, fontSize: 11 }}>{list.items.length} items</Text></View>
                    <Pressable onPress={() => handleDeleteList(list.id)} hitSlop={8}><Ionicons name="trash-outline" size={16} color={palette.textDim} /></Pressable>
                  </Pressable>
                )) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {filteredItems.map((item) => {
                    const selected = selectedItems.has(item.id);
                    const name = getGroceryDisplayName(item, language);
                    const quantity = shoppingItemQuantities[item.id] ?? item.defaultQuantity ?? '';
                    return (
                      <Pressable key={item.id} onPress={() => handleShoppingToggle(item)} style={({ pressed }) => ({ width: columns === 1 ? '100%' : `${100 / columns - 1}%`, minWidth: columns === 1 ? undefined : 250, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: selected ? palette.accent : palette.border, backgroundColor: selected ? `${palette.accent}24` : pressed ? palette.surfaceAlt : palette.surface, gap: 8 })}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ color: palette.textBody, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>{name}</Text>
                            <Text style={{ color: palette.textMuted, fontSize: 11, textTransform: 'capitalize' }} numberOfLines={1}>{item.category.replace('_', ' ')}{item.defaultQuantity ? ` · ${item.defaultQuantity}` : ''}</Text>
                          </View>
                          <Ionicons name={selected ? 'checkmark-circle' : 'add-circle-outline'} size={19} color={selected ? palette.accent : palette.textDim} />
                        </View>
                        {selected ? <TextInput value={quantity} onChangeText={(text) => setShoppingItemQuantities((prev) => ({ ...prev, [item.id]: safeText(text) }))} placeholder="quantity" placeholderTextColor={palette.textMuted} style={{ minHeight: 36, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.bg, color: palette.textBody, fontSize: 12 }} /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>

          {toastMessage ? <View style={{ position: 'absolute', bottom: 86, left: 16, right: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}><Text style={{ color: palette.textBody, fontSize: 13, fontWeight: '600' }}>{toastMessage}</Text></View> : null}

          {((activeTab === 'medications' && selectedMeds.size > 0) || (activeTab === 'shopping' && selectedItems.size > 0)) ? (
            <View style={{ borderTopWidth: 1, borderTopColor: palette.border, paddingHorizontal: 16, paddingVertical: 12 }}>
              <Pressable onPress={activeTab === 'medications' ? handleAddMedications : handleAddItems} style={({ pressed }) => ({ backgroundColor: palette.accent, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: pressed ? 0.85 : 1 })}>
                <Text style={{ color: '#000', fontSize: 14, fontWeight: '800' }}>{activeTab === 'medications' ? `ADD ${selectedMeds.size} MEDICATION${selectedMeds.size !== 1 ? 'S' : ''}` : `ADD ${selectedItems.size} ITEM${selectedItems.size !== 1 ? 'S' : ''}`}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
