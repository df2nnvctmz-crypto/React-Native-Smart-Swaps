/**
 * Gradient-boosted-tree swap ranker - the "student" distilled from 13,538 LLM-labeled
 * (source, candidate) pairs, replacing the 216-row logistic regression in swapRanker.ts
 * as the learned layer of findBestSwaps().
 *
 * Trained by scripts/train-swap-gbm.ts, exported to swapGbm.data.json. Like swapRanker
 * before it this runs as plain arithmetic - a few numeric comparisons per tree, no ML
 * runtime, no ONNX. 200 trees of depth 4 is ~130 KB of JSON.
 *
 * MEASURED, grouped 5-fold CV split by source food (so pairs sharing a source never
 * straddle a fold):
 *   GBM     bal 82.5%  auc 90.5%   train-CV gap 5.4pts
 *   LogReg  bal 79.8%  auc 87.1%   train-CV gap 0.2pts
 * and on the 216 hand-labeled human rows, which NEITHER model ever saw in training:
 *   GBM     auc 84.7%
 *   LogReg  auc 77.9%
 *   shipped logistic regression  auc 82.8%  (cross-validated ON those rows - i.e. with
 *                                            home advantage, and still beaten)
 *
 * WHY AUC IS THE METRIC THAT MATTERS HERE, and accuracy is not: findBestSwaps sorts
 * candidates and shows the top few. It never thresholds a probability. The GBM's plain
 * accuracy on the human rows (72.2%) is below the shipped model's (79.2%) because its
 * decision threshold sits in a different place - but its ORDERING is better, and
 * ordering is the entire job. Do not "fix" the accuracy gap by recalibrating unless
 * something starts consuming the probability as a probability.
 *
 * The 5.4pt train-CV gap is the number to watch on any retrain: swapRanker.ts records a
 * Random Forest that reached ~84% CV with an 11pt gap and was rejected for it.
 */

import { FoodItem } from '../types';
import { embeddingCosine } from './foodEmbeddings';
import { getAttributes } from './foodAttributes';
import modelData from './swapGbm.data.json';

interface Tree {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  value: number[];
  defaultLeft: number[];
}

interface GbmModel {
  featureNames: string[];
  baseScore: number;
  learningRate: number;
  trees: Tree[];
}

const model = modelData as GbmModel;

/**
 * Feature order is part of the model's contract - the trees index into this vector by
 * position, so a reordering here silently feeds every split the wrong variable and
 * produces confident nonsense rather than an error. Asserted against the exported
 * model's own featureNames at module load so a mismatch fails loudly at startup.
 */
export const FEATURE_NAMES = [
  'cosine_sim', 'same_swiss_category', 'liquid_mismatch', 'raw_ingredient_mismatch',
  'delta_kcal', 'delta_sugar_g', 'delta_fat_g', 'delta_satfat_g', 'delta_protein_g',
  'delta_fiber_g', 'delta_salt_g', 'delta_health_score', 'kcal_ratio',
  'sensory_distance', 'same_culinary_role', 'same_prep_state',
  'delta_glycemic_load', 'delta_satiety', 'adds_caffeine', 'time_of_day_overlap',
] as const;

if (
  model.featureNames.length !== FEATURE_NAMES.length ||
  model.featureNames.some((n, i) => n !== FEATURE_NAMES[i])
) {
  throw new Error(
    'swapGbm: feature order does not match the trained model. ' +
    `Model expects [${model.featureNames.join(', ')}] but this file builds ` +
    `[${FEATURE_NAMES.join(', ')}]. Re-run scripts/train-swap-gbm.ts or fix the order.`
  );
}

// Matches the rounding scripts/build-pair-slates.ts applied when writing the training
// corpus. Without it the app would feed the trees values at a different precision than
// the thresholds were fit against - harmless for most splits, but silently wrong for any
// threshold that lands between the rounded and unrounded value.
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 10000) / 10000;

const ANY_TIME_BIT = 1 << 4; // TIMES = [breakfast, lunch, dinner, snack, any]

function popcount(n: number): number {
  let c = 0;
  while (n) { n &= n - 1; c++; }
  return c;
}

