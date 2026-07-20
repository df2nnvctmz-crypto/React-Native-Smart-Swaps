/**
 * Learned swap-quality ranker, trained on 216 hand-labeled (source, candidate) pairs
 * via logistic regression. No Python/scikit-learn is available in this project's
 * environment, so training runs through scripts/trainSwapRanker.ts - a from-scratch
 * (standard) implementation: L2-regularized logistic regression via batch gradient
 * descent, standardized features, manual StratifiedKFold(5) cross-validation.
 *
 * Independently re-verified (not just copied from whoever labeled the data) 5-fold
 * cross-validated accuracy: 79.2% vs a 59.3% majority-class baseline, vs 75.1% for the
 * previous 7-feature version on the same 216 rows - adding liquid_mismatch and
 * raw_ingredient_mismatch as explicit features (rather than only using them as a hard
 * pre-filter in swapAlgorithm.ts) is a real, verified improvement. A Random Forest was
 * also reported to hit ~84% CV elsewhere, but with an 11-point train/CV gap (severe
 * overfitting risk at this dataset size) and no easy portable representation - this
 * project intentionally ships the smaller, honestly-verified logistic regression
 * instead (1.3-point train/CV gap here). Re-run scripts/trainSwapRanker.ts as the
 * labeled set grows and only replace these numbers if cross-validated accuracy - not
 * training accuracy - actually improves.
 *
 * HONEST CAVEAT: delta_protein_g's weight is still negative and still plausibly
 * confounded (as flagged in earlier versions of this model) - treat it as low-trust
 * signal, not "more protein is bad."
 *
 * ANOTHER CAVEAT SPECIFIC TO THIS APP: liquid_mismatch is a real, useful feature in the
 * general training set, but findBestSwaps() in swapAlgorithm.ts already hard-filters
 * out liquid/solid mismatches *before* candidates ever reach this model - so in this
 * app's actual production traffic, liquid_mismatch will always evaluate to 0. Its
 * weight is shipped for correctness (and in case that upstream filter ever loosens),
 * but don't expect it to move rankings today. raw_ingredient_mismatch has no such
 * upstream filter, so it's the one of the two new features doing real work right now.
 *
 * This runs as plain arithmetic - no ML runtime, no ONNX, no model file. It's a
 * logistic regression, which after training is just a weighted sum plus a sigmoid.
 */

import { FoodItem } from '../types';

// Learned from swap_training_rows.json via scripts/trainSwapRanker.ts. Weights apply
// to STANDARDIZED features - see scaler mean/scale below, fit on the same 216 rows.
// Do not change these without retraining; they must move together (weights are only
// meaningful relative to this exact standardization).
const SCALER_MEAN = {
  cosine_sim: 0.900981, same_swiss_category: 0.606481, liquid_mismatch: 0.185185, raw_ingredient_mismatch: 0.064815,
  delta_kcal: -7.388889, delta_sugar_g: -0.277315, delta_fat_g: -1.253704, delta_satfat_g: 0.142130, delta_protein_g: 1.648148,
};

const SCALER_SCALE = {
  cosine_sim: 0.048455, same_swiss_category: 0.488530, liquid_mismatch: 0.388448, raw_ingredient_mismatch: 0.246199,
  delta_kcal: 170.331693, delta_sugar_g: 15.280673, delta_fat_g: 16.712775, delta_satfat_g: 9.896176, delta_protein_g: 7.108419,
};

const WEIGHTS = {
  cosine_sim: 0.0127,
  same_swiss_category: 1.1753,
  liquid_mismatch: -0.6130, // see caveat above - structurally always 0 in this app today
  raw_ingredient_mismatch: -0.5563,
  delta_kcal: 0.3884,
  delta_sugar_g: -0.3948,
  delta_fat_g: -0.2681,
  delta_satfat_g: -0.0711,
  delta_protein_g: -0.1188, // see honest caveat above - likely confounded, low trust
};
const INTERCEPT = -0.7826;

