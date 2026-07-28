/**
 * Compares ways of COMBINING the hand-tuned score with the learned model, measured on
 * the thing the user actually sees: the top 3 swaps.
 *
 * WHY THIS EXISTS: findBestSwaps currently ranks by
 *     evaluateSwap(...) * (0.5 + gbmProbability)
 * so the learned model can only scale the hand-tuned score by 0.5x-1.5x. But
 * evaluateSwap awards +300 for a matching swiss_category and +150 per shared name word,
 * and those constants were never fit to anything. "Cucumber raw" -> "Garlic raw" collects
 * ~500 points (category + the shared word "raw" + calorie parity) before the model runs,
 * so even a maximally sceptical model leaves it at 250 - ahead of a genuinely better swap
 * the hand-tuned layer happened to score 200. The learned layer is structurally unable to
 * overrule the part of the system nobody validated.
 *
 * METHOD: grouped 5-fold CV by source food. The GBM is trained on 4 folds and used to
 * rank slates in the held-out fold, so it is never scored on pairs it memorized -
 * evaluating on the same labels it was fit to would flatter every GBM-based scheme.
 *
 * RELEVANCE comes from the teacher's taste_fit (0-3), which the learning curve showed is
 * the axis that best matches human GOOD/BAD judgments. Binary relevant = taste_fit >= 2.
 *
 * Run with: npx tsx scripts/eval-ranking-schemes.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { FoodItem } from '../app/types';
import { evaluateSwap } from '../app/engine/swapAlgorithm';
import { mulberry32, groupedFolds } from './lib/logreg';
import { train as gbmTrain, predictProba } from './lib/gbm';
import { loadFoods } from './lib/loadFoods';

const ROOT = path.join(__dirname, '..');
const FOLDS = 5, SEED = 42;

const FULL = [
  'cosine_sim', 'same_swiss_category', 'liquid_mismatch', 'raw_ingredient_mismatch',
  'delta_kcal', 'delta_sugar_g', 'delta_fat_g', 'delta_satfat_g', 'delta_protein_g',
  'delta_fiber_g', 'delta_salt_g', 'delta_health_score', 'kcal_ratio',
  'sensory_distance', 'same_culinary_role', 'same_prep_state',
  'delta_glycemic_load', 'delta_satiety', 'adds_caffeine', 'time_of_day_overlap',
];

const foods: FoodItem[] = loadFoods();
const byId = new Map(foods.map(f => [f.id, f]));
const rows: any[] = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/pair_training_rows.json'), 'utf-8'));

// Group labeled pairs back into the slates they came from - ranking is only meaningful
// within a slate (one source food's candidate set).
const slates = new Map<string, any[]>();
for (const r of rows) {
  const b = slates.get(r.source_id);
  if (b) b.push(r); else slates.set(r.source_id, [r]);
}
// A slate needs enough candidates to rank, and at least one relevant item, or precision
// is undefined and would silently be counted as 0 for every scheme equally.
const usable = [...slates.entries()].filter(([, cs]) =>
  cs.length >= 4 && cs.some(c => c.taste_fit >= 2) && cs.some(c => c.taste_fit < 2));
console.log(`${usable.length} slates usable for ranking eval (>=4 candidates, mixed relevance)`);
console.log(`${usable.reduce((s, [, c]) => s + c.length, 0)} labeled pairs total\n`);

// Hand-tuned score, recomputed from the live evaluateSwap rather than read from the
// corpus's production_score - that field already has the OLD logistic-regression
// multiplier baked in, which would contaminate the comparison.
const handScore = new Map<string, number>();
for (const r of rows) {
  const s = byId.get(r.source_id), c = byId.get(r.candidate_id);
  if (s && c) handScore.set(r.pair_id, evaluateSwap(s, c));
}

type Scheme = { name: string; score: (hand: number, p: number) => number };
const SCHEMES: Scheme[] = [
  { name: 'hand-tuned only (no model)', score: h => h },
  { name: 'CURRENT: hand * (0.5+p)', score: (h, p) => h * (0.5 + p) },
  { name: 'GBM only', score: (_h, p) => p },
  // A middle ground: keep the hand-tuned score as a weak prior via its rank-order
  // magnitude but let the model dominate. Included because "replace everything" and
  // "change nothing" are rarely the only two options worth measuring.
  { name: 'GBM primary, hand tiebreak', score: (h, p) => p * 1000 + Math.min(h, 999) / 1000 },
];

function ndcg3(ranked: any[]): number {
  const gain = (r: any) => (2 ** r.taste_fit - 1);
  const dcg = ranked.slice(0, 3).reduce((s, r, i) => s + gain(r) / Math.log2(i + 2), 0);
  const ideal = [...ranked].sort((a, b) => b.taste_fit - a.taste_fit)
    .slice(0, 3).reduce((s, r, i) => s + gain(r) / Math.log2(i + 2), 0);
  return ideal > 0 ? dcg / ideal : 0;
}

const results = new Map<string, { p1: number; p3: number; ndcg: number; n: number }>();
for (const s of SCHEMES) results.set(s.name, { p1: 0, p3: 0, ndcg: 0, n: 0 });

const sourceIds = usable.map(([sid]) => sid);
const folds = groupedFolds(sourceIds, FOLDS, mulberry32(SEED));

for (let f = 0; f < FOLDS; f++) {
  const testIdx = new Set(folds[f]);
  const testSids = new Set(sourceIds.filter((_, i) => testIdx.has(i)));
  const trainRows = rows.filter(r => !testSids.has(r.source_id));
  if (!trainRows.length) continue;

  const model = gbmTrain(
    trainRows.map(r => FULL.map(k => r[k] as number)),
    trainRows.map(r => (r.taste_fit >= 2 ? 1 : 0)),
    FULL
  );

  for (const [sid, cands] of usable) {
    if (!testSids.has(sid)) continue;
    const probs = predictProba(model, cands.map(r => FULL.map(k => r[k] as number)));
    for (const scheme of SCHEMES) {
      const ranked = cands
        .map((c, i) => ({ ...c, _s: scheme.score(handScore.get(c.pair_id) ?? 0, probs[i]) }))
        .sort((a, b) => b._s - a._s);
      const agg = results.get(scheme.name)!;
      agg.p1 += ranked[0].taste_fit >= 2 ? 1 : 0;
      agg.p3 += ranked.slice(0, 3).filter(r => r.taste_fit >= 2).length / Math.min(3, ranked.length);
      agg.ndcg += ndcg3(ranked);
      agg.n++;
    }
  }
}

const pc = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`${'scheme'.padEnd(30)} ${'P@1'.padStart(7)} ${'P@3'.padStart(7)} ${'NDCG@3'.padStart(8)}`);
console.log('-'.repeat(56));
for (const s of SCHEMES) {
  const r = results.get(s.name)!;
  console.log(`${s.name.padEnd(30)} ${pc(r.p1 / r.n).padStart(7)} ${pc(r.p3 / r.n).padStart(7)} ${pc(r.ndcg / r.n).padStart(8)}`);
}
console.log(`\nP@1    = the single suggestion shown first is a good swap (taste_fit >= 2)`);
console.log(`P@3    = fraction of the visible top-3 that are good swaps`);
console.log(`NDCG@3 = graded ranking quality over the top 3, 100% = perfect ordering`);
console.log(`\nEvaluated on held-out slates only (grouped ${FOLDS}-fold by source food).`);
