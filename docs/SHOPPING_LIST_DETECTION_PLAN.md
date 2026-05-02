# Shopping List Detection Plan

## Goal

Improve MyKit Notes so the app intelligently detects when a user is writing a shopping/product list and softly suggests converting it into a Shopping List.

The app must **not auto-convert immediately**. It should only show a suggestion:

> 🛒 Parece una lista de compras. ¿Deseas convertirla?

Actions:
- Convert
- Keep as note / Not now

Convert only when the user clicks **Convert**.

---

## Current files involved

Already touched / relevant files:

- `src/core/shoppingList.ts`
- `src/components/ComposerSection.tsx`
- `src/components/mainApp/tabs/NotesTab.tsx`
- `src/components/NoteCard.tsx`
- `tests/run-tests.ts`

New files to create:

- `src/core/shoppingDictionary.ts`
- `src/data/shopping/es.json`
- `src/data/shopping/fr.json`
- `src/data/shopping/en.json`
- `src/data/shopping/nl.json`

If the app already uses another fourth language instead of Dutch, follow the existing locale convention.

---

## Main problems to fix

The current system detects simple comma-separated lists like:

```text
arroz, leche, huevos
```

But it must also understand natural lists like:

```text
arroz leche huevos azucar
azura leche y pan
lait sucre et pain
pain, lait et coca cola, beurre
pommes de terre oignons ail
leche y pan
```

It must not detect normal notes like:

```text
hoy comí arroz con leche y huevos
me gusta el arroz con leche
j’aime le pain au lait
I like milk and bread
```

---

## Architecture decision

Do not hardcode large product lists inside `src/core/shoppingList.ts`.

Use small JSON dictionaries per language.

The parser should think.
The JSON files should remember.

`shoppingList.ts` should focus on:

- text normalization
- splitting/parsing
- confidence scoring
- quantity/unit extraction
- candidate analysis
- parsed item generation

Language data belongs in JSON:

- products
- aliases
- typos
- connectors
- narrative blockers
- units
- multi-word products

---

## JSON dictionary format

Each dictionary should follow this structure:

```json
{
  "language": "es",
  "connectors": [],
  "narrativeBlockers": [],
  "units": [],
  "articlesToClean": [],
  "products": [
    {
      "canonical": "Azúcar",
      "aliases": ["azúcar", "azucar", "azura", "asucar"],
      "category": "pantry"
    }
  ],
  "multiWordProducts": [
    {
      "canonical": "Coca cola",
      "aliases": ["coca cola", "coca-cola"],
      "category": "drinks"
    }
  ]
}
```

---

## File: `src/data/shopping/es.json`

