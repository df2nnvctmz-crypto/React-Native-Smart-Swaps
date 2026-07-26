/**
 * Maps every food in foods.json to a real OpenMoji food-drink icon.
 *
 * OpenMoji's food-drink category has exactly 131 icons (verified against the
 * `openmoji` npm package's data/openmoji.json + color/svg/*.svg at build time —
 * there is no larger "food" set to draw from). Rules are ordered specific-first;
 * the first regex that matches a food's name wins. Foods that hit nothing fall
 * back to one generic icon per foods.json `category`.
 *
 * NOTE: with only 131 real icons for 7,140 foods (many of them ultra-specific
 * Swiss butchery/offal cuts with no OpenMoji equivalent), "cut of meat" ends up
 * covering a large share of the Pantry category. That's an OpenMoji coverage
 * limit, not a mapping bug.
 */

export const KEYWORD_TO_ANNOTATION: [RegExp, string][] = [
  [/strawberr/i, 'strawberry'],
  [/blueberr/i, 'blueberries'],
  [/\bgrape/i, 'grapes'],
  [/watermelon/i, 'watermelon'],
  [/\bmelon/i, 'melon'],
  [/tangerine|mandarin|clementine/i, 'tangerine'],
  [/\blime\b/i, 'lime'],
  [/\blemon/i, 'lemon'],
  [/\bbanana/i, 'banana'],
  [/pineapple/i, 'pineapple'],
  [/\bmango/i, 'mango'],
  [/apple/i, 'red apple'],
  [/\bpear\b/i, 'pear'],
  [/\bpeach/i, 'peach'],
  [/cherr(y|ies)/i, 'cherries'],
  [/kiwi/i, 'kiwi fruit'],
  [/\btomato/i, 'tomato'],
  [/\bolive/i, 'olive'],
  [/coconut/i, 'coconut'],
  [/avocado/i, 'avocado'],
  [/eggplant|aubergine/i, 'eggplant'],
  [/sweet potato/i, 'roasted sweet potato'],
  [/\bpotato\b/i, 'potato'],
  [/\bcarrot/i, 'carrot'],
  [/\bmaize\b|\bcorn\b/i, 'ear of corn'],
  [/chil(l)?i|\bhot pepper/i, 'hot pepper'],
  [/sweet pepper|bell pepper/i, 'bell pepper'],
  [/cucumber/i, 'cucumber'],
  [/broccoli/i, 'broccoli'],
  [/\bgarlic/i, 'garlic'],
  [/\bonion/i, 'onion'],
  [/peanut/i, 'peanuts'],
  [/\bbean(s)?\b/i, 'beans'],
  [/chestnut/i, 'chestnut'],
  [/\bginger/i, 'ginger root'],
  [/\bpea\b|\bpeas\b/i, 'pea pod'],
  [/mushroom/i, 'brown mushroom'],
  [/turnip|swede|celeriac|beet|radish|parsnip|salsify/i, 'root vegetable'],
  [/rocket|lettuce|spinach|chard|kale|cabbage.*greens|greens\b/i, 'leafy green'],
  [/lentil|chickpea|split pea|\btofu\b/i, 'beans'],
  [/\boat(s)?\b|\bbarley\b|\bwheat\b|\brye\b|\bspelt\b|\bquinoa\b|\bmillet\b|\bbuckwheat\b|\bsemolina\b|whole grain|bran\b/i, 'sheaf of rice'],
  [/herb(s)?\b|\bbasil\b|\boregano\b|\bthyme\b|\brosemary\b|\bparsley\b|\bdill\b|\bmint\b|\bsage\b/i, 'herb'],
  [/\bfish\b|salmon|trout|cod\b|tuna|herring|mackerel|sardine|halibut|haddock|catfish|wolffish|whitefish|pike|perch|carp|eel\b|anchov|plaice|sole\b|turbot|seafood|scallop|mussel|oyster|squid|octopus|clam|lobster|crawfish|crayfish/i, 'fish'],
  [/almond|walnut|hazelnut|cashew|pistachio|macadamia|pecan|brazil nut/i, 'peanuts'],
  [/margarine/i, 'butter'],
  [/\bbread\b/i, 'bread'],
  [/croissant/i, 'croissant'],
  [/baguette/i, 'baguette bread'],
  [/flatbread|tortilla|pita|naan/i, 'flatbread'],
  [/pretzel/i, 'pretzel'],
  [/\bbagel/i, 'bagel'],
  [/pancake/i, 'pancakes'],
  [/waffle/i, 'waffle'],
  [/cheese/i, 'cheese wedge'],
  [/poultry|chicken|turkey|duck/i, 'poultry leg'],
  [/bacon/i, 'bacon'],
  [/\bmeat\b|\bbeef\b|\bpork\b|\blamb\b|\bsheep\b|\bveal\b|\bgoat\b|\bgame\b|\bvenison\b|\bham\b|sausage|salami|offal|liver|kidney|tripe/i, 'cut of meat'],
  [/hamburger/i, 'hamburger'],
  [/french fries|chips \(fries\)/i, 'french fries'],
  [/\bpizza/i, 'pizza'],
  [/hot dog|hotdog/i, 'hot dog'],
  [/sandwich/i, 'sandwich'],
  [/\btaco\b/i, 'taco'],
  [/burrito/i, 'burrito'],
  [/\begg\b|\beggs\b/i, 'egg'],
  [/salad/i, 'green salad'],
  [/popcorn/i, 'popcorn'],
  [/\bbutter\b/i, 'butter'],
  [/\bsalt\b/i, 'salt'],
  [/rice cracker/i, 'rice cracker'],
  [/curry/i, 'curry rice'],
  [/\brice\b/i, 'cooked rice'],
  [/spaghetti|\bpasta\b|noodle/i, 'spaghetti'],
  [/sushi/i, 'sushi'],
  [/shrimp|prawn/i, 'fried shrimp'],
  [/dumpling/i, 'dumpling'],
  [/ice cream/i, 'ice cream'],
  [/doughnut|donut/i, 'doughnut'],
  [/\bcookie|biscuit/i, 'cookie'],
  [/\bcake\b/i, 'shortcake'],
  [/cupcake|muffin/i, 'cupcake'],
  [/\bpie\b/i, 'pie'],
  [/chocolate/i, 'chocolate bar'],
  [/candy|caramel|toffee|fudge/i, 'candy'],
  [/lollipop/i, 'lollipop'],
  [/custard|flan/i, 'custard'],
  [/honey/i, 'honey pot'],
  [/\bmilk\b|buttermilk/i, 'glass of milk'],
  [/\btea\b/i, 'teacup without handle'],
  [/\bcoffee\b/i, 'hot beverage'],
  [/\bwine\b/i, 'wine glass'],
  [/\bbeer\b/i, 'beer mug'],
  [/\bjuice\b/i, 'cup with straw'],
  [/\bwater\b/i, 'ice'],
];

// Last-resort fallback when no keyword rule matches, keyed by foods.json `category`.
export const CATEGORY_FALLBACK_ANNOTATION: Record<string, string> = {
  Pantry: 'cut of meat',
  Produce: 'leafy green',
  'Dairy & Eggs': 'cheese wedge',
  Beverages: 'ice',
  Snacks: 'candy',
};

export function getIconAnnotationForFood(food: { name: string; category?: string | null }): string {
  for (const [re, annotation] of KEYWORD_TO_ANNOTATION) {
    if (re.test(food.name)) return annotation;
  }
  return CATEGORY_FALLBACK_ANNOTATION[food.category || ''] || 'cut of meat';
}
