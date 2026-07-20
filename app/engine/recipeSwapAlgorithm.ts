/**
 * Recipe-specific ingredient swap matching.
 *
 * This is deliberately NOT the same pipeline as swapAlgorithm.ts's general
 * findBestSwaps() (used for "swap this grocery item" everywhere else in the app).
 * A recipe ingredient plays a functional ROLE in a dish - fat, thickener, egg,
 * sweetener, leavening, protein, etc - and a candidate that's nutritionally similar
 * but functionally wrong doesn't just rank lower here, it's excluded outright. The
 * bar for a recipe swap is "would this actually work if you cooked it", not just
 * "healthier".
 *
 * FIRST-PASS BUGS FOUND BY TESTING AGAINST REAL RECIPES (kept here so nobody
 * reintroduces them):
 * - Naive `.includes(keyword)` substring matching tagged "Rice boiled" as FAT,
 *   because "boiled" contains the substring "oil". Fixed with word-boundary regex
 *   matching instead of plain substring search.
 * - A broad VEGETABLE/FRUIT/OTHER bucket suggested "Garlic" as a swap for "Onion"
 *   and "Tomato" (all three share the exact same swiss_category "Vegetables/Fresh
 *   vegetables" in this dataset, which is too coarse to mean "interchangeable").
 *   There's no reliable name/category signal in this data to tell "kale is a fine
 *   swap for spinach" from "garlic is not a fine swap for tomato", so this engine
 *   deliberately stays silent (returns null) for those three buckets rather than
 *   guess - see COARSE_ROLES below.
 * - "Garlic in oil, canned, drained" name-matched FAT (via "oil") and got offered as
 *   a swap for actual cooking oils. Its swiss_category is "Vegetables/Fresh
 *   vegetables", not "Fats and oils" - added category corroboration so a name match
 *   alone isn't enough for FAT/DAIRY_LIQUID.
 * - "Saffron milk cap" (a mushroom) name-matched DAIRY_LIQUID via the word "milk".
 *   Same category-corroboration fix catches this too (its category is nowhere near
 *   dairy).
 * - Baking powder (chemical leavening) and yeast (biological leavening) were treated
 *   as interchangeable under one LEAVENING bucket - split into two.
 */

import { FoodItem } from '../types';
import { evaluateSwap, isLiquid, isRawIngredient } from './swapAlgorithm';
import { extractSwapFeatures, predictSwapQuality, combineWithExistingScore } from './swapRanker';
import { computeVectorSimilarity } from './foodVectors';

export type CulinaryRole =
  | 'FAT'
  | 'SWEETENER'
  | 'CHEMICAL_LEAVENING'
  | 'YEAST'
  | 'EGG'
  | 'DAIRY_LIQUID'
  | 'FLOUR_STARCH'
  | 'PROTEIN'
  | 'SEASONING'
  | 'VEGETABLE'
  | 'FRUIT'
  | 'OTHER';

// Buckets too heterogeneous for role-tagging alone to guarantee a plausible recipe
// substitute (this dataset's vegetable/fruit subcategories are too coarse - onion,
// garlic, and tomato all share "Vegetables/Fresh vegetables"). This engine
// intentionally offers no swap for these rather than guess.
const COARSE_ROLES = new Set<CulinaryRole>(['VEGETABLE', 'FRUIT', 'OTHER']);

type PreciseRole = Exclude<CulinaryRole, 'VEGETABLE' | 'FRUIT' | 'OTHER'>;

const ROLE_KEYWORDS: Record<PreciseRole, string[]> = {
  FAT: ['oil', 'butter', 'margarine', 'lard', 'shortening'],
  SWEETENER: ['sugar', 'honey', 'syrup', 'sweetener', 'agave'],
  CHEMICAL_LEAVENING: ['baking powder', 'baking soda', 'bicarbonate'],
  YEAST: ['yeast'],
  EGG: ['egg'],
  DAIRY_LIQUID: ['milk', 'cream', 'buttermilk'],
  FLOUR_STARCH: ['flour', 'starch', 'cornflour', 'cornstarch'],
  PROTEIN: ['chicken', 'beef', 'pork', 'turkey', 'fish', 'salmon', 'tuna', 'tofu', 'lentil', 'bean', 'mince', 'sausage'],
  SEASONING: ['salt', 'pepper', 'spice', 'herb', 'seasoning', 'vanilla', 'cinnamon'],
};

