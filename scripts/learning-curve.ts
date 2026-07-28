/**
 * Answers "how many labeled pairs do we actually need?" by measurement instead of guess.
 *
 * Trains the student on growing subsets of the teacher-labeled corpus and reports, at
 * each size, how well it does on TWO different questions:
 *
 *   1. HUMAN AGREEMENT - test on the 216 hand-labeled rows in swap_training_rows.json.
 *      This is the one that matters. It asks whether a model distilled from qwen3's
 *      judgments predicts what a HUMAN called good, and it is directly comparable to
 *      the 79.2% CV that swapRanker.ts currently ships. If this never approaches that,
 *      the teacher is not worth distilling regardless of how big the corpus gets.
 *
 *      Restricted to the 9 features both datasets share. The 216 rows store only those
 *      features and no food ids, and an attempt to recover the ids by matching nutrient
 *      deltas back against foods.json resolved just 12 of 216 uniquely (185 found no
 *      match at all - the stored values are rounded and probably predate a foods.json
 *      revision). So the human test set simply cannot be enriched with the new
 *      taste/effect features; that is a property of the data, not a shortcut here.
 *
 *   2. TEACHER AGREEMENT - grouped cross-validation within the teacher corpus, on the
 *      full feature set. Measures how learnable the teacher's own judgments are, and
 *      is the only way to score the taste/effect features. Note this says nothing about
 *      whether the teacher is RIGHT - only (1) does.
 *
 * Stop the labeling run when curve (1) flattens. That is the whole point.
 *
 * Run with: npx tsx scripts/learning-curve.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  mulberry32, shuffle, fitScaler, applyScaler, trainLogReg,
  accuracy, balancedAccuracy, rocAuc, groupedFolds, stratifiedFolds, Model,
} from './lib/logreg';

const ROOT = path.join(__dirname, '..');
const ROWS_PATH = path.join(ROOT, 'scripts/pair_training_rows.json');
const HUMAN_PATH = path.join(ROOT, 'swap_training_rows.json');
const SEED = 42;
const FOLDS = 5;

// The 9 features swapRanker.ts ships and the 216 human rows also carry.
const SHARED_9 = [
  'cosine_sim', 'same_swiss_category', 'liquid_mismatch', 'raw_ingredient_mismatch',
  'delta_kcal', 'delta_sugar_g', 'delta_fat_g', 'delta_satfat_g', 'delta_protein_g',
];
// Everything the teacher corpus has. `production_score` is deliberately excluded: it is
// the output of the system being replaced, so including it would let the student learn
// to echo today's ranking instead of the teacher's judgment.
const FULL = [
  ...SHARED_9,
  'delta_fiber_g', 'delta_salt_g', 'delta_health_score', 'kcal_ratio',
  'sensory_distance', 'same_culinary_role', 'same_prep_state',
  'delta_glycemic_load', 'delta_satiety', 'adds_caffeine', 'time_of_day_overlap',
];

/**
 * How a teacher label becomes a binary target. This is NOT a detail - it dominated
 * every result on the first real run.
 *
 * The obvious mapping (verdict === 'good') makes only 6.2% of the corpus positive,
 * while the 216 human rows are 40.7% positive. Trained on that, the model essentially
 * never predicts positive: accuracy lands on 59.3% - exactly the majority baseline -
 * and balanced accuracy on 50.0%, i.e. indistinguishable from a coin flip, even though
 * its AUC was 65.6% and therefore clearly carrying signal. The label definition, not
 * the corpus size, was the binding constraint.
 *
 * `taste_fit >= 2` turned out to be the best proxy for what a human called GOOD -
 * better even than good+marginal at a nearly identical positive rate - which says the
 * human labelers were judging whether the swap is a plausible SUBSTITUTE, not whether
 * it is a nutritional win. Worth remembering when defining the shipping target.
 */
const LABEL_DEFS: Record<string, (r: Row) => number> = {
  'taste_fit>=2': r => (r.taste_fit >= 2 ? 1 : 0),
  'good+marginal': r => (r.verdict !== 'bad' ? 1 : 0),
  'good only': r => (r.verdict === 'good' ? 1 : 0),
};
const PRIMARY = 'taste_fit>=2';

if (!fs.existsSync(ROWS_PATH)) {
  console.error(`Missing ${ROWS_PATH}. Run: npx tsx scripts/build-pair-training-rows.ts`);
  process.exit(1);
}

type Row = Record<string, any>;
const rows: Row[] = JSON.parse(fs.readFileSync(ROWS_PATH, 'utf-8'));
const human: Row[] = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf-8'));

