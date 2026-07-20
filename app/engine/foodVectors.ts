/**
 * Lightweight, fully on-device "vector similarity" for foods - a hashed bag-of-words
 * (the classic "hashing trick") over each food's name + category tokens, projected
 * into a fixed-size numeric vector. Cosine similarity between two such vectors is a
 * real, computable measure of lexical/textual closeness.
 *
 * HONEST SCOPE: this is NOT a semantic embedding model (no Granite/BERT/sentence-
 * transformer, no ONNX runtime, no network call, no API key) - it only "knows" two
 * foods are similar if they share overlapping words, not deeper meaning. It's a real,
 * useful, zero-dependency signal for recipe-ingredient matching (where sharing words
 * like "flour"/"butter"/"milk" is itself a strong plausibility signal). Keep this
 * separate from the trained ranker's cosine_sim in swapRanker.ts, which is calibrated
 * to real embeddings and deliberately left null/neutral until this project ships
 * one - feeding this hashed value into that model's cosine_sim slot would reintroduce
 * the exact distribution-mismatch bug already fixed there.
 */

import { FoodItem } from '../types';

const VECTOR_DIM = 64;
const STOP_WORDS = new Set(['and', 'the', 'with', 'organic', 'raw', 'fried', 'without', 'fat', 'pan', 'for', 'min']);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w) && isNaN(Number(w)));
}

function hashToken(token: string): number {
  let h = 0;
  for (let i = 0; i < token.length; i++) {
    h = (h * 31 + token.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % VECTOR_DIM;
}

function textFor(food: FoodItem): string {
  // Deliberately name-only, not name + swiss_category. Calibration against real data
  // showed including swiss_category text badly inflates similarity between foods that
  // just happen to share a broad category umbrella but aren't interchangeable at all -
  // e.g. "Whipping cream" and "Mozzarella" share the exact swiss_category string
  // "Milk and dairy products/Milk, cream and cheese" and scored 0.78 similar on
  // category tokens alone, despite having nothing in common by name. This is the same
  // false-positive pattern already found and fixed for isLiquid() in swapAlgorithm.ts.
  return food.name;
}

// Foods are static for the lifetime of the app session, so caching by id is safe and
// avoids re-tokenizing/re-hashing the same food repeatedly across many swap lookups.
const vectorCache = new Map<string, Float64Array>();

function toVector(food: FoodItem): Float64Array {
  const cached = vectorCache.get(food.id);
  if (cached) return cached;

  const vec = new Float64Array(VECTOR_DIM);
  for (const token of tokenize(textFor(food))) {
    vec[hashToken(token)] += 1;
  }
  vectorCache.set(food.id, vec);
  return vec;
}

/**
 * Cosine similarity in [0, 1] between two foods' hashed word vectors. 0 means no
 * shared vocabulary (or only a hash-collision "match" at this small dimension);
 * close to 1 means their names/categories are built from very similar words.
 */
export function computeVectorSimilarity(a: FoodItem, b: FoodItem): number {
  const va = toVector(a);
  const vb = toVector(b);
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < VECTOR_DIM; i++) {
    dot += va[i] * vb[i];
    magA += va[i] * va[i];
    magB += vb[i] * vb[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
