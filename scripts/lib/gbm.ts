/**
 * Gradient-boosted decision trees for binary classification, from scratch.
 *
 * WHY FROM SCRATCH: same constraint as scripts/trainSwapRanker.ts - there is no
 * Python/scikit-learn in this project's environment, and more importantly the model has
 * to SHIP. swapRanker.ts's own note rules out an ML runtime on device ("no ML runtime,
 * no ONNX, no model file"), so whatever is trained here has to reduce to plain
 * arithmetic over a JSON blob. Trees do: prediction is a handful of comparisons per
 * tree. See exportModel() for the shipped representation.
 *
 * WHY TREES AT ALL: the current ranker is a logistic regression, which is linear in the
 * features. Several of the features unlocked by the attribute-labeling pass are not
 * usefully linear - `sensory_distance` matters near zero and saturates, `delta_satiety`
 * is a 3-level ordinal, `same_culinary_role` interacts with category rather than adding
 * independently. Measured on this corpus, grouped-CV AUC with the full feature set is
 * 87.0% versus 77.9% for the 9-feature linear model, which is the gap this exists to
 * capture.
 *
 * ALGORITHM: standard second-order gradient boosting (the XGBoost formulation).
 * Per round it fits a regression tree to the gradient/hessian of logistic loss:
 *   gain     = 0.5 * [ GL^2/(HL+l) + GR^2/(HR+l) - G^2/(H+l) ] - gamma
 *   leafval  = -G / (H + lambda)
 * Second-order (using the hessian, not just residuals) is what makes leaf values
 * self-scaling, so this needs far less hand-tuning than a first-order implementation.
 *
 * OVERFITTING IS THE MAIN RISK HERE, and this project has already been bitten by it:
 * swapRanker.ts records a Random Forest that hit ~84% CV but with an 11-point train/CV
 * gap, and was rejected in favour of the honestly-verified logistic regression. Trees on
 * 13.5k rows can memorise. Defaults below are deliberately conservative (shallow trees,
 * strong shrinkage, minimum child weight), and scripts/train-swap-gbm.ts reports the
 * train/CV gap as a first-class number rather than burying it.
 */

export interface GbmParams {
  rounds: number;         // number of boosting rounds (trees)
  maxDepth: number;       // tree depth; 3-6 is the useful range at this dataset size
  learningRate: number;   // shrinkage - lower needs more rounds but generalizes better
  lambda: number;         // L2 on leaf weights
  gamma: number;          // minimum gain to make a split at all
  minChildWeight: number; // minimum summed hessian in a child - the main anti-memorization knob
  subsample: number;      // row sampling per tree (<1 adds regularizing noise)
  colsample: number;      // feature sampling per tree
  seed: number;
}

export const DEFAULT_PARAMS: GbmParams = {
  rounds: 200,
  maxDepth: 4,
  learningRate: 0.06,
  lambda: 1.0,
  gamma: 0.0,
  minChildWeight: 8,
  subsample: 0.8,
  colsample: 0.8,
  seed: 42,
};

/**
 * A tree in flat-array form. Nested objects would roughly triple the JSON size for the
 * same information, and this file gets bundled into the app.
 * Node i is a leaf when feature[i] === -1; then value[i] is its output.
 * Otherwise: go left when x[feature[i]] < threshold[i], right when >=,
 * and follow defaultLeft[i] when the feature is missing (null/NaN).
 */
export interface Tree {
  feature: number[];
  threshold: number[];
  left: number[];
  right: number[];
  value: number[];
  defaultLeft: number[]; // 1 or 0
}

