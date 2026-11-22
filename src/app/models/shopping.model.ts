export type ShoppingCategoryId =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'bakery'
  | 'grocery'
  | 'drinks'
  | 'household'
  | 'sweets'
  | 'frozen'
  | 'other';

export interface ShoppingCategoryMeta {
  id: ShoppingCategoryId;
  label: string;
  shortLabel: string;
  icon: string;
}

export const SHOPPING_CATEGORIES: ShoppingCategoryMeta[] = [
  { id: 'produce', label: 'Овочі та фрукти', shortLabel: 'Овочі', icon: 'eco' },
  { id: 'dairy', label: 'Молочні та яйця', shortLabel: 'Молочні', icon: 'egg_alt' },
  { id: 'meat', label: 'Мʼясо, птиця та риба', shortLabel: 'Мʼясо', icon: 'set_meal' },
  { id: 'bakery', label: 'Хліб та випічка', shortLabel: 'Хліб', icon: 'bakery_dining' },
  { id: 'grocery', label: 'Бакалія та крупи', shortLabel: 'Бакалія', icon: 'kitchen' },
  { id: 'drinks', label: 'Напої', shortLabel: 'Напої', icon: 'local_cafe' },
  { id: 'household', label: 'Побутова хімія та гігієна', shortLabel: 'Побут', icon: 'cleaning_services' },
  { id: 'sweets', label: 'Солодощі та снеки', shortLabel: 'Солодощі', icon: 'cookie' },
  { id: 'frozen', label: 'Заморозка', shortLabel: 'Заморозка', icon: 'ac_unit' },
  { id: 'other', label: 'Інше', shortLabel: 'Інше', icon: 'shopping_bag' },
];

export interface ShoppingParticipant {
  id: string;
  name: string;
  email?: string;
  picture?: string;
  sharedHouses?: string[];
}

export type ShoppingPriceMode = 'per_100g' | 'per_kg' | 'per_unit';

export interface ShoppingItem {
  id: string;
  name: string;
  category: ShoppingCategoryId;
  quantity: number;
  unit?: string;
  priceMode?: ShoppingPriceMode;
  weightGrams?: number | null;
  price: number | null;
  isBought: boolean;
  addedByUserId: string;
  addedByName: string;
  boughtByUserId?: string;
  boughtByName?: string;
  createdAt: string;
  updatedAt?: string;
}

export function resolveShoppingPriceMode(
  item: Pick<ShoppingItem, 'priceMode' | 'unit'>
): ShoppingPriceMode {
  if (
    item.priceMode === 'per_100g' ||
    item.priceMode === 'per_kg' ||
    item.priceMode === 'per_unit'
  ) {
    return item.priceMode;
  }
  const normalizedUnit = (item.unit || '').trim().toLowerCase();
  if (normalizedUnit === 'г' || normalizedUnit === 'гр' || normalizedUnit === 'g') {
    return 'per_100g';
  }
  if (normalizedUnit === 'кг' || normalizedUnit === 'kg') {
    return 'per_kg';
  }
  return 'per_unit';
}

export function computeShoppingItemTotal(
  item: Pick<ShoppingItem, 'price' | 'quantity' | 'priceMode' | 'unit' | 'weightGrams'>,
  overridePrice?: number | null,
  overrideWeightGrams?: number | null
): number {
  const unitPrice =
    overridePrice !== undefined ? Number(overridePrice ?? 0) : Number(item.price ?? 0);
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) return 0;

  const mode = resolveShoppingPriceMode(item);
  if (mode === 'per_100g') {
    const rawGrams = overrideWeightGrams !== undefined ? overrideWeightGrams : item.weightGrams;
    const grams =
      rawGrams !== null && rawGrams !== undefined && Number.isFinite(Number(rawGrams)) && Number(rawGrams) > 0
        ? Number(rawGrams)
        : 100;
    return Math.round(unitPrice * (grams / 100) * 100) / 100;
  }

  if (mode === 'per_kg') {
    const rawGrams = overrideWeightGrams !== undefined ? overrideWeightGrams : item.weightGrams;
    const kg =
      rawGrams !== null && rawGrams !== undefined && Number.isFinite(Number(rawGrams)) && Number(rawGrams) > 0
        ? Number(rawGrams) / 1000
        : 1;
    return Math.round(unitPrice * kg * 100) / 100;
  }

  const qty = Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0 ? Number(item.quantity) : 1;
  return Math.round(unitPrice * qty * 100) / 100;
}

