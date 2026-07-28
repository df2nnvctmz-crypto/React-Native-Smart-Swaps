import { FoodItem } from '../types';
import { applyPersonalPreference } from './personalSwapPreferences';
import { embeddingCosine } from './foodEmbeddings';
import { getAttributes, ROLE_LABELS } from './foodAttributes';
import { isAllowedForDiet } from './dietaryFilter';
import { extractGbmFeatures, predictSwapQualityGbm } from './swapGbm';

const STOP_WORDS = new Set(['and', 'the', 'with', 'organic', 'raw', 'fried', 'without', 'fat', 'pan', 'in', 'of', 'for', 'a']);
const UNSWEETENED_KEYWORDS = ['zero', 'diet', 'plain', 'unsweetened', 'no sugar'];
const SWEETENED_KEYWORDS = ['sweet', 'sugar', 'syrup', 'honey', 'sweetened', 'chocolate', 'candy', 'pastry', 'cola', 'cookie', 'cake'];

const LIQUID_KEYWORDS = ['drink', 'juice', 'beverage', 'milk', 'soda', 'water', 'cola', 'liquid', 'tea', 'coffee', 'stock', 'broth', 'cream', 'sahne'];
const RESTRICTED_KEYWORDS = ['alcohol', 'beer', 'wine', 'energy drink', 'liquor', 'vodka', 'rum', 'whiskey', 'spirit'];
const RAW_INGREDIENT_KEYWORDS = ['flour', 'starch', 'dried', 'powder'];