const usable = rows.filter(r => FULL.every(f => r[f] !== null && r[f] !== undefined));
console.log(`teacher corpus: ${rows.length} labeled rows (${usable.length} with no null features)`);
console.log(`human test set: ${human.length} rows`);
console.log(`positives: teacher ${usable.filter(r => r.is_good).length}, human ${human.filter(r => r.is_good).length}`);

// --- sanity check: does lib/logreg reproduce trainSwapRanker's published numbers? ---
// If this drifts, every comparison below against the shipped 79.2% is meaningless.
{
  const X = human.map(r => SHARED_9.map(f => r[f]));
  const y = human.map(r => r.is_good);
  const rng = mulberry32(SEED);
  const folds = stratifiedFolds(y, FOLDS, rng);
  const accs = folds.map((_, f) => {
    const test = new Set(folds[f]);
    const trX: number[][] = [], trY: number[] = [], teX: number[][] = [], teY: number[] = [];
    X.forEach((row, i) => (test.has(i) ? (teX.push(row), teY.push(y[i])) : (trX.push(row), trY.push(y[i]))));
    const sc = fitScaler(trX);
    return accuracy(applyScaler(teX, sc), teY, trainLogReg(applyScaler(trX, sc), trY));
  });
  const mean = accs.reduce((s, a) => s + a, 0) / accs.length;
  const majority = Math.max(y.filter(v => v === 1).length, y.filter(v => v === 0).length) / y.length;
  const ok = Math.abs(mean - 0.792) < 0.02 && Math.abs(majority - 0.593) < 0.02;
  console.log(`\nself-check vs trainSwapRanker.ts: CV ${(mean * 100).toFixed(1)}% (expected 79.2%), ` +
              `baseline ${(majority * 100).toFixed(1)}% (expected 59.3%)  ${ok ? 'OK' : '<-- DIVERGED'}`);
  if (!ok) console.log('  lib/logreg.ts no longer matches the shipped trainer - numbers below are not comparable.');
}

type Labeler = (r: Row) => number;

function trainOn(data: Row[], features: string[], label: Labeler): { model: Model; scaler: ReturnType<typeof fitScaler> } {
  const X = data.map(r => features.map(f => r[f]));
  const scaler = fitScaler(X);
  return { model: trainLogReg(applyScaler(X, scaler), data.map(label)), scaler };
}

function evalOn(data: Row[], features: string[], m: Model, scaler: ReturnType<typeof fitScaler>, label: Labeler) {
  const X = applyScaler(data.map(r => features.map(f => r[f])), scaler);
  const y = data.map(label);
  return { acc: accuracy(X, y, m), bal: balancedAccuracy(X, y, m), auc: rocAuc(X, y, m) };
}

/** The human rows carry their own binary label; teacher label definitions never apply. */
const humanLabel: Labeler = r => r.is_good;

/** Grouped CV inside the teacher corpus - whole slates stay on one side of the split. */
function groupedCv(data: Row[], features: string[], label: Labeler) {
  const rng = mulberry32(SEED);
  const folds = groupedFolds(data.map(r => r.source_id), FOLDS, rng);
  const out = { acc: 0, bal: 0, auc: 0 };
  let used = 0;
  // AUC is undefined for a test fold containing only one class. Those folds are counted
  // for acc/bal but must be EXCLUDED from the AUC mean - averaging them in as 0 (the
  // obvious-looking `isNaN(x) ? 0 : x`) drags AUC toward zero and makes a working model
  // look perfectly inverted, which is exactly what it did on the first real run here.
  let aucFolds = 0;
  for (let f = 0; f < FOLDS; f++) {
    const test = new Set(folds[f]);
    const tr = data.filter((_, i) => !test.has(i));
    const te = data.filter((_, i) => test.has(i));
    if (!tr.length || !te.length) continue;
    if (new Set(tr.map(label)).size < 2) continue; // train fold has one class only
    const { model, scaler } = trainOn(tr, features, label);
    const r = evalOn(te, features, model, scaler, label);
    out.acc += r.acc; out.bal += r.bal;
    if (!isNaN(r.auc)) { out.auc += r.auc; aucFolds++; }
    used++;
  }
  if (!used) return null;
  return {
    acc: out.acc / used,
    bal: out.bal / used,
    auc: aucFolds ? out.auc / aucFolds : NaN,
    folds: used,
    aucFolds,
  };
}

// --- the curve: grow the corpus by whole SLATES, not by rows ---
// Sampling rows individually would split slates across the boundary and quietly leak
// source foods into every subset size.
const rng = mulberry32(SEED);
const slateIds = shuffle([...new Set(usable.map(r => r.source_id))], rng);
const bySlate = new Map<string, Row[]>();
for (const r of usable) {
  const b = bySlate.get(r.source_id);
  if (b) b.push(r); else bySlate.set(r.source_id, [r]);
}

