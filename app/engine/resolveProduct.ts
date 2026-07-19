import { FoodItem } from '../types';
import { FoodIndexData } from './foodIndex';
import { ParsedReceiptItem, parseReceiptLine } from './receiptParser';
import { OverrideStore } from '../services/overrideStore';
import { lookupOffProduct, OffProduct, OffLookupOptions } from '../services/offClient';
import { normalizeOverrideKey } from './overrideKey';

/**
 * Product resolution. A line is resolved to a BLS food through a fixed priority of sources:
 *
 *   1. override   - the user's saved manual corrections (offline, authoritative)
 *   2. bls-direct - the existing offline fuzzy matcher
 *   3. off         - OpenFoodFacts, on demand, for lines the above left weak (OPT-IN, gated)
 *
 * Nutrition ALWAYS comes from BLS: OFF is used only to turn a branded receipt line into a
 * generic product description (its category tags), which is then matched against BLS. So a
 * health score is comparable no matter which source identified the product.
 *
 * Tiers 1-2 are synchronous (resolveProductLine) and run in the per-line loop. Tier 3 is a
 * network call, so it runs as an async SECOND PASS (enrichWithOff) over only the lines the
 * offline path could not place - keeping OFF traffic minimal and the hot path fast. Tier 3
 * is also gated behind a user setting defaulting to OFF (see enrichWithOff's `enabled` arg):
 * with it disabled, resolution is exactly tiers 1-2, the fully-offline path.
 */

/** Below this confidence a BLS-direct result is considered "weak" and worth an OFF lookup. */
export const OFF_UPGRADE_THRESHOLD = 0.45;
/** A BLS match derived from an OFF category must clear this to replace the weak result. */
export const OFF_BRIDGE_MIN_CONFIDENCE = 0.6;

export interface ResolveDeps {
  allFoods: FoodItem[];
  foodIndexData?: FoodIndexData;
}

/**
 * Tiers 1-2. Returns null only when the line is receipt noise the matcher rejects (so the
 * caller drops it). A weak-but-non-null result is still returned; enrichWithOff may upgrade it.
 */
export function resolveProductLine(line: string, deps: ResolveDeps): ParsedReceiptItem | null {
  // Tier 1: a saved correction wins outright. OverrideStore.load() must have completed;
  // the lookup is synchronous and returns null until it has.
  const overrideId = OverrideStore.get(line);
  if (overrideId) {
    const food = deps.allFoods.find(f => f.id === overrideId);
    if (food) {
      return { rawText: line, matchedFood: food, confidence: 1.0, source: 'override' };
    }
    // Override points at a food that no longer exists; fall through to matching.
  }

  // Tier 2: existing offline BLS matcher.
  const direct = parseReceiptLine(line, deps.allFoods, deps.foodIndexData);
  if (direct) return { ...direct, source: 'bls' };
  return null;
}

const cleanCategoryTag = (tag: string) => tag.replace(/^[a-z]{2}:/, '').replace(/[-_]/g, ' ').trim();

/**
 * OFF leaf food-type categories are short noun phrases ("crisps", "potato crisps",
 * "mozzarella", "olive oil"). Long descriptive tags ("salty snacks made from potato") are
 * not food names and fuzzy-match unrelated BLS entries (that one lands on potato dumplings),
 * so we ignore tags longer than this. Short + specific is exactly what maps cleanly to BLS.
 */
const MAX_TAG_WORDS = 3;

/**
 * Bridge an OFF product onto a BLS food: run its short English category tags through the BLS
 * matcher and keep the best result clearing OFF_BRIDGE_MIN_CONFIDENCE. Returns null when
 * nothing maps cleanly (BLS genuinely lacks an analogue), leaving the line unresolved rather
 * than forcing a wrong nutrition row - a wrong match here is worse than "not found".
 */
export function bridgeOffToBls(off: OffProduct, deps: ResolveDeps): ParsedReceiptItem | null {
  const enTags = off.categoriesTags.filter(t => t.startsWith('en:'));
  let best: { food: FoodItem; confidence: number } | null = null;

  for (const tag of enTags) {
    const text = cleanCategoryTag(tag);
    if (text.length < 3) continue;
    if (text.split(/\s+/).length > MAX_TAG_WORDS) continue;
    const m = parseReceiptLine(text, deps.allFoods, deps.foodIndexData);
    if (m && m.matchedFood && m.confidence >= OFF_BRIDGE_MIN_CONFIDENCE) {
      if (!best || m.confidence > best.confidence) {
        best = { food: m.matchedFood, confidence: m.confidence };
      }
    }
  }

  if (!best) return null;
  return {
    rawText: '',           // filled in by the caller with the original OCR line
    matchedFood: best.food,
    confidence: best.confidence,
    source: 'off',
    displayName: off.productName || undefined,
  };
}

/**
 * Second pass: for each already-parsed item whose offline confidence is weak, ask OFF to
 * identify the product and bridge it onto a BLS food. Upgrades in place (returns a new array).
 * Best-effort and fully optional - offline or on any OFF failure the items are returned
 * unchanged. A saved override (source === 'override') is never overridden by OFF.
 *
 * `enabled` gates the entire pass and is required (not defaulted) so every call site must
 * make an explicit decision. When false, this makes ZERO network calls and returns `items`
 * completely unchanged - resolution is then exactly override cache -> BLS-direct matcher.
 * The OFF category-bridge is known to occasionally pick a confidently wrong same-category
 * neighbour (e.g. Coca-Cola -> tonic water) and has not been tuned against a labelled eval
 * set yet, so callers should wire this to a user setting defaulting to false
 * (see app/context/SettingsContext.ts: settings.offLookupEnabled).
 */
export async function enrichWithOff(
  items: ParsedReceiptItem[],
  deps: ResolveDeps,
  enabled: boolean,
  opts: { lookup?: typeof lookupOffProduct; lookupOptions?: OffLookupOptions } = {}
): Promise<ParsedReceiptItem[]> {
  if (!enabled) return items;

  const lookup = opts.lookup ?? lookupOffProduct;
  const result = [...items];

  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (item.source === 'override') continue;
    const weak = !item.matchedFood || item.confidence < OFF_UPGRADE_THRESHOLD;
    if (!weak) continue;

    // Query OFF with the product words only - sizes/prices/units in the raw line
    // ("Nutella 400g") otherwise pollute the full-text search and return the wrong product.
    const query = normalizeOverrideKey(item.rawText);
    if (!query) continue;

    const off = await lookup(query, opts.lookupOptions);
    if (!off) continue;

    const bridged = bridgeOffToBls(off, deps);
    if (bridged) {
      result[i] = { ...bridged, rawText: item.rawText };
    }
  }

  return result;
}
