/**
 * On-device semantic-embedding lookup for swap ranking.
 *
 * Provides the real `cosine_sim` signal that swapRanker.ts was trained on but never
 * received - findBestSwaps() previously passed null because "this project has no
 * embeddings pipeline." It does: scripts/food_vectors.json (IBM Granite, 384-dim,
 * L2-normalized), quantized to int8 and bundled by scripts/build-food-embeddings-asset.ts
 * as foodEmbeddings.data.json.
 *
 * MODEL LOCK: the vectors here are Granite. swapRanker's cosine_sim scaler
 * (mean 0.901, scale 0.048) is calibrated to Granite similarities specifically - do NOT
 * swap in the Jina vectors (scripts/food_vectors_jina.json) without retraining the
 * ranker, or the standardization will be wrong (see build-food-embeddings-asset.ts).
 *
 * COST: the base64 asset is decoded to an Int8Array exactly once, lazily, on first
 * similarity request. After that, each cosine is a 384-length int8 dot product (a few
 * microseconds) - findBestSwaps only ever asks for the handful of candidates that
 * already survived filtering, so this is cheap.
 */

import assetData from './foodEmbeddings.data.json';

interface EmbeddingAsset {
  model: string;
  dim: number;
  count: number;
  ids: string[];
  scales: number[];
  q: string; // base64 of count*dim signed int8 components, row-major
}

const asset = assetData as EmbeddingAsset;

// --- dependency-free base64 decode (Hermes/RN has no guaranteed atob or Buffer) ---
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Int16Array = (() => {
  const t = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64.length; i++) t[B64.charCodeAt(i)] = i;
  return t;
})();

function base64ToInt8Array(b64: string): Int8Array {
  let len = b64.length;
  let padding = 0;
  if (len > 0 && b64[len - 1] === '=') padding++;
  if (len > 1 && b64[len - 2] === '=') padding++;
  const byteLength = (len / 4) * 3 - padding;
  const bytes = new Int8Array(byteLength);
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const e0 = B64_LOOKUP[b64.charCodeAt(i)];
    const e1 = B64_LOOKUP[b64.charCodeAt(i + 1)];
    const e2 = B64_LOOKUP[b64.charCodeAt(i + 2)];
    const e3 = B64_LOOKUP[b64.charCodeAt(i + 3)];
    const chunk = (e0 << 18) | (e1 << 12) | ((e2 & 63) << 6) | (e3 & 63);
    if (p < byteLength) bytes[p++] = (chunk >> 16) & 0xff; // Int8Array wraps to signed
    if (p < byteLength) bytes[p++] = (chunk >> 8) & 0xff;
    if (p < byteLength) bytes[p++] = chunk & 0xff;
  }
  return bytes;
}

// Lazily materialized on first use.
let quant: Int8Array | null = null;
let idIndex: Map<string, number> | null = null;

function ensureLoaded(): void {
  if (quant !== null) return;
  quant = base64ToInt8Array(asset.q);
  idIndex = new Map();
  for (let i = 0; i < asset.ids.length; i++) idIndex.set(asset.ids[i], i);
}

/**
 * Cosine similarity in [-1, 1] between two foods' Granite embeddings, or null if either
 * food has no embedding (unknown id). Null is intentional: swapRanker.predictSwapQuality
 * skips the cosine_sim term entirely when it's null rather than guessing a value, so an
 * unembedded food degrades gracefully to the pre-embedding behavior instead of getting a
 * garbage similarity.
 *
 * Both vectors are unit-length pre-quantization, so the int8 dot product times the two
 * per-vector scales is the cosine directly (no separate normalization needed).
 */
export function embeddingCosine(idA: string, idB: string): number | null {
  ensureLoaded();
  const ia = idIndex!.get(idA);
  const ib = idIndex!.get(idB);
  if (ia === undefined || ib === undefined) return null;
  const dim = asset.dim;
  const baseA = ia * dim;
  const baseB = ib * dim;
  const q = quant!;
  let dot = 0;
  for (let i = 0; i < dim; i++) dot += q[baseA + i] * q[baseB + i];
  return dot * asset.scales[ia] * asset.scales[ib];
}

/** True if we have an embedding for this food id. */
export function hasEmbedding(id: string): boolean {
  ensureLoaded();
  return idIndex!.has(id);
}

export const EMBEDDING_MODEL = asset.model;
