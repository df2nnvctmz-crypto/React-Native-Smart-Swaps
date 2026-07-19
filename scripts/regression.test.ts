/**
 * Matcher regression suite.
 *
 *   npx tsx scripts/regression.test.ts             run, print PASS/FAIL per line
 *   npx tsx scripts/regression.test.ts --verbose   also print the passing lines' matches
 *   npx tsx scripts/regression.test.ts --snapshot  rewrite expectations from current behaviour
 *
 * Run this after EVERY change to the matching pipeline. If a line regresses, fix the
 * mechanism that broke it - do not retune thresholds, and do not --snapshot the failure
 * away. --snapshot exists only for the initial capture and for deliberate, reviewed
 * expectation changes.
 *
 * Exit code is non-zero when any case fails, so it can gate a commit hook or CI.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseReceiptLine } from '../app/engine/receiptParser';
import { buildFoodIndex } from '../app/engine/foodIndex';
import { FoodItem } from '../app/types';
import { REGRESSION_CASES, RegressionCase } from './regression.cases';

/**
 * Confidence floor below which the UI shows a line as "Not Found" rather than a match.
 * Mirrors components/ReceiptItemList.tsx - keep in sync.
 */
const DISPLAY_CONFIDENCE_FLOOR = 0.45;

const foods = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'foods.json'), 'utf-8')
) as FoodItem[];

const indexData = buildFoodIndex(foods);
const byId = new Map(foods.map(f => [f.id, f]));

const label = (id: string | null) => {
  if (id === null) return '(no match)';
  const f = byId.get(id);
  return f ? `${id} ${f.name_de || f.name}` : `${id} <UNKNOWN ID>`;
};

interface Result {
  testCase: RegressionCase;
  actualId: string | null;
  confidence: number;
  pass: boolean;
}

function run(): Result[] {
  return REGRESSION_CASES.map(testCase => {
    const parsed = parseReceiptLine(testCase.line, foods, indexData);
    // A line "resolves" only if it produced a match the UI would actually display.
    const resolved =
      parsed && parsed.matchedFood && parsed.confidence >= DISPLAY_CONFIDENCE_FLOOR
        ? parsed.matchedFood
        : null;
    const actualId = resolved ? resolved.id : null;
    return {
      testCase,
      actualId,
      confidence: parsed ? parsed.confidence : 0,
      pass: actualId === testCase.expected,
    };
  });
}

const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const snapshot = args.includes('--snapshot');

const results = run();
const failures = results.filter(r => !r.pass);

for (const r of results) {
  if (r.pass) {
    if (verbose) {
      console.log(`PASS  "${r.testCase.line}"\n        -> ${label(r.actualId)} (${r.confidence.toFixed(2)})`);
    }
    continue;
  }
  console.log(`FAIL  "${r.testCase.line}"`);
  console.log(`        expected: ${label(r.testCase.expected)}`);
  console.log(`        actual:   ${label(r.actualId)} (conf ${r.confidence.toFixed(2)})`);
  if (r.testCase.note) console.log(`        note:     ${r.testCase.note}`);
}

const passed = results.length - failures.length;
console.log(`\n${passed}/${results.length} passed`);

if (snapshot) {
  // Rewrite only the `expected:` literals in the cases file, preserving all notes/comments.
  const casesPath = path.join(process.cwd(), 'scripts', 'regression.cases.ts');
  let src = fs.readFileSync(casesPath, 'utf-8');
  let rewritten = 0;
  for (const r of results) {
    if (r.pass) continue;
    // Match this case's object literal by its exact line string.
    const escaped = r.testCase.line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // The line may be written with single or double quotes in the source.
    const pattern = new RegExp(
      `(\\{\\s*line:\\s*(?:'|")${escaped.replace(/'/g, "\\'")}(?:'|"),\\s*expected:\\s*)(?:null|'[^']*')`
    );
    const replacement = r.actualId === null ? 'null' : `'${r.actualId}'`;
    if (pattern.test(src)) {
      src = src.replace(pattern, `$1${replacement}`);
      rewritten++;
    } else {
      console.log(`  ! could not snapshot "${r.testCase.line}" - update it by hand`);
    }
  }
  fs.writeFileSync(casesPath, src);
  console.log(`\n--snapshot: rewrote ${rewritten} expectation(s). REVIEW THE DIFF before committing.`);
  process.exit(0);
}

process.exit(failures.length === 0 ? 0 : 1);
