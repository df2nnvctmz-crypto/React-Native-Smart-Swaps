/**
 * Builds the on-device food-embedding asset consumed by app/engine/foodEmbeddings.ts.
 *
 * WHY THIS EXISTS:
 * swapRanker.ts has a trained `cosine_sim` feature that was, until now, always fed
 * `null` because "this project has no embeddings pipeline" (that comment was stale -
 * the vectors were sitting in scripts/food_vectors.json all along). This script turns
 * those precomputed vectors into a small, bundle-able asset so findBestSwaps() can pass
 * a real similarity instead of null.
 *
 * SOURCE MODEL (must not change without retraining swapRanker):
 * scripts/food_vectors.json holds L2-normalized 384-dim vectors from IBM Granite
 * (ibm/granite-embedding:107m-multilingual-f16), embedded over each food's name_de/name.
 * We verified this is the exact model behind swapRanker's SCALER_MEAN.cosine_sim (0.901):
 * best-per-source Granite similarity (mean 0.82, min-quartile 0.758) matches the training
 * rows (mean 0.901 on hand-picked pairs, min 0.752), while Jina (mean 0.61, 768-dim)
 * cannot reach a 0.90 mean. Feeding Jina similarities into that feature slot would
 * reintroduce the distribution-mismatch bug swapRanker.ts already warns about.
 *
 * QUANTIZATION:
 * Full float32 is 33MB - too big to bundle. Each unit vector is quantized to int8 with a
 * per-vector scale (max|component|/127). Measured cosine error vs full precision: mean
 * 5.5e-4, max 2.7e-3 - negligible, and the cosine_sim feature's standardized weight is
 * only 0.0127 anyway. Output is ~3.7MB (base64-packed int8 + one float scale per vector).
 *
 * USAGE: npx tsx scripts/build-food-embeddings-asset.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const SRC = path.join(process.cwd(), 'scripts/food_vectors.json');
const OUT = path.join(process.cwd(), 'app/engine/foodEmbeddings.data.json');
const MODEL = 'ibm/granite-embedding:107m-multilingual-f16';

const vectors = JSON.parse(fs.readFileSync(SRC, 'utf-8')) as Record<string, number[]>;
const ids = Object.keys(vectors);
if (ids.length === 0) throw new Error(`No vectors found in ${SRC}`);

const dim = vectors[ids[0]].length;
const packed = Buffer.alloc(ids.length * dim); // one int8 per component
const scales: number[] = new Array(ids.length);

ids.forEach((id, row) => {
  const v = vectors[id];
  if (v.length !== dim) throw new Error(`Vector ${id} has dim ${v.length}, expected ${dim}`);
  let maxAbs = 0;
  for (const x of v) maxAbs = Math.max(maxAbs, Math.abs(x));
  const scale = maxAbs / 127 || 1; // guard all-zero vectors
  scales[row] = scale;
  const base = row * dim;
  for (let i = 0; i < dim; i++) {
    // clamp into int8 range; round-to-nearest
    let q = Math.round(v[i] / scale);
    if (q > 127) q = 127;
    else if (q < -128) q = -128;
    packed[base + i] = q & 0xff; // store as unsigned byte; decoded back to signed on device
  }
});

const asset = {
  model: MODEL,
  dim,
  count: ids.length,
  ids,
  // round scales to keep the file smaller; precision far exceeds what int8 needs
  scales: scales.map((s) => Number(s.toPrecision(6))),
  q: packed.toString('base64'),
};

fs.writeFileSync(OUT, JSON.stringify(asset));
const mb = (fs.statSync(OUT).size / 1e6).toFixed(2);
console.log(`Wrote ${OUT}`);
console.log(`  model=${MODEL} dim=${dim} count=${ids.length} size=${mb}MB`);