```json
{
  "language": "es",
  "connectors": ["y", "e", "&"],
  "narrativeBlockers": [
    "hoy",
    "ayer",
    "mañana",
    "manana",
    "comí",
    "comi",
    "comimos",
    "cené",
    "cene",
    "desayuné",
    "desayune",
    "almorcé",
    "almorce",
    "necesito",
    "quiero",
    "me gusta",
    "porque",
    "cuando",
    "si tengo tiempo"
  ],
  "units": [
    "kg",
    "kilo",
    "kilos",
    "g",
    "gr",
    "gramo",
    "gramos",
    "l",
    "litro",
    "litros",
    "ml",
    "paquete",
    "paquetes",
    "pack",
    "packs",
    "botella",
    "botellas",
    "caja",
    "cajas",
    "lata",
    "latas",
    "unidad",
    "unidades",
    "pieza",
    "piezas"
  ],
  "articlesToClean": ["el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del"],
  "products": [
    { "canonical": "Arroz", "aliases": ["arroz"], "category": "pantry" },
    { "canonical": "Leche", "aliases": ["leche"], "category": "dairy" },
    { "canonical": "Huevos", "aliases": ["huevo", "huevos"], "category": "dairy" },
    { "canonical": "Azúcar", "aliases": ["azúcar", "azucar", "azura", "asucar"], "category": "pantry" },
    { "canonical": "Queso", "aliases": ["queso"], "category": "dairy" },
    { "canonical": "Pan", "aliases": ["pan"], "category": "bakery" },
    { "canonical": "Pollo", "aliases": ["pollo"], "category": "meat" },
    { "canonical": "Carne", "aliases": ["carne"], "category": "meat" },
    { "canonical": "Pescado", "aliases": ["pescado"], "category": "fish" },
    { "canonical": "Agua", "aliases": ["agua"], "category": "drinks" },
    { "canonical": "Tomate", "aliases": ["tomate", "tomates"], "category": "vegetables" },
    { "canonical": "Cebolla", "aliases": ["cebolla", "cebollas"], "category": "vegetables" },
    { "canonical": "Ajo", "aliases": ["ajo", "ajos"], "category": "vegetables" },
    { "canonical": "Café", "aliases": ["café", "cafe"], "category": "pantry" },
    { "canonical": "Aceite", "aliases": ["aceite"], "category": "pantry" },
    { "canonical": "Sal", "aliases": ["sal"], "category": "pantry" },
    { "canonical": "Pasta", "aliases": ["pasta", "fideos"], "category": "pantry" },
    { "canonical": "Mantequilla", "aliases": ["mantequilla"], "category": "dairy" },
    { "canonical": "Jamón", "aliases": ["jamón", "jamon"], "category": "meat" },
    { "canonical": "Manzana", "aliases": ["manzana", "manzanas"], "category": "fruit" },
    { "canonical": "Pera", "aliases": ["pera", "peras"], "category": "fruit" },
    { "canonical": "Uvas", "aliases": ["uva", "uvas"], "category": "fruit" },
    { "canonical": "Aguacate", "aliases": ["aguacate", "avocado"], "category": "vegetables" },
    { "canonical": "Ensalada", "aliases": ["ensalada", "salada"], "category": "vegetables" },
    { "canonical": "Pepino", "aliases": ["pepino", "pepinos"], "category": "vegetables" },
    { "canonical": "Mozzarella", "aliases": ["mozzarella"], "category": "dairy" }
  ],
  "multiWordProducts": [
    { "canonical": "Coca cola", "aliases": ["coca cola", "coca-cola"], "category": "drinks" },
    { "canonical": "Jugo de naranja", "aliases": ["jugo de naranja", "zumo de naranja"], "category": "drinks" },
    { "canonical": "Jugo de manzana", "aliases": ["jugo de manzana", "zumo de manzana"], "category": "drinks" },
    { "canonical": "Pechuga de pollo", "aliases": ["pechuga de pollo", "blanco de pollo"], "category": "meat" },
    { "canonical": "Carne picada", "aliases": ["carne picada", "carne molida"], "category": "meat" }
  ]
}
```

---

## File: `src/data/shopping/fr.json`