export const SHOPPING_THEME_IMAGES = {
  vegetables: '/assets/images/shop_vegetables_1795349838660.jpg',
  fruits: '/assets/images/shop_fruits_1795349847456.jpg',
  dairy: '/assets/images/shop_dairy_1795349847931.jpg',
  meat: '/assets/images/shop_meat_1795349847623.jpg',
  fish: '/assets/images/shop_fish_1795349846589.jpg',
  bakery: '/assets/images/shop_bakery_1795349846628.jpg',
  grocery: '/assets/images/shop_grocery_1795349847063.jpg',
  coffeeTea: '/assets/images/shop_coffee_tea_1795349848194.jpg',
  drinks: '/assets/images/shop_drinks_1795349848129.jpg',
  household: '/assets/images/shop_household_1795349850156.jpg',
  sweets: '/assets/images/shop_sweets_1795349847487.jpg',
  frozen: '/assets/images/shop_frozen_1795349846592.jpg',
  other: '/assets/images/shop_other_1795349848265.jpg',
} as const;

export function resolveShoppingItemImage(
  name: string | undefined | null,
  category: ShoppingCategoryId | undefined | null
): string {
  const low = (name || '').trim().toLowerCase();

  // Specific visual subcategories first so items get the closest thematic photo
  if (/риб|лосос|форел|оселед|селед|краб|тунец|тунц|кревет|кальмар|скумбр|ікр|морепрод|salmon|fish|tuna/.test(low)) {
    return SHOPPING_THEME_IMAGES.fish;
  }
  if (
    category !== 'frozen' &&
    /яблук|яблок|банан|лимон|апельсин|мандарин|виноград|груш|ківі|киви|авокад|персик|нектарин|слив|абрикос|гранат|манго|ананас|кавун|дин|полуниц|клубник|малин|лохин|чорниц|вишн|черешн|фрукт|apple|banana|orange|lemon|fruit/.test(low)
  ) {
    return SHOPPING_THEME_IMAGES.fruits;
  }
  if (/кав|коф|чай|чаю|какао|матч|еспрес|coffee|tea|cocoa/.test(low)) {
    return SHOPPING_THEME_IMAGES.coffeeTea;
  }

  switch (category) {
    case 'produce':
      return SHOPPING_THEME_IMAGES.vegetables;
    case 'dairy':
      return SHOPPING_THEME_IMAGES.dairy;
    case 'meat':
      return SHOPPING_THEME_IMAGES.meat;
    case 'bakery':
      return SHOPPING_THEME_IMAGES.bakery;
    case 'grocery':
      return SHOPPING_THEME_IMAGES.grocery;
    case 'drinks':
      return SHOPPING_THEME_IMAGES.drinks;
    case 'household':
      return SHOPPING_THEME_IMAGES.household;
    case 'sweets':
      return SHOPPING_THEME_IMAGES.sweets;
    case 'frozen':
      return SHOPPING_THEME_IMAGES.frozen;
    default:
      break;
  }

  // Fallback keyword matching for custom items saved under 'other'
  if (/молок|кефір|сметан|масл|сир|яйц|йогурт|ряжанк|вершк|milk|cheese|egg|butter/.test(low)) {
    return SHOPPING_THEME_IMAGES.dairy;
  }
  if (/хліб|батон|лаваш|булоч|круасан|випіч|bread|croissant|bakery/.test(low)) {
    return SHOPPING_THEME_IMAGES.bakery;
  }
  if (/мʼяс|м'яс|мяс|курк|куряч|свинин|ялович|індич|фарш|ковбас|сосис|сардел|бекон|грудин|сало|meat|chicken|pork|beef/.test(low)) {
    return SHOPPING_THEME_IMAGES.meat;
  }
  if (/картоп|цибул|моркв|буряк|капуст|помідор|томат|огірк|перец|часник|зелен|салат|гриб|печериц|кабач|баклаж|брокол|овоч/.test(low)) {
    return SHOPPING_THEME_IMAGES.vegetables;
  }
  if (/шоколад|печив|цукер|вафл|пряник|чіпс|сухар|горіх|сухофрукт|насін|батонч|зефір|торт|тістеч|chocolate|cookie|candy/.test(low)) {
    return SHOPPING_THEME_IMAGES.sweets;
  }
  if (/мило|шампун|гель|паст|папір|рушник|сервет|порош|кондиціон|губк|пакет|дезодор|фольг|пергамент|плівк|засіб|таблетк/.test(low)) {
    return SHOPPING_THEME_IMAGES.household;
  }
  if (/пельмен|вареник|морозив|заморож|тісто|ice cream|frozen/.test(low)) {
    return SHOPPING_THEME_IMAGES.frozen;
  }
  if (/греч|рис|макарон|спагет|вівсян|булгур|кускус|борошн|цукор|сіль|олі|оцет|соус|кетчуп|майонез|гірчиц|консерв|оливк|маслин|спеці|приправ|дріждж|мед/.test(low)) {
    return SHOPPING_THEME_IMAGES.grocery;
  }
  if (/вод|сік|сок|кола|напій|газов|морс|компот|квас|juice|water|soda/.test(low)) {
    return SHOPPING_THEME_IMAGES.drinks;
  }

  return SHOPPING_THEME_IMAGES.other;
}

