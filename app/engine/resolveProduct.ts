import { FoodItem } from '../types';
import { FoodIndexData } from './foodIndex';
import { ParsedReceiptItem, parseReceiptLine } from './receiptParser';
import { OverrideStore } from '../services/overrideStore';

/**
 * Single entry point the scan flow calls per OCR line. Resolves a line to a BLS food by
 * trying a fixed priority of sources, each falling through to the next on no-hit:
 *
 *   1. override   - the user's saved manual corrections (offline, authoritative)
 *   2. off-local  - bundled OpenFoodFacts subset -> BLS category   [STUBBED: returns null]
 *   3. bls-direct - the existing fuzzy matcher (unchanged)
 *   4. off-live   - optional live OpenFoodFacts API                [STUBBED: returns null]
 *
 * Nutrition always comes from BLS: every tier ultimately yields a BLS FoodItem, so health
 * scores stay comparable across all foods regardless of which source identified the product.
 *
 * Synchronous by design. Tiers 1-3 are all synchronous and this runs in a tight per-line
 * loop, so we do not make the hot path async for the sake of a stub. When tier 4 (a live
 * network call) is actually built, it will run as an async second pass over the lines that
 * tiers 1-3 left unresolved - not inline here.
 */

export type ResolutionSource = 'override' | 'off-local' | 'bls-direct' | 'off-live';

export interface ResolveDeps {
  allFoods: FoodItem[];
  foodIndexData?: FoodIndexData;
}

/**
 * Tier 2 - match the OCR line against the bundled OFF subset, map its category to a BLS
 * food, and return it. STUB until Step 3 lands the OFF data + category mapping.
 */
function resolveFromOffLocal(_line: string, _deps: ResolveDeps): ParsedReceiptItem | null {
  return null;
}

/**
 * Tier 4 - best-effort live OFF lookup. STUB and pluggable; wired in later as an async
 * post-pass, never inline (see the note on this module).
 */
function resolveFromOffLive(_line: string, _deps: ResolveDeps): ParsedReceiptItem | null {
  return null;
}

/**
 * Resolve one OCR line. Returns null when no source produced a result (e.g. receipt noise),
 * in which case the caller skips the line - identical to calling the matcher directly.
 */
export function resolveProductLine(line: string, deps: ResolveDeps): ParsedReceiptItem | null {
  // Tier 1: a saved correction wins outright. OverrideStore.load() must have completed;
  // the lookup is synchronous and returns null until it has.
  const overrideId = OverrideStore.get(line);
  if (overrideId) {
    const food = deps.allFoods.find(f => f.id === overrideId);
    if (food) {
      return { rawText: line, matchedFood: food, confidence: 1.0 };
    }
    // Override points at a food that no longer exists; fall through to matching.
  }

  // Tier 2: bundled OFF subset (stub for now).
  const offLocal = resolveFromOffLocal(line, deps);
  if (offLocal) return offLocal;

  // Tier 3: existing BLS-direct matcher. A non-null result (even a low-confidence one the
  // UI will flag) counts as a hit, exactly as before.
  const direct = parseReceiptLine(line, deps.allFoods, deps.foodIndexData);
  if (direct) return direct;

  // Tier 4: live OFF (stub for now).
  return resolveFromOffLive(line, deps);
}
