#!/usr/bin/env node
/**
 * Same test as check-vector-matcher.js, but this time the receipt line gets
 * cleaned FIRST - using the same stripNoise + abbreviation-expansion logic
 * your real lexical matcher already applies - before it's sent to the
 * embedding model. Last time we compared "noisy raw OCR text" against
 * "clean food names", which wasn't a fair fight. This time it's clean
 * against clean.
 *
 * PLACEMENT: put this file in your project's `scripts/` folder (same folder
 * as your existing regression.test.ts etc.), so the relative requires below
 * find app/engine/receiptParser.js and app/engine/germanAbbreviations.js.
 *
 * Put food_vectors.json and ground_truth.json in the SAME folder as this
 * script (scripts/), or edit the two paths below to point at wherever you
 * kept them from last time.
 *
 * USAGE (from inside scripts/):
 *   node check-vector-matcher-cleaned.js
 */

const fs = require('fs');
const path = require('path');

// --- adjust these if your files live somewhere else ---
const FOOD_VECTORS_PATH = path.join(__dirname, 'food_vectors_jina.json');
const GROUND_TRUTH_PATH = path.join(__dirname, 'ground_truth.json');
// -------------------------------------------------------

const { normalize, asciiFold } = require('../app/engine/receiptParser.js');
const { expandGermanAbbreviations, BRAND_STRIP_LIST, CERTIFICATIONS } = require('../app/engine/germanAbbreviations.js');

const OLLAMA_URL = 'http://localhost:11434/api/embed';
const MODEL_NAME = 'jina/jina-embeddings-v2-base-de'; // <-- match your pull tag exactly
const SIMILARITY_FLOOR = 0.75; // starting guess, not tuned - see report at the end

/**
 * Faithful port of the private stripNoise() from receiptParser.ts (it isn't
 * exported, so it's copied here rather than modifying your source file).
 * Strips prices, weights/volumes, pack-count codes, and known receipt
 * qualifiers that aren't part of the actual product identity.
 *
 * KNOWN LIMITATION: dotted brand prefixes like "M.I." sometimes survive as
 * stray fragments ("m i") rather than being fully stripped, because of how
 * this tokenizes vs. how BRAND_STRIP_LIST's entries are keyed. Not chasing
 * this to perfection here - it's still a meaningful improvement over zero
 * cleaning (see the "sample of raw -> cleaned text" printout at the top of
 * the run to eyeball residual noise yourself).
 */
function stripNoise(text) {
  let cleaned = text.toLowerCase();
  cleaned = cleaned.replace(/([a-zäöüß])(\d)/gi, '$1 $2').replace(/(\d)([a-zäöüß])/gi, '$1 $2');
  cleaned = cleaned.replace(/(protein|bio|vegan|veggie|mini|schoko)/gi, '$1 ');
  cleaned = cleaned.replace(/\b\d+,\d{2}\b/g, ' ');
  cleaned = cleaned.replace(/\b\d+\.\d{2}\b/g, ' ');
  cleaned = cleaned.replace(/\b\d+([.,]\d+)?\s*(g|kg|ml|l|oz|lb)\b/gi, ' ');
  cleaned = cleaned.replace(/\b\d+\s*(x|st|stk)\b/gi, ' ');
  cleaned = cleaned.replace(/\b(stk|st|pck|pkg|bd|pack|btl)\b/gi, ' ');
  cleaned = cleaned.replace(/\b(tk|h-milch|frischmilch|ger|gem|vlog|ogt|zb|sort)\b/gi, ' ');
  cleaned = cleaned.replace(/\s\b[a-c]\b$/i, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
}

function cleanQueryText(raw) {
  const stripped = stripNoise(raw);
  const expanded = expandGermanAbbreviations(stripped);
  const knownNoise = new Set([...BRAND_STRIP_LIST, ...CERTIFICATIONS].map(s => s.toLowerCase()));
  const filtered = expanded
    .split(/\s+/)
    .filter(tok => tok.length > 0 && !knownNoise.has(tok.toLowerCase()))
    .join(' ');
  return filtered.replace(/\s+/g, ' ').trim();
}

function cosSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embed(text) {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL_NAME, input: text }),
  });
  if (!res.ok) throw new Error(`Ollama request failed (${res.status}): ${await res.text()}`);
  const data = await res.json();
  return data.embeddings[0];
}

