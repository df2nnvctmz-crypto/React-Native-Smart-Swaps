#!/usr/bin/env node
/**
 * Precomputes embedding vectors for every food in foods.json, using a locally
 * running Ollama instance as the embedding backend.
 *
 * WHY THIS SHAPE:
 * - Runs ONCE, offline, on your dev machine. Output ships inside the app bundle
 *   as a static file - the phone never needs to run this script or reach Ollama.
 * - Embeds `name_de` when present (your receipts are German OCR text, so the
 *   food vectors should live in the same language space as what you're matching
 *   against), falling back to `name` (English) otherwise.
 * - Batches + checkpoints to disk every BATCH_SIZE items, so a 7,140-item run
 *   surviving a crash/interrupt just resumes instead of starting over.
 *
 * USAGE:
 *   1. Make sure `ollama serve` is running locally and you've already pulled
 *      your chosen model, e.g.:
 *        ollama pull ibm/granite-embedding:107m-multilingual-f16
 *   2. Set MODEL_NAME below to match EXACTLY the tag you pulled.
 *   3. node precompute-food-embeddings.js /path/to/foods.json
 *
 * OUTPUT:
 *   food_vectors.json - { "<food id>": [ ...384 floats... ], ... }
 *   Keep this MODEL_NAME recorded somewhere (e.g. in the filename or a sidecar
 *   file) - if you ever change models, these vectors are meaningless against
 *   query vectors produced by a different model and must be regenerated.
 */

const fs = require('fs');
const path = require('path');

// --- CONFIG - edit these two lines for your setup ---
const OLLAMA_URL = 'http://localhost:11434/api/embed';
const MODEL_NAME = 'jina/jina-embeddings-v2-base-de'; // <-- match your `ollama pull` tag exactly
// ------------------------------------------------------

const BATCH_SIZE = 32;          // how many foods per Ollama call
const CHECKPOINT_EVERY = 200;   // how often to write partial progress to disk
const OUTPUT_PATH = path.join(process.cwd(), 'food_vectors_jina.json');

async function embedBatch(texts) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL_NAME, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama request failed (${res.status}): ${body}`);
  }
  const data = await res.json();
  // Ollama's /api/embed returns { embeddings: [[...], [...], ...] } for array input
  if (!data.embeddings) {
    throw new Error(`Unexpected Ollama response shape: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data.embeddings;
}

async function main() {
  const foodsPath = process.argv[2];
  if (!foodsPath) {
    console.error('Usage: node precompute-food-embeddings.js /path/to/foods.json');
    process.exit(1);
  }

  const foods = JSON.parse(fs.readFileSync(foodsPath, 'utf-8'));
  console.log(`Loaded ${foods.length} foods from ${foodsPath}`);
  console.log(`Using Ollama model: ${MODEL_NAME}`);

  // Resume support: load any existing partial output
  let vectors = {};
  if (fs.existsSync(OUTPUT_PATH)) {
    vectors = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf-8'));
    console.log(`Resuming - found ${Object.keys(vectors).length} vectors already computed.`);
  }

  const remaining = foods.filter(f => !vectors[f.id]);
  console.log(`${remaining.length} foods left to embed.`);

  let processed = 0;
  const startTime = Date.now();

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const texts = batch.map(f => f.name_de || f.name);

    try {
      const embeddings = await embedBatch(texts);
      batch.forEach((f, j) => { vectors[f.id] = embeddings[j]; });
      processed += batch.length;
    } catch (err) {
      console.error(`Batch starting at index ${i} failed: ${err.message}`);
      console.error('Saving progress so far before exiting - rerun the script to resume.');
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(vectors));
      process.exit(1);
    }

    if (processed % CHECKPOINT_EVERY === 0 || i + BATCH_SIZE >= remaining.length) {
      fs.writeFileSync(OUTPUT_PATH, JSON.stringify(vectors));
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`  ${processed}/${remaining.length} done (${elapsed}s elapsed) - checkpoint saved.`);
    }
  }

  console.log(`\nDone. ${Object.keys(vectors).length} total vectors written to ${OUTPUT_PATH}`);
  console.log(`Vector dimension: ${Object.values(vectors)[0]?.length ?? 'unknown'}`);
  console.log(`\nIMPORTANT: record that this file was generated with model "${MODEL_NAME}".`);
  console.log('Query-side (on-device) embeddings MUST come from the exact same model,');
  console.log('or cosine similarity comparisons against these vectors will be meaningless.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