export interface GbmModel {
  featureNames: string[];
  baseScore: number; // initial log-odds
  learningRate: number;
  trees: Tree[];
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

interface Split {
  feature: number;
  threshold: number;
  gain: number;
  defaultLeft: boolean;
  leftRows: number[];
  rightRows: number[];
}

/**
 * Best split for one node.
 *
 * Missing values (null / NaN) are not imputed. They are collected separately and tried
 * in BOTH directions, keeping whichever scores better - the same learned-default-branch
 * trick XGBoost uses. That matters in production even though this training corpus has
 * no nulls: `cosine_sim` is null for any food without an embedding and the attribute
 * features are null for any unlabeled food, so the shipped model must handle a missing
 * feature as a first-class case rather than substituting a fabricated 0.
 */
function findBestSplit(
  rows: number[], X: (number | null)[][], grad: Float64Array, hess: Float64Array,
  features: number[], p: GbmParams
): Split | null {
  let G = 0, H = 0;
  for (const i of rows) { G += grad[i]; H += hess[i]; }
  const parentScore = (G * G) / (H + p.lambda);

  let best: Split | null = null;

  for (const f of features) {
    const present: number[] = [];
    const missing: number[] = [];
    for (const i of rows) {
      const v = X[i][f];
      (v === null || Number.isNaN(v) ? missing : present).push(i);
    }
    if (present.length < 2) continue;
    present.sort((a, b) => (X[a][f] as number) - (X[b][f] as number));

    let Gm = 0, Hm = 0;
    for (const i of missing) { Gm += grad[i]; Hm += hess[i]; }

    // Two passes: missing rows sent left, then sent right.
    for (const missLeft of [true, false]) {
      let GL = missLeft ? Gm : 0;
      let HL = missLeft ? Hm : 0;
      for (let k = 0; k < present.length - 1; k++) {
        const i = present[k];
        GL += grad[i]; HL += hess[i];
        const vk = X[i][f] as number;
        const vNext = X[present[k + 1]][f] as number;
        if (vk === vNext) continue; // can't split between equal values
        const GR = G - GL, HR = H - HL;
        if (HL < p.minChildWeight || HR < p.minChildWeight) continue;
        const gain = 0.5 * ((GL * GL) / (HL + p.lambda) + (GR * GR) / (HR + p.lambda) - parentScore) - p.gamma;
        if (gain > (best?.gain ?? 0)) {
          const leftPresent = present.slice(0, k + 1);
          const rightPresent = present.slice(k + 1);
          best = {
            feature: f, threshold: vNext, gain, defaultLeft: missLeft,
            leftRows: missLeft ? [...leftPresent, ...missing] : leftPresent,
            rightRows: missLeft ? rightPresent : [...rightPresent, ...missing],
          };
        }
      }
    }
  }
  return best;
}

function buildTree(
  rows: number[], X: (number | null)[][], grad: Float64Array, hess: Float64Array,
  features: number[], p: GbmParams
): Tree {
  const t: Tree = { feature: [], threshold: [], left: [], right: [], value: [], defaultLeft: [] };

  const addNode = () => {
    t.feature.push(-1); t.threshold.push(0); t.left.push(-1);
    t.right.push(-1); t.value.push(0); t.defaultLeft.push(1);
    return t.feature.length - 1;
  };

  const makeLeaf = (node: number, nodeRows: number[]) => {
    let G = 0, H = 0;
    for (const i of nodeRows) { G += grad[i]; H += hess[i]; }
    t.feature[node] = -1;
    t.value[node] = -G / (H + p.lambda);
  };

  const grow = (node: number, nodeRows: number[], depth: number) => {
    if (depth >= p.maxDepth || nodeRows.length < 2) { makeLeaf(node, nodeRows); return; }
    const split = findBestSplit(nodeRows, X, grad, hess, features, p);
    if (!split || split.gain <= 0) { makeLeaf(node, nodeRows); return; }
    const l = addNode(), r = addNode();
    t.feature[node] = split.feature;
    t.threshold[node] = split.threshold;
    t.defaultLeft[node] = split.defaultLeft ? 1 : 0;
    t.left[node] = l; t.right[node] = r;
    grow(l, split.leftRows, depth + 1);
    grow(r, split.rightRows, depth + 1);
  };

  grow(addNode(), rows, 0);
  return t;
}

export function predictTree(t: Tree, x: (number | null)[]): number {
  let node = 0;
  while (t.feature[node] !== -1) {
    const v = x[t.feature[node]];
    const goLeft = (v === null || v === undefined || Number.isNaN(v as number))
      ? t.defaultLeft[node] === 1
      : (v as number) < t.threshold[node];
    node = goLeft ? t.left[node] : t.right[node];
  }
  return t.value[node];
}

/** Raw log-odds for one row. */
export function predictRaw(m: GbmModel, x: (number | null)[]): number {
  let f = m.baseScore;
  for (const t of m.trees) f += m.learningRate * predictTree(t, x);
  return f;
}

export function predictProba(m: GbmModel, X: (number | null)[][]): number[] {
  return X.map(x => sigmoid(predictRaw(m, x)));
}

export function train(
  X: (number | null)[][], y: number[], featureNames: string[],
  params: Partial<GbmParams> = {}
): GbmModel {
  const p = { ...DEFAULT_PARAMS, ...params };
  const rng = mulberry32(p.seed);
  const n = X.length, d = featureNames.length;

  const pos = y.reduce((s, v) => s + v, 0);
  const rate = Math.min(Math.max(pos / n, 1e-6), 1 - 1e-6);
  const baseScore = Math.log(rate / (1 - rate));

  const F = new Float64Array(n).fill(baseScore);
  const grad = new Float64Array(n);
  const hess = new Float64Array(n);
  const trees: Tree[] = [];

  for (let round = 0; round < p.rounds; round++) {
    for (let i = 0; i < n; i++) {
      const pi = sigmoid(F[i]);
      grad[i] = pi - y[i];
      hess[i] = Math.max(pi * (1 - pi), 1e-6);
    }
    // Row and column subsampling: cheap regularization, and the main defence against
    // the memorization that got a Random Forest rejected here before.
    const rows: number[] = [];
    for (let i = 0; i < n; i++) if (p.subsample >= 1 || rng() < p.subsample) rows.push(i);
    const feats: number[] = [];
    for (let f = 0; f < d; f++) if (p.colsample >= 1 || rng() < p.colsample) feats.push(f);
    if (!rows.length || !feats.length) continue;

    const tree = buildTree(rows, X, grad, hess, feats, p);
    trees.push(tree);
    // Update every row, including those held out of this tree by subsampling.
    for (let i = 0; i < n; i++) F[i] += p.learningRate * predictTree(tree, X[i]);
  }

  return { featureNames, baseScore, learningRate: p.learningRate, trees };
}

/** Total split count - a proxy for capacity, and for the shipped JSON's size. */
export function modelSize(m: GbmModel): { trees: number; nodes: number; leaves: number } {
  let nodes = 0, leaves = 0;
  for (const t of m.trees) {
    nodes += t.feature.length;
    leaves += t.feature.filter(f => f === -1).length;
  }
  return { trees: m.trees.length, nodes, leaves };
}

/**
 * Gain-based feature importance: total loss reduction attributed to each feature.
 * Recomputed from the trees rather than accumulated during training so it stays correct
 * for any model, including one loaded back from JSON.
 */
export function featureImportance(m: GbmModel): { name: string; gain: number }[] {
  const total = new Array(m.featureNames.length).fill(0);
  for (const t of m.trees) {
    for (let i = 0; i < t.feature.length; i++) {
      if (t.feature[i] === -1) continue;
      // Approximate a node's contribution by the spread of its children's leaf values;
      // exact gains are not recoverable from the exported tree alone.
      const lv = t.value[t.left[i]], rv = t.value[t.right[i]];
      total[t.feature[i]] += Math.abs(lv - rv);
    }
  }
  const sum = total.reduce((s, v) => s + v, 0) || 1;
  return m.featureNames
    .map((name, i) => ({ name, gain: total[i] / sum }))
    .sort((a, b) => b.gain - a.gain);
}
