/**
 * L2-regularized logistic regression via batch gradient descent, with feature
 * standardization - extracted so the learning curve and the shipping-weights trainer
 * cannot silently drift apart.
 *
 * This is the same algorithm scripts/trainSwapRanker.ts implements inline. That file
 * is deliberately left untouched (it produces the weights swapRanker.ts currently
 * ships, and it works); instead scripts/learning-curve.ts asserts that this module
 * reproduces its published 79.2% CV / 59.3% baseline on the same 216 rows. If that
 * assertion ever fails, the two implementations have diverged and any comparison
 * between their numbers is meaningless.
 *
 * No Python/scikit-learn in this project's environment, hence from-scratch.
 */

export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

/** Deterministic PRNG (mulberry32) so every split in this project is reproducible. */
export function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface Scaler { mean: number[]; scale: number[] }

export function fitScaler(X: number[][]): Scaler {
  const n = X.length, d = X[0].length;
  const mean = new Array(d).fill(0);
  const scale = new Array(d).fill(0);
  for (const row of X) for (let j = 0; j < d; j++) mean[j] += row[j] / n;
  for (const row of X) for (let j = 0; j < d; j++) scale[j] += (row[j] - mean[j]) ** 2 / n;
  for (let j = 0; j < d; j++) scale[j] = Math.sqrt(scale[j]) || 1;
  return { mean, scale };
}

export function applyScaler(X: number[][], s: Scaler): number[][] {
  return X.map(row => row.map((v, j) => (v - s.mean[j]) / s.scale[j]));
}

export interface Model { w: number[]; b: number }

export function trainLogReg(
  X: number[][], y: number[],
  opts: { lr: number; iters: number; l2: number } = { lr: 0.3, iters: 3000, l2: 0.02 }
): Model {
  const n = X.length, d = X[0].length;
  const w = new Array(d).fill(0);
  let b = 0;
  for (let it = 0; it < opts.iters; it++) {
    const gradW = new Array(d).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = X[i].reduce((s, v, j) => s + v * w[j], b);
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < d; j++) gradW[j] += err * X[i][j];
      gradB += err;
    }
    for (let j = 0; j < d; j++) w[j] -= opts.lr * (gradW[j] / n + opts.l2 * w[j]);
    b -= opts.lr * (gradB / n);
  }
  return { w, b };
}

export function predict(X: number[][], m: Model): number[] {
  return X.map(row => sigmoid(row.reduce((s, v, j) => s + v * m.w[j], m.b)));
}

export function accuracy(X: number[][], y: number[], m: Model): number {
  const p = predict(X, m);
  return p.filter((pi, i) => (pi >= 0.5 ? 1 : 0) === y[i]).length / y.length;
}

/**
 * Accuracy averaged over the two classes. With a corpus this imbalanced, plain
 * accuracy is dominated by the majority class - a model that predicts "bad" for
 * everything can score 90%+ while being useless for ranking. Balanced accuracy is
 * the number to watch on the learning curve.
 */
export function balancedAccuracy(X: number[][], y: number[], m: Model): number {
  const p = predict(X, m);
  let tp = 0, fn = 0, tn = 0, fp = 0;
  p.forEach((pi, i) => {
    const yhat = pi >= 0.5 ? 1 : 0;
    if (y[i] === 1) { yhat === 1 ? tp++ : fn++; } else { yhat === 0 ? tn++ : fp++; }
  });
  const tpr = tp + fn ? tp / (tp + fn) : 0;
  const tnr = tn + fp ? tn / (tn + fp) : 0;
  return (tpr + tnr) / 2;
}

/** Threshold-free ranking quality - the metric that actually matches this use case. */
export function rocAuc(X: number[][], y: number[], m: Model): number {
  const p = predict(X, m);
  const pos = p.filter((_, i) => y[i] === 1);
  const neg = p.filter((_, i) => y[i] === 0);
  if (!pos.length || !neg.length) return NaN;
  // Rank-sum (Mann-Whitney U) formulation, with ties counted as half.
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/**
 * Stratified k-fold indices. Used only where rows are independent; for the pair corpus
 * prefer grouping by source food (see groupedFolds) since pairs sharing a source are
 * not independent.
 */
export function stratifiedFolds(y: number[], k: number, rng: () => number): number[][] {
  const byClass: Record<number, number[]> = {};
  y.forEach((label, i) => { (byClass[label] ??= []).push(i); });
  const folds: number[][] = Array.from({ length: k }, () => []);
  for (const idx of Object.values(byClass)) {
    shuffle(idx, rng).forEach((v, i) => folds[i % k].push(v));
  }
  return folds;
}

/**
 * k-fold indices where every row sharing a group id lands in the SAME fold.
 *
 * This matters more than it looks. Candidates in one slate share a source food, so a
 * plain row-wise split puts near-identical rows (same source, same category, similar
 * deltas) on both sides of the split. The model then scores well by recognising the
 * source rather than by learning what makes a swap good, and cross-validated accuracy
 * comes out inflated - exactly the failure mode this whole eval exists to catch.
 */
export function groupedFolds(groups: string[], k: number, rng: () => number): number[][] {
  const byGroup = new Map<string, number[]>();
  groups.forEach((g, i) => {
    const b = byGroup.get(g);
    if (b) b.push(i); else byGroup.set(g, [i]);
  });
  const folds: number[][] = Array.from({ length: k }, () => []);
  // Largest groups first, each into whichever fold is currently smallest, so folds stay
  // balanced even when slate sizes vary a lot (they range from 2 to 30 here).
  const ordered = shuffle([...byGroup.values()], rng).sort((a, b) => b.length - a.length);
  for (const idxs of ordered) {
    let smallest = 0;
    for (let f = 1; f < k; f++) if (folds[f].length < folds[smallest].length) smallest = f;
    folds[smallest].push(...idxs);
  }
  return folds;
}
