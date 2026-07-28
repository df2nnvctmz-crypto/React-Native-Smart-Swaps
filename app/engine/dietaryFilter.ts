/**
 * Decides whether a food is acceptable for a dietary preference.
 *
 * WHY THIS EXISTS: findBestSwaps previously filtered with
 *     f.category !== 'Meat' && f.category !== 'Fish' && f.category !== 'Dairy'
 * but `category` in this database holds shopping-aisle labels - the only values are
 * Pantry, Snacks, Produce, "Dairy & Eggs" and Beverages. There is no 'Meat', no 'Fish',
 * and 'Dairy & Eggs' is not 'Dairy', so every condition was always true and the filter
 * was a complete no-op. Verified: with preference set to Vegan, "Pork mince, raw"
 * returned pork steak, pork neck and beef. That is the bug this file fixes.
 *
 * DELIBERATELY BIASED TOWARD EXCLUSION. Everywhere else in this engine, over-matching a
 * keyword is the bug (see getEquivalenceGroup's notes on "fat" and "milk"). Here the
 * asymmetry runs the other way: wrongly hiding a vegan food costs a user one suggestion
 * they never see, while wrongly showing pork to a vegan is a product failure they will
 * remember. So the keyword lists are broad on purpose, and ambiguous cases resolve to
 * "exclude".
 *
 * TWO LAYERS, because neither alone is sufficient:
 *  1. swiss_category - catches whole animal products (1,535 meat, 527 fish, 279 dairy).
 *  2. name keywords  - catches animal ingredients inside foods filed elsewhere:
 *     "Chicken stock" is Soups and stocks, "Lasagne" is Prepared dishes, "Cheese-ham
 *     crescent" is Bakery products. Category alone would pass all three.
 *
 * The plant-alternative override matters: "Plant-based mince", "Cheese alternative
 * Mozzarella style, vegan" and "Soya spreadable sausage alternative" all contain animal
 * words in their names but are exactly what a vegan user should be offered.
 */

import { FoodItem } from '../types';

export type DietaryPreference = 'Balanced' | 'Vegetarian' | 'Vegan' | string;

// Whole-word matcher, same approach as swapAlgorithm.ts - a bare substring test collides
// constantly in this dataset ("ham" in "hamburger bun" is fine, but "cod" in "cocoa" is
// not, and "egg" in "eggplant" definitely is not).
function hasWord(str: string, words: string[]): boolean {
  const lower = str.toLowerCase();
  return words.some(w => {
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(lower);
  });
}

// Marks a product as a deliberate plant-based substitute. Checked FIRST, so a food
// carrying one of these is never excluded by the animal words it also contains.
// Same list as getEquivalenceGroup's PLANT_ALT_KEYWORDS, and for the same reason:
// "substitute"/"alternative" are excluded because in this database they attach to a
// different noun as often as to the food class ("Coffee substitute with milk").
const PLANT_ALT = ['vegan', 'plant-based', 'plant based', 'tofu', 'seitan', 'soy', 'soya', 'texturised', 'texturized'];

const MEAT_CATEGORIES = ['meat and meat products'];
const FISH_CATEGORIES = ['fish and seafood', 'fish'];
const DAIRY_CATEGORIES = ['milk and dairy products'];

const MEAT_WORDS = [
  'meat', 'beef', 'pork', 'veal', 'lamb', 'mutton', 'goat', 'venison', 'game',
  'chicken', 'poultry', 'turkey', 'duck', 'goose', 'rabbit', 'hare',
  'ham', 'bacon', 'sausage', 'salami', 'mince', 'minced', 'wurst', 'bratwurst',
  'liver', 'kidney', 'heart', 'tripe', 'offal', 'blood', 'brawn', 'pate',
  'lard', 'tallow', 'dripping', 'gelatine', 'gelatin', 'bologna', 'pastrami',
  'prosciutto', 'chorizo', 'pepperoni', 'schnitzel', 'meatball', 'burger patty',
];

const FISH_WORDS = [
  'fish', 'salmon', 'tuna', 'cod', 'haddock', 'herring', 'mackerel', 'sardine',
  'anchovy', 'trout', 'carp', 'pike', 'perch', 'plaice', 'sole', 'halibut',
  'whiting', 'pollack', 'saithe', 'eel', 'bass', 'bream', 'albacore',
  'shrimp', 'prawn', 'crab', 'lobster', 'crayfish', 'mussel', 'oyster', 'clam',
  'squid', 'octopus', 'scallop', 'caviar', 'roe', 'seafood', 'surimi',
];

