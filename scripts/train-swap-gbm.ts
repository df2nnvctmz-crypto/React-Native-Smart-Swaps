/**
 * Step 4 of the swap-ranker plan: trains the GBM student on the teacher-labeled pairs,
 * measures it honestly, and exports a JSON model the app can evaluate as plain
 * arithmetic (no ML runtime - see scripts/lib/gbm.ts for why).
 *
 * Reports FOUR things, because any one of them alone is misleading here:
 *
 *   1. GBM vs logistic regression, same features, same folds. The only question that
 *      matters for "is a tree model worth the extra complexity".
 *   2. Grouped CV, split by SOURCE FOOD. Pairs sharing a source are not independent;
 *      a row-wise split leaks near-identical rows across the boundary and inflates
 *      everything.
 *   3. The train/CV gap. swapRanker.ts records a Random Forest that reached ~84% CV
 *      with an 11-point train/CV gap and was rejected for it. If this model shows the
 *      same signature it should be rejected too, however good its headline number.
 *   4. Accuracy on the 216 human labels - restricted to the 9 shared features, since
 *      those rows have no food ids and cannot be enriched with the taste/effect
 *      features (id recovery by nutrient-delta matching resolved only 12 of 216).
 *
 * Run with: npx tsx scripts/train-swap-gbm.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { mulberry32, fitScaler, applyScaler, trainLogReg, groupedFolds, predict as lrPredict } from './lib/logreg';
import { train as gbmTrain, predictProba, modelSize, featureImportance, GbmModel, DEFAULT_PARAMS } from './lib/gbm';

const ROOT = path.join(__dirname, '..');
const ROWS_PATH = path.join(ROOT, 'scripts/pair_training_rows.json');
const HUMAN_PATH = path.join(ROOT, 'swap_training_rows.json');
const OUT_MODEL = path.join(ROOT, 'app/engine/swapGbm.data.json');
const SEED = 42, FOLDS = 5;

const SHARED_9 = [
  'cosine_sim', 'same_swiss_category', 'liquid_mismatch', 'raw_ingredient_mismatch',
  'delta_kcal', 'delta_sugar_g', 'delta_fat_g', 'delta_satfat_g', 'delta_protein_g',
];
const FULL = [
  ...SHARED_9,
  'delta_fiber_g', 'delta_salt_g', 'delta_health_score', 'kcal_ratio',
  'sensory_distance', 'same_culinary_role', 'same_prep_state',
  'delta_glycemic_load', 'delta_satiety', 'adds_caffeine', 'time_of_day_overlap',
];

// Matches scripts/learning-curve.ts. `taste_fit >= 2` beat the teacher's own composite
// verdict at predicting human GOOD/BAD by ~9 points, which says the human labelers were
// judging substitutability rather than nutritional gain.
const label = (r: any) => (r.taste_fit >= 2 ? 1 : 0);

type Row = Record<string, any>;
const rows: Row[] = JSON.parse(fs.readFileSync(ROWS_PATH, 'utf-8'));
const human: Row[] = JSON.parse(fs.readFileSync(HUMAN_PATH, 'utf-8'));
const usable = rows.filter(r => FULL.every(f => r[f] !== null && r[f] !== undefined));

console.log(`teacher corpus: ${usable.length} rows, ${new Set(usable.map(r => r.source_id)).size} source foods`);
console.log(`positives: ${usable.filter(r => label(r) === 1).length} (${(100 * usable.filter(r => label(r) === 1).length / usable.length).toFixed(1)}%)`);

const mat = (data: Row[], feats: string[]) => data.map(r => feats.map(f => r[f] as number));
const pc = (x: number) => isNaN(x) ? '  n/a' : `${(x * 100).toFixed(1)}%`;

function metrics(p: number[], y: number[]) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  p.forEach((pi, i) => {
    const yh = pi >= 0.5 ? 1 : 0;
    if (y[i] === 1) (yh === 1 ? tp++ : fn++); else (yh === 0 ? tn++ : fp++);
  });
  const acc = (tp + tn) / y.length;
  const bal = ((tp + fn ? tp / (tp + fn) : 0) + (tn + fp ? tn / (tn + fp) : 0)) / 2;
  const pos = p.filter((_, i) => y[i] === 1), neg = p.filter((_, i) => y[i] === 0);
  let auc = NaN;
  if (pos.length && neg.length) {
    let wins = 0;
    for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
    auc = wins / (pos.length * neg.length);
  }
  return { acc, bal, auc };
}

/** Grouped CV for both model types on the same folds, plus the train-side numbers. */
function compare(feats: string[], tag: string) {
  const folds = groupedFolds(usable.map(r => r.source_id), FOLDS, mulberry32(SEED));
  const agg = {
    gbmCv: [] as number[][], lrCv: [] as number[][],
    gbmTrain: [] as number[][], lrTrain: [] as number[][],
  };

  for (let f = 0; f < FOLDS; f++) {
    const test = new Set(folds[f]);
    const tr = usable.filter((_, i) => !test.has(i));
    const te = usable.filter((_, i) => test.has(i));
    const ytr = tr.map(label), yte = te.map(label);
    if (new Set(ytr).size < 2 || new Set(yte).size < 2) continue;

    const Xtr = mat(tr, feats), Xte = mat(te, feats);

    const g = gbmTrain(Xtr, ytr, feats);
    const gTe = metrics(predictProba(g, Xte), yte);
    const gTr = metrics(predictProba(g, Xtr), ytr);

    const sc = fitScaler(Xtr);
    const lr = trainLogReg(applyScaler(Xtr, sc), ytr);
    const lTe = metrics(lrPredict(applyScaler(Xte, sc), lr), yte);
    const lTr = metrics(lrPredict(applyScaler(Xtr, sc), lr), ytr);

    agg.gbmCv.push([gTe.acc, gTe.bal, gTe.auc]);
    agg.gbmTrain.push([gTr.acc, gTr.bal, gTr.auc]);
    agg.lrCv.push([lTe.acc, lTe.bal, lTe.auc]);
    agg.lrTrain.push([lTr.acc, lTr.bal, lTr.auc]);
  }

  const mean = (a: number[][], j: number) => a.reduce((s, r) => s + r[j], 0) / a.length;
  console.log(`\n=== ${tag} (${feats.length} features, grouped ${FOLDS}-fold by source food) ===`);
  console.log(`${''.padEnd(22)} ${'acc'.padStart(7)} ${'bal'.padStart(7)} ${'auc'.padStart(7)}`);
  for (const [name, cv, tr] of [['GBM', agg.gbmCv, agg.gbmTrain], ['LogReg', agg.lrCv, agg.lrTrain]] as const) {
    console.log(`${(name + ' CV').padEnd(22)} ${pc(mean(cv, 0)).padStart(7)} ${pc(mean(cv, 1)).padStart(7)} ${pc(mean(cv, 2)).padStart(7)}`);
    console.log(`${(name + ' train').padEnd(22)} ${pc(mean(tr, 0)).padStart(7)} ${pc(mean(tr, 1)).padStart(7)} ${pc(mean(tr, 2)).padStart(7)}`);
    const gap = (mean(tr, 1) - mean(cv, 1)) * 100;
    console.log(`${(name + ' train-CV gap').padEnd(22)} ${(gap.toFixed(1) + 'pts').padStart(7)}   <- watch this` +
      (gap > 10 ? '  OVERFITTING (a RF was rejected here at 11pts)' : ''));
  }
  return { gbmBal: mean(agg.gbmCv, 1), lrBal: mean(agg.lrCv, 1), gbmAuc: mean(agg.gbmCv, 2), lrAuc: mean(agg.lrCv, 2) };
}

