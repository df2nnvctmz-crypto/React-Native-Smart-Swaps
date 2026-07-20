/**
 * Standalone retraining/verification tool for the swap-quality ranker.
 *
 * There's no Python/scikit-learn available in this environment, so this is a
 * from-scratch (but standard) implementation: L2-regularized logistic regression
 * via batch gradient descent, standardized features, manual StratifiedKFold(5)
 * cross-validation. Used to independently verify accuracy claims before trusting
 * them, and to produce the exact scaler/weights swapRanker.ts ships.
 *
 * Run with: npx tsx scripts/trainSwapRanker.ts
 */

import fs from 'fs';
import path from 'path';

type Row = Record<string, number> & { label: string; is_good: number };

const DATA_PATH = path.join(__dirname, '..', 'swap_training_rows.json');
const rows: Row[] = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));

const FEATURE_SETS = {
  legacy7: ['cosine_sim', 'same_swiss_category', 'delta_kcal', 'delta_sugar_g', 'delta_fat_g', 'delta_satfat_g', 'delta_protein_g'],
  full9: ['cosine_sim', 'same_swiss_category', 'liquid_mismatch', 'raw_ingredient_mismatch', 'delta_kcal', 'delta_sugar_g', 'delta_fat_g', 'delta_satfat_g', 'delta_protein_g'],
};

// Deterministic PRNG (mulberry32) so CV splits are reproducible across runs.
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function extractMatrix(data: Row[], features: string[]) {
  const X = data.map(r => features.map(f => r[f]));
  const y = data.map(r => r.is_good);
  return { X, y };
}

function standardize(X: number[][]) {
  const n = X.length, d = X[0].length;
  const mean = new Array(d).fill(0);
  const scale = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j] / n;
  for (const row of X) for (let j = 0; j < d; j++) scale[j] += (row[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < d; j++) scale[j] = Math.sqrt(scale[j]) || 1;
  const Xs = X.map(row => row.map((v, j) => (v - mean[j]) / scale[j]));
  return { Xs, mean, scale };
}

function applyScaler(X: number[][], mean: number[], scale: number[]) {
  return X.map(row => row.map((v, j) => (v - mean[j]) / scale[j]));
}

function sigmoid(x: number) { return 1 / (1 + Math.exp(-x)); }

// L2-regularized logistic regression, batch gradient descent.
function trainLogReg(X: number[][], y: number[], opts = { lr: 0.3, iters: 3000, l2: 0.02 }) {
  const n = X.length, d = X[0].length;
  let w = new Array(d).fill(0);
  let b = 0;
  for (let it = 0; it < opts.iters; it++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = X[i].reduce((s, v, j) => s + v * w[j], b);
      const p = sigmoid(z);
      const err = p - y[i];
      for (let j = 0; j < d; j++) gradW[j] += err * X[i][j];
      gradB += err;
    }
    for (let j = 0; j < d; j++) w[j] -= opts.lr * (gradW[j] / n + opts.l2 * w[j]);
    b -= opts.lr * (gradB / n);
  }
  return { w, b };
}

function accuracy(X: number[][], y: number[], w: number[], b: number) {
  let correct = 0;
  for (let i = 0; i < X.length; i++) {
    const p = sigmoid(X[i].reduce((s, v, j) => s + v * w[j], b));
    if ((p >= 0.5 ? 1 : 0) === y[i]) correct++;
  }
  return correct / X.length;
}

function stratifiedFolds(y: number[], k: number, rng: () => number): number[][] {
  const idxByClass: Record<number, number[]> = {};
  y.forEach((label, i) => {
    (idxByClass[label] ??= []).push(i);
  });
  const folds: number[][] = Array.from({ length: k }, () => []);
  for (const classIdx of Object.values(idxByClass)) {
    const shuffled = shuffle(classIdx, rng);
    shuffled.forEach((idx, i) => folds[i % k].push(idx));
  }
  return folds;
}

function crossValidate(X: number[][], y: number[], k = 5, seed = 42) {
  const rng = mulberry32(seed);
  const folds = stratifiedFolds(y, k, rng);
  const accuracies: number[] = [];
  for (let f = 0; f < k; f++) {
    const testIdx = new Set(folds[f]);
    const trainX: number[][] = [], trainY: number[] = [], testX: number[][] = [], testY: number[] = [];
    X.forEach((row, i) => {
      if (testIdx.has(i)) { testX.push(row); testY.push(y[i]); }
      else { trainX.push(row); trainY.push(y[i]); }
    });
    // Fit the scaler on the TRAINING fold only - fitting on all data (including the
    // held-out fold) would leak information and overstate accuracy.
    const { Xs: trainXs, mean, scale } = standardize(trainX);
    const testXs = applyScaler(testX, mean, scale);
    const { w, b } = trainLogReg(trainXs, trainY);
    accuracies.push(accuracy(testXs, testY, w, b));
  }
  return accuracies;
}

function report(label: string, features: string[]) {
  const { X, y } = extractMatrix(rows, features);
  const accs = crossValidate(X, y);
  const mean = accs.reduce((s, a) => s + a, 0) / accs.length;
  console.log(`\n=== ${label} (${features.length} features, n=${rows.length}) ===`);
  console.log('fold accuracies:', accs.map(a => (a * 100).toFixed(1) + '%').join(', '));
  console.log('mean CV accuracy:', (mean * 100).toFixed(1) + '%');

  // Also fit on the FULL dataset to report the training-accuracy gap (overfit check).
  const { Xs: fullXs, mean: fullMean, scale: fullScale } = standardize(X);
  const { w, b } = trainLogReg(fullXs, y);
  const trainAcc = accuracy(fullXs, y, w, b);
  console.log('full-data training accuracy:', (trainAcc * 100).toFixed(1) + '% (gap vs CV:', ((trainAcc - mean) * 100).toFixed(1) + 'pts)');

  return { features, mean, w, b, scalerMean: fullMean, scalerScale: fullScale };
}

const legacyResult = report('Legacy (original 7 features)', FEATURE_SETS.legacy7);
const fullResult = report('Full (9 features incl. mismatch flags)', FEATURE_SETS.full9);

console.log('\n=== Final full-9-feature model, fit on all', rows.length, 'rows (for shipping) ===');
console.log('SCALER_MEAN =', JSON.stringify(Object.fromEntries(fullResult.features.map((f, i) => [f, +fullResult.scalerMean[i].toFixed(6)])), null, 2));
console.log('SCALER_SCALE =', JSON.stringify(Object.fromEntries(fullResult.features.map((f, i) => [f, +fullResult.scalerScale[i].toFixed(6)])), null, 2));
console.log('WEIGHTS =', JSON.stringify(Object.fromEntries(fullResult.features.map((f, i) => [f, +fullResult.w[i].toFixed(4)])), null, 2));
console.log('INTERCEPT =', +fullResult.b.toFixed(4));

console.log('\n=== Majority-class baseline ===');
const majority = rows.filter(r => r.is_good === 1).length / rows.length;
console.log('baseline accuracy (always predict majority class):', (Math.max(majority, 1 - majority) * 100).toFixed(1) + '%');
