/**
 * Matches every OCR line in ocr_output.json against foods.json using the real
 * matcher, and emits a labeled corpus for Create ML training.
 *
 * Same entry points as ground-truth-eval.ts (isLikelyProductLine + parseReceiptLine)
 * so the labels here stay consistent with what the app actually does.
 *
 * Output: scripts/ml_dataset.jsonl (one row per OCR line) + a stdout summary.
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseReceiptLine, isLikelyProductLine } from '../app/engine/receiptParser';
import { buildFoodIndex } from '../app/engine/foodIndex';
import { FoodItem } from '../app/types';
import { loadFoods } from './lib/loadFoods';

const OCR_PATH = process.argv[2]
  ?? path.join(process.cwd(), '..', 'ocr_output.json');
const OUT_PATH = path.join(process.cwd(), 'scripts/ml_dataset.jsonl');

// Mirrors regression.test.ts / ground-truth-eval.ts.
const DISPLAY_CONFIDENCE_FLOOR = 0.45;
// Above this we trust the label enough to train on it unreviewed.
const AUTO_ACCEPT_FLOOR = 0.8;

interface OcrReceipt {
  post_id: string;
  file: string;
  lines: string[];
}

const foods = loadFoods();
const receipts = JSON.parse(fs.readFileSync(OCR_PATH, 'utf-8')) as OcrReceipt[];
const indexData = buildFoodIndex(foods);

const STORES = ['rewe', 'aldi', 'lidl', 'edeka', 'kaufland', 'netto', 'penny', 'action', 'müller', 'dm'];
const storeOf = (file: string) => {
  const low = file.toLowerCase();
  return STORES.find(s => low.includes(s)) ?? 'unknown';
};

type Bucket = 'auto' | 'review' | 'unmatched' | 'non_product';

const rows: any[] = [];
const counts: Record<Bucket, number> = { auto: 0, review: 0, unmatched: 0, non_product: 0 };

for (const receipt of receipts) {
  for (const [i, line] of receipt.lines.entries()) {
    const isProduct = isLikelyProductLine(line);
    const parsed = isProduct ? parseReceiptLine(line, foods, indexData) : null;
    const conf = parsed?.confidence ?? 0;
    const food =
      parsed?.matchedFood && conf >= DISPLAY_CONFIDENCE_FLOOR ? parsed.matchedFood : null;

    const bucket: Bucket = !isProduct
      ? 'non_product'
      : food === null
        ? 'unmatched'
        : conf >= AUTO_ACCEPT_FLOOR
          ? 'auto'
          : 'review';
    counts[bucket]++;

    rows.push({
      post_id: receipt.post_id,
      store: storeOf(receipt.file),
      line_index: i,
      raw_line: line,
      is_product_line: isProduct,
      bucket,
      confidence: Number(conf.toFixed(3)),
      food_id: food?.id ?? null,
      food_name: food?.name ?? null,
      food_name_de: food?.name_de ?? null,
      category: food?.category ?? null,
      swiss_category: food?.swiss_category ?? null,
      nutri_grade: food?.nutri_grade ?? null,
    });
  }
}

fs.writeFileSync(OUT_PATH, rows.map(r => JSON.stringify(r)).join('\n') + '\n');

const total = rows.length;
const pct = (n: number) => `${((n / total) * 100).toFixed(1)}%`;
console.log(`receipts: ${receipts.length}   lines: ${total}`);
console.log(`  non_product (filtered noise): ${counts.non_product} (${pct(counts.non_product)})`);
console.log(`  auto  (conf >= ${AUTO_ACCEPT_FLOOR}):        ${counts.auto} (${pct(counts.auto)})`);
console.log(`  review (${DISPLAY_CONFIDENCE_FLOOR}-${AUTO_ACCEPT_FLOOR}):             ${counts.review} (${pct(counts.review)})`);
console.log(`  unmatched product lines:      ${counts.unmatched} (${pct(counts.unmatched)})`);

const productLines = counts.auto + counts.review + counts.unmatched;
console.log(`\nof ${productLines} product lines, ${counts.auto + counts.review} got a food (${(((counts.auto + counts.review) / productLines) * 100).toFixed(1)}%)`);
console.log(`wrote ${OUT_PATH}`);
