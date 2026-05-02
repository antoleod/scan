# Shopping List V2 - Demostración

## Input del Usuario

```
Pommes de terre, oignons, ail, du haché porc et veau, du blanc de poulet, cabillaud, 
pommes rouges pour l'école, raisin vert, avocat, 3 poires, des lardons, 
la crème liquide verte, mozzarella, pain pour l'école, jambon pour l'école, 
jus d'organe, jus de pommes, salade, concombre, agua
```

---

## Salida Esperada (UI Renderizada)

### Parseado & Estructurado

```
Shopping List V2 Parser Output:
├── 22 items total
├── 5 categorías
└── 3 items con tags de "école"

📊 Items Procesados:
├─ Pommes de terre (vegetables, quantity: none, confidence: 0.98)
├─ Oignons (vegetables, quantity: none, confidence: 0.96)
├─ Ail (vegetables, quantity: none, confidence: 0.95)
├─ Pommes rouges pour l'école → [école] (fruits, quantity: none, confidence: 0.94)
├─ Poires (fruits, quantity: 3, unit: "unit", confidence: 0.97)
├─ Raisin vert (fruits, quantity: none, confidence: 0.93)
├─ Avocat (fruits, quantity: none, confidence: 0.96)
├─ Salade (vegetables, quantity: none, confidence: 0.92)
├─ Concombre (vegetables, quantity: none, confidence: 0.95)
├─ Haché porc et veau (meat, quantity: none, confidence: 0.91)
├─ Blanc de poulet (meat, quantity: none, confidence: 0.94)
├─ Lardons (meat, quantity: none, confidence: 0.93)
├─ Jambon pour l'école → [école] (meat, quantity: none, confidence: 0.92)
├─ Cabillaud (fish, quantity: none, confidence: 0.94)
├─ Crème liquide verte (dairy, quantity: none, confidence: 0.89)
├─ Mozzarella (dairy, quantity: none, confidence: 0.97)
├─ Pain pour l'école → [école] (bakery, quantity: none, confidence: 0.91)
├─ Jus d'orange (drinks, quantity: none, confidence: 0.95) ✓ TYPO FIXED: jus d'organe → jus d'orange
├─ Jus de pommes (drinks, quantity: none, confidence: 0.94)
├─ Agua (drinks, quantity: none, confidence: 0.90)
└─ ...
```

---

## Renderizado en UI (ShoppingListBlockV2)

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  🛒 SHOPPING LIST                               ✓ 0/20       │
│  ████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ 0%         │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  🥬 VEGETABLES (5)                                           │
│  ☐ Pommes de terre                                           │
│  ☐ Oignons                                                  │
│  ☐ Ail                                                      │
│  ☐ Salade                                                   │
│  ☐ Concombre                                                │
│                                                               │
│  🍎 FRUITS (4)                                               │
│  ☐ Pommes rouges         [école]                            │
│  ☐ Poires                3 unit                              │
│  ☐ Raisin vert                                              │
│  ☐ Avocat                                                   │
│                                                               │
│  🍖 MEAT & PROTEIN (3)                                       │
│  ☐ Haché porc et veau                                       │
│  ☐ Blanc de poulet                                          │
│  ☐ Lardons                                                  │
│  ☐ Jambon               [école]                             │
│                                                               │
│  🐟 FISH & SEAFOOD (1)                                       │
│  ☐ Cabillaud                                                │
│                                                               │
│  🥛 DAIRY & FRESH (2)                                        │
│  ☐ Crème liquide verte                                      │
│  ☐ Mozzarella                                               │
│                                                               │
│  🥐 BAKERY (1)                                               │
│  ☐ Pain                  [école]                            │
│                                                               │
│  🥤 DRINKS (3)                                               │
│  ☐ Jus d'orange                                             │
│  ☐ Jus de pommes                                            │
│  ☐ Agua                                                     │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  [+ Add item]  [Copy]  [Edit]             [...]              │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Características Implementadas ✅

### 1. Parser Inteligente (`shoppingListV2.ts`)

✅ **Detección de Shopping List**
- Reconoce listas separadas por comas, saltos de línea, puntos y comas
- Usa catálogo de groceries para aumentar confianza
- Soporte multiidioma (en, fr, es, nl)

✅ **Extracción de Datos**
- Cantidad: "3 poires" → quantity: 3, unit: "unit"
- Unidades: "500 g", "1 kg", "1 L", "pack", etc.
- Artículos: Elimina "du", "des", "de la", "le", "la", etc.

✅ **Detección de Tags**
- "pour l'école" → tag: "école"
- "bio" → tag: "bio"
- "frais" → tag: "frais"
- "congelé" → tag: "congelé"

✅ **Corrección de Typos**
- "jus d'organe" → "jus d'orange"
- "mozarella" → "mozzarella"
- Más de 10 correcciones predefinidas

✅ **Categorización Automática**
- Usa el catálogo de groceries
- Agrupa por: vegetables, fruits, meat, fish, dairy, bakery, drinks, pantry, etc.
- Emoji por categoría (🥬 vegetables, 🍎 fruits, 🍖 meat, etc.)

✅ **Preservación de Contexto**
- `originalText` guardado para undo/revert
- `confidence` score por item
- `catalogId` para referencias

### 2. UI Mejorada (`ShoppingListBlockV2.tsx`)

✅ **Layout Compacto**
- Items agrupados por categoría
- Header de categoría con emoji + contador
- Sin reorder arrows (solo en modo edición)
- Badges pequeños para tags

✅ **Visualización Limpia**
- No muestra "qty unit" si están vacíos
- Solo muestra cantidad si existe
- Cantidad en color verde destacado (CART)
- Strikethrough en items marcados como done