function findBestMatch(queryVec, foodVectors) {
  let bestId = null, bestSim = -1;
  for (const [id, vec] of Object.entries(foodVectors)) {
    const sim = cosSim(queryVec, vec);
    if (sim > bestSim) { bestSim = sim; bestId = id; }
  }
  return { id: bestId, sim: bestSim };
}

async function main() {
  const foodVectors = JSON.parse(fs.readFileSync(FOOD_VECTORS_PATH, 'utf-8'));
  const groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, 'utf-8'));

  console.log(`Loaded ${Object.keys(foodVectors).length} food vectors.`);
  console.log(`Loaded ${groundTruth.length} labeled receipt lines.`);
  console.log(`Using model: ${MODEL_NAME}\n`);

  // Show a few examples of what cleaning actually changes, so you can eyeball
  // it before trusting the numbers.
  console.log('=== Sample of raw -> cleaned text (spot-check these look sane) ===');
  for (const item of groundTruth.slice(0, 5)) {
    console.log(`  "${item.raw_line}"  ->  "${cleanQueryText(item.raw_line)}"`);
  }
  console.log('');

  const results = [];
  for (let i = 0; i < groundTruth.length; i++) {
    const item = groundTruth[i];
    const cleanedText = cleanQueryText(item.raw_line);
    let queryVec;
    try {
      queryVec = await embed(cleanedText);
    } catch (err) {
      console.error(`Failed to embed "${item.raw_line}" (cleaned: "${cleanedText}"): ${err.message}`);
      continue;
    }
    const { id: vectorMatchId, sim } = findBestMatch(queryVec, foodVectors);
    const vectorShown = sim >= SIMILARITY_FLOOR;
    const vectorCorrect = item.correct_id !== null && vectorMatchId === item.correct_id;
    const vectorCorrectlyAbstained = item.correct_id === null && !vectorShown;

    results.push({ ...item, cleanedText, vectorMatchId, vectorSim: sim, vectorShown, vectorCorrect, vectorCorrectlyAbstained });

    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${groundTruth.length} processed...`);
  }

  fs.writeFileSync(path.join(__dirname, 'vector_vs_lexical_results_cleaned.json'), JSON.stringify(results, null, 2));

  const byVerdict = { CORRECT: [], WRONG: [], GAP: [] };
  for (const r of results) byVerdict[r.verdict].push(r);

  console.log('\n=== RESULTS (cleaned-text embeddings vs. your CURRENT lexical matcher) ===\n');

  console.log(`CORRECT rows (${byVerdict.CORRECT.length}) - lexical matcher already gets these right.`);
  console.log(`  Vector matcher also correct: ${byVerdict.CORRECT.filter(r => r.vectorCorrect).length}/${byVerdict.CORRECT.length}\n`);

  console.log(`WRONG rows (${byVerdict.WRONG.length}) - the real matcher bugs you want fixed.`);
  console.log(`  Vector matcher gets these right: ${byVerdict.WRONG.filter(r => r.vectorCorrect).length}/${byVerdict.WRONG.length}\n`);
  for (const r of byVerdict.WRONG) {
    const mark = r.vectorCorrect ? 'FIXED' : 'still wrong';
    console.log(`    [${mark}] "${r.raw_line}" (cleaned: "${r.cleanedText}") -> "${r.vectorMatchId}" (sim ${r.vectorSim.toFixed(3)}), correct was "${r.correct_id}"`);
  }

  console.log(`\nGAP rows (${byVerdict.GAP.length}) - genuinely not in your database.`);
  console.log(`  Correctly stayed silent: ${byVerdict.GAP.filter(r => r.vectorCorrectlyAbstained).length}/${byVerdict.GAP.length}`);
  console.log(`  Forced a confident guess anyway: ${byVerdict.GAP.filter(r => r.vectorShown).length}/${byVerdict.GAP.length}\n`);

  console.log('Full row-by-row results written to vector_vs_lexical_results_cleaned.json.');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
