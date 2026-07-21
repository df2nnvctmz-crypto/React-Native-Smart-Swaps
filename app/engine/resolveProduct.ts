import { FoodItem } from '../types';
import { FoodIndexData } from './foodIndex';
import { ParsedReceiptItem, parseReceiptLine } from './receiptParser';
import { OverrideStore } from '../services/overrideStore';
import { lookupOffProduct, OffProduct, OffLookupOptions } from '../services/offClient';
import { normalizeOverrideKey } from './overrideKey';
import { matchBrandDict } from './brandDict';
import { matchExactLookup } from './exactLookup';
import { isKnownNonMatch } from './knownNonMatches';

/**
 * Product resolution. A line is resolved to a BLS food through a fixed priority of sources:
 *
 *   1. override     - the user's saved manual corrections (offline, authoritative)
 *   2. exact_lookup - pre-seeded verified exact-string dictionary (offline, highest-trust automated tier)
 *   3. brand_dict   - the pre-seeded verified brand/bare-noun dictionary (offline, high-trust).
 *                      Entries that are just a common ingredient's generic raw form (value
 *                      ends in " roh") defer to a confident bls-direct answer instead of
 *                      overriding it - see isGenericRawEntry below.
 *   4. bls-direct   - the existing offline fuzzy matcher
 *   5. off          - OpenFoodFacts, on demand, for lines the above left weak (OPT-IN, gated)
 *
 * Nutrition ALWAYS comes from BLS: OFF is used only to turn a branded receipt line into a
 * generic product description (its category tags), which is then matched against BLS. So a
 * health score is comparable no matter which source identified the product.
 *
 * Tiers 1-4 are synchronous (resolveProductLine) and run in the per-line loop. Tier 5 is a
 * network call, so it runs as an async SECOND PASS (enrichWithOff) over only the lines the
 * offline path could not place - keeping OFF traffic minimal and the hot path fast. Tier 5
 * is also gated behind a user setting defaulting to OFF (see enrichWithOff's `enabled` arg):
 * with it disabled, resolution is exactly tiers 1-4, the fully-offline path.
 *
 * After tiers 2-4 produce a candidate (but before it's returned), a known-non-match safety
 * gate can force the result to "not found" regardless of confidence - see
 * app/data/knownNonMatches.json. It does not apply to tier 1: a user's own saved correction
 * is never second-guessed.
 */

/** Below this confidence a BLS-direct result is considered "weak" and worth an OFF lookup. */
export const OFF_UPGRADE_THRESHOLD = 0.45;
/** A BLS match derived from an OFF category must clear this to replace the weak result. */
export const OFF_BRIDGE_MIN_CONFIDENCE = 0.6;

export interface ResolveDeps {
  allFoods: FoodItem[];
  foodIndexData?: FoodIndexData;
}

/** Confidence assigned to an exact_lookup hit: a known-correct answer for that literal string. */
export const EXACT_LOOKUP_CONFIDENCE = 0.99;
/** Confidence assigned to a brand_dict hit: pre-verified, but not as authoritative as a user override. */
export const BRAND_DICT_CONFIDENCE = 0.95;

/**
 * A brand_dict value ending in " roh" is just the generic/default raw form of a common
 * ingredient (851 of the dictionary's 978 entries are shaped this way: apfel -> Apfel roh,
 * tomate/tomaten -> Tomate roh, spinat -> Spinat roh, etc). These exist to catch compound
 * words bls-direct's own tokenizer doesn't split ("Strauchtomaten", "Cherrytomaten") - but a
 * bare single/double-word key can ALSO win as a whole-word substring match inside a longer,
 * more specific product name that bls-direct would have resolved correctly on its own
 * ("Tomaten ganz, geschält" -> canned peeled tomato, not raw; "Spinat Ricotta Tortelloni" ->
 * a pasta, not raw spinach). Ties don't exist between two different products the same way
 * short vs. long dictionary keys did (that's what the whole-word-preference fix in
 * brandDict.ts handles) - here it's the dictionary vs. bls-direct's OWN correct answer.
 * So: only accept a "roh"-shaped brand_dict match if bls-direct itself has nothing confident
 * to say (null, or below this bar) - if bls-direct is already confident, trust its more
 * context-aware, multi-word-capable scoring over a context-free bare-noun substring hit.
 * Threshold matches ReceiptItemList.tsx's own "confident" bucket cutoff (> 0.72), so this
 * reuses an existing, already-meaningful confidence line rather than a new arbitrary number.
 */
const GENERIC_BRAND_ENTRY_DEFER_THRESHOLD = 0.72;
const isGenericRawEntry = (value: string) => / roh$/.test(value);

/**
 * Tiers 1-4. Returns null only when the line is receipt noise the matcher rejects (so the
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

  let result: ParsedReceiptItem | null = null;

  // Tier 2: pre-seeded verified exact-string dictionary (direct lowercase-trimmed match).
  const exactName = matchExactLookup(line);
  if (exactName) {
    const food = deps.allFoods.find(f => f.name_de === exactName || f.name === exactName);
    if (food) {
      result = { rawText: line, matchedFood: food, confidence: EXACT_LOOKUP_CONFIDENCE, source: 'exact_lookup' };
    }
    // Lookup points at a food name no longer in the DB; fall through to matching.
  }

  // Tier 3: pre-seeded verified brand/bare-noun dictionary (substring match, high trust).
  if (!result) {
    const brandName = matchBrandDict(line);
    if (brandName) {
      const food = deps.allFoods.find(f => f.name_de === brandName || f.name === brandName);
      if (food) {
        if (isGenericRawEntry(brandName)) {
          const direct = parseReceiptLine(line, deps.allFoods, deps.foodIndexData);
          if (direct && direct.matchedFood && direct.confidence >= GENERIC_BRAND_ENTRY_DEFER_THRESHOLD) {
            result = { ...direct, source: 'bls' };
          } else {
            result = { rawText: line, matchedFood: food, confidence: BRAND_DICT_CONFIDENCE, source: 'brand_dict' };
          }
        } else {
          result = { rawText: line, matchedFood: food, confidence: BRAND_DICT_CONFIDENCE, source: 'brand_dict' };
        }
      }
      // Dictionary points at a food name no longer in the DB; fall through to matching.
    }
  }

  // Tier 4: existing offline BLS matcher.
  if (!result) {
    const direct = parseReceiptLine(line, deps.allFoods, deps.foodIndexData);
    if (direct) result = { ...direct, source: 'bls' };
  }

  if (!result) return null; // genuine receipt noise - no tier produced anything to gate

  // Safety gate: a query known to make every automated tier confidently wrong is forced back
  // to "not found" rather than returned as-is - a confident wrong nutrition match can be
  // actively misleading (e.g. "vegan bacon" resolving to literal pork), which is worse than
  // an honest miss the user can correct by hand. Never applies to tier 1 (checked above).
  if (isKnownNonMatch(line)) {
    return { rawText: line, matchedFood: null, confidence: 0 };
  }

  return result;
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
