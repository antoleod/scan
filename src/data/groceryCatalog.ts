export type AppLanguage = 'en' | 'fr' | 'es' | 'nl' | string;

export type GroceryCategory =
  | 'fruits'
  | 'vegetables'
  | 'meat'
  | 'fish'
  | 'dairy'
  | 'bakery'
  | 'drinks'
  | 'pantry'
  | 'frozen'
  | 'snacks'
  | 'baby_school'
  | 'household'
  | 'hygiene'
  | 'other';

export type GroceryCatalogItem = {
  id: string;
  category: GroceryCategory;
  defaultQuantity?: string;
  unitOptions?: string[];
  names: Record<string, string[]>;
  aliases?: string[];
};

const n = (en: string[], fr: string[], es: string[], nl: string[]) => ({ en, fr, es, nl });

export const GROCERY_CATALOG: GroceryCatalogItem[] = [
  { id: 'apple', category: 'fruits', defaultQuantity: '1 kg', unitOptions: ['500 g', '1 kg', '2 kg'], names: n(['apple', 'apples'], ['pomme', 'pommes'], ['manzana', 'manzanas'], ['appel', 'appels']) },
  { id: 'red_apple', category: 'fruits', defaultQuantity: '1 kg', unitOptions: ['500 g', '1 kg'], names: n(['red apple', 'red apples', 'school fruit'], ['pomme rouge', 'pommes rouges', 'pommes rouges pour l’école', 'fruit pour l’école'], ['manzana roja', 'manzanas rojas', 'fruta para la escuela'], ['rode appel', 'rode appels', 'schoolfruit']) },
  { id: 'banana', category: 'fruits', defaultQuantity: '1 kg', unitOptions: ['500 g', '1 kg'], names: n(['banana', 'bananas'], ['banane', 'bananes'], ['plátano', 'plátanos', 'banana', 'bananas'], ['banaan', 'bananen']) },
  { id: 'orange', category: 'fruits', defaultQuantity: '1 kg', names: n(['orange', 'oranges'], ['orange', 'oranges'], ['naranja', 'naranjas'], ['sinaasappel', 'sinaasappels']) },
  { id: 'lemon', category: 'fruits', defaultQuantity: '500 g', names: n(['lemon', 'lemons'], ['citron', 'citrons'], ['limón', 'limones'], ['citroen', 'citroenen']) },
  { id: 'lime', category: 'fruits', defaultQuantity: '500 g', names: n(['lime', 'limes'], ['citron vert', 'citrons verts'], ['lima', 'limas'], ['limoen', 'limoenen']) },
  { id: 'pear', category: 'fruits', unitOptions: ['3 pièces', '6 pièces', '1 kg'], names: n(['pear', 'pears'], ['poire', 'poires'], ['pera', 'peras'], ['peer', 'peren']) },
  { id: 'grapes', category: 'fruits', defaultQuantity: '500 g', names: n(['grapes'], ['raisin', 'raisins'], ['uva', 'uvas'], ['druiven']) },
  { id: 'green_grapes', category: 'fruits', defaultQuantity: '500 g', names: n(['green grapes'], ['raisin vert', 'raisins verts'], ['uvas verdes'], ['groene druiven']) },
  { id: 'strawberry', category: 'fruits', defaultQuantity: '500 g', names: n(['strawberry', 'strawberries'], ['fraise', 'fraises'], ['fresa', 'fresas'], ['aardbei', 'aardbeien']) },
  { id: 'raspberry', category: 'fruits', defaultQuantity: '250 g', names: n(['raspberry', 'raspberries'], ['framboise', 'framboises'], ['frambuesa', 'frambuesas'], ['framboos', 'frambozen']) },
  { id: 'avocado', category: 'fruits', names: n(['avocado', 'avocados'], ['avocat', 'avocats'], ['aguacate', 'aguacates'], ['avocado', 'avocado’s']) },
  { id: 'peach', category: 'fruits', names: n(['peach', 'peaches'], ['pêche', 'pêches'], ['melocotón', 'durazno'], ['perzik', 'perziken']) },
  { id: 'mango', category: 'fruits', names: n(['mango', 'mangos'], ['mangue', 'mangues'], ['mango', 'mangos'], ['mango', 'mango’s']) },
  { id: 'pineapple', category: 'fruits', names: n(['pineapple'], ['ananas'], ['piña'], ['ananas']) },
  { id: 'watermelon', category: 'fruits', names: n(['watermelon'], ['pastèque'], ['sandía'], ['watermeloen']) },
  { id: 'melon', category: 'fruits', names: n(['melon'], ['melon'], ['melón'], ['meloen']) },
  { id: 'kiwi', category: 'fruits', names: n(['kiwi', 'kiwis'], ['kiwi', 'kiwis'], ['kiwi', 'kiwis'], ['kiwi', 'kiwi’s']) },
  { id: 'blueberries', category: 'fruits', defaultQuantity: '250 g', names: n(['blueberries', 'blueberry'], ['myrtilles', 'myrtille'], ['arándanos', 'arándano'], ['bosbessen', 'bosbes']) },

  { id: 'potato', category: 'vegetables', defaultQuantity: '1 kg', unitOptions: ['500 g', '1 kg', '2 kg'], names: n(['potato', 'potatoes'], ['pomme de terre', 'pommes de terre'], ['papa', 'papas', 'patata', 'patatas'], ['aardappel', 'aardappelen']) },
  { id: 'onion', category: 'vegetables', defaultQuantity: '1 kg', names: n(['onion', 'onions'], ['oignon', 'oignons'], ['cebolla', 'cebollas'], ['ui', 'uien']) },
  { id: 'garlic', category: 'vegetables', names: n(['garlic'], ['ail'], ['ajo', 'ajos'], ['knoflook']) },
  { id: 'tomato', category: 'vegetables', defaultQuantity: '1 kg', names: n(['tomato', 'tomatoes'], ['tomate', 'tomates'], ['tomate', 'tomates'], ['tomaat', 'tomaten']) },
  { id: 'cucumber', category: 'vegetables', names: n(['cucumber', 'cucumbers'], ['concombre', 'concombres'], ['pepino', 'pepinos'], ['komkommer', 'komkommers']) },
  { id: 'lettuce', category: 'vegetables', names: n(['salad', 'lettuce'], ['salade', 'laitue'], ['ensalada', 'lechuga'], ['sla']) },
  { id: 'carrot', category: 'vegetables', defaultQuantity: '1 kg', names: n(['carrot', 'carrots'], ['carotte', 'carottes'], ['zanahoria', 'zanahorias'], ['wortel', 'wortels']) },
  { id: 'broccoli', category: 'vegetables', names: n(['broccoli'], ['brocoli'], ['brócoli'], ['broccoli']) },
  { id: 'cauliflower', category: 'vegetables', names: n(['cauliflower'], ['chou-fleur'], ['coliflor'], ['bloemkool']) },
  { id: 'zucchini', category: 'vegetables', names: n(['zucchini', 'courgette'], ['courgette'], ['calabacín'], ['courgette']) },
  { id: 'eggplant', category: 'vegetables', names: n(['eggplant', 'aubergine'], ['aubergine'], ['berenjena'], ['aubergine']) },
  { id: 'pepper', category: 'vegetables', names: n(['pepper', 'bell pepper'], ['poivron'], ['pimiento'], ['paprika']) },
  { id: 'spinach', category: 'vegetables', names: n(['spinach'], ['épinards', 'épinard'], ['espinaca', 'espinacas'], ['spinazie']) },
  { id: 'mushroom', category: 'vegetables', names: n(['mushroom', 'mushrooms'], ['champignon', 'champignons'], ['champiñón', 'champiñones'], ['champignon', 'champignons']) },
  { id: 'leek', category: 'vegetables', names: n(['leek'], ['poireau'], ['puerro'], ['prei']) },
  { id: 'celery', category: 'vegetables', names: n(['celery'], ['céleri'], ['apio'], ['selderij']) },
  { id: 'cabbage', category: 'vegetables', names: n(['cabbage'], ['chou'], ['repollo', 'col'], ['kool']) },
  { id: 'green_beans', category: 'vegetables', names: n(['green beans'], ['haricots verts'], ['judías verdes', 'habichuelas'], ['sperziebonen']) },
  { id: 'peas', category: 'vegetables', names: n(['peas'], ['petits pois'], ['guisantes'], ['erwten']) },

  { id: 'minced_pork_veal', category: 'meat', names: n(['minced pork and veal'], ['haché porc et veau', 'haché de porc et veau'], ['picada de cerdo y ternera'], ['gehakt varken en kalf']) },
  { id: 'minced_beef', category: 'meat', names: n(['minced beef', 'ground beef'], ['haché de bœuf'], ['carne picada de ternera'], ['rundergehakt']) },
  { id: 'chicken_breast', category: 'meat', names: n(['chicken breast'], ['blanc de poulet', 'filet de poulet'], ['pechuga de pollo'], ['kipfilet']) },
  { id: 'chicken_thighs', category: 'meat', names: n(['chicken thighs'], ['cuisses de poulet'], ['muslos de pollo'], ['kippendijen']) },
  { id: 'ham', category: 'meat', defaultQuantity: '200 g', names: n(['ham'], ['jambon'], ['jamón'], ['ham']) },
  { id: 'school_ham', category: 'baby_school', defaultQuantity: '200 g', names: n(['school ham'], ['jambon pour l’école'], ['jamón para la escuela'], ['schoolham']) },
  { id: 'bacon_lardons', category: 'meat', names: n(['bacon', 'lardons'], ['lardons'], ['bacon', 'panceta'], ['spekblokjes']) },
  { id: 'sausages', category: 'meat', names: n(['sausages'], ['saucisses'], ['salchichas'], ['worsten']) },
  { id: 'turkey', category: 'meat', names: n(['turkey'], ['dinde'], ['pavo'], ['kalkoen']) },
  { id: 'pork_chops', category: 'meat', names: n(['pork chops'], ['côtes de porc'], ['chuletas de cerdo'], ['varkenskoteletten']) },

  { id: 'cod', category: 'fish', names: n(['cod'], ['cabillaud'], ['bacalao'], ['kabeljauw']) },
  { id: 'salmon', category: 'fish', names: n(['salmon'], ['saumon'], ['salmón'], ['zalm']) },
  { id: 'tuna', category: 'fish', names: n(['tuna'], ['thon'], ['atún'], ['tonijn']) },
  { id: 'shrimp', category: 'fish', names: n(['shrimp'], ['crevettes'], ['gambas', 'camarones'], ['garnalen']) },
  { id: 'white_fish', category: 'fish', names: n(['white fish'], ['poisson blanc'], ['pescado blanco'], ['witte vis']) },
  { id: 'fish_sticks', category: 'fish', names: n(['fish sticks'], ['bâtonnets de poisson'], ['palitos de pescado'], ['vissticks']) },

  { id: 'milk', category: 'dairy', defaultQuantity: '1 l', names: n(['milk'], ['lait'], ['leche'], ['melk']) },
  { id: 'liquid_cream', category: 'dairy', names: n(['liquid cream'], ['crème liquide'], ['nata líquida'], ['room']) },
  { id: 'green_liquid_cream', category: 'dairy', names: n(['green cream', 'green liquid cream'], ['crème liquide verte'], ['nata líquida verde'], ['groene room']) },
  { id: 'mozzarella', category: 'dairy', names: n(['mozzarella'], ['mozzarella'], ['mozzarella'], ['mozzarella']) },
  { id: 'cheese', category: 'dairy', defaultQuantity: '500 g', names: n(['cheese'], ['fromage'], ['queso'], ['kaas']) },
  { id: 'yogurt', category: 'dairy', names: n(['yogurt', 'yoghurt'], ['yaourt'], ['yogur'], ['yoghurt']) },
  { id: 'butter', category: 'dairy', defaultQuantity: '250 g', names: n(['butter'], ['beurre'], ['mantequilla'], ['boter']) },
  { id: 'eggs', category: 'dairy', defaultQuantity: '12 pcs', names: n(['eggs', 'egg'], ['œufs', 'oeufs', 'œuf', 'oeuf'], ['huevos', 'huevo'], ['eieren', 'ei']) },

  { id: 'bread', category: 'bakery', defaultQuantity: '1 pack', names: n(['bread'], ['pain'], ['pan'], ['brood']) },
  { id: 'school_bread', category: 'baby_school', defaultQuantity: '1 pack', names: n(['school bread'], ['pain pour l’école'], ['pan para la escuela'], ['schoolbrood']) },
  { id: 'baguette', category: 'bakery', names: n(['baguette'], ['baguette'], ['baguette'], ['stokbrood']) },
  { id: 'sandwich_bread', category: 'bakery', names: n(['sandwich bread'], ['pain de mie'], ['pan de molde'], ['toastbrood']) },
  { id: 'croissant', category: 'bakery', names: n(['croissant'], ['croissant'], ['cruasán'], ['croissant']) },
  { id: 'wraps', category: 'bakery', names: n(['wraps'], ['wraps'], ['tortillas', 'wraps'], ['wraps']) },

  { id: 'water', category: 'drinks', defaultQuantity: '1.5 l', names: n(['water'], ['eau'], ['agua'], ['water']) },
  { id: 'orange_juice', category: 'drinks', defaultQuantity: '1 l', names: n(['orange juice'], ['jus d’orange', 'jus d\'orange'], ['zumo de naranja', 'jugo de naranja'], ['sinaasappelsap']) },
  { id: 'apple_juice', category: 'drinks', defaultQuantity: '1 l', names: n(['apple juice'], ['jus de pommes', 'jus de pomme'], ['zumo de manzana', 'jugo de manzana'], ['appelsap']) },
  { id: 'milk_drink', category: 'drinks', names: n(['milk drink'], ['boisson lactée'], ['bebida láctea'], ['melkdrank']) },
  { id: 'sparkling_water', category: 'drinks', defaultQuantity: '1.5 l', names: n(['sparkling water'], ['eau pétillante'], ['agua con gas'], ['bruiswater']) },

  { id: 'rice', category: 'pantry', defaultQuantity: '1 kg', names: n(['rice'], ['riz'], ['arroz'], ['rijst']) },
  { id: 'pasta', category: 'pantry', defaultQuantity: '500 g', names: n(['pasta'], ['pâtes', 'pates'], ['pasta'], ['pasta']) },
  { id: 'flour', category: 'pantry', defaultQuantity: '1 kg', names: n(['flour'], ['farine'], ['harina'], ['bloem']) },
  { id: 'sugar', category: 'pantry', defaultQuantity: '1 kg', names: n(['sugar'], ['sucre'], ['azúcar'], ['suiker']) },
  { id: 'salt', category: 'pantry', names: n(['salt'], ['sel'], ['sal'], ['zout']) },
  { id: 'olive_oil', category: 'pantry', defaultQuantity: '1 l', names: n(['olive oil'], ['huile d’olive', 'huile d\'olive'], ['aceite de oliva'], ['olijfolie']) },
  { id: 'sunflower_oil', category: 'pantry', defaultQuantity: '1 l', names: n(['sunflower oil'], ['huile de tournesol'], ['aceite de girasol'], ['zonnebloemolie']) },
  { id: 'vinegar', category: 'pantry', names: n(['vinegar'], ['vinaigre'], ['vinagre'], ['azijn']) },
  { id: 'tomato_sauce', category: 'pantry', names: n(['tomato sauce'], ['sauce tomate'], ['salsa de tomate'], ['tomatensaus']) },
  { id: 'cereal', category: 'pantry', names: n(['cereal', 'cereals'], ['céréales'], ['cereales'], ['ontbijtgranen']) },
  { id: 'coffee', category: 'pantry', names: n(['coffee'], ['café'], ['café'], ['koffie']) },
  { id: 'tea', category: 'pantry', names: n(['tea'], ['thé'], ['té'], ['thee']) },

  { id: 'school_snack', category: 'baby_school', names: n(['school snack'], ['goûter pour l’école'], ['merienda para la escuela'], ['schoolsnack']) },
  { id: 'school_fruit', category: 'baby_school', names: n(['school fruit'], ['fruit pour l’école'], ['fruta para la escuela'], ['schoolfruit']) },
  { id: 'compote', category: 'baby_school', names: n(['compote', 'apple sauce'], ['compote'], ['compota'], ['compote']) },
  { id: 'juice_box', category: 'baby_school', names: n(['juice box'], ['brique de jus'], ['zumo en brick'], ['sapdoosje']) },

  { id: 'toilet_paper', category: 'household', names: n(['toilet paper'], ['papier toilette'], ['papel higiénico'], ['toiletpapier']) },
  { id: 'kitchen_paper', category: 'household', names: n(['kitchen paper'], ['essuie-tout'], ['papel de cocina'], ['keukenpapier']) },
  { id: 'detergent', category: 'household', names: n(['detergent'], ['lessive'], ['detergente'], ['wasmiddel']) },
  { id: 'dish_soap', category: 'household', names: n(['dish soap'], ['liquide vaisselle'], ['lavavajillas'], ['afwasmiddel']) },
  { id: 'shampoo', category: 'hygiene', names: n(['shampoo'], ['shampooing'], ['champú'], ['shampoo']) },
  { id: 'toothpaste', category: 'hygiene', names: n(['toothpaste'], ['dentifrice'], ['pasta de dientes'], ['tandpasta']) },
  { id: 'soap', category: 'hygiene', names: n(['soap'], ['savon'], ['jabón'], ['zeep']) },
  { id: 'wipes', category: 'hygiene', names: n(['wipes'], ['lingettes'], ['toallitas'], ['doekjes']) },
];

export function getGroceryDisplayName(item: GroceryCatalogItem, language: AppLanguage = 'en'): string {
  const lang = typeof language === 'string' ? language.slice(0, 2).toLowerCase() : 'en';
  return item.names[lang]?.[0] || item.names.en?.[0] || item.id;
}
