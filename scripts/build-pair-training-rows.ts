/**
 * Joins the LLM teacher's labels back onto the feature vectors, producing the flat
 * training corpus that scripts/learning-curve.ts (and later the GBM student) consumes.
 *
 *   scripts/pair_slates.jsonl  (features, from build-pair-slates.ts)
 * + scripts/pair_labels.json   (labels,   from label_swap_pairs_ollama.py)
 * = scripts/pair_training_rows.json
 *
 * Runs against a PARTIAL label file on purpose - the labeling pass takes ~20h and this
 * is how you check whether it is worth finishing. Unlabeled pairs are skipped, not
 * zero-filled.
 *
 * Row shape is deliberately a superset of swap_training_rows.json (the 216 hand-labeled
 * rows): same feature names, same `label`/`is_good` columns, so the two can be compared
 * and, for the 9 shared features, trained/tested against each other directly.
 *
 * WHY `is_good` COLLAPSES THREE VERDICTS TO TWO:
 * the teacher emits good/marginal/bad, but the 216 human labels are binary GOOD/BAD.
 * `is_good` maps good->1 and marginal/bad->0 purely so the two datasets line up; the
 * raw `verdict` and the three ordinal axes are kept on every row, so the multi-axis
 * work in step 5 of the plan does not need a re-label.
 *
 * Run with: npx tsx scripts/build-pair-training-rows.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const SLATES = path.join(ROOT, 'scripts/pair_slates.jsonl');
const LABELS = path.join(ROOT, 'scripts/pair_labels.json');
const OUT = path.join(ROOT, 'scripts/pair_training_rows.json');

interface Label {
  pair_id: string; taste_fit: number; nutrition_gain: number;
  effect_fit: number; verdict: 'good' | 'marginal' | 'bad';
}

for (const p of [SLATES, LABELS]) {
  if (!fs.existsSync(p)) {
    console.error(`Missing ${p}.`);
    console.error('Run: npx tsx scripts/build-pair-slates.ts && python3 scripts/label_swap_pairs_ollama.py');
    process.exit(1);
  }
}

const labels = new Map<string, Label>(
  (JSON.parse(fs.readFileSync(LABELS, 'utf-8')) as Label[]).map(l => [l.pair_id, l])
);

const rows: Record<string, unknown>[] = [];
let totalPairs = 0, nullFeatureRows = 0;

for (const line of fs.readFileSync(SLATES, 'utf-8').split('\n')) {
  if (!line.trim()) continue;
  const slate = JSON.parse(line);
  for (const c of slate.candidates) {
    totalPairs++;
    const label = labels.get(c.pair_id);
    if (!label) continue;

    // Nulls mean "this food had no embedding / no attribute record" and must stay null
    // rather than becoming 0 - see the note in build-pair-slates.ts. Consumers decide
    // whether to drop the row or skip the feature; the join does not decide for them.
    if (Object.values(c.features).some(v => v === null)) nullFeatureRows++;

    rows.push({
      pair_id: c.pair_id,
      // Grouping key for leakage-free CV: pairs sharing a source food are not
      // independent, so they must never be split across folds.
      source_id: slate.source_id,
      candidate_id: c.candidate_id,
      source_name: slate.source.name,
      candidate_name: c.candidate.name,
      slot: c.slot,
      production_rank: c.production_rank,
      pool_size: slate.pool_size,
      ...c.features,
      taste_fit: label.taste_fit,
      nutrition_gain: label.nutrition_gain,
      effect_fit: label.effect_fit,
      verdict: label.verdict,
      label: label.verdict === 'good' ? 'GOOD' : 'BAD',
      is_good: label.verdict === 'good' ? 1 : 0,
    });
  }
}

fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));

const count = (fn: (r: any) => boolean) => rows.filter(fn).length;
const pct = (n: number) => rows.length ? `${((n / rows.length) * 100).toFixed(1)}%` : '-';
const corpusPct = totalPairs ? ((rows.length / totalPairs) * 100).toFixed(1) : '0.0';
console.log(`labeled ${rows.length} of ${totalPairs} pairs (${corpusPct}% of the corpus)`);
console.log(`  distinct source foods: ${new Set(rows.map(r => r.source_id)).size}`);
console.log(`  rows with a null feature: ${nullFeatureRows}`);
console.log(`\nverdict:  good ${count(r => r.verdict === 'good')} (${pct(count(r => r.verdict === 'good'))})` +
            `   marginal ${count(r => r.verdict === 'marginal')} (${pct(count(r => r.verdict === 'marginal'))})` +
            `   bad ${count(r => r.verdict === 'bad')} (${pct(count(r => r.verdict === 'bad'))})`);
for (const axis of ['taste_fit', 'nutrition_gain', 'effect_fit'] as const) {
  const dist = [0, 1, 2, 3].map(v => `${v}:${count(r => r[axis] === v)}`).join('  ');
  console.log(`  ${axis.padEnd(15)} ${dist}`);
}
console.log(`\nwrote ${OUT}`);

if (rows.length && count(r => r.is_good === 1) / rows.length < 0.05) {
  console.log('\nWARNING: under 5% positive. A classifier trained here will likely collapse to');
  console.log('always-predict-BAD. Check balanced accuracy / AUC, not plain accuracy, and');
  console.log('consider rebalancing the slate sampler before spending more teacher time.');
}
