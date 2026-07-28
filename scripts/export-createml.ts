/**
 * Turns scripts/ml_dataset.jsonl into a Create ML text-classification corpus.
 *
 * Labels: FoodItem.category, taken only from rows the matcher scored >= 0.80
 * (the `auto` bucket). Deduped case-insensitively on the raw line so the same
 * receipt string repeated across 20 receipts does not dominate a class or leak
 * across the train/test split.
 *
 * Beverages is excluded: only 11 examples survived dedupe, and three of them are
 * the matcher finding "wein" inside OCR-mangled "Zwiebein" (onions -> white wine).
 * Too few examples to learn from, too poisoned to include.
 *
 * Output: scripts/createml/{train,test}.json in Create ML's [{text,label}] shape.
 */

import * as fs from 'fs';
import * as path from 'path';

const IN_PATH = path.join(process.cwd(), 'scripts/ml_dataset.jsonl');
const OUT_DIR = path.join(process.cwd(), 'scripts/createml');
const TEST_FRACTION = 0.2;
const EXCLUDED_LABELS = new Set(['Beverages']);

interface Row {
  raw_line: string;
  bucket: string;
  confidence: number;
  category: string | null;
  food_id: string | null;
}

const rows = fs
  .readFileSync(IN_PATH, 'utf-8')
  .split('\n')
  .filter(Boolean)
  .map(l => JSON.parse(l) as Row)
  .filter(r => r.bucket === 'auto' && r.category && !EXCLUDED_LABELS.has(r.category));

// Dedupe on the normalized line. Keep the highest-confidence row for each, and
// drop lines that the matcher assigned to two different categories - an
// ambiguous string is a label we cannot trust either way.
const byLine = new Map<string, { text: string; label: string; conf: number; conflict: boolean }>();
for (const r of rows) {
  const key = r.raw_line.trim().toLowerCase();
  const existing = byLine.get(key);
  if (!existing) {
    byLine.set(key, { text: r.raw_line.trim(), label: r.category!, conf: r.confidence, conflict: false });
  } else {
    if (existing.label !== r.category) existing.conflict = true;
    if (r.confidence > existing.conf) {
      existing.conf = r.confidence;
      existing.label = r.category!;
    }
  }
}

const conflicts = [...byLine.values()].filter(e => e.conflict);
const examples = [...byLine.values()]
  .filter(e => !e.conflict)
  .map(e => ({ text: e.text, label: e.label }));

// Stratified split so every class keeps its share of the test set. Sort first so
// the split is deterministic across runs.
const byLabel = new Map<string, { text: string; label: string }[]>();
for (const e of examples) {
  if (!byLabel.has(e.label)) byLabel.set(e.label, []);
  byLabel.get(e.label)!.push(e);
}

const train: typeof examples = [];
const test: typeof examples = [];
for (const [label, items] of [...byLabel.entries()].sort()) {
  items.sort((a, b) => a.text.localeCompare(b.text));
  items.forEach((item, i) => (i % Math.round(1 / TEST_FRACTION) === 0 ? test : train).push(item));
  console.log(`${label.padEnd(16)} ${String(items.length).padStart(4)} examples`);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'train.json'), JSON.stringify(train, null, 2));
fs.writeFileSync(path.join(OUT_DIR, 'test.json'), JSON.stringify(test, null, 2));

console.log(`\ndropped ${conflicts.length} ambiguous lines (same text, two categories)`);
if (conflicts.length) {
  console.log(conflicts.slice(0, 10).map(c => `  "${c.text}"`).join('\n'));
}
console.log(`\ntrain: ${train.length}   test: ${test.length}`);
console.log(`wrote ${OUT_DIR}/{train,test}.json`);