// A name keyword match alone isn't enough evidence for these roles - real recipe
// data had compound/prepared items ("Garlic in oil, canned", a mushroom called
// "milk cap") name-match a role they have nothing to do with. Require the food's
// own top-level category to NOT be one of these unrelated buckets too.
const CATEGORY_EXCLUDE_FOR_ROLE: Partial<Record<PreciseRole, string[]>> = {
  FAT: ['Vegetables', 'Fruit', 'Soups and stocks', 'Prepared dishes', 'Potatoes and starches'],
  DAIRY_LIQUID: ['Vegetables', 'Fruit', 'Soups and stocks', 'Prepared dishes', 'Potatoes and starches'],
};

function hasWord(name: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`).test(name);
}

/**
 * Best-effort functional role for an ingredient. Falls back to the food's broad
 * category (vegetable/fruit) and finally OTHER - see COARSE_ROLES above for why
 * those three buckets never actually produce a swap suggestion.
 */
export function getCulinaryRole(food: FoodItem): CulinaryRole {
  const name = food.name.toLowerCase();
  const topCategory = food.swiss_category.split('/')[0];

  for (const role of Object.keys(ROLE_KEYWORDS) as PreciseRole[]) {
    const matches = ROLE_KEYWORDS[role].some(kw => hasWord(name, kw));
    if (!matches) continue;
    const excluded = CATEGORY_EXCLUDE_FOR_ROLE[role];
    if (excluded?.includes(topCategory)) continue; // name matched, but category disagrees - keep looking
    return role;
  }

  if (topCategory === 'Vegetables') return 'VEGETABLE';
  if (topCategory === 'Fruit') return 'FRUIT';
  return 'OTHER';
}

export interface RecipeSwapResult {
  candidate: FoodItem;
  score: number;
  vectorSimilarity: number;
}

const MIN_HEALTH_IMPROVEMENT = 10;

/**
 * Finds the single best recipe-appropriate swap for an ingredient, or null if
 * nothing clears the bar (including "this ingredient's role isn't precise enough
 * to trust automatically" - see COARSE_ROLES). Returning null on purpose is the
 * point - a recipe swap that doesn't actually work in the dish is worse than no
 * suggestion at all.
 */
export function findBestRecipeSwap(
  ingredientFood: FoodItem,
  allFoods: FoodItem[],
  dietaryPreference: string[] = ['Balanced']
): RecipeSwapResult | null {
  if (ingredientFood.health_score >= 75) return null; // already a fine choice as-is

  const role = getCulinaryRole(ingredientFood);
  if (COARSE_ROLES.has(role)) return null;

  const targetIsLiquid = isLiquid(ingredientFood);
  const targetIsRaw = isRawIngredient(ingredientFood);

  let candidates = allFoods.filter(f =>
    f.id !== ingredientFood.id &&
    f.health_score >= ingredientFood.health_score + MIN_HEALTH_IMPROVEMENT &&
    getCulinaryRole(f) === role &&
    isLiquid(f) === targetIsLiquid &&
    isRawIngredient(f) === targetIsRaw
  );

  if (dietaryPreference.includes('Vegetarian')) {
    candidates = candidates.filter(f => f.category !== 'Meat' && f.category !== 'Fish');
  }
  if (dietaryPreference.includes('Vegan')) {
    candidates = candidates.filter(f => f.category !== 'Meat' && f.category !== 'Fish' && f.category !== 'Dairy');
  }

  let best: RecipeSwapResult | null = null;

  for (const candidate of candidates) {
    let score = evaluateSwap(ingredientFood, candidate);

    // Learned nutrient-delta signal from swapRanker.ts (cosine_sim stays null here -
    // no real embeddings exist, see the neutrality note in that file).
    const features = extractSwapFeatures(ingredientFood, candidate, null, 0, 0);
    score = combineWithExistingScore(score, predictSwapQuality(features));

    // Lexical name-similarity bonus (0.7x-1.3x) - NOT a hard cutoff for these precise
    // roles. A same-role substitute with a totally different name (margarine for
    // butter, tofu for chicken) is often exactly the right swap despite zero shared
    // vocabulary, so this only nudges ranking rather than excluding valid candidates.
    const vectorSimilarity = computeVectorSimilarity(ingredientFood, candidate);
    score *= 0.7 + 0.6 * vectorSimilarity;

    if (!best || score > best.score) {
      best = { candidate, score, vectorSimilarity };
    }
  }

  return best;
}
