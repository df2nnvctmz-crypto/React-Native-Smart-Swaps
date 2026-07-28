/**
 * Builds the (source food -> candidate slate) corpus that the LLM teacher labels,
 * as step 3 of the swap-ranker plan. Output: scripts/pair_slates.jsonl, one slate
 * per line.
 *
 * WHY THIS SHAPE:
 *
 * - Candidates come from the REAL retrieval stage (findBestSwaps in
 *   app/engine/swapAlgorithm.ts), not from random pairing. Training a ranker on
 *   randomly-paired foods teaches it to separate "yoghurt vs. motor oil" - a
 *   distinction production never asks for, because the category/liquid/dietary
 *   hard filters already removed those. The pairs that decide real rankings are
 *   the near-ties at the top of the surviving pool, so those are the pairs worth
 *   spending teacher tokens on.
 *
 * - Measured pool sizes are strongly bimodal (sampled 655 of the 6,549 eligible
 *   source foods): 12% of sources have ZERO candidates, 40% have fewer than 10,
 *   but 49% have 30+ and the p90 is 753. So a fixed "top 30" is wrong in both
 *   directions - HEAD_K/TAIL_K are caps, not quotas, and thin slates are emitted
 *   whole. Sources with an empty pool are skipped entirely (nothing to label).
 *
 * - Each slate mixes HEAD (top-K by the current production score) with a few TAIL
 *   candidates sampled from deeper in the same pool. This is a deliberate tension
 *   with the "sample the way production does" rule above: production only ever
 *   shows the head. But a corpus that is ONLY near-ties gives the student no
 *   coarse scale to anchor on - every pair looks equally plausible and the labels
 *   compress toward the middle. The tail candidates are the cheap negatives that
 *   fix the scale. They are a deliberate minority and every pair carries a `slot`
 *   field, so this choice can be ablated (train head-only) rather than being
 *   baked in irreversibly.
 *
 * - Source foods are drawn receipt-first: every food that actually appeared in a
 *   scanned receipt (via scripts/ml_dataset.jsonl) is used before any synthetic
 *   pick, so the corpus is weighted toward what users really buy. The remainder
 *   is filled by round-robin across top-level Swiss categories rather than a flat
 *   random sample - a flat sample would over-represent whichever category happens
 *   to have the most BLS entries and leave small categories unlabeled.
 *
 * - Every pair carries BOTH the 9 features swapRanker.ts already uses (identical
 *   names, so rows drop straight into scripts/trainSwapRanker.ts) AND the new
 *   attribute-derived taste/effect features unlocked by step 2's labeling pass.
 *   Emitting them here rather than in the labeler keeps one definition of each
 *   feature, and means re-labeling never silently changes the feature math.
 *
 * Deterministic: all sampling runs through a seeded PRNG, so re-running produces
 * byte-identical output and a partially-labeled run stays valid.
 *
 * Run with: npx tsx scripts/build-pair-slates.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { FoodItem } from '../app/types';
import { findBestSwaps, isLiquid, isRawIngredient, SwapResult } from '../app/engine/swapAlgorithm';
import { embeddingCosine } from '../app/engine/foodEmbeddings';
import { loadFoods } from './lib/loadFoods';

// --- CONFIG ---
const TARGET_PAIRS = Number(process.env.TARGET_PAIRS ?? 20000);
const HEAD_K = 24; // top-ranked candidates per slate (cap, not quota)
const TAIL_K = 6;  // sampled deeper candidates, for scale anchoring
const MIN_SLATE = 2; // a 1-candidate slate teaches no comparison - skip it
// At most this many preparations of the SAME base food per slate. BLS carries a food
// once per preparation, so an undeduplicated slate is largely one ingredient repeated:
// measured on the full corpus, 23.4% of all pairs were a base food already present in
// that same slate, with a worst case of 17x "ice cream mixed chocolate" and several
// slates carrying 14x "garlic". Those pairs are not wrong - the teacher grades each one
// correctly - they just cost teacher time and over-weight one ingredient in the training
// distribution. Capping is applied while WALKING the ranked pool rather than by
// truncating afterwards, so a slate that would have been 14 garlics instead reaches
// deeper into the pool and comes back with 14 different foods: strictly more
// discriminative signal for the same number of labeled pairs.
const MAX_PER_BASE = 2;
const SEED = 42;

const ROOT = path.join(__dirname, '..');
const ATTRS_PATH = path.join(ROOT, 'scripts/food_attributes/ollama_output.json');
const ML_DATASET_PATH = path.join(ROOT, 'scripts/ml_dataset.jsonl');
const OUT_PATH = path.join(ROOT, 'scripts/pair_slates.jsonl');

// --- types mirroring scripts/food_attributes/ollama_output.json ---
interface FoodAttributes {
  id: string;
  sensory: {
    sweet: number; salty: number; sour: number; bitter: number;
    umami: number; fatty_rich: number; creamy: number; crunchy: number;
  };
  culinary_role: string;
  prep_state: string;
  effect: {
    glycemic_load: 'low' | 'medium' | 'high';
    satiety: 'low' | 'medium' | 'high';
    caffeine: boolean;
    alcohol: boolean;
    time_of_day: string[];
  };
}

const SENSORY_AXES = ['sweet', 'salty', 'sour', 'bitter', 'umami', 'fatty_rich', 'creamy', 'crunchy'] as const;
const ORDINAL = { low: 0, medium: 1, high: 2 } as const;

// Deterministic PRNG (mulberry32) - same generator scripts/trainSwapRanker.ts uses,
// so sampling here is reproducible and reviewable the same way CV splits are.
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Preparation/state words BLS appends to distinguish otherwise-identical entries.
// Stripping them collapses "Garlic fried without fat (pan)", "Garlic deep-frozen,
// braised without fat" and "Garlic baked" to the same key.
const PREP_WORDS = /\b(deep-frozen|frozen|chilled|raw|boiled|baked|braised|stewed|fried|grilled|roasted|steamed|canned|dried|cooked|pickled|smoked|drained|ready-made|prepared|unsalted|salted|sweetened|unsweetened|without|with|fat|salt|pan|oven|product)\b/gi;

/** Collapses a BLS food name to its underlying ingredient, for de-duplication only. */
function baseFoodKey(name: string): string {
  return name
    .split(',')[0]              // BLS puts the qualifier after the first comma
    .replace(/\([^)]*\)/g, ' ') // "(pan)", "(red pine mushroom)"
    .replace(PREP_WORDS, ' ')
    .replace(/[^a-zA-Z ]/g, ' ')
    .toLowerCase()
    .split(/\s+/).filter(Boolean).join(' ');
}