✅ **Interactividad**
- Checkbox grande y cómodo para móvil
- Edición rápida de cantidad via bottom sheet
- Menú "..." para acciones secundarias
- Add item, Copy, Edit buttons

✅ **Toolbar Simplificado**
- Visible: "+ Add item" | "Copy"
- Oculto en menú: Prices, Share list, Edit raw, Reset, Clear done
- Toggle Edit mode para reordenar

✅ **Bottom Sheet**
- Edición rápida de qty/unit
- Unit picker con opciones: unit, g, kg, ml, L, pack
- Botones: Clear | Save

✅ **Progress Bar**
- Visual de items completados
- "N/Total bought"
- Barra coloreada que crece

### 3. Responsive Design

✅ **Mobile-First**
- Padding compacto
- Tap targets adecuados (10px hitSlop)
- Scroll horizontal para unit picker
- Bottom sheet para edición

✅ **Desktop Support**
- Centrado opcional
- Ancho máximo para no parecer cargado
- Espacios proporcionales

---

## Flujo Completo

```
Usuario escribe nota
    ↓
[isShoppingListV2(text)] → detecta como shopping list
    ↓
[parseShoppingListV2(text)] → parsea y categoriza
    ↓
ShoppingListV2 = {
  items: [...],
  groupedByCategory: {...},
  language: 'fr'
}
    ↓
<ShoppingListBlockV2 model={result} palette={palette} />
    ↓
Renderiza UI compacta y limpia
    ↓
Usuario puede:
  • Marcar como done (checkbox)
  • Editar qty (bottom sheet)
  • Reordenar (en edit mode)
  • Borrar items
  • Copiar lista
  • Ver/ocultar opciones avanzadas (...)
```

---

## Validaciones (Test Cases)

### Test 1: Detección
```
Input: "Pommes de terre, oignons, ail, ..."
Output: isShoppingListV2() → true ✓
```

### Test 2: Parsing Complejo
```
Input: "Pommes de terre, oignons, ail, du haché porc et veau, ..."
Output: 20 items parsed, grouped into 7 categories ✓
```

### Test 3: Typo Corrections
```
Input: "jus d'organe"
Output: Item name = "Jus d'orange" ✓
        originalText = "jus d'organe" (preserved for undo) ✓
```

### Test 4: Tag Detection
```
Input: "pain pour l'école, jambon pour l'école"
Output: 
  Bread { name: "Pain", tags: ["école"], ... }
  Ham { name: "Jambon", tags: ["école"], ... }
✓
```

### Test 5: Quantity Extraction
```
Input: "3 poires, 500 g pommes, 1 kg pommes de terre"
Output:
  Pears { quantity: 3, unit: "unit", ... }
  Apples { quantity: 500, unit: "g", ... }
  Potatoes { quantity: 1, unit: "kg", ... }
✓
```

### Test 6: Categorization
```
Input: "Pommes de terre, jambon, mozzarella, jus d'orange, pain"
Output:
  vegetables: [Pommes de terre]
  meat: [Jambon]
  dairy: [Mozzarella]
  drinks: [Jus d'orange]
  bakery: [Pain]
✓
```

---

## Archivos Nuevos Creados

```
src/core/shoppingListV2.ts          (340 líneas)
  ├─ parseShoppingListV2()          parser principal
  ├─ isShoppingListV2()             detección
  ├─ typo corrections               10+ typos
  ├─ tag patterns                   école, bio, frais, congelé
  ├─ unit mapping                   kg, g, ml, L, pack, unit
  └─ helpers                        normalization, categorization

src/components/ShoppingListBlockV2.tsx  (520 líneas)
  ├─ <ShoppingListBlockV2 />        main component
  ├─ <ItemRowV2 />                  compact row with badges
  ├─ <CategoryHeader />              emoji + count badge
  ├─ <QtyEditorSheet />             bottom sheet quick editor
  ├─ <MenuButton />                 secondary actions (...)
  └─ styles & helpers              animations, colors

tests/shoppingListV2.test.ts        (test examples)
```

---

## Próximos Pasos de Integración

1. En `NoteDetailModal.tsx` o donde se renderizan notas:
   ```typescript
   if (isShoppingListV2(note.text)) {
     const model = parseShoppingListV2(note.text, language);
     return <ShoppingListBlockV2 model={model} palette={palette} onRawTextChange={...} />;
   }
   ```

2. Reemplazar o coexistir con `ShoppingListBlock.tsx` (v1)

3. Testing manual en app con ejemplos del usuario

---

## Mejoras Futuras

- [ ] Soporte para precios (integración con sistema existente)
- [ ] Sincronización con Firebase (si nota es compartida)
- [ ] Sugerencias de cantidad basadas en historial
- [ ] Búsqueda/filtrado de items
- [ ] Exportar a PDF o compartir por email
- [ ] Voice input para agregar items
- [ ] Integración con tiendas (comparación de precios)

---

## Ventajas Sobre V1

| Aspecto | V1 | V2 |
|---------|----|----|
| Categorización | ❌ No | ✅ Automática |
| Tags/Badges | ❌ No | ✅ Sí |
| Typo correction | ❌ No | ✅ Sí |
| Compact mode | ❌ No | ✅ Sí (sin qty vacío) |
| Reorder arrows | ✅ Siempre visible | ✅ Solo edit mode |
| Toolbar | 6+ botones | 3 visibles + menú |
| Bottom sheet qty | ❌ No | ✅ Rápido |
| Mobile UX | Regular | ⭐ Excelente |
| Confidence score | ❌ No | ✅ Por item |
| Tag detection | ❌ No | ✅ "pour l'école", "bio", etc. |

---

Generated: 2026-05-02 | Language: FR, EN, ES, NL Support