```json
{
  "language": "fr",
  "connectors": ["et", "&"],
  "narrativeBlockers": [
    "aujourd’hui",
    "aujourd'hui",
    "hier",
    "demain",
    "j’aime",
    "j'aime",
    "je veux",
    "besoin",
    "mangé",
    "mange",
    "manger",
    "parce que",
    "quand",
    "sur la table"
  ],
  "units": [
    "kg",
    "kilo",
    "kilos",
    "g",
    "gr",
    "gramme",
    "grammes",
    "l",
    "litre",
    "litres",
    "ml",
    "paquet",
    "paquets",
    "pack",
    "packs",
    "bouteille",
    "bouteilles",
    "boîte",
    "boite",
    "boîtes",
    "boites",
    "pièce",
    "piece",
    "pièces",
    "pieces"
  ],
  "articlesToClean": ["le", "la", "les", "un", "une", "des", "du", "de", "d’", "d'"],
  "products": [
    { "canonical": "Riz", "aliases": ["riz"], "category": "pantry" },
    { "canonical": "Lait", "aliases": ["lait"], "category": "dairy" },
    { "canonical": "Œufs", "aliases": ["œufs", "oeufs", "oeuf", "œuf"], "category": "dairy" },
    { "canonical": "Sucre", "aliases": ["sucre"], "category": "pantry" },
    { "canonical": "Fromage", "aliases": ["fromage"], "category": "dairy" },
    { "canonical": "Pain", "aliases": ["pain"], "category": "bakery" },
    { "canonical": "Poulet", "aliases": ["poulet"], "category": "meat" },
    { "canonical": "Viande", "aliases": ["viande"], "category": "meat" },
    { "canonical": "Poisson", "aliases": ["poisson"], "category": "fish" },
    { "canonical": "Cabillaud", "aliases": ["cabillaud"], "category": "fish" },
    { "canonical": "Eau", "aliases": ["eau"], "category": "drinks" },
    { "canonical": "Tomate", "aliases": ["tomate", "tomates"], "category": "vegetables" },
    { "canonical": "Oignon", "aliases": ["oignon", "oignons"], "category": "vegetables" },
    { "canonical": "Ail", "aliases": ["ail"], "category": "vegetables" },
    { "canonical": "Café", "aliases": ["café", "cafe"], "category": "pantry" },
    { "canonical": "Huile", "aliases": ["huile"], "category": "pantry" },
    { "canonical": "Sel", "aliases": ["sel"], "category": "pantry" },
    { "canonical": "Pâtes", "aliases": ["pâtes", "pates"], "category": "pantry" },
    { "canonical": "Beurre", "aliases": ["beurre"], "category": "dairy" },
    { "canonical": "Lardons", "aliases": ["lardon", "lardons"], "category": "meat" },
    { "canonical": "Mozzarella", "aliases": ["mozzarella"], "category": "dairy" },
    { "canonical": "Pomme", "aliases": ["pomme", "pommes"], "category": "fruit" },
    { "canonical": "Poire", "aliases": ["poire", "poires"], "category": "fruit" },
    { "canonical": "Raisin", "aliases": ["raisin", "raisins"], "category": "fruit" },
    { "canonical": "Avocat", "aliases": ["avocat", "avocats"], "category": "vegetables" },
    { "canonical": "Salade", "aliases": ["salade"], "category": "vegetables" },
    { "canonical": "Concombre", "aliases": ["concombre", "concombres"], "category": "vegetables" },
    { "canonical": "Jambon", "aliases": ["jambon"], "category": "meat" }
  ],
  "multiWordProducts": [
    { "canonical": "Pommes de terre", "aliases": ["pommes de terre", "pomme de terre"], "category": "vegetables" },
    { "canonical": "Pain au lait", "aliases": ["pain au lait", "pains au lait"], "category": "bakery" },
    { "canonical": "Jus d’orange", "aliases": ["jus d’orange", "jus d'orange"], "category": "drinks" },
    { "canonical": "Jus de pommes", "aliases": ["jus de pommes", "jus de pomme"], "category": "drinks" },
    { "canonical": "Crème liquide", "aliases": ["crème liquide", "creme liquide"], "category": "dairy" },
    { "canonical": "Crème liquide verte", "aliases": ["crème liquide verte", "creme liquide verte"], "category": "dairy" },
    { "canonical": "Blanc de poulet", "aliases": ["blanc de poulet", "du blanc de poulet"], "category": "meat" },
    { "canonical": "Haché porc et veau", "aliases": ["haché porc et veau", "hache porc et veau"], "category": "meat" },
    { "canonical": "Pommes rouges", "aliases": ["pommes rouges", "pomme rouge"], "category": "fruit" },
    { "canonical": "Raisin vert", "aliases": ["raisin vert", "raisins verts"], "category": "fruit" },
    { "canonical": "Coca cola", "aliases": ["coca cola", "coca-cola"], "category": "drinks" }
  ]
}
```

---

## File: `src/data/shopping/en.json`

