/**
 * Personal, on-device swap preference layer.
 *
 * This is NOT a neural network and needs no training loop, GPU, or ONNX export -
 * it's a small set of per-user numbers, updated with plain arithmetic every time
 * someone accepts or rejects a suggested swap, stored only in local device storage.
 * Nothing here ever leaves the device or touches the shared base model/weights.
 *
 * MECHANISM: track a personal multiplier per swiss_category (e.g. "this user tends to
 * reject blue-cheese-family suggestions") and per specific candidate food id (for
 * sharper per-food learning once enough signal accumulates). Both start neutral (1.0)
 * and nudge up/down a little with each accept/reject - an exponential moving average,
 * not a full gradient-descent training step.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'swap_personal_preferences_v1';
const LEARNING_RATE = 0.15; // how much one accept/reject shifts the running preference
const MIN_MULTIPLIER = 0.3; // floor - a disliked category is suppressed, never fully zeroed
const MAX_MULTIPLIER = 1.8; // ceiling - a liked category is boosted, not made all-powerful

interface PersonalPreferences {
  bySwissCategory: Record<string, number>; // swiss_category -> multiplier, default 1.0
  byFoodId: Record<string, number>;        // specific food id -> multiplier, default 1.0
}

let cache: PersonalPreferences | null = null;

async function load(): Promise<PersonalPreferences> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? JSON.parse(raw) : { bySwissCategory: {}, byFoodId: {} };
  } catch {
    cache = { bySwissCategory: {}, byFoodId: {} };
  }
  return cache!;
}

async function save(prefs: PersonalPreferences): Promise<void> {
  cache = prefs;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage failure shouldn't crash the app - worst case, personalization
    // just doesn't persist this session. Not worth surfacing to the user.
  }
}

function clamp(x: number): number {
  return Math.max(MIN_MULTIPLIER, Math.min(MAX_MULTIPLIER, x));
}

/**
 * Call this when a user accepts (clicks/taps) a suggested swap.
 */
export async function recordSwapAccepted(swissCategory: string, foodId: string): Promise<void> {
  const prefs = await load();
  const currentCat = prefs.bySwissCategory[swissCategory] ?? 1.0;
  const currentFood = prefs.byFoodId[foodId] ?? 1.0;
  prefs.bySwissCategory[swissCategory] = clamp(currentCat + LEARNING_RATE * (MAX_MULTIPLIER - currentCat) * 0.3);
  prefs.byFoodId[foodId] = clamp(currentFood + LEARNING_RATE * (MAX_MULTIPLIER - currentFood) * 0.5);
  await save(prefs);
}

/**
 * Call this when a user explicitly dismisses/rejects a suggested swap (not just
 * ignores it - an explicit "no thanks" action is a much cleaner signal than absence
 * of action, which could mean anything).
 */
export async function recordSwapRejected(swissCategory: string, foodId: string): Promise<void> {
  const prefs = await load();
  const currentCat = prefs.bySwissCategory[swissCategory] ?? 1.0;
  const currentFood = prefs.byFoodId[foodId] ?? 1.0;
  prefs.bySwissCategory[swissCategory] = clamp(currentCat - LEARNING_RATE * (currentCat - MIN_MULTIPLIER) * 0.3);
  prefs.byFoodId[foodId] = clamp(currentFood - LEARNING_RATE * (currentFood - MIN_MULTIPLIER) * 0.5);
  await save(prefs);
}

/**
 * Apply the learned personal preference as a final multiplier on a candidate's score.
 * Combines the category-level (broader, more data) and food-specific (sharper, less
 * data) signals by averaging them - so a brand-new food in a well-known-disliked
 * category still gets suppressed somewhat, even with zero direct history on that
 * exact food.
 */
export async function applyPersonalPreference(
  baseScore: number,
  swissCategory: string,
  foodId: string
): Promise<number> {
  const prefs = await load();
  const catMultiplier = prefs.bySwissCategory[swissCategory] ?? 1.0;
  const foodMultiplier = prefs.byFoodId[foodId] ?? 1.0;
  const combined = (catMultiplier + foodMultiplier) / 2;
  return baseScore * combined;
}

/**
 * Optional: expose a reset for a settings screen ("forget my swap preferences").
 */
export async function resetPersonalPreferences(): Promise<void> {
  await save({ bySwissCategory: {}, byFoodId: {} });
}