const SIZES = [250, 500, 1000, 2000, 4000, 8000, 15000];
const targets = SIZES.filter(s => s < usable.length).concat([usable.length]);

const pc = (x: number) => isNaN(x) ? '  n/a' : `${(x * 100).toFixed(1)}%`;

function subsetOf(target: number): { rows: Row[]; slates: number } {
  const out: Row[] = [];
  let used = 0;
  for (const sid of slateIds) {
    if (out.length >= target) break;
    out.push(...bySlate.get(sid)!);
    used++;
  }
  return { rows: out, slates: used };
}

// --- how the binary target is defined, at full corpus size ---
// Printed first because it dominates everything below: pick the wrong definition and
// the curve reads as "no signal" no matter how many pairs are labeled.
console.log(`\nLABEL DEFINITION (all ${usable.length} rows, tested on the 216 humans)`);
console.log(`${'definition'.padEnd(16)} ${'teacher pos'.padStart(11)} | ${'acc'.padStart(6)} ${'bal'.padStart(6)} ${'auc'.padStart(6)}`);
console.log('-'.repeat(56));
for (const [name, fn] of Object.entries(LABEL_DEFS)) {
  const posRate = usable.filter(r => fn(r) === 1).length / usable.length;
  if (new Set(usable.map(fn)).size < 2) { console.log(`${name.padEnd(16)} single-class`); continue; }
  const m = trainOn(usable, SHARED_9, fn);
  const h = evalOn(human, SHARED_9, m.model, m.scaler, humanLabel);
  console.log(`${name.padEnd(16)} ${pc(posRate).padStart(11)} | ${pc(h.acc).padStart(6)} ${pc(h.bal).padStart(6)} ${pc(h.auc).padStart(6)}`
    + (name === PRIMARY ? '   <- used for the curve below' : ''));
}
console.log(`${'(human rows)'.padEnd(16)} ${pc(human.filter(r => r.is_good).length / human.length).padStart(11)} |   -- target distribution the teacher corpus should resemble`);

// --- the curve, under the primary label definition ---
const label = LABEL_DEFS[PRIMARY];
console.log(`\nLEARNING CURVE (label = ${PRIMARY})`);
console.log(`${'rows'.padStart(6)} ${'slates'.padStart(7)} ${'pos'.padStart(5)} | ` +
            `${'HUMAN acc'.padStart(10)} ${'bal'.padStart(6)} ${'auc'.padStart(6)} | ` +
            `${'TEACHER acc'.padStart(12)} ${'bal'.padStart(6)} ${'auc'.padStart(6)}`);
console.log('-'.repeat(88));

for (const target of targets) {
  const { rows: subset, slates } = subsetOf(target);
  const pos = subset.filter(r => label(r) === 1).length;
  if (new Set(subset.map(label)).size < 2) {
    console.log(`${String(subset.length).padStart(6)} ${String(slates).padStart(7)} ${String(pos).padStart(5)} | single-class subset - skipped`);
    continue;
  }

  // (1) human agreement: train on the 9 shared features, test on all 216 human rows
  const nine = trainOn(subset, SHARED_9, label);
  const h = evalOn(human, SHARED_9, nine.model, nine.scaler, humanLabel);

  // (2) teacher agreement: grouped CV on the full feature set
  const t = groupedCv(subset, FULL, label);

  console.log(
    `${String(subset.length).padStart(6)} ${String(slates).padStart(7)} ${String(pos).padStart(5)} | ` +
    `${pc(h.acc).padStart(10)} ${pc(h.bal).padStart(6)} ${pc(h.auc).padStart(6)} | ` +
    `${(t ? pc(t.acc) : '   n/a').padStart(12)} ${(t ? pc(t.bal) : ' n/a').padStart(6)} ${(t ? pc(t.auc) : ' n/a').padStart(6)}`
  );
}

console.log('\nHUMAN  = trained on teacher labels (9 shared features), tested on the 216 hand labels.');
console.log('         Benchmark: the shipped ranker gets acc 79.2% / bal 81.4% / auc 82.8% on these rows,');
console.log('         but via CV on the rows themselves - the distilled model has never seen a human label.');
console.log('         Majority baseline is 59.3%.');
console.log('TEACHER = grouped 5-fold CV inside the teacher corpus, full feature set, split by source food.');
console.log('\nWatch `bal` and `auc`, not `acc`: on an imbalanced corpus a model that always predicts');
console.log('BAD scores high on acc while being useless for ranking. Stop labeling when HUMAN flattens.');
