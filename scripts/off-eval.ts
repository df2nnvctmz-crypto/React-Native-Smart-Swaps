/**
 * OFF bridge evaluation harness.
 *
 *   npx tsx scripts/off-eval.ts             run against the live OFF API, print a report
 *   npx tsx scripts/off-eval.ts --verbose   also print every case, not just failures
 *
 * Unlike scripts/regression.test.ts (the offline BLS-direct matcher suite), this makes REAL
 * network calls to OpenFoodFacts through the exact production code path
 * (app/engine/resolveProduct.ts: enrichWithOff / bridgeOffToBls, app/services/offClient.ts).
 * There is nothing to mock here on purpose - the whole point is measuring how the bridge
 * behaves against the live service, not against a canned response.
 *
 * Reports:
 *   - precision: of the cases where the bridge confidently returned something, how many
 *     were correct
 *   - recall: of the cases that SHOULD resolve (expected != null), how many did
 *   - confident-wrong: cases where the bridge returned a match, but not the right one (or
 *     returned any match for a case that should have stayed unresolved) - the dangerous
 *     class, because a wrong nutrition value looks exactly as confident as a right one
 *
 * Exits non-zero if any confident-wrong match appears, so this can gate a CI step once the
 * bridge is tuned enough to expect zero. Right now it is not gated on that in CI - see the
 * baseline note at the bottom of this file's sibling PR/commit for current numbers and why.
 *
 * Per session instructions: this task only BUILDS the measurement. Do not use a failing run
 * here as a prompt to start tuning bridgeOffToBls/offClient - record the baseline and stop.
 */

import * as fs from 'fs';
import * as path from 'path';
import { enrichWithOff } from '../app/engine/resolveProduct';
import { buildFoodIndex } from '../app/engine/foodIndex';
import { lookupOffProduct } from '../app/services/offClient';
import { FoodItem } from '../app/types';
import { ParsedReceiptItem } from '../app/engine/receiptParser';
import { OFF_EVAL_CASES, OffEvalCase } from './off-eval.cases';

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

interface CaseResult {
  testCase: OffEvalCase;
  actualId: string | null;
  confidence: number;
  displayName?: string;
}

/** Runs one query through the exact production tier-3 path: a synthetic weak item, upgraded
 *  by enrichWithOff exactly as scan-receipt.tsx would after the offline matcher left it weak. */
async function runOne(query: string): Promise<{ actualId: string | null; confidence: number; displayName?: string }> {
  const weakItem: ParsedReceiptItem = {
    rawText: query,
    matchedFood: null,
    confidence: 0,
    source: 'bls',
  };
  const [result] = await enrichWithOff([weakItem], { allFoods: foods, foodIndexData }, true, {
    lookup: lookupOffProduct,
  });
  return {
    actualId: result.matchedFood ? result.matchedFood.id : null,
    confidence: result.confidence,
    displayName: result.displayName,
  };
}

async function preflight(): Promise<boolean> {
  // A known-good query the API should always have an answer for. If this comes back empty,
  // the numbers below likely reflect a service outage, not bridge quality - say so instead
  // of silently reporting a misleadingly bad (or good) baseline.
  const off = await lookupOffProduct('Coca-Cola');
  return off !== null;
}

async function main() {
  const verbose = process.argv.includes('--verbose');

  console.log(`Preflight: checking OpenFoodFacts reachability...`);
  const reachable = await preflight();
  if (!reachable) {
    console.log(
      `\n*** WARNING: preflight query ("Coca-Cola") returned no OFF result. ***\n` +
      `This usually means the OFF API is unreachable or degraded right now (observed: the\n` +
      `search-a-licious endpoint returning 502 during development of this harness), not that\n` +
      `the bridge is broken. Every case below will likely show as "(no match)". Re-run this\n` +
      `harness later and compare before trusting these numbers as the real baseline.\n`
    );
  } else {
    console.log(`Preflight OK - OFF is reachable.\n`);
  }

  const results: CaseResult[] = [];
  for (const testCase of OFF_EVAL_CASES) {
    const r = await runOne(testCase.query);
    results.push({ testCase, ...r });
    // Be a polite API citizen - this is a one-shot eval run, not the hot path.
    await new Promise(res => setTimeout(res, 250));
  }

  const positives = results.filter(r => r.testCase.expected !== null);
  const negatives = results.filter(r => r.testCase.expected === null);

  const truePositives = positives.filter(r => r.actualId === r.testCase.expected);
  const positiveMisses = positives.filter(r => r.actualId === null);
  const positiveWrong = positives.filter(r => r.actualId !== null && r.actualId !== r.testCase.expected);

  const negativeCorrectlyWithheld = negatives.filter(r => r.actualId === null);
  const negativeConfidentWrong = negatives.filter(r => r.actualId !== null);

  const confidentWrong = [...positiveWrong, ...negativeConfidentWrong];
  const confidentMatches = results.filter(r => r.actualId !== null);
  const confidentCorrect = confidentMatches.filter(r => r.actualId === r.testCase.expected);

  const precision = confidentMatches.length > 0 ? confidentCorrect.length / confidentMatches.length : 1;
  const recall = positives.length > 0 ? truePositives.length / positives.length : 1;

  for (const r of results) {
    const isConfidentWrong = confidentWrong.includes(r);
    const isPass = r.actualId === r.testCase.expected;
    if (!verbose && isPass && !isConfidentWrong) continue;

    const tag = isPass ? 'PASS' : isConfidentWrong ? 'WRONG' : 'MISS';
    console.log(`${tag.padEnd(6)} "${r.testCase.query}"`);
    console.log(`         expected: ${label(r.testCase.expected)}`);
    console.log(`         actual:   ${label(r.actualId)} (conf ${r.confidence.toFixed(2)})`);
    console.log(`         note:     ${r.testCase.note}`);
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`SUMMARY (${results.length} cases: ${positives.length} should resolve, ${negatives.length} should not)`);
  console.log('='.repeat(60));
  console.log(`Precision (of confident matches, % correct):     ${confidentMatches.length ? (precision * 100).toFixed(1) : 'n/a'}%  (${confidentCorrect.length}/${confidentMatches.length})`);
  console.log(`Recall (of should-resolve cases, % found):       ${(recall * 100).toFixed(1)}%  (${truePositives.length}/${positives.length})`);
  console.log(`  - correct:                                     ${truePositives.length}`);
  console.log(`  - missed (safe: returned null instead):        ${positiveMisses.length}`);
  console.log(`  - confident-wrong (returned the WRONG id):     ${positiveWrong.length}`);
  console.log(`Negative cases (should stay null):               ${negatives.length}`);
  console.log(`  - correctly withheld:                          ${negativeCorrectlyWithheld.length}`);
  console.log(`  - confident-wrong (resolved when it shouldn't): ${negativeConfidentWrong.length}`);
  console.log(`\nTOTAL CONFIDENT-WRONG MATCHES (the dangerous class): ${confidentWrong.length}`);
  if (confidentWrong.length > 0) {
    console.log(`  ${confidentWrong.map(r => `"${r.testCase.query}" -> ${label(r.actualId)}`).join('\n  ')}`);
  }

  if (!reachable) {
    console.log(`\n(Preflight failed - treat the numbers above as INVALID, not a real baseline. See warning above.)`);
  }

  process.exit(confidentWrong.length === 0 ? 0 : 1);
}

main();
