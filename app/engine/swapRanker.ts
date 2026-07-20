/**
 * Learned swap-quality ranker, trained on 156 hand-labeled (source, candidate) pairs
 * via logistic regression (see /scripts training work - scikit-learn, run once offline,
 * weights extracted below). Cross-validated accuracy: 72.4% vs 64.7% majority-class
 * baseline - a real but modest improvement given the small labeled set so far.
 *
 * HONEST CAVEAT: delta_protein_g's learned weight is very likely confounded (see notes
 * in the training summary) - it came out negative because one specific bad cluster
 * (cream mismatched to cheese) happened to also have large protein increases, not
 * because more protein is generally bad. Treat this file as a v1 draft to replace as
 * the labeled dataset grows, not a finished, fully-trusted scoring function yet.
 *
 * This runs as plain arithmetic - no ML runtime, no ONNX, no model file. It's a
 * logistic regression, which after training is just a weighted sum plus a sigmoid.
 */

import { FoodItem } from '../types';

// Learned from swap_training_rows.json via 5-fold cross-validated logistic regression.
// Weights apply to STANDARDIZED features - see scaler mean/scale below, extracted from
// the same training run. Do not change these without retraining; they must move
// together (weights are only meaningful relative to this exact standardization).
const SCALER_MEAN = {
  cosine_sim: 0.903949, same_swiss_category: 0.596154, delta_kcal: -6.224359,
  delta_sugar_g: 0.380769, delta_fat_g: -0.403205, delta_satfat_g: 0.360256, delta_protein_g: 1.664103,
};

const SCALER_SCALE = {
  cosine_sim: 0.051907, same_swiss_category: 0.490667, delta_kcal: 158.783136,
  delta_sugar_g: 13.454358, delta_fat_g: 15.125218, delta_satfat_g: 8.852616, delta_protein_g: 7.352698,
};

const WEIGHTS = {
  cosine_sim: 0.058,
  same_swiss_category: 1.364,
  delta_kcal: 0.455,
  delta_sugar_g: -0.275,
  delta_fat_g: 0.039,
  delta_satfat_g: -0.639,
  delta_protein_g: -0.279, // see honest caveat above - likely confounded, low trust
};
const INTERCEPT = -0.413;

export interface SwapFeatures {
  cosine_sim: number;
  same_swiss_category: 0 | 1;
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
 */
export function predictSwapQuality(features: SwapFeatures): number {
  let z = INTERCEPT;
  for (const key of Object.keys(WEIGHTS) as (keyof SwapFeatures)[]) {
    const standardized = (features[key] - SCALER_MEAN[key]) / SCALER_SCALE[key];
    z += WEIGHTS[key] * standardized;
  }
  return sigmoid(z);
}

/**
 * Extracts the same features used in training from a real (source, candidate) food pair.
 * cosine_sim requires precomputed embeddings (food_vectors_jina.json equivalent) - pass
 * null if unavailable and this feature will be treated as neutral (0 after standardization).
 */
export function extractSwapFeatures(
  source: FoodItem,
  candidate: FoodItem,
  cosineSim: number | null
): SwapFeatures {
  const sn = source.nutrients_per_100;
  const cn = candidate.nutrients_per_100;
  return {
    cosine_sim: cosineSim ?? 0,
    same_swiss_category: source.swiss_category === candidate.swiss_category ? 1 : 0,
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
  // trained on only 156 examples so far, being overconfident in the wrong direction).
  const multiplier = 0.5 + learnedProbability;
  return existingScore * multiplier;
}