export interface SwapFeatures {
  // null means "we don't have a real embedding for this pair" - see the neutrality
  // note on predictSwapQuality() below for why this has to stay nullable rather than
  // defaulting to a number.
  cosine_sim: number | null;
  same_swiss_category: 0 | 1;
  liquid_mismatch: 0 | 1;
  raw_ingredient_mismatch: 0 | 1;
  delta_kcal: number;
  delta_sugar_g: number;
  delta_fat_g: number;
  delta_satfat_g: number;
  delta_protein_g: number;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Returns a probability [0,1] that this candidate is a GOOD swap, per the learned model.
 * This is a SEPARATE signal from evaluateSwap()'s existing hand-tuned score - see
 * combineWithExistingScore() below for how to blend them rather than replace one with
 * the other outright.
 *
 * NEUTRALITY FIX: cosine_sim was trained on real embeddings tightly clustered around
 * 0.90 (SCALER_SCALE.cosine_sim is only ~0.05 - a very narrow range). This project has
 * no embeddings pipeline at all (no food_vectors file anywhere), so every real call site
 * passes null for it. Standardizing a stand-in value like 0 against that narrow scale
 * produces a huge, wrong z-shift that swamps every other feature, instead of the
 * "neutral" contribution a naive implementation might assume. The correct fix is to
 * skip a feature's term entirely when it's not actually known, rather than push a
 * placeholder through a standardization it was never trained to see.
 */
export function predictSwapQuality(features: SwapFeatures): number {
  let z = INTERCEPT;
  for (const key of Object.keys(WEIGHTS) as (keyof SwapFeatures)[]) {
    const raw = features[key];
    if (raw === null) continue;
    const standardized = (raw - SCALER_MEAN[key]) / SCALER_SCALE[key];
    z += WEIGHTS[key] * standardized;
  }
  return sigmoid(z);
}

/**
 * Extracts the same features used in training from a real (source, candidate) food pair.
 * cosine_sim requires precomputed semantic embeddings, which this project doesn't have -
 * pass null when unavailable (the normal case today) and predictSwapQuality() will skip
 * that term instead of guessing a value for it.
 */
export function extractSwapFeatures(
  source: FoodItem,
  candidate: FoodItem,
  cosineSim: number | null,
  liquidMismatch: 0 | 1,
  rawIngredientMismatch: 0 | 1
): SwapFeatures {
  const sn = source.nutrients_per_100;
  const cn = candidate.nutrients_per_100;
  return {
    cosine_sim: cosineSim,
    same_swiss_category: source.swiss_category === candidate.swiss_category ? 1 : 0,
    liquid_mismatch: liquidMismatch,
    raw_ingredient_mismatch: rawIngredientMismatch,
    delta_kcal: cn.kcal - sn.kcal,
    delta_sugar_g: cn.sugars_g - sn.sugars_g,
    delta_fat_g: cn.fat_g - sn.fat_g,
    delta_satfat_g: cn.saturated_fat_g - sn.saturated_fat_g,
    delta_protein_g: cn.protein_g - sn.protein_g,
  };
}

/**
 * Suggested blend: use the learned model as a MULTIPLIER on the existing hand-tuned
 * score, not a replacement. This means a candidate the learned model considers
 * implausible (e.g. wrong food role) gets heavily discounted even if the hand-tuned
 * nutrient math likes its numbers - while a candidate both systems like keeps its full
 * score. Keeping the existing score in the loop, rather than fully replacing it, means
 * you don't throw away everything evaluateSwap() already does well.
 */
export function combineWithExistingScore(existingScore: number, learnedProbability: number): number {
  // learnedProbability ranges [0,1]; use it as a 0.5x-1.5x multiplier so a confident
  // BAD prediction can meaningfully suppress a candidate, without a single wrong
  // signal being able to zero it out entirely (guards against the learned model,
  // trained on a still-small 216 examples, being overconfident in the wrong direction).
  const multiplier = 0.5 + learnedProbability;
  return existingScore * multiplier;
}
