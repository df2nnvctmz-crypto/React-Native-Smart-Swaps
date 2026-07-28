/**
 * Runs the REAL matcher over the labeled receipt corpus in ground_truth.json.
 *
 * baseline-eval.ts covers curated product cases; this covers the raw OCR receipt
 * lines, which are where the receipt-specific normalization bugs show up (glued
 * pack sizes, abbreviations, tax-class letters). Same matcher entry point and the
 * same display floor as regression.test.ts, so the three suites stay comparable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseReceiptLine } from '../app/engine/receiptParser';
import { buildFoodIndex } from '../app/engine/foodIndex';
import { FoodItem } from '../app/types';
import { loadFoods } from './lib/loadFoods';

const DISPLAY_CONFIDENCE_FLOOR = 0.45; // mirrors regression.test.ts

interface GroundTruthRow {
  source: string;
  raw_line: string;
  verdict: 'CORRECT' | 'WRONG' | 'GAP';
  correct_id: string | null;
  correct_name: string | null;
}

const foods = loadFoods();
const rows = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'scripts/ground_truth.json'), 'utf-8')
) as GroundTruthRow[];

const indexData = buildFoodIndex(foods);
const byId = new Map(foods.map(f => [f.id, f]));
const label = (id: string | null) =>
  id === null ? '(no match)' : `${id} ${byId.get(id)?.name_de ?? '<UNKNOWN>'}`;

let correct = 0, wrongMatch = 0, missed = 0, abstained = 0, fabricated = 0;
const detail: string[] = [];

for (const row of rows) {
  const parsed = parseReceiptLine(row.raw_line, foods, indexData);
  const shown =
    parsed && parsed.matchedFood && parsed.confidence >= DISPLAY_CONFIDENCE_FLOOR
      ? parsed.matchedFood
      : null;
  const actualId = shown ? shown.id : null;
  const conf = parsed ? parsed.confidence : 0;

  if (row.correct_id === null) {
    // No right answer exists - staying silent is the win, any match is fabricated.
    if (actualId === null) abstained++;
    else {
      fabricated++;
      detail.push(`FABRICATED "${row.raw_line}"\n    -> ${label(actualId)} (conf ${conf.toFixed(2)})`);
    }
  } else if (actualId === row.correct_id) {
    correct++;
  } else if (actualId === null) {
    missed++;
    detail.push(`MISS       "${row.raw_line}"\n    want ${label(row.correct_id)}`);
  } else {
    wrongMatch++;
    detail.push(`WRONG      "${row.raw_line}"\n    -> ${label(actualId)} (conf ${conf.toFixed(2)})\n    want ${label(row.correct_id)}`);
  }
}

const answerable = rows.filter(r => r.correct_id !== null).length;
const unanswerable = rows.length - answerable;

console.log(detail.join('\n'));
console.log('\n================================================');
console.log('GROUND TRUTH - real matcher over raw receipt lines');
console.log('================================================');
console.log(`  answerable rows:   ${answerable}`);
console.log(`    correct:         ${correct}  (${((100 * correct) / answerable).toFixed(1)}%)`);
console.log(`    wrong match:     ${wrongMatch}`);
console.log(`    missed (silent): ${missed}`);
console.log(`  unanswerable rows: ${unanswerable}`);
console.log(`    correctly silent:${abstained}`);
console.log(`    fabricated:      ${fabricated}   <- watch hardest`);
