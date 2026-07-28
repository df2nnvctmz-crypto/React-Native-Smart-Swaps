/**
 * Freezes the top-N swap suggestions for a fixed sample of source foods, so any
 * change to retrieval or ranking can be diffed instead of eyeballed.
 *
 * The matcher has scripts/baseline-eval.ts and scripts/ground-truth-eval.ts; the
 * swap ranker had no equivalent, which is exactly how evaluateSwap()'s constants
 * ended up tuned blind. Every later step of the ranker plan (GBM student, gated
 * multi-axis scoring, personalization) changes this output, so it needs a frozen
 * reference to move against.
 *
 * This is a CHANGE DETECTOR, not a correctness oracle - it says what moved, not
 * whether the new ranking is better. Pair it with the labeled pairs corpus for
 * the quality question.
 *
 * Usage:
 *   npx tsx scripts/snapshot-swaps.ts before.json     # capture
 *   npx tsx scripts/snapshot-swaps.ts after.json      # capture again after a change
 *   npx tsx scripts/snapshot-swaps.ts --diff before.json after.json
 *
 * The sample is deterministic (seeded, receipt-weighted like build-pair-slates.ts),
 * so two captures are always comparable.
 */

import * as fs from 'fs';
import * as path from 'path';
import { FoodItem } from '../app/types';
import { findBestSwaps } from '../app/engine/swapAlgorithm';
import { loadFoods } from './lib/loadFoods';

const TOP_N = 3;          // what the UI actually shows
const SAMPLE_SIZE = 400;
const SEED = 42;

const ROOT = path.join(__dirname, '..');
const ML_DATASET_PATH = path.join(ROOT, 'scripts/ml_dataset.jsonl');

interface Snapshot {
  generated_at: string;
  top_n: number;
  entries: Record<string, { name: string; pool_size: number; top: string[] }>;
}

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function capture(outPath: string) {
  const foods: FoodItem[] = loadFoods();
  const byId = new Map(foods.map(f => [f.id, f]));
  const eligible = foods.filter(f => f.health_score < 80);
  const eligibleIds = new Set(eligible.map(f => f.id));

  // Receipt-observed foods first (what users actually buy), then a seeded random
  // fill - same weighting as the pair corpus, so the two agree on what matters.
  const receiptIds: string[] = [];
  if (fs.existsSync(ML_DATASET_PATH)) {
    const seen = new Set<string>();
    for (const line of fs.readFileSync(ML_DATASET_PATH, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      const id = JSON.parse(line).food_id;
      if (id && eligibleIds.has(id) && !seen.has(id)) { seen.add(id); receiptIds.push(id); }
    }
  }
  const rng = mulberry32(SEED);
  const rest = shuffle(eligible.filter(f => !receiptIds.includes(f.id)), rng);
  const sample = [
    ...receiptIds.map(id => byId.get(id)!),
    ...rest,
  ].slice(0, SAMPLE_SIZE);

  const entries: Snapshot['entries'] = {};
  for (const src of sample) {
    const pool = findBestSwaps(src, foods, Number.MAX_SAFE_INTEGER, ['Balanced']);
    entries[src.id] = {
      name: src.name,
      pool_size: pool.length,
      top: pool.slice(0, TOP_N).map(r => r.candidate.name),
    };
  }

  const snap: Snapshot = { generated_at: new Date().toISOString(), top_n: TOP_N, entries };
  fs.writeFileSync(outPath, JSON.stringify(snap, null, 1));

  const sizes = Object.values(entries).map(e => e.pool_size).sort((a, b) => a - b);
  const q = (p: number) => sizes[Math.floor(sizes.length * p)];
  console.log(`captured ${sample.length} source foods -> ${outPath}`);
  console.log(`  pool size: median ${q(0.5)}  p90 ${q(0.9)}  max ${sizes[sizes.length - 1]}`);
  console.log(`  empty pools: ${sizes.filter(s => s === 0).length}`);
}

function diff(beforePath: string, afterPath: string) {
  const a: Snapshot = JSON.parse(fs.readFileSync(beforePath, 'utf-8'));
  const b: Snapshot = JSON.parse(fs.readFileSync(afterPath, 'utf-8'));

  const ids = Object.keys(a.entries).filter(id => b.entries[id]);
  let changed = 0, poolShrunk = 0, poolGrew = 0, totalBefore = 0, totalAfter = 0;
  const examples: string[] = [];

  for (const id of ids) {
    const x = a.entries[id], y = b.entries[id];
    totalBefore += x.pool_size;
    totalAfter += y.pool_size;
    if (y.pool_size < x.pool_size) poolShrunk++;
    if (y.pool_size > x.pool_size) poolGrew++;
    if (JSON.stringify(x.top) !== JSON.stringify(y.top)) {
      changed++;
      if (examples.length < 12) {
        examples.push(
          `  ${x.name}  (pool ${x.pool_size} -> ${y.pool_size})\n` +
          `     before: ${x.top.join(' | ') || '(none)'}\n` +
          `     after:  ${y.top.join(' | ') || '(none)'}`
        );
      }
    }
  }

  const pct = (n: number) => `${((n / ids.length) * 100).toFixed(1)}%`;
  console.log(`\ncompared ${ids.length} source foods`);
  console.log(`  top-${a.top_n} changed:  ${changed} (${pct(changed)})`);
  console.log(`  pool shrunk:     ${poolShrunk} (${pct(poolShrunk)})`);
  console.log(`  pool grew:       ${poolGrew} (${pct(poolGrew)})`);
  console.log(`  total candidates: ${totalBefore} -> ${totalAfter} (${totalAfter - totalBefore >= 0 ? '+' : ''}${totalAfter - totalBefore})`);
  console.log(`\nsample of changed rankings:\n${examples.join('\n')}`);
}

const args = process.argv.slice(2);
if (args[0] === '--diff') {
  if (args.length < 3) { console.error('usage: --diff <before.json> <after.json>'); process.exit(1); }
  diff(args[1], args[2]);
} else {
  if (!args[0]) { console.error('usage: snapshot-swaps.ts <out.json> | --diff <before> <after>'); process.exit(1); }
  capture(args[0]);
}