```json
{
  "language": "en",
  "connectors": ["and", "&"],
  "narrativeBlockers": [
    "today",
    "yesterday",
    "tomorrow",
    "i ate",
    "i like",
    "i want",
    "need",
    "because",
    "when",
    "on the table"
  ],
  "units": [
    "kg",
    "kilo",
    "kilos",
    "g",
    "gram",
    "grams",
    "l",
    "liter",
    "liters",
    "litre",
    "litres",
    "ml",
    "pack",
    "packs",
    "package",
    "packages",
    "bottle",
    "bottles",
    "box",
    "boxes",
    "can",
    "cans",
    "piece",
    "pieces",
    "pcs"
  ],
  "articlesToClean": ["the", "a", "an", "some"],
  "products": [
    { "canonical": "Rice", "aliases": ["rice"], "category": "pantry" },
    { "canonical": "Milk", "aliases": ["milk"], "category": "dairy" },
    { "canonical": "Eggs", "aliases": ["egg", "eggs"], "category": "dairy" },
    { "canonical": "Sugar", "aliases": ["sugar"], "category": "pantry" },
    { "canonical": "Cheese", "aliases": ["cheese"], "category": "dairy" },
    { "canonical": "Bread", "aliases": ["bread"], "category": "bakery" },
    { "canonical": "Chicken", "aliases": ["chicken"], "category": "meat" },
    { "canonical": "Meat", "aliases": ["meat"], "category": "meat" },
    { "canonical": "Fish", "aliases": ["fish"], "category": "fish" },
    { "canonical": "Water", "aliases": ["water"], "category": "drinks" },
    { "canonical": "Tomato", "aliases": ["tomato", "tomatoes"], "category": "vegetables" },
    { "canonical": "Onion", "aliases": ["onion", "onions"], "category": "vegetables" },
    { "canonical": "Garlic", "aliases": ["garlic"], "category": "vegetables" },
    { "canonical": "Coffee", "aliases": ["coffee"], "category": "pantry" },
    { "canonical": "Oil", "aliases": ["oil"], "category": "pantry" },
    { "canonical": "Salt", "aliases": ["salt"], "category": "pantry" },
    { "canonical": "Pasta", "aliases": ["pasta"], "category": "pantry" },
    { "canonical": "Butter", "aliases": ["butter"], "category": "dairy" },
    { "canonical": "Apple", "aliases": ["apple", "apples"], "category": "fruit" },
    { "canonical": "Pear", "aliases": ["pear", "pears"], "category": "fruit" },
    { "canonical": "Grapes", "aliases": ["grape", "grapes"], "category": "fruit" },
    { "canonical": "Avocado", "aliases": ["avocado", "avocados"], "category": "vegetables" },
    { "canonical": "Salad", "aliases": ["salad"], "category": "vegetables" },
    { "canonical": "Cucumber", "aliases": ["cucumber", "cucumbers"], "category": "vegetables" },
    { "canonical": "Ham", "aliases": ["ham"], "category": "meat" },
    { "canonical": "Mozzarella", "aliases": ["mozzarella"], "category": "dairy" }
  ],
  "multiWordProducts": [
    { "canonical": "Coca cola", "aliases": ["coca cola", "coca-cola"], "category": "drinks" },
    { "canonical": "Orange juice", "aliases": ["orange juice"], "category": "drinks" },
    { "canonical": "Apple juice", "aliases": ["apple juice"], "category": "drinks" },
    { "canonical": "Chicken breast", "aliases": ["chicken breast"], "category": "meat" },
    { "canonical": "Ground meat", "aliases": ["ground meat", "minced meat"], "category": "meat" },
    { "canonical": "Green grapes", "aliases": ["green grapes"], "category": "fruit" },
    { "canonical": "Red apples", "aliases": ["red apples"], "category": "fruit" }
  ]
}
```

---

## File: `src/data/shopping/nl.json`