function normalizeString(str: string): string[] {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

// Word-boundary (whole-word/whole-phrase) keyword match - every keyword-list check in
// this file goes through this, instead of a plain .includes() substring test. A bare
// substring check collides with unrelated words disturbingly often in this dataset, and
// every case below was verified against the real data, not hypothesized:
//   "tea" inside "steak"           -> 73 foods
//   "cola" inside "chocolate"      -> 232 foods
//   "cream" inside "cream cheese"  -> 151 foods
//   "rum" inside "rump"/"drumstick"-> 21 foods
//   "sweet" inside "sweetbread"    -> 7 foods (organ meat, not a dessert)
//   "cake" inside "pancake"        -> 38 foods
//   "bread" inside "breadfruit", "stock" inside "stockfish", "water" inside
//   "watermelon", "liquor" inside "liquorice" -> 1 food each
// \b enforces a real word edge on both sides, so a keyword only matches when it
// appears as an actual word (or, for multi-word keywords like "energy drink" or "no
// sugar", the literal phrase) - not as a fragment of a longer word. This protection
// is automatic for any food added to the database later; it does not require
// hand-maintaining an exclusion list each time a new collision is discovered.
function containsKeywords(str: string, keywords: string[]): boolean {
  const lowerStr = str.toLowerCase();
  return keywords.some(kw => {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(lowerStr);
  });
}

export function isLiquid(food: FoodItem): boolean {
  // NOTE: deliberately checks the food's own NAME only, not category/swiss_category text.
  // Category labels are broad taxonomy umbrellas (e.g. "Milk, cream and cheese" covers
  // liquid milk, liquid cream, AND solid cheese under one label) - matching keywords
  // against that shared label text produces false positives for every food in the
  // bucket, not just the actually-liquid ones. Concretely: Whipping cream and
  // Mozzarella share the exact swiss_category string "Milk and dairy products/Milk,
  // cream and cheese" - checking category text made both match "cream" and therefore
  // both register as liquid, defeating the whole point of this filter.
  return containsKeywords(food.name, LIQUID_KEYWORDS);
}

// A "raw cooking ingredient" (flour, starch, dried goods, powders) plays a different
// role in a meal than a ready-to-eat food - swapping one for the other tends to be a
// poor match even when the category and nutrients line up on paper.
export function isRawIngredient(food: FoodItem): boolean {
  return containsKeywords(food.name, RAW_INGREDIENT_KEYWORDS);
}

function isRestricted(food: FoodItem): boolean {
  return containsKeywords(food.name, RESTRICTED_KEYWORDS)
    || containsKeywords(`${food.category} ${food.swiss_category}`, RESTRICTED_KEYWORDS);
}

const MEAT_KEYWORDS = ['meat', 'poultry', 'mince', 'sausage'];
const OILS_FATS_KEYWORDS = ['fat', 'fats', 'oil', 'oils'];
const DAIRY_KEYWORDS = ['milk', 'dairy', 'cheese', 'yoghurt'];
const GRAINS_KEYWORDS = ['cereal', 'bread', 'pasta', 'rice', 'grain'];
const VEG_KEYWORDS = ['vegetable'];
// Gate for the NAME-based half of the MEAT_ALT / DAIRY_ALT checks below. Consulting
// the name at all exists for exactly one purpose - letting a plant-based product sit
// in the same swap pool as the animal product it replaces, since this database has no
// category for them (they are scattered across "Legumes...soy products" (tofu),
// "Cereals...whole grains" (seitan), "Fats and oils/Vegetable oils" (plant cheese) and
// "Prepared dishes/Mixed dishes" (vegan tofu burger)). Without the gate the name check
// was matching any product that merely MENTIONS milk/meat, which is overwhelmingly
// ordinary food: it pulled 292 extra foods into DAIRY_ALT (vs only 279 from the
// category itself) and 117 into MEAT_ALT, of which 254 and 111 respectively were pure
// noise - milk chocolate bars, "Saffron milk cap" (a mushroom), "Coconut meat",
// "Egg pasta Tortellini (meat filling)", stocks and soups. Requiring a plant-alternative
// marker as well cuts those to 6 and 6, every one of them a real alternative product.
//
// Deliberately EXCLUDED from this list, both verified against real foods.json entries:
//   - bare "substitute"/"alternative": in this database those words attach to a
//     different noun as often as to the food class - "Coffee substitute (infusion)
//     with milk 3.5 % fat" is a coffee substitute, not a dairy one. Every genuine
//     alternative product also carries "vegan", "plant-based", or its base ingredient,
//     so dropping these two loses nothing and removes the whole coffee family.
//   - plant-milk ingredients "oat"/"almond"/"coconut"/"rice"/"cashew": too collision-
//     prone in a database this size - they readmit "Milk chocolate filled with
//     almond-caramel", "Coconut meat, raw", "Milk soup thickened with oat flakes" and
//     "Rice soup with meat stock". The named plant milks that matter are reachable by
//     their category instead.
const PLANT_ALT_KEYWORDS = ['vegan', 'plant-based', 'plant based', 'tofu', 'seitan', 'soy', 'soya', 'texturised', 'texturized'];
const FRUIT_KEYWORDS = ['fruit'];
const SWEETS_KEYWORDS = ['sweet', 'sugar', 'chocolate'];
const BEVERAGES_KEYWORDS = ['beverage', 'drink', 'juice'];

// Map broad Swiss categories to equivalence groups to allow vegan swaps for dairy/meat
function getEquivalenceGroup(swissCategory: string, name: string): string {
  const lowerCat = swissCategory.toLowerCase();

  // Meat check MUST come before oils/fats: the real Swiss category "Meat and meat
  // products/Fat and offal" (organ meats, trimmed fat cuts) is itself a meat
  // subcategory whose own string contains "fat" - checking oils/fats first routed
  // every food in it into OILS_FATS instead of MEAT_ALT, breaking its strict-category
  // swap pool (e.g. "Sheep shoulder, raw" ended up grouped with "Garlic boiled").
  // MEAT_ALT keeps its ungated name check, unlike DAIRY_ALT below. Measured, they
  // are not the same situation. The meat name check is doing a SECOND job beyond
  // plant alternatives: this database files plenty of genuine meat foods under
  // non-meat categories ("Meat skewer (veal and pork) grilled" is
  // "Prepared dishes/Mixed dishes"; meat stocks are "Soups and stocks"), and the
  // name is the only thing that identifies them as meat at all. Gating this check
  // on a plant-alternative marker was tried and reverted - it dropped those real
  // meat dishes out of MEAT_ALT entirely, taking their swap pools to zero. The
  // residual noise it admits ("Coconut meat", "Egg pasta Tortellini (meat filling)")
  // is ~117 foods and far less harmful than losing real meat classification.
  if (containsKeywords(lowerCat, MEAT_KEYWORDS) || containsKeywords(name, MEAT_KEYWORDS)) return 'MEAT_ALT';

  // OILS_FATS is decided by CATEGORY ONLY - deliberately not by name, unlike every
  // other group here. In this dataset "fat" and "oil" appear in food names as
  // NUTRITIONAL DESCRIPTORS far more often than as food identity:
  //   "Yogurt mild, min. 3.5 % fat"        "Roquefort min. 50 % fat in dry matter"
  //   "Garlic fried without fat (pan)"     "Whiting fried without fat (pan)"
  // These are whole-word matches, so the \b guard in containsKeywords does not help -
  // the word really is "fat", just used to describe a food rather than name one.
  // Checking the name routed 1,096 foods into OILS_FATS that do not belong there
  // (259 dairy, 164 fish, 115 vegetables), which then became each other's swap
  // candidates: real yoghurt slates were returning fried mushrooms and pollack,
  // and an LLM rater scored only 0.8% of the resulting pairs as acceptable swaps.
  // The name check rescued nothing in exchange - "Fats and oils/Vegetable oils"
  // already captures 750 genuine oils by category (and "Meat and meat products/Fat
  // and offal" is caught by the MEAT check above, per the note there), while of the
  // 1,096 name-only matches just 39 even contain a fat noun, all of them incidental
  // ("Apple cake (quark oil dough)", "Polenta prepared with rapeseed oil"). Verified
  // against real foods.json entries - do not reintroduce the name check without
  // re-measuring both of those numbers.
  if (containsKeywords(lowerCat, OILS_FATS_KEYWORDS)) return 'OILS_FATS';
  // Unlike MEAT_ALT above, the dairy name check is almost pure noise and its
  // name-only matches were inspected one category at a time: milk chocolate bars,
  // coffee/tea with milk, cheese waffles, milk rolls, "Ham bologna with cheese",
  // "Saffron milk cap" (a mushroom). These are foods that CONTAIN dairy, not dairy
  // products, and there is no "real dairy filed under the wrong category" population
  // here for the check to rescue - the way there is for meat. So the plant-alternative
  // gate applies: 292 name-only matches drop to 6, all of them genuine.
  if (containsKeywords(lowerCat, DAIRY_KEYWORDS) || (containsKeywords(name, DAIRY_KEYWORDS) && containsKeywords(name, PLANT_ALT_KEYWORDS))) return 'DAIRY_ALT';
  if (containsKeywords(lowerCat, GRAINS_KEYWORDS)) return 'GRAINS';
  if (containsKeywords(lowerCat, VEG_KEYWORDS) || containsKeywords(name, VEG_KEYWORDS)) return 'VEG';
  if (containsKeywords(lowerCat, FRUIT_KEYWORDS)) return 'FRUIT';
  if (containsKeywords(lowerCat, SWEETS_KEYWORDS)) return 'SWEETS';
  if (containsKeywords(lowerCat, BEVERAGES_KEYWORDS)) return 'BEVERAGES';

  // Default to the first part of the swiss category string
  return lowerCat.split('/')[0];
}

export interface SwapResult {
  candidate: FoodItem;
  score: number;
}

// Foods the labeling pass called `raw_produce` - whole, minimally processed fruit and
// veg. 278 foods, of which 268 sit in Vegetables / Fruit / Potatoes.
const RAW_PRODUCE_ROLE = ROLE_LABELS.indexOf('raw_produce');
// ...but only suppress swaps for produce that is ALSO in good shape. The handful of
// low-scoring raw_produce entries are exactly the ones a user should be nudged away
// from - "Banana dried" (47), "Carrot pickled, drained" (58) - and those keep their
// suggestions. Fresh produce clusters in the high 60s and 70s, well above this line.
const WHOLE_FOOD_MIN_SCORE = 65;

export type SwapSuppressionReason = 'already_healthy' | 'whole_food';

/**
 * Why we are DELIBERATELY not suggesting swaps for this food, or null if we would.
 *
 * This exists because "no swaps" has two completely different meanings and the UI was
 * showing the same message for both. "No healthier swaps found in our database" reads as
 * a gap in the product; for a banana or a cucumber the honest message is "this is already
 * a good choice". Callers should check this before rendering an empty-state.
 *
 * The whole-food case is not a cosmetic fix. Measured on real receipt data, 37 of the 51
 * raw-produce items users actually scanned were getting suggestions, and they were
 * uniformly nonsense - cucumber, tomato, courgette, lettuce and spinach ALL resolved to
 * "Curly kale raw", because kale is the only fresh vegetable scoring 10+ points above
 * them. The algorithm was technically satisfying its own filter while giving advice
 * nobody would follow.
 */
export function swapSuppressionReason(food: FoodItem): SwapSuppressionReason | null {
  if (food.health_score >= 80) return 'already_healthy';
  const attrs = getAttributes(food.id);
  if (attrs?.culinaryRole === RAW_PRODUCE_ROLE && food.health_score >= WHOLE_FOOD_MIN_SCORE) {
    return 'whole_food';
  }
  return null;
}

export function evaluateSwap(currentFood: FoodItem, candidate: FoodItem): number {
  let score = 0;

  // 1. Core Health Score Jumps
  const scoreDiff = candidate.health_score - currentFood.health_score;
  if (scoreDiff > 0) {
    score += Math.sqrt(scoreDiff) * 5;
    if (scoreDiff >= 10 && scoreDiff <= 40) {
      score += 40; // Realistic Jump Bonus
    }
  }

  // 2. Exact Swiss Category Match (Very High Bonus)
  if (currentFood.swiss_category === candidate.swiss_category) {
    score += 300;
  }

  // 3. Name Overlap (Semantic Similarity)
  const currentWords = normalizeString(currentFood.name);
  const candidateWords = normalizeString(candidate.name);
  const overlap = currentWords.filter(w => candidateWords.includes(w)).length;
  // Massive bonus for sharing base nouns (e.g. Yoghurt -> Yoghurt)
  if (overlap > 0) {
    score += (overlap * 150);
  }

  // Sweet-to-Unsweet Bonus: only reward when swapping away from a genuinely sweet
  // food toward an unsweetened alternative. The original used
  // !containsKeywords(UNSWEETENED_KEYWORDS) which is true for almost every food name
  // (most foods aren't labelled "zero/diet/plain"), giving a spurious +150 to nearly
  // every pair. Check positive SWEETENED_KEYWORDS instead.
  const currentIsSweet = containsKeywords(currentFood.name, SWEETENED_KEYWORDS);
  const candidateIsUnsweet = containsKeywords(candidate.name, UNSWEETENED_KEYWORDS);
  if (currentIsSweet && candidateIsUnsweet) {
    score += 150;
  }

  // 4. Targeted Macro Optimizations based on category group
  const group = getEquivalenceGroup(currentFood.swiss_category, currentFood.name);
  const currNutrients = currentFood.nutrients_per_100;
  const candNutrients = candidate.nutrients_per_100;

  if (group === 'OILS_FATS') {
    // Oils are judged almost entirely on Saturated Fat profile
    const satFatDiff = currNutrients.saturated_fat_g - candNutrients.saturated_fat_g;
    score += satFatDiff * 15; // heavily reward lower saturated fat
  }
  else if (group === 'DAIRY_ALT') {
    // Dairy/Yogurts are judged on Sugar and Fat
    const sugarDiff = currNutrients.sugars_g - candNutrients.sugars_g;
    const fatDiff = currNutrients.fat_g - candNutrients.fat_g;
    score += sugarDiff * 8;
    score += fatDiff * 6;

    // Dairy is a primary calcium source - a plant-based/lower-fat alternative that
    // quietly drops calcium a lot is a common real downside of this exact swap category.
    const calciumDiff = candNutrients.micros.calcium_mg - currNutrients.micros.calcium_mg;
    score += (calciumDiff / 50) * 4;
  }
  else if (group === 'MEAT_ALT') {
    // Meats judged on Protein retention and lower saturated fat
    const proteinDiff = candNutrients.protein_g - currNutrients.protein_g;
    const satFatDiff = currNutrients.saturated_fat_g - candNutrients.saturated_fat_g;
    score += proteinDiff * 8;
    score += satFatDiff * 10;

    // Meat is a primary iron source - the same "looks healthier but loses a key
    // micronutrient" risk as the dairy case above.
    const ironDiff = candNutrients.micros.iron_mg - currNutrients.micros.iron_mg;
    score += ironDiff * 8;
  }
  else {
    // General heuristics for other categories
    const sugarDiff = currNutrients.sugars_g - candNutrients.sugars_g;
    score += (sugarDiff > 0 ? sugarDiff * 4 : sugarDiff * 2);
  }

  // Salt and fiber matter for every category, not just the ones singled out above -
  // previously an oil or dairy swap got no credit at all for also being lower-salt or
  // higher-fiber. Meat/general swaps keep their original (larger) salt weight since
  // that's the group where salt already mattered most and was tuned/validated.
  const saltDiff = currNutrients.salt_g - candNutrients.salt_g;
  const fiberDiff = candNutrients.fiber_g - currNutrients.fiber_g;
  score += saltDiff * (group === 'OILS_FATS' || group === 'DAIRY_ALT' ? 12 : 20);
  score += fiberDiff * 5;

  // 5. Calorie Parity constraint
  const currentKcal = currNutrients.kcal || 1;
  const candKcal = candNutrients.kcal;
  const kcalRatio = candKcal / currentKcal;

  if (kcalRatio >= 0.8 && kcalRatio <= 1.2) {
    score += 40;
  }
  if (kcalRatio > 1.5 || kcalRatio < 0.5) {
    score -= 100; // Penalize wild calorie swings
  }

  return score;
}

// TRIED AND REJECTED: supplementing a thin strict-category pool with cross-category
// candidates admitted purely by Granite whole-name cosine similarity. Calibration
// against real foods.json entries disproved the premise before this shipped:
// genuine taxonomy blind spots that a similarity fallback should rescue - e.g. "Beef
// mince, raw" -> "Tofu" (0.646) or -> "Vegetarian bratwurst...tofu..." (0.634) - scored
// LOWER than clearly unrelated pairs that just happen to share a preparation-state word
// - e.g. "Strawberry raw" -> "Garlic raw" (0.805), "Lobster raw" -> "Black truffle...
// raw" (0.798). On short 2-4 word food names, this embedding is dominated by
// boilerplate like "raw"/"roh"/"boiled", not food identity, so no threshold both admits
// real substitutes and excludes nonsense ones. Do not reintroduce a cosine-gated
// candidate-generation fallback without first re-embedding on text that strips
// preparation-state words, and validating separation on known good/bad pairs BEFORE
// wiring it into the candidate pool - the ranker-layer use of embeddingCosine below
// (as one scoring input among several, not a pool-admission gate) remains valid and
// unaffected by this finding.

export function findBestSwaps(badFood: FoodItem, allFoods: FoodItem[], count: number = 3, dietaryPreference: string[] = ['Balanced']): SwapResult[] {
  // Covers both "already scores 80+" and "this is whole produce and fine as it is" -
  // see swapSuppressionReason() for why the second case matters and what the UI should
  // say instead of an empty-state.
  if (swapSuppressionReason(badFood) !== null) {
    return [];
  }

  // Determine the broad equivalence group of the target food
  const targetGroup = getEquivalenceGroup(badFood.swiss_category, badFood.name);
  const targetIsLiquid = isLiquid(badFood);

  // Base pool: every filter that has NOTHING to do with category taxonomy - physical
  // state, dietary preference, and restricted foods. Both the strict category match
  // below and the embedding fallback draw from this same pool, so a cross-category
  // candidate can never bypass a filter its same-category sibling has to pass.
  let basePool = allFoods.filter(f => f.id !== badFood.id && f.health_score >= badFood.health_score + 10);
  basePool = basePool.filter(f => isLiquid(f) === targetIsLiquid);
  // Dietary filtering lives in dietaryFilter.ts. The previous version tested
  // `f.category !== 'Meat' && f.category !== 'Fish' && f.category !== 'Dairy'`, but
  // `category` holds shopping-aisle labels here - the only values in the database are
  // Pantry, Snacks, Produce, "Dairy & Eggs" and Beverages. None of those three strings
  // exists, so every comparison was always true and the filter did nothing: with Vegan
  // selected, "Pork mince, raw" returned pork steak, pork neck and beef.
  basePool = basePool.filter(f => isAllowedForDiet(f, dietaryPreference));
  basePool = basePool.filter(f => !isRestricted(f));

  // STRICT CATEGORIZATION FILTER:
  // Must either share the EXACT same swiss_category or belong to the same equivalence group (e.g. Dairy <-> Soy alternative)
  const strictCandidates = basePool.filter(f => {
    if (f.swiss_category === badFood.swiss_category) return true;

    const candGroup = getEquivalenceGroup(f.swiss_category, f.name);
    if (candGroup === targetGroup) {
       const broadGroups = ['VEG', 'FRUIT', 'GRAINS', 'SWEETS', 'SNACKS'];
       if (broadGroups.includes(targetGroup)) {
          // Require them to be much closer, like same subcategory
          const fSub = f.swiss_category.split('/')[1];
          const bSub = badFood.swiss_category.split('/')[1];
          return fSub && bSub && fSub === bSub;
       }
       return true;
    }
    return false;
  });

  // Hand-tuned score, kept only as a deterministic tiebreak below - see the ranking note
  // on the learned layer for why it is no longer the primary signal.
  const scoredCandidates: SwapResult[] = strictCandidates.map(candidate => ({
    candidate,
    score: evaluateSwap(badFood, candidate)
  }));

  // --- Learned ranker layer (swapGbm.ts) ---
  // This was swapRanker.ts's 9-feature logistic regression, trained on 216 hand-labeled
  // pairs. It is now the gradient-boosted-tree student distilled from 13,538 LLM-labeled
  // pairs over 20 features. Measured on the same 216 human labels, which neither model
  // saw in training, AUC went 77.9% -> 84.7% - past even the 82.8% the shipped logistic
  // regression scores when cross-validated on those rows directly.
  //
  // swapRanker.ts is intentionally left in place, not deleted: it holds the calibration
  // notes and the honest record of what was tried. Nothing in this file calls it any
  // more - the blend it provided (combineWithExistingScore) was measured and dropped,
  // see the ranking note below.
  //
  // cosine_sim comes from the real Granite embeddings (foodEmbeddings.ts). Do NOT
  // substitute computeVectorSimilarity from foodVectors.ts - that's a hashed
  // bag-of-words lexical score on a different scale entirely. embeddingCosine returns
  // null for any food with no vector, and getAttributes returns null for any food the
  // labeling pass missed; the trees carry a learned default branch per split, so either
  // gap degrades gracefully instead of being papered over with a fabricated 0.
  // RANKING: the model's probability IS the score. It used to be a 0.5x-1.5x multiplier
  // on evaluateSwap's output (combineWithExistingScore), which capped how much the
  // learned layer could ever correct. evaluateSwap awards +300 for a matching
  // swiss_category and +150 per shared name word - constants that were never fit to
  // anything - so "Cucumber raw" -> "Garlic raw" banked ~500 points from the category
  // match plus the shared word "raw" before the model was consulted, and even a
  // maximally sceptical 0.5x left it ahead of genuinely better swaps.
  //
  // MEASURED on 374 held-out slates (grouped 5-fold by source food, so the model never
  // ranks pairs it trained on), scoring against the teacher's taste_fit:
  //     hand-tuned only          P@1 58.8%   P@3 55.1%   NDCG@3 62.0%
  //     hand * (0.5 + p)         P@1 83.7%   P@3 75.8%   NDCG@3 84.2%
  //     p alone (this)           P@1 87.2%   P@3 78.7%   NDCG@3 86.1%
  // Re-run scripts/eval-ranking-schemes.ts before changing this, and only adopt a scheme
  // that wins on P@1 - that is the single suggestion most users will ever look at.
  //
  // evaluateSwap is deliberately still computed, as a stable tiebreak when two candidates
  // score identical probabilities (common for near-duplicate BLS preparation variants).
  // Without it their order depends on filter order and can change between runs.
  const handScore = new Map<string, number>();
  for (const sc of scoredCandidates) {
    handScore.set(sc.candidate.id, sc.score);
    const liquidMismatch = isLiquid(badFood) !== isLiquid(sc.candidate) ? 1 : 0;
    const rawIngredientMismatch = isRawIngredient(badFood) !== isRawIngredient(sc.candidate) ? 1 : 0;
    const cosineSim = embeddingCosine(badFood.id, sc.candidate.id);
    const features = extractGbmFeatures(badFood, sc.candidate, cosineSim, liquidMismatch, rawIngredientMismatch);
    sc.score = predictSwapQualityGbm(features);
  }

  scoredCandidates.sort((a, b) =>
    b.score - a.score ||
    (handScore.get(b.candidate.id) ?? 0) - (handScore.get(a.candidate.id) ?? 0)
  );
  return scoredCandidates.slice(0, count);
}

/**
 * Async variant that also applies the on-device personal preference layer.
 * Kept separate from findBestSwaps() (which stays synchronous) since
 * AsyncStorage reads are inherently async - call this from your UI/screen code
 * where you're already in an async context (e.g. loading a swap suggestion screen).
 */
export async function findBestSwapsPersonalized(
  badFood: FoodItem,
  allFoods: FoodItem[],
  count: number = 3,
  dietaryPreference: string[] = ['Balanced']
): Promise<SwapResult[]> {
  // Pull more candidates than needed since personalization can reorder the ranking -
  // count*3 is a reasonable starting buffer, tune based on real usage.
  const base = findBestSwaps(badFood, allFoods, count * 3, dietaryPreference);
  const personalized: SwapResult[] = [];
  for (const r of base) {
    const adjustedScore = await applyPersonalPreference(r.score, r.candidate.swiss_category, r.candidate.id);
    personalized.push({ ...r, score: adjustedScore });
  }
  personalized.sort((a, b) => b.score - a.score);
  return personalized.slice(0, count);
}
