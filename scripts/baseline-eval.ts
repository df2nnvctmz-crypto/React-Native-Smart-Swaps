/**
 * PHASE 0: the baseline measurement. Runs the CURRENT matcher over the labeled set in
 * scripts/baseline.cases.ts and reports accuracy per bucket.
 *
 *   npx tsx scripts/baseline-eval.ts                       offline path only (tiers 1-2)
 *   npx tsx scripts/baseline-eval.ts --with-off            also run tier 3 (live OFF network calls)
 *   npx tsx scripts/baseline-eval.ts --verbose             print every case, not just failures
 *   npx tsx scripts/baseline-eval.ts --save baseline.json  write the run to disk
 *   npx tsx scripts/baseline-eval.ts --compare baseline.json   diff this run against a saved one
 *
 * The default (no --with-off) is the number that matters most: it is the fully-offline path
 * a device runs today, and it is what the on-device embedding tier would be added to. Run
 * --with-off separately to see what the network tier currently buys, but treat those numbers
 * as noisy - they depend on OFF being up (see scripts/off-eval.ts).
 *
 * This script only MEASURES. Do not tune thresholds or the matcher in response to a bad
 * number here - a baseline you tuned against is not a baseline. Record it, commit it, move on
 * to Phase 1. Exit code is always 0 on a completed run for the same reason: this is not a
 * pass/fail gate (scripts/regression.test.ts is). It exits non-zero only if the harness
 * itself could not run.
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveProductLine, enrichWithOff } from '../app/engine/resolveProduct';
import { buildFoodIndex } from '../app/engine/foodIndex';
import { lookupOffProduct } from '../app/services/offClient';
import { FoodItem } from '../app/types';
import { ParsedReceiptItem } from '../app/engine/receiptParser';
import { BASELINE_CASES, BaselineCase, Bucket, validateBuckets } from './baseline.cases';

/**
 * Confidence floor below which the UI shows "Not Found" instead of a match. Mirrors
 * components/ReceiptItemList.tsx and app/scan-receipt.tsx - keep in sync. Grading against the
 * floor rather than the raw match is deliberate: a 0.3-confidence match the user never sees
 * is not a hit, and counting it as one would flatter every pipeline equally.
 */
const DISPLAY_CONFIDENCE_FLOOR = 0.45;

const BUCKETS: Bucket[] = ['bls-direct', 'semantic', 'unresolvable'];

const foods = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'foods.json'), 'utf-8')
) as FoodItem[];
const foodIndexData = buildFoodIndex(foods);
const byId = new Map(foods.map(f => [f.id, f]));

const label = (id: string | null) => {
  if (id === null) return '(no match)';
  const f = byId.get(id);
  return f ? `${id} ${f.name_de || f.name}` : `${id} <UNKNOWN ID>`;
};

/** correct: matched what the label says (including correctly returning nothing).
 *  miss:    should have resolved, returned nothing - safe, just unhelpful.
 *  wrong:   returned a confident match that is not the labeled one, or resolved something
 *           that should have stayed unresolved. The dangerous class. */
type Outcome = 'correct' | 'miss' | 'wrong';

interface CaseResult {
  testCase: BaselineCase;
  actualId: string | null;
  confidence: number;
  source: string | null;
  outcome: Outcome;
}

function grade(testCase: BaselineCase, actualId: string | null): Outcome {
  if (actualId === testCase.expected) return 'correct';
  if (actualId === null) return 'miss';
  return 'wrong';
}

/** Tiers 1-2, exactly as scan-receipt.tsx runs them per line. A null return (receipt noise
 *  the matcher rejects outright) and a below-floor match are both "no match" here, because
 *  both look identical to the user. */
function runOffline(line: string): { item: ParsedReceiptItem | null; actualId: string | null } {
  const parsed = resolveProductLine(line, { allFoods: foods, foodIndexData });
  const resolved =
    parsed && parsed.matchedFood && parsed.confidence >= DISPLAY_CONFIDENCE_FLOOR
      ? parsed.matchedFood
      : null;
  return { item: parsed, actualId: resolved ? resolved.id : null };
}

async function runCase(testCase: BaselineCase, withOff: boolean): Promise<CaseResult> {
  const { item, actualId } = runOffline(testCase.line);

  if (!withOff || !item) {
    return {
      testCase,
      actualId,
      confidence: item?.confidence ?? 0,
      source: item?.source ?? null,
      outcome: grade(testCase, actualId),
    };
  }

  // Tier 3, second pass - same call shape scan-receipt.tsx makes. enrichWithOff decides for
  // itself whether the line is weak enough to be worth a lookup, so strong lines cost nothing.
  const [enriched] = await enrichWithOff([item], { allFoods: foods, foodIndexData }, true, {
    lookup: lookupOffProduct,
  });
  const finalId =
    enriched.matchedFood && enriched.confidence >= DISPLAY_CONFIDENCE_FLOOR
      ? enriched.matchedFood.id
      : null;

  return {
    testCase,
    actualId: finalId,
    confidence: enriched.confidence,
    source: enriched.source ?? null,
    outcome: grade(testCase, finalId),
  };
}