```json
{
  "language": "nl",
  "connectors": ["en", "&"],
  "narrativeBlockers": [
    "vandaag",
    "gisteren",
    "morgen",
    "ik at",
    "ik eet",
    "ik hou van",
    "ik wil",
    "nodig",
    "omdat",
    "wanneer",
    "op tafel"
  ],
  "units": [
    "kg",
    "kilo",
    "kilos",
    "g",
    "gram",
    "l",
    "liter",
    "liters",
    "ml",
    "pak",
    "pakken",
    "fles",
    "flessen",
    "doos",
    "dozen",
    "blik",
    "blikken",
    "stuk",
    "stukken"
  ],
  "articlesToClean": ["de", "het", "een", "wat"],
  "products": [
    { "canonical": "Rijst", "aliases": ["rijst"], "category": "pantry" },
    { "canonical": "Melk", "aliases": ["melk"], "category": "dairy" },
    { "canonical": "Eieren", "aliases": ["ei", "eieren"], "category": "dairy" },
    { "canonical": "Suiker", "aliases": ["suiker"], "category": "pantry" },
    { "canonical": "Kaas", "aliases": ["kaas"], "category": "dairy" },
    { "canonical": "Brood", "aliases": ["brood"], "category": "bakery" },
    { "canonical": "Kip", "aliases": ["kip"], "category": "meat" },
    { "canonical": "Vlees", "aliases": ["vlees"], "category": "meat" },
    { "canonical": "Vis", "aliases": ["vis"], "category": "fish" },
    { "canonical": "Water", "aliases": ["water"], "category": "drinks" },
    { "canonical": "Tomaat", "aliases": ["tomaat", "tomaten"], "category": "vegetables" },
    { "canonical": "Ui", "aliases": ["ui", "uien"], "category": "vegetables" },
    { "canonical": "Knoflook", "aliases": ["knoflook"], "category": "vegetables" },
    { "canonical": "Koffie", "aliases": ["koffie"], "category": "pantry" },
    { "canonical": "Olie", "aliases": ["olie"], "category": "pantry" },
    { "canonical": "Zout", "aliases": ["zout"], "category": "pantry" },
    { "canonical": "Pasta", "aliases": ["pasta"], "category": "pantry" },
    { "canonical": "Boter", "aliases": ["boter"], "category": "dairy" },
    { "canonical": "Appel", "aliases": ["appel", "appels"], "category": "fruit" },
    { "canonical": "Peer", "aliases": ["peer", "peren"], "category": "fruit" },
    { "canonical": "Druiven", "aliases": ["druif", "druiven"], "category": "fruit" },
    { "canonical": "Avocado", "aliases": ["avocado", "avocados"], "category": "vegetables" },
    { "canonical": "Salade", "aliases": ["salade"], "category": "vegetables" },
    { "canonical": "Komkommer", "aliases": ["komkommer", "komkommers"], "category": "vegetables" },
    { "canonical": "Ham", "aliases": ["ham"], "category": "meat" },
    { "canonical": "Mozzarella", "aliases": ["mozzarella"], "category": "dairy" }
  ],
  "multiWordProducts": [
    { "canonical": "Coca cola", "aliases": ["coca cola", "coca-cola"], "category": "drinks" },
    { "canonical": "Sinaasappelsap", "aliases": ["sinaasappelsap"], "category": "drinks" },
    { "canonical": "Appelsap", "aliases": ["appelsap"], "category": "drinks" },
    { "canonical": "Kipfilet", "aliases": ["kipfilet"], "category": "meat" },
    { "canonical": "Gehakt", "aliases": ["gehakt"], "category": "meat" }
  ]
}
```

---

## Helper module: `src/core/shoppingDictionary.ts`

Create this module to keep dictionary logic out of `shoppingList.ts`.

Responsibilities:

- import all JSON dictionaries
- normalize text for matching
- normalize accents
- collapse extra spaces
- build alias lookup maps
- expose helpers

Suggested helpers:

```ts
getAllShoppingDictionaries()
normalizeShoppingText(text: string): string
findProductAlias(text: string)
isConnector(word: string): boolean
isNarrativeBlocker(text: string): boolean
isKnownUnit(word: string): boolean
cleanLeadingArticles(text: string): string
```

Important:

If JSON imports are not enabled, check `tsconfig` and add:

```json
"resolveJsonModule": true
```

Only add it if needed. Do not break Expo or React Native bundling.

---

## Detector rules

Main function:

```ts
analyzeShoppingListCandidate(rawText)
```

Expected return shape:

```ts
{
  isCandidate: boolean,
  confidence: number,
  reason: string,
  parsedItems: ShoppingListItem[]
}
```

Confidence should increase when:

- text has 3+ product-like items
- text uses commas, new lines, semicolons, bullets, spaces, or connectors
- chunks are short
- most words are known products
- quantities or units are present
- text looks like a list

Confidence should decrease or block when:

- text has narrative words
- text contains many verbs
- text is a long sentence/paragraph
- product ratio is low
- it looks like normal writing

---

## Connector rules

Treat these as list separators only when surrounding text looks like products:

- Spanish: `y`, `e`
- French: `et`
- English: `and`
- Dutch: `en`
- Universal: `&`

Examples that should trigger:

```text
leche y pan
lait sucre et pain
milk bread and cheese
rijst melk en brood
```

Examples that must not trigger:

```text
hoy comí arroz con leche y huevos
j’aime le pain au lait
I like milk and bread
```

---

## Space-separated fallback

If there are no commas or new lines, still detect a shopping list when:

- text is short
- there are 3+ known product terms, OR
- there are 2 known product terms connected by y / et / and / en and the text is very short
- product ratio is high
- no strong narrative blockers are present

Examples that should trigger:

```text
arroz leche huevos azucar
azura leche y pan
lait sucre et pain
pommes de terre oignons ail
rice milk eggs sugar
```

---

## Parsing rules

When converting, create items like:

```ts
{
  id,
  name,
  quantity,
  unit,
  bought: false,
  rawText
}
```

Expected parsing:

```text
azura leche y pan
```

Output:

```text
Azúcar
Leche
Pan
```

```text
lait sucre et pain
```

Output:

```text
Lait
Sucre
Pain
```

```text
pain, lait et coca cola, beurre
```

Output:

```text
Pain
Lait
Coca cola
Beurre
```

```text
pain au lait, coca cola, beurre
```

Output:

```text
Pain au lait
Coca cola
Beurre
```

---

## Quantity and unit rules

Support:

```text
3 poires
1,5 kg ribs
400 g lardons
2 bouteilles d’eau
```

Expected:

```text
3 poires => name: Poires, quantity: 3, unit: pièces
1,5 kg ribs => name: Ribs, quantity: 1.5, unit: kg
400 g lardons => name: Lardons, quantity: 400, unit: g
2 bouteilles d’eau => name: Eau, quantity: 2, unit: bouteilles
```

Clean common articles when useful:

```text
du blanc de poulet => Blanc de poulet
des lardons => Lardons
la crème liquide verte => Crème liquide verte
```

Do not over-correct user wording.

---

## UI rules

In `ComposerSection.tsx` / `NotesTab.tsx`:

- analyze text while typing and pasting
- debounce analysis around 300–500ms
- show a small inline suggestion card/chip
- suggestion must not overlap mobile keyboard or important buttons
- suggestion must match current theme
- hide suggestion if text stops looking like a list
- if user clicks Keep as note, hide suggestion for the current draft
- show again only if text changes significantly
- if user clicks Convert, save using the existing Shopping List note model/UI

Important:

- reuse existing Shopping List card/component
- reuse existing note type/model
- do not create another shopping list format

---

## Duplicate/conversion safety

Once a note is already converted to Shopping List:

- do not keep showing the convert/format suggestion for the same saved shopping list
- do not duplicate items if Convert/Format is clicked twice
- preserve checked/bought status when editing raw text and item names still match
- Shopping List notes should remain pending while not all items are bought
- only mark done/completed if existing app logic explicitly supports it and all items are bought

---

## No regressions

Do not break:

- normal notes
- existing saved shopping lists
- NoteCard rendering
- templates
- clipboard
- history / versions
- sync
- mobile layout
- desktop layout

---

## Implementation phases

### Phase 1 — Create dictionary files

- [ ] Create `src/data/shopping/es.json`
- [ ] Create `src/data/shopping/fr.json`
- [ ] Create `src/data/shopping/en.json`
- [ ] Create `src/data/shopping/nl.json`
- [ ] Add products, aliases, typo aliases, connectors, blockers, units and multi-word products
- [ ] Verify JSON is valid

### Phase 2 — Create dictionary helper

- [ ] Create `src/core/shoppingDictionary.ts`
- [ ] Import all JSON files
- [ ] Add text normalization
- [ ] Add alias lookup
- [ ] Add multi-word lookup
- [ ] Add connector lookup
- [ ] Add blocker lookup
- [ ] Add unit lookup
- [ ] Keep helper reusable and typed

### Phase 3 — Refactor shopping parser

- [ ] Update `src/core/shoppingList.ts`
- [ ] Remove large hardcoded language/product lists
- [ ] Use `shoppingDictionary.ts`
- [ ] Keep existing public functions compatible
- [ ] Improve confidence scoring
- [ ] Add space-separated fallback
- [ ] Add connector-aware detection
- [ ] Add multi-word product preservation
- [ ] Add typo alias support through JSON
- [ ] Keep normal notes safe

### Phase 4 — Improve UI suggestion

- [ ] Update `ComposerSection.tsx` / `NotesTab.tsx` only if needed
- [ ] Debounce candidate analysis
- [ ] Show inline suggestion
- [ ] Convert only on user action
- [ ] Keep as note hides suggestion
- [ ] Avoid overlap on mobile
- [ ] Match current theme
- [ ] Do not show suggestion for already-converted Shopping Lists

### Phase 5 — Improve NoteCard safety

- [ ] Check `NoteCard.tsx`
- [ ] Ensure existing Shopping List rendering still works
- [ ] Avoid duplicate format/convert actions
- [ ] Keep pending status unless all items are bought
- [ ] Preserve bought state after raw edit when names still match

### Phase 6 — Tests