/**
 * Walks `pool` in rank order and takes up to `limit` candidates, allowing at most
 * MAX_PER_BASE entries per base food. Returns the picks plus the running base-count
 * map, so the tail selection can keep honouring the cap across the whole slate.
 */
function takeCapped(pool: SwapResult[], limit: number, counts: Map<string, number>): SwapResult[] {
  const picked: SwapResult[] = [];
  for (const r of pool) {
    if (picked.length >= limit) break;
    const key = baseFoodKey(r.candidate.name);
    const n = counts.get(key) ?? 0;
    if (n >= MAX_PER_BASE) continue;
    counts.set(key, n + 1);
    picked.push(r);
  }
  return picked;
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- load inputs ---
const foods: FoodItem[] = loadFoods();
const foodById = new Map(foods.map(f => [f.id, f]));

const attrList: FoodAttributes[] = JSON.parse(fs.readFileSync(ATTRS_PATH, 'utf-8'));
const attrById = new Map(attrList.map(a => [a.id, a]));
if (attrById.size !== foods.length) {
  // Not fatal - attribute features degrade to null for unlabeled foods, exactly
  // as cosine_sim does for unembedded ones - but it should be visible, since a
  // silently partial attribute join would quietly weaken every taste feature.
  console.warn(`WARNING: ${attrById.size} attribute records for ${foods.length} foods - ${foods.length - attrById.size} food(s) will emit null taste/effect features.`);
}

/** Food ids observed on real scanned receipts - the production source distribution. */
function loadReceiptFoodIds(): string[] {
  if (!fs.existsSync(ML_DATASET_PATH)) {
    console.warn(`WARNING: ${ML_DATASET_PATH} not found - falling back to category-stratified sources only.`);
    return [];
  }
  const counts = new Map<string, number>();
  for (const line of fs.readFileSync(ML_DATASET_PATH, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    const id = JSON.parse(line).food_id;
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  // Most-purchased first: if TARGET_PAIRS runs out before the receipt list does,
  // the pairs we did spend on are the ones users hit most often.
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

// --- feature extraction ---

/** Mean absolute difference across the 8 sensory axes, normalized to [0,1]. */
function sensoryDistance(a: FoodAttributes, b: FoodAttributes): number {
  let sum = 0;
  for (const axis of SENSORY_AXES) sum += Math.abs(a.sensory[axis] - b.sensory[axis]);
  return sum / (SENSORY_AXES.length * 10);
}

function attributeFeatures(src: FoodItem, cand: FoodItem) {
  const a = attrById.get(src.id);
  const b = attrById.get(cand.id);
  // null (not 0) when either side is unlabeled: 0 would read as "identical taste",
  // the most confidently wrong value available. Consumers must skip nulls the way
  // swapRanker.predictSwapQuality already skips a null cosine_sim.
  if (!a || !b) {
    return {
      sensory_distance: null, same_culinary_role: null, same_prep_state: null,
      delta_glycemic_load: null, delta_satiety: null, adds_caffeine: null,
      time_of_day_overlap: null,
    };
  }
  const srcTimes = new Set(a.effect.time_of_day);
  const shared = b.effect.time_of_day.filter(t => srcTimes.has(t) || t === 'any' || srcTimes.has('any')).length;
  return {
    sensory_distance: +sensoryDistance(a, b).toFixed(4),
    same_culinary_role: a.culinary_role === b.culinary_role ? 1 : 0,
    same_prep_state: a.prep_state === b.prep_state ? 1 : 0,
    // Negative = the candidate is LOWER glycemic load / an improvement.
    delta_glycemic_load: ORDINAL[b.effect.glycemic_load] - ORDINAL[a.effect.glycemic_load],
    // Positive = the candidate is MORE filling / an improvement.
    delta_satiety: ORDINAL[b.effect.satiety] - ORDINAL[a.effect.satiety],
    adds_caffeine: !a.effect.caffeine && b.effect.caffeine ? 1 : 0,
    time_of_day_overlap: b.effect.time_of_day.length ? +(shared / b.effect.time_of_day.length).toFixed(4) : 0,
  };
}

function pairFeatures(src: FoodItem, cand: FoodItem, productionScore: number) {
  const sn = src.nutrients_per_100;
  const cn = cand.nutrients_per_100;
  return {
    // --- the exact 9 features swapRanker.ts / trainSwapRanker.ts already use ---
    cosine_sim: embeddingCosine(src.id, cand.id),
    same_swiss_category: src.swiss_category === cand.swiss_category ? 1 : 0,
    liquid_mismatch: isLiquid(src) !== isLiquid(cand) ? 1 : 0,
    raw_ingredient_mismatch: isRawIngredient(src) !== isRawIngredient(cand) ? 1 : 0,
    delta_kcal: +(cn.kcal - sn.kcal).toFixed(3),
    delta_sugar_g: +(cn.sugars_g - sn.sugars_g).toFixed(3),
    delta_fat_g: +(cn.fat_g - sn.fat_g).toFixed(3),
    delta_satfat_g: +(cn.saturated_fat_g - sn.saturated_fat_g).toFixed(3),
    delta_protein_g: +(cn.protein_g - sn.protein_g).toFixed(3),
    // --- additional cheap nutrient signals worth having in a tree model ---
    delta_fiber_g: +(cn.fiber_g - sn.fiber_g).toFixed(3),
    delta_salt_g: +(cn.salt_g - sn.salt_g).toFixed(3),
    delta_health_score: cand.health_score - src.health_score,
    kcal_ratio: +(cn.kcal / (sn.kcal || 1)).toFixed(4),
    // --- new, unlocked by step 2's attribute labeling ---
    ...attributeFeatures(src, cand),
    // The current hand-tuned+ranker score. NOT a training feature (it would leak
    // the system we're trying to replace) - it is recorded so the eval can measure
    // how far the student moved the ranking versus today's baseline.
    production_score: +productionScore.toFixed(3),
  };
}

/** The compact view the LLM teacher actually reads. */
function promptView(f: FoodItem) {
  const n = f.nutrients_per_100;
  const a = attrById.get(f.id);
  return {
    id: f.id,
    name: f.name,
    name_de: f.name_de,
    swiss_category: f.swiss_category,
    health_score: f.health_score,
    per100g: {
      kcal: n.kcal, protein_g: n.protein_g, sugars_g: n.sugars_g,
      fat_g: n.fat_g, satfat_g: n.saturated_fat_g, fiber_g: n.fiber_g, salt_g: n.salt_g,
    },
    sensory: a?.sensory ?? null,
    culinary_role: a?.culinary_role ?? null,
    prep_state: a?.prep_state ?? null,
    effect: a?.effect ?? null,
  };
}

// --- source ordering: receipt-observed first, then category round-robin ---
function orderedSources(rng: () => number): FoodItem[] {
  const eligible = foods.filter(f => f.health_score < 80); // findBestSwaps returns [] above this
  const eligibleIds = new Set(eligible.map(f => f.id));

  const receiptIds = loadReceiptFoodIds().filter(id => eligibleIds.has(id));
  const seen = new Set(receiptIds);
  const ordered: FoodItem[] = receiptIds.map(id => foodById.get(id)!).filter(Boolean);

  // Round-robin across top-level Swiss categories so small categories get labeled
  // too, instead of being crowded out by whichever category has the most BLS rows.
  const byGroup = new Map<string, FoodItem[]>();
  for (const f of eligible) {
    if (seen.has(f.id)) continue;
    const group = f.swiss_category.split('/')[0];
    const bucket = byGroup.get(group);
    if (bucket) bucket.push(f); else byGroup.set(group, [f]);
  }
  const queues = [...byGroup.keys()].sort().map(g => shuffle(byGroup.get(g)!, rng));
  let remaining = queues.reduce((s, q) => s + q.length, 0);
  while (remaining > 0) {
    for (const q of queues) {
      const next = q.pop();
      if (next) { ordered.push(next); remaining--; }
    }
  }
  return ordered;
}

// --- main ---
const rng = mulberry32(SEED);
const sources = orderedSources(rng);
console.log(`${foods.length} foods, ${sources.length} eligible sources (health_score < 80).`);
console.log(`Target ${TARGET_PAIRS} pairs at up to ${HEAD_K} head + ${TAIL_K} tail per slate.`);

const out = fs.createWriteStream(OUT_PATH);
let pairCount = 0, slateCount = 0, emptyPools = 0, thinSlates = 0, tailPairs = 0;
const t0 = Date.now();

for (const src of sources) {
  if (pairCount >= TARGET_PAIRS) break;

  // Ask for the whole surviving pool, already scored and sorted exactly as
  // production sorts it (hand-tuned evaluateSwap x learned ranker multiplier).
  const pool = findBestSwaps(src, foods, Number.MAX_SAFE_INTEGER, ['Balanced']);
  if (pool.length === 0) { emptyPools++; continue; }
  if (pool.length < MIN_SLATE) { thinSlates++; continue; }

  // Base-food counts are shared between head and tail so the cap holds across the
  // whole slate - otherwise the tail could re-add the same garlics the head skipped.
  const baseCounts = new Map<string, number>();
  const head = takeCapped(pool, HEAD_K, baseCounts);

  // Tail: sampled from below whatever the head consumed, so these are candidates the
  // current system ranked low. Deterministic, and empty for thin pools where the head
  // already took everything eligible.
  const headIds = new Set(head.map(r => r.candidate.id));
  const rest = pool.filter(r => !headIds.has(r.candidate.id));
  const tail = rest.length ? takeCapped(shuffle(rest, rng), TAIL_K, baseCounts) : [];

  const candidates = [
    ...head.map(r => ({ slot: 'head' as const, ...r })),
    ...tail.map(r => ({ slot: 'tail' as const, ...r })),
  ];

  // Rank within the full production-ordered pool, for every candidate. Built once as
  // a map rather than derived from the emitted array's index: base-food capping means
  // the Nth emitted candidate is no longer the Nth pool entry.
  const rankById = new Map(pool.map((r, i) => [r.candidate.id, i]));

  out.write(JSON.stringify({
    source_id: src.id,
    pool_size: pool.length,
    source: promptView(src),
    candidates: candidates.map(c => ({
      pair_id: `${src.id}:${c.candidate.id}`,
      candidate_id: c.candidate.id,
      slot: c.slot,
      // Lets the eval compute rank-correlation between the teacher's judgment and
      // today's production ranking.
      production_rank: rankById.get(c.candidate.id)!,
      candidate: promptView(c.candidate),
      features: pairFeatures(src, c.candidate, c.score),
    })),
  }) + '\n');

  slateCount++;
  pairCount += candidates.length;
  tailPairs += tail.length;
}
out.end();

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
console.log(`\nwrote ${OUT_PATH}`);
console.log(`  slates:        ${slateCount}`);
console.log(`  pairs:         ${pairCount}  (${tailPairs} tail, ${pct(tailPairs, pairCount)})`);
console.log(`  avg slate:     ${(pairCount / slateCount).toFixed(1)} candidates`);
console.log(`  skipped:       ${emptyPools} sources with an empty pool, ${thinSlates} with < ${MIN_SLATE} candidates`);
console.log(`  elapsed:       ${((Date.now() - t0) / 1000).toFixed(1)}s`);