/**
 * Builds the 20-feature vector for one (source, candidate) pair, in FEATURE_NAMES order.
 *
 * `null` entries are intentional and must not be replaced with 0: the trees carry a
 * learned default branch for missing values, so an unembedded or unlabeled food degrades
 * gracefully, whereas a fabricated 0 asserts something specific and false (a cosine of 0
 * means "unrelated", not "unknown").
 *
 * liquidMismatch / rawIngredientMismatch are passed in rather than computed here so this
 * module does not import swapAlgorithm.ts, which imports this one.
 */
export function extractGbmFeatures(
  source: FoodItem,
  candidate: FoodItem,
  cosineSim: number | null,
  liquidMismatch: 0 | 1,
  rawIngredientMismatch: 0 | 1
): (number | null)[] {
  const sn = source.nutrients_per_100;
  const cn = candidate.nutrients_per_100;
  const a = getAttributes(source.id);
  const b = getAttributes(candidate.id);

  let sensoryDistance: number | null = null;
  let sameRole: number | null = null;
  let samePrep: number | null = null;
  let dGl: number | null = null;
  let dSatiety: number | null = null;
  let addsCaffeine: number | null = null;
  let timeOverlap: number | null = null;

  if (a && b) {
    let sum = 0;
    for (let k = 0; k < a.sensory.length; k++) sum += Math.abs(a.sensory[k] - b.sensory[k]);
    sensoryDistance = r4(sum / (a.sensory.length * 10));
    sameRole = a.culinaryRole === b.culinaryRole ? 1 : 0;
    samePrep = a.prepState === b.prepState ? 1 : 0;
    dGl = b.glycemicLoad - a.glycemicLoad;
    dSatiety = b.satiety - a.satiety;
    addsCaffeine = !a.caffeine && b.caffeine ? 1 : 0;

    // Mirrors the corpus builder exactly: a candidate slot counts when the source shares
    // it, when the candidate itself is "any", or when the SOURCE is "any" (in which case
    // every candidate slot matches). Denominator is the candidate's own slot count.
    const bCount = popcount(b.timeOfDayMask);
    if (bCount === 0) {
      timeOverlap = 0;
    } else {
      const shared = (a.timeOfDayMask & ANY_TIME_BIT)
        ? bCount
        : popcount(b.timeOfDayMask & (a.timeOfDayMask | ANY_TIME_BIT));
      timeOverlap = r4(shared / bCount);
    }
  }

  return [
    cosineSim,
    source.swiss_category === candidate.swiss_category ? 1 : 0,
    liquidMismatch,
    rawIngredientMismatch,
    r3(cn.kcal - sn.kcal),
    r3(cn.sugars_g - sn.sugars_g),
    r3(cn.fat_g - sn.fat_g),
    r3(cn.saturated_fat_g - sn.saturated_fat_g),
    r3(cn.protein_g - sn.protein_g),
    r3(cn.fiber_g - sn.fiber_g),
    r3(cn.salt_g - sn.salt_g),
    candidate.health_score - source.health_score,
    r4(cn.kcal / (sn.kcal || 1)),
    sensoryDistance,
    sameRole,
    samePrep,
    dGl,
    dSatiety,
    addsCaffeine,
    timeOverlap,
  ];
}

function predictTree(t: Tree, x: (number | null)[]): number {
  let node = 0;
  while (t.feature[node] !== -1) {
    const v = x[t.feature[node]];
    const goLeft = (v === null || v === undefined || Number.isNaN(v))
      ? t.defaultLeft[node] === 1
      : v < t.threshold[node];
    node = goLeft ? t.left[node] : t.right[node];
  }
  return t.value[node];
}

/** Probability in [0,1] that this candidate is a good swap, per the distilled model. */
export function predictSwapQualityGbm(features: (number | null)[]): number {
  let f = model.baseScore;
  for (const t of model.trees) f += model.learningRate * predictTree(t, features);
  return 1 / (1 + Math.exp(-f));
}

export const GBM_TREE_COUNT = model.trees.length;