- [ ] Update `tests/run-tests.ts`
- [ ] Add dictionary loading tests
- [ ] Add alias tests
- [ ] Add typo tests
- [ ] Add multi-word product tests
- [ ] Add positive candidate tests
- [ ] Add negative candidate tests
- [ ] Add quantity/unit tests
- [ ] Ensure existing tests still pass

---

## Required tests

### Candidate true

```text
arroz, leche, huevos
arroz leche huevos azucar
arroz leche huevos azúcar
azura leche y pan
leche y pan
arroz, leche y huevos
lait sucre et pain
pain, lait et coca cola, beurre
pain au lait, coca cola, beurre
pommes de terre oignons ail
rice milk eggs sugar
milk bread and cheese
rijst melk eieren suiker
melk brood en kaas
```

### Candidate false

```text
hoy comí arroz con leche y huevos
hoy comi arroz con leche y huevos
me gusta el arroz con leche
arroz con leche es un postre
necesito comprar pan mañana
quiero leche pero no sé si comprarla
j’aime le pain au lait
lait et pain sont sur la table
I like milk and bread
I ate rice with eggs today
ik hou van melk en brood
```

### Parsing tests

```text
azura leche y pan
```

Expected:

```text
Azúcar
Leche
Pan
```

```text
lait sucre et pain
```

Expected:

```text
Lait
Sucre
Pain
```

```text
pain, lait et coca cola, beurre
```

Expected:

```text
Pain
Lait
Coca cola
Beurre
```

```text
pain au lait, coca cola, beurre
```

Expected:

```text
Pain au lait
Coca cola
Beurre
```

---

## Manual QA

Run:

```bash
npm run -s typecheck
npm test -- --runInBand
```

Then manually test:

- [ ] Type `arroz, leche, huevos` => suggestion appears
- [ ] Type `arroz leche huevos azucar` => suggestion appears
- [ ] Type `azura leche y pan` => suggestion appears and parses Azúcar, Leche, Pan
- [ ] Type `lait sucre et pain` => suggestion appears
- [ ] Type `pain, lait et coca cola, beurre` => suggestion appears
- [ ] Type `Hoy comí arroz con leche y huevos` => no suggestion
- [ ] Click Convert => note renders using existing Shopping List UI
- [ ] Click Keep as note => note stays normal and suggestion disappears
- [ ] Edit raw shopping list => re-parse without losing bought items when names still match
- [ ] Click Convert/Format twice => no duplicate items
- [ ] Confirm mobile UI has no overlap
- [ ] Confirm desktop UI still looks clean

---

## Acceptance criteria

- [ ] Product/language data is moved to JSON dictionaries
- [ ] `shoppingList.ts` stays generic and clean
- [ ] Adding a product requires editing JSON only
- [ ] Adding a new language is easy
- [ ] Natural lists with spaces/connectors are detected
- [ ] Normal sentences are not wrongly detected
- [ ] Multi-word products are preserved
- [ ] Typos like `azura` resolve through aliases
- [ ] Existing Shopping List UI/model is reused
- [ ] Existing saved Shopping Lists still work
- [ ] Shopping Lists do not duplicate items after repeated Convert/Format clicks
- [ ] Shopping Lists remain pending unless all items are bought
- [ ] No regression in notes, sync, history, templates, clipboard, mobile or desktop

---

## Future short prompts for Codex

Use these prompts one phase at a time.

```text
Read docs/SHOPPING_LIST_DETECTION_PLAN.md and complete Phase 1 only. Do not touch parser or UI files yet.
```

```text
Read docs/SHOPPING_LIST_DETECTION_PLAN.md and complete Phase 2 only. Keep the helper typed, reusable and centralized.
```

```text
Read docs/SHOPPING_LIST_DETECTION_PLAN.md and complete Phase 3 only. Preserve existing public functions and add tests for the new detection cases.
```

```text
Read docs/SHOPPING_LIST_DETECTION_PLAN.md and complete Phase 4 only. Keep the UI subtle, theme-safe and mobile-safe.
```

```text
Read docs/SHOPPING_LIST_DETECTION_PLAN.md and complete Phase 5 only. Focus on NoteCard safety, duplicate prevention and pending status.
```

```text
Read docs/SHOPPING_LIST_DETECTION_PLAN.md and complete Phase 6 only. Run typecheck and tests.
```

---

## Final output format for Codex

After each phase, reply only:

```text
DONE
Files changed:
- ...