const full = compare(FULL, 'FULL feature set');
const nine = compare(SHARED_9, 'SHARED 9 features (comparable to the shipped ranker)');

// --- the human test set: 9 features only, trained purely on teacher labels ---
console.log(`\n=== HUMAN test set (216 hand labels, never seen in training) ===`);
const yHuman = human.map(r => r.is_good);
{
  const X = mat(usable, SHARED_9), y = usable.map(label);
  const g = gbmTrain(X, y, SHARED_9);
  const gm = metrics(predictProba(g, mat(human, SHARED_9)), yHuman);
  const sc = fitScaler(X);
  const lr = trainLogReg(applyScaler(X, sc), y);
  const lm = metrics(lrPredict(applyScaler(mat(human, SHARED_9), sc), lr), yHuman);
  console.log(`${''.padEnd(22)} ${'acc'.padStart(7)} ${'bal'.padStart(7)} ${'auc'.padStart(7)}`);
  console.log(`${'GBM'.padEnd(22)} ${pc(gm.acc).padStart(7)} ${pc(gm.bal).padStart(7)} ${pc(gm.auc).padStart(7)}`);
  console.log(`${'LogReg'.padEnd(22)} ${pc(lm.acc).padStart(7)} ${pc(lm.bal).padStart(7)} ${pc(lm.auc).padStart(7)}`);
  console.log(`${'shipped ranker'.padEnd(22)} ${'79.2%'.padStart(7)} ${'81.4%'.padStart(7)} ${'82.8%'.padStart(7)}   (CV on these rows - home advantage)`);
  console.log(`${'majority baseline'.padEnd(22)} ${'59.3%'.padStart(7)} ${'50.0%'.padStart(7)} ${'50.0%'.padStart(7)}`);
}

// --- final model on the full feature set, fit on everything, for shipping ---
const finalModel: GbmModel = gbmTrain(mat(usable, FULL), usable.map(label), FULL);
fs.writeFileSync(OUT_MODEL, JSON.stringify(finalModel));
const size = modelSize(finalModel);
const bytes = fs.statSync(OUT_MODEL).size;

console.log(`\n=== shipped model ===`);
console.log(`params: ${JSON.stringify(DEFAULT_PARAMS)}`);
console.log(`${size.trees} trees, ${size.nodes} nodes, ${size.leaves} leaves -> ${(bytes / 1024).toFixed(0)} KB`);
console.log(`wrote ${OUT_MODEL}`);

console.log(`\ntop features by contribution:`);
for (const { name, gain } of featureImportance(finalModel).slice(0, 10)) {
  console.log(`  ${(gain * 100).toFixed(1).padStart(5)}%  ${name}`);
}

console.log(`\nVERDICT: GBM ${full.gbmBal > nine.lrBal ? 'beats' : 'does NOT beat'} the linear model on balanced accuracy ` +
            `(${pc(full.gbmBal)} full-feature GBM vs ${pc(nine.lrBal)} 9-feature LogReg).`);
console.log('Ship only if the train-CV gap above is small AND the human-test number holds up.');