export interface ShoppingList {
  id: string;
  title: string;
  ownerUserId: string;
  ownerName: string;
  participantIds: string[];
  budgetUah: number | null;
  items: ShoppingItem[];
  isInactive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingCatalogItem {
  id: string;
  name: string;
  category: ShoppingCategoryId;
  defaultUnit?: string;
  isCustom?: boolean;
  createdByUserId?: string;
}

export interface ShoppingDataResponse {
  lists: ShoppingList[];
  catalog: ShoppingCatalogItem[];
  people: ShoppingParticipant[];
}

export const DEFAULT_SHOPPING_CATALOG: ShoppingCatalogItem[] = [
  // Овочі та фрукти (produce)
  { id: 'cat_potato', name: 'Картопля', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_onion', name: 'Цибуля ріпчаста', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_carrot', name: 'Морква', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_beet', name: 'Буряк', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_cabbage', name: 'Капуста білокачанна', category: 'produce', defaultUnit: 'шт' },
  { id: 'cat_tomato', name: 'Помідори', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_cucumber', name: 'Огірки', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_pepper', name: 'Перець болгарський', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_garlic', name: 'Часник', category: 'produce', defaultUnit: 'шт' },
  { id: 'cat_greens', name: 'Зелень (кріп, петрушка)', category: 'produce', defaultUnit: 'пуч' },
  { id: 'cat_green_onion', name: 'Цибуля зелена', category: 'produce', defaultUnit: 'пуч' },
  { id: 'cat_lettuce', name: 'Салат листовий', category: 'produce', defaultUnit: 'шт' },
  { id: 'cat_mushrooms', name: 'Печериці (гриби)', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_zucchini', name: 'Кабачки', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_eggplant', name: 'Баклажани', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_broccoli', name: 'Броколі', category: 'produce', defaultUnit: 'шт' },
  { id: 'cat_apples', name: 'Яблука', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_bananas', name: 'Банани', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_lemons', name: 'Лимони', category: 'produce', defaultUnit: 'шт' },
  { id: 'cat_oranges', name: 'Апельсини', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_tangerines', name: 'Мандарини', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_grapes', name: 'Виноград', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_pears', name: 'Груші', category: 'produce', defaultUnit: 'кг' },
  { id: 'cat_kiwi', name: 'Ківі', category: 'produce', defaultUnit: 'шт' },
  { id: 'cat_avocado', name: 'Авокадо', category: 'produce', defaultUnit: 'шт' },

  // Молочні продукти та яйця (dairy)
  { id: 'cat_milk', name: 'Молоко', category: 'dairy', defaultUnit: 'л' },
  { id: 'cat_kefir', name: 'Кефір', category: 'dairy', defaultUnit: 'л' },
  { id: 'cat_sour_cream', name: 'Сметана', category: 'dairy', defaultUnit: 'шт' },
  { id: 'cat_butter', name: 'Масло вершкове', category: 'dairy', defaultUnit: 'пач' },
  { id: 'cat_hard_cheese', name: 'Сир твердий', category: 'dairy', defaultUnit: 'г' },
  { id: 'cat_cottage_cheese', name: 'Сир кисломолочний', category: 'dairy', defaultUnit: 'пач' },
  { id: 'cat_cream_cheese', name: 'Сир плавлений / крем-сир', category: 'dairy', defaultUnit: 'шт' },
  { id: 'cat_mozzarella', name: 'Моцарела / Сулугуні', category: 'dairy', defaultUnit: 'шт' },
  { id: 'cat_yogurt', name: 'Йогурт', category: 'dairy', defaultUnit: 'шт' },
  { id: 'cat_ryazhenka', name: 'Ряжанка', category: 'dairy', defaultUnit: 'шт' },
  { id: 'cat_cream', name: 'Вершки', category: 'dairy', defaultUnit: 'шт' },
  { id: 'cat_eggs', name: 'Яйця курячі (10 шт)', category: 'dairy', defaultUnit: 'дес' },
  { id: 'cat_condensed_milk', name: 'Згущене молоко', category: 'dairy', defaultUnit: 'шт' },
  { id: 'cat_glazed_curd', name: 'Сирки глазуровані', category: 'dairy', defaultUnit: 'шт' },

  // Мʼясо, птиця та риба (meat)
  { id: 'cat_chicken_fillet', name: 'Куряче філе', category: 'meat', defaultUnit: 'кг' },
  { id: 'cat_chicken_legs', name: 'Курячі стегна / гомілки', category: 'meat', defaultUnit: 'кг' },
  { id: 'cat_pork', name: 'Свинина', category: 'meat', defaultUnit: 'кг' },
  { id: 'cat_beef', name: 'Яловичина', category: 'meat', defaultUnit: 'кг' },
  { id: 'cat_turkey', name: 'Індичка', category: 'meat', defaultUnit: 'кг' },
  { id: 'cat_minced_meat', name: 'Фарш мʼясний', category: 'meat', defaultUnit: 'кг' },
  { id: 'cat_sausage_boiled', name: 'Ковбаса варена', category: 'meat', defaultUnit: 'шт' },
  { id: 'cat_sausage_smoked', name: 'Ковбаса копчена', category: 'meat', defaultUnit: 'шт' },
  { id: 'cat_frankfurters', name: 'Сосиски / сардельки', category: 'meat', defaultUnit: 'пач' },
  { id: 'cat_bacon', name: 'Бекон / грудинка', category: 'meat', defaultUnit: 'пач' },
  { id: 'cat_salo', name: 'Сало', category: 'meat', defaultUnit: 'кг' },
  { id: 'cat_fish_fresh', name: 'Риба свіжа / філе', category: 'meat', defaultUnit: 'кг' },
  { id: 'cat_salmon', name: 'Червона риба (лосось / форель)', category: 'meat', defaultUnit: 'пач' },
  { id: 'cat_herring', name: 'Оселедець', category: 'meat', defaultUnit: 'шт' },
  { id: 'cat_crab_sticks', name: 'Крабові палички', category: 'meat', defaultUnit: 'пач' },

  // Хліб та випічка (bakery)
  { id: 'cat_bread_white', name: 'Хліб білий', category: 'bakery', defaultUnit: 'шт' },
  { id: 'cat_bread_rye', name: 'Хліб чорний / житній', category: 'bakery', defaultUnit: 'шт' },
  { id: 'cat_baton', name: 'Батон', category: 'bakery', defaultUnit: 'шт' },
  { id: 'cat_toast_bread', name: 'Хліб тостовий', category: 'bakery', defaultUnit: 'пач' },
  { id: 'cat_lavash', name: 'Лаваш', category: 'bakery', defaultUnit: 'шт' },
  { id: 'cat_buns', name: 'Булочки', category: 'bakery', defaultUnit: 'шт' },
  { id: 'cat_croissant', name: 'Круасани', category: 'bakery', defaultUnit: 'шт' },
  { id: 'cat_crackers_bread', name: 'Хлібці', category: 'bakery', defaultUnit: 'пач' },

  // Бакалія та крупи (grocery)
  { id: 'cat_buckwheat', name: 'Гречка', category: 'grocery', defaultUnit: 'пач' },
  { id: 'cat_rice', name: 'Рис', category: 'grocery', defaultUnit: 'пач' },
  { id: 'cat_pasta', name: 'Макарони / спагеті', category: 'grocery', defaultUnit: 'пач' },
  { id: 'cat_oatmeal', name: 'Вівсяні пластівці', category: 'grocery', defaultUnit: 'пач' },
  { id: 'cat_bulgur', name: 'Булгур / кускус', category: 'grocery', defaultUnit: 'пач' },
  { id: 'cat_flour', name: 'Борошно пшеничне', category: 'grocery', defaultUnit: 'кг' },
  { id: 'cat_sugar', name: 'Цукор', category: 'grocery', defaultUnit: 'кг' },
  { id: 'cat_salt', name: 'Сіль', category: 'grocery', defaultUnit: 'пач' },
  { id: 'cat_sunflower_oil', name: 'Олія соняшникова', category: 'grocery', defaultUnit: 'пляш' },
  { id: 'cat_olive_oil', name: 'Олія оливкова', category: 'grocery', defaultUnit: 'пляш' },
  { id: 'cat_vinegar', name: 'Оцет', category: 'grocery', defaultUnit: 'пляш' },
  { id: 'cat_soy_sauce', name: 'Соєвий соус', category: 'grocery', defaultUnit: 'пляш' },
  { id: 'cat_ketchup', name: 'Кетчуп', category: 'grocery', defaultUnit: 'шт' },
  { id: 'cat_mayo', name: 'Майонез', category: 'grocery', defaultUnit: 'шт' },
  { id: 'cat_mustard', name: 'Гірчиця', category: 'grocery', defaultUnit: 'шт' },
  { id: 'cat_tomato_paste', name: 'Томатна паста', category: 'grocery', defaultUnit: 'шт' },
  { id: 'cat_canned_corn', name: 'Кукурудза консервована', category: 'grocery', defaultUnit: 'банка' },
  { id: 'cat_canned_peas', name: 'Горошок консервований', category: 'grocery', defaultUnit: 'банка' },
  { id: 'cat_canned_beans', name: 'Квасоля консервована', category: 'grocery', defaultUnit: 'банка' },
  { id: 'cat_canned_tuna', name: 'Тунець консервований', category: 'grocery', defaultUnit: 'банка' },
  { id: 'cat_olives', name: 'Оливки / маслини', category: 'grocery', defaultUnit: 'банка' },
  { id: 'cat_spices', name: 'Спеції та приправи', category: 'grocery', defaultUnit: 'пач' },
  { id: 'cat_black_pepper', name: 'Перець чорний мелений', category: 'grocery', defaultUnit: 'пач' },
  { id: 'cat_baking_powder', name: 'Розпушувач / сода', category: 'grocery', defaultUnit: 'пач' },
  { id: 'cat_yeast', name: 'Дріжджі', category: 'grocery', defaultUnit: 'пач' },
  { id: 'cat_honey', name: 'Мед', category: 'grocery', defaultUnit: 'банка' },

  // Напої (drinks)
  { id: 'cat_water_still', name: 'Вода питна негазована', category: 'drinks', defaultUnit: 'пляш' },
  { id: 'cat_water_sparkling', name: 'Вода мінеральна газована', category: 'drinks', defaultUnit: 'пляш' },
  { id: 'cat_tea_black', name: 'Чай чорний', category: 'drinks', defaultUnit: 'пач' },
  { id: 'cat_tea_green', name: 'Чай зелений / травʼяний', category: 'drinks', defaultUnit: 'пач' },
  { id: 'cat_coffee_ground', name: 'Кава мелена / в зернах', category: 'drinks', defaultUnit: 'пач' },
  { id: 'cat_coffee_instant', name: 'Кава розчинна', category: 'drinks', defaultUnit: 'шт' },
  { id: 'cat_cocoa', name: 'Какао', category: 'drinks', defaultUnit: 'пач' },
  { id: 'cat_juice', name: 'Сік фруктовий', category: 'drinks', defaultUnit: 'л' },
  { id: 'cat_soda', name: 'Газований напій / Кола', category: 'drinks', defaultUnit: 'пляш' },
  { id: 'cat_kompot', name: 'Морс / компот / квас', category: 'drinks', defaultUnit: 'пляш' },

  // Побутова хімія та гігієна (household)
  { id: 'cat_toilet_paper', name: 'Туалетний папір', category: 'household', defaultUnit: 'уп' },
  { id: 'cat_paper_towels', name: 'Паперові рушники', category: 'household', defaultUnit: 'уп' },
  { id: 'cat_napkins', name: 'Серветки столові', category: 'household', defaultUnit: 'пач' },
  { id: 'cat_wet_wipes', name: 'Вологі серветки', category: 'household', defaultUnit: 'пач' },
  { id: 'cat_trash_bags', name: 'Пакети для сміття', category: 'household', defaultUnit: 'рул' },
  { id: 'cat_dish_soap', name: 'Засіб для миття посуду', category: 'household', defaultUnit: 'шт' },
  { id: 'cat_sponges', name: 'Губки для посуду', category: 'household', defaultUnit: 'уп' },
  { id: 'cat_laundry_detergent', name: 'Пральний порошок / гель', category: 'household', defaultUnit: 'шт' },
  { id: 'cat_fabric_softener', name: 'Кондиціонер для білизни', category: 'household', defaultUnit: 'шт' },
  { id: 'cat_dishwasher_tabs', name: 'Таблетки для посудомийки', category: 'household', defaultUnit: 'уп' },
  { id: 'cat_bathroom_cleaner', name: 'Засіб для ванної / туалету', category: 'household', defaultUnit: 'шт' },
  { id: 'cat_liquid_soap', name: 'Мило рідке / туалетне', category: 'household', defaultUnit: 'шт' },
  { id: 'cat_shampoo', name: 'Шампунь', category: 'household', defaultUnit: 'шт' },
  { id: 'cat_shower_gel', name: 'Гель для душу', category: 'household', defaultUnit: 'шт' },
  { id: 'cat_toothpaste', name: 'Зубна паста', category: 'household', defaultUnit: 'шт' },
  { id: 'cat_deodorant', name: 'Дезодорант', category: 'household', defaultUnit: 'шт' },
  { id: 'cat_foil', name: 'Фольга / пергамент / плівка', category: 'household', defaultUnit: 'рул' },

  // Солодощі та снеки (sweets)
  { id: 'cat_chocolate', name: 'Шоколад', category: 'sweets', defaultUnit: 'шт' },
  { id: 'cat_cookies', name: 'Печиво', category: 'sweets', defaultUnit: 'пач' },
  { id: 'cat_candies', name: 'Цукерки', category: 'sweets', defaultUnit: 'г' },
  { id: 'cat_waffles', name: 'Вафлі / пряники', category: 'sweets', defaultUnit: 'пач' },
  { id: 'cat_chips', name: 'Чіпси / сухарики', category: 'sweets', defaultUnit: 'пач' },
  { id: 'cat_nuts', name: 'Горіхи / сухофрукти', category: 'sweets', defaultUnit: 'пач' },
  { id: 'cat_seeds', name: 'Насіння соняшникове', category: 'sweets', defaultUnit: 'пач' },
  { id: 'cat_bars', name: 'Батончики / зефір', category: 'sweets', defaultUnit: 'шт' },

  // Заморозка (frozen)
  { id: 'cat_pelmeni', name: 'Пельмені', category: 'frozen', defaultUnit: 'пач' },
  { id: 'cat_varenyky', name: 'Вареники', category: 'frozen', defaultUnit: 'пач' },
  { id: 'cat_frozen_veg', name: 'Овочева суміш заморожена', category: 'frozen', defaultUnit: 'пач' },
  { id: 'cat_frozen_berries', name: 'Ягоди заморожені', category: 'frozen', defaultUnit: 'пач' },
  { id: 'cat_ice_cream', name: 'Морозиво', category: 'frozen', defaultUnit: 'шт' },
  { id: 'cat_puff_pastry', name: 'Тісто листкове', category: 'frozen', defaultUnit: 'пач' },

  // Інше (other)
  { id: 'cat_pet_food', name: 'Корм для тварин', category: 'other', defaultUnit: 'шт' },
  { id: 'cat_batteries', name: 'Батарейки', category: 'other', defaultUnit: 'уп' },
  { id: 'cat_candles', name: 'Свічки / сірники', category: 'other', defaultUnit: 'уп' },
  { id: 'cat_lightbulb', name: 'Лампочки LED', category: 'other', defaultUnit: 'шт' },
];