interface BucketStats {
  bucket: Bucket;
  total: number;
  correct: number;
  miss: number;
  wrong: number;
  accuracy: number;
}

function statsFor(results: CaseResult[], bucket: Bucket): BucketStats {
  const inBucket = results.filter(r => r.testCase.bucket === bucket);
  const correct = inBucket.filter(r => r.outcome === 'correct').length;
  const miss = inBucket.filter(r => r.outcome === 'miss').length;
  const wrong = inBucket.filter(r => r.outcome === 'wrong').length;
  return {
    bucket,
    total: inBucket.length,
    correct,
    miss,
    wrong,
    accuracy: inBucket.length ? correct / inBucket.length : 0,
  };
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/** The on-disk snapshot format. Deliberately small and id-only: it is a comparison
 *  substrate for Phase 7, not a report. */
interface Snapshot {
  runAt: string;
  mode: 'offline' | 'with-off';
  totals: BucketStats[];
  cases: { line: string; bucket: Bucket; expected: string | null; actual: string | null; outcome: Outcome }[];
}

function toSnapshot(results: CaseResult[], mode: Snapshot['mode']): Snapshot {
  return {
    runAt: new Date().toISOString(),
    mode,
    totals: BUCKETS.map(b => statsFor(results, b)),
    cases: results.map(r => ({
      line: r.testCase.line,
      bucket: r.testCase.bucket,
      expected: r.testCase.expected,
      actual: r.actualId,
      outcome: r.outcome,
    })),
  };
}

/** Phase 7's actual question: line-by-line, what got better and what got worse. A headline
 *  accuracy that moved up while ten previously-correct lines broke is not an improvement. */
function printComparison(previous: Snapshot, current: Snapshot) {
  const prevByLine = new Map(previous.cases.map(c => [c.line, c]));
  const improved: string[] = [];
  const regressed: string[] = [];

  for (const c of current.cases) {
    const p = prevByLine.get(c.line);
    if (!p) continue;
    if (p.outcome !== 'correct' && c.outcome === 'correct') {
      improved.push(`  [${c.bucket}] "${c.line}"  ${p.outcome} -> correct (${label(c.actual)})`);
    } else if (p.outcome === 'correct' && c.outcome !== 'correct') {
      regressed.push(`  [${c.bucket}] "${c.line}"  correct -> ${c.outcome} (${label(c.actual)})`);
    }
  }

  const onlyInOne = current.cases.length !== previous.cases.length;
  console.log(`\n${'='.repeat(64)}`);
  console.log(`COMPARISON vs ${previous.runAt} (${previous.mode})`);
  console.log('='.repeat(64));
  if (onlyInOne) {
    console.log(
      `WARNING: case counts differ (${previous.cases.length} -> ${current.cases.length}).\n` +
      `The eval set changed since that snapshot, so the bucket deltas below are not a\n` +
      `like-for-like comparison. Only the per-line improved/regressed lists are trustworthy.\n`
    );
  }
  for (const bucket of BUCKETS) {
    const p = previous.totals.find(t => t.bucket === bucket);
    const c = current.totals.find(t => t.bucket === bucket)!;
    if (!p) continue;
    const delta = c.accuracy - p.accuracy;
    const arrow = delta > 0.0001 ? '+' : delta < -0.0001 ? '-' : '=';
    console.log(
      `${bucket.padEnd(14)} ${pct(p.accuracy)} -> ${pct(c.accuracy)}  ${arrow}${pct(Math.abs(delta))}` +
      `   wrong: ${p.wrong} -> ${c.wrong}`
    );
  }
  console.log(`\nImproved (${improved.length}):`);
  console.log(improved.length ? improved.join('\n') : '  (none)');
  console.log(`\nRegressed (${regressed.length}):`);
  console.log(regressed.length ? regressed.join('\n') : '  (none)');
}

async function main() {
  const argv = process.argv.slice(2);
  const verbose = argv.includes('--verbose');
  const withOff = argv.includes('--with-off');
  const savePath = argv[argv.indexOf('--save') + 1] && argv.includes('--save') ? argv[argv.indexOf('--save') + 1] : null;
  const comparePath = argv.includes('--compare') ? argv[argv.indexOf('--compare') + 1] : null;

  const badBuckets = validateBuckets();
  if (badBuckets.length) {
    console.error(`Bucket labels reference queries that no longer exist in off-eval.cases.ts:\n  ${badBuckets.join('\n  ')}`);
    process.exit(2);
  }

  // A label pointing at a deleted food id would silently count as a permanent miss and
  // quietly depress the baseline forever. Catch it now, while the numbers still mean something.
  const unknownIds = BASELINE_CASES.filter(c => c.expected !== null && !byId.has(c.expected)).map(
    c => `${c.expected}  (case: "${c.line}")`
  );
  if (unknownIds.length) {
    console.error(`Labeled ids that are not in foods.json:\n  ${unknownIds.join('\n  ')}`);
    process.exit(2);
  }

  const dupes = BASELINE_CASES.map(c => c.line).filter((l, i, a) => a.indexOf(l) !== i);
  if (dupes.length) {
    console.log(`Note: ${dupes.length} duplicate line(s) across sources, counted once per occurrence: ${[...new Set(dupes)].join(', ')}\n`);
  }

  console.log(
    `Running ${BASELINE_CASES.length} cases through the ${withOff ? 'FULL pipeline (tiers 1-3, live OFF calls)' : 'OFFLINE pipeline (tiers 1-2)'}...\n`
  );

  const results: CaseResult[] = [];
  for (const testCase of BASELINE_CASES) {
    results.push(await runCase(testCase, withOff));
    // Only tier 3 touches the network; no reason to throttle the offline run.
    if (withOff) await new Promise(res => setTimeout(res, 250));
  }

  for (const bucket of BUCKETS) {
    const inBucket = results.filter(r => r.testCase.bucket === bucket);
    const shown = verbose ? inBucket : inBucket.filter(r => r.outcome !== 'correct');
    if (!shown.length) continue;
    console.log(`--- ${bucket} ---`);
    for (const r of shown) {
      console.log(`${r.outcome.toUpperCase().padEnd(8)} "${r.testCase.line}"  [${r.testCase.origin}]`);
      console.log(`         expected: ${label(r.testCase.expected)}`);
      console.log(`         actual:   ${label(r.actualId)} (conf ${r.confidence.toFixed(2)}${r.source ? `, ${r.source}` : ''})`);
      if (r.testCase.note) console.log(`         note:     ${r.testCase.note}`);
    }
    console.log('');
  }

  const totals = BUCKETS.map(b => statsFor(results, b));
  const allWrong = results.filter(r => r.outcome === 'wrong');

  console.log('='.repeat(64));
  console.log(`BASELINE - ${withOff ? 'tiers 1-3 (with OFF)' : 'tiers 1-2 (offline only)'}`);
  console.log('='.repeat(64));
  console.log(`bucket         total  correct  miss  wrong   accuracy`);
  for (const t of totals) {
    console.log(
      `${t.bucket.padEnd(14)} ${String(t.total).padStart(5)}  ${String(t.correct).padStart(7)}  ${String(t.miss).padStart(4)}  ${String(t.wrong).padStart(5)}   ${pct(t.accuracy)}`
    );
  }
  const overallCorrect = results.filter(r => r.outcome === 'correct').length;
  console.log(`${'OVERALL'.padEnd(14)} ${String(results.length).padStart(5)}  ${String(overallCorrect).padStart(7)}  ${String(results.filter(r => r.outcome === 'miss').length).padStart(4)}  ${String(allWrong.length).padStart(5)}   ${pct(overallCorrect / results.length)}`);

  console.log(
    `\nRead this as three separate questions, not one score:\n` +
    `  bls-direct   must not go DOWN when a new tier is added (regression guard)\n` +
    `  semantic     the number a new tier has to move UP to be worth shipping\n` +
    `  unresolvable "wrong" here is the count of fabricated nutrition rows - watch it hardest\n`
  );

  const snapshot = toSnapshot(results, withOff ? 'with-off' : 'offline');

  if (comparePath) {
    const previous = JSON.parse(fs.readFileSync(comparePath, 'utf-8')) as Snapshot;
    if (previous.mode !== snapshot.mode) {
      console.log(`\nWARNING: comparing a '${snapshot.mode}' run against a '${previous.mode}' snapshot - different pipelines, so the deltas mix two changes.`);
    }
    printComparison(previous, snapshot);
  }

  if (savePath) {
    fs.writeFileSync(savePath, JSON.stringify(snapshot, null, 2));
    console.log(`\nSnapshot written to ${savePath} - commit it; Phase 7 diffs against this file.`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