const DAIRY_WORDS = [
  'milk', 'cheese', 'butter', 'cream', 'yoghurt', 'yogurt', 'quark', 'curd',
  'whey', 'skyr', 'kefir', 'ghee', 'mozzarella', 'ricotta', 'parmesan', 'feta',
  'camembert', 'brie', 'gouda', 'cheddar', 'emmentaler', 'mascarpone', 'lactose',
];

const EGG_WORDS = ['egg', 'eggs', 'mayonnaise', 'meringue', 'albumen'];

// Honey is the classic non-vegan edge case users notice immediately.
const OTHER_ANIMAL_WORDS = ['honey', 'beeswax', 'propolis', 'royal jelly', 'carmine', 'shellac'];

function inCategory(food: FoodItem, prefixes: string[]): boolean {
  const cat = (food.swiss_category ?? '').toLowerCase();
  return prefixes.some(p => cat.startsWith(p));
}

/**
 * A name that explicitly DECLARES an animal ingredient, e.g. "Meat substitute containing
 * gluten, milk and soya" or "Vegetarian cold cuts alternative, with egg".
 *
 * This exists to break the plant-alternative exemption below, and it is not hypothetical:
 * both of those products carry plant-alternative markers ("soya", "vegetarian") and were
 * therefore being offered to vegan users despite listing milk and egg in their own names.
 * A declared ingredient always beats a marketing label.
 *
 * Bounded to 40 characters and stopped at ; or brackets - NOT at commas, because an
 * ingredient list is comma-separated by nature: an earlier version excluded commas and
 * therefore never matched "containing gluten, milk and soya", stopping dead at the first
 * comma before it ever reached the word it was looking for.
 */
const DECLARED_ANIMAL = /\b(containing|contains|with)\b[^;()]{0,40}\b(milk|egg|eggs|cheese|butter|cream|honey|whey|lactose|gelatine|gelatin)\b/i;
const DECLARED_MEAT = /\b(containing|contains|with)\b[^;()]{0,40}\b(meat|beef|pork|chicken|poultry|ham|bacon|fish|gelatine|gelatin|lard)\b/i;

/** True when the food is explicitly a plant-based substitute product. */
export function isPlantAlternative(food: FoodItem): boolean {
  return hasWord(food.name, PLANT_ALT) || hasWord(food.name_de ?? '', PLANT_ALT);
}

/** Contains meat or fish. */
export function containsMeatOrFish(food: FoodItem): boolean {
  const text = `${food.name} ${food.name_de ?? ''}`;
  // Declared ingredients are checked BEFORE the plant-alternative exemption, so a
  // product cannot market itself past its own ingredient list.
  if (DECLARED_MEAT.test(text)) return true;
  if (isPlantAlternative(food)) return false;
  if (inCategory(food, [...MEAT_CATEGORIES, ...FISH_CATEGORIES])) return true;
  return hasWord(text, MEAT_WORDS) || hasWord(text, FISH_WORDS);
}

/** Contains dairy, egg, honey or another animal-derived ingredient. */
export function containsAnimalProduct(food: FoodItem): boolean {
  const text = `${food.name} ${food.name_de ?? ''}`;
  if (DECLARED_ANIMAL.test(text) || DECLARED_MEAT.test(text)) return true;
  if (containsMeatOrFish(food)) return true;
  if (isPlantAlternative(food)) return false;
  if (inCategory(food, DAIRY_CATEGORIES)) return true;
  return hasWord(text, DAIRY_WORDS) || hasWord(text, EGG_WORDS) || hasWord(text, OTHER_ANIMAL_WORDS);
}

/**
 * Whether this food may be shown as a swap under the given preferences.
 *
 * Unknown preference strings are permissive - a typo or a future preference this file
 * has not learned about should not silently empty every user's suggestions.
 */
export function isAllowedForDiet(food: FoodItem, preferences: DietaryPreference[]): boolean {
  if (preferences.includes('Vegan')) return !containsAnimalProduct(food);
  if (preferences.includes('Vegetarian')) return !containsMeatOrFish(food);
  return true;
}
