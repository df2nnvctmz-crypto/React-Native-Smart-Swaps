#!/usr/bin/env node
/**
 * RETRIEVE-THEN-RERANK vector matcher.
 *
 * Instead of trusting raw cosine similarity to pick THE winner, this:
 *   1. Uses the embedding model to pull the top K candidates by cosine sim
 *      (vectors are good at "is the right answer probably in this shortlist" -
 *      i.e. recall - even when they're bad at picking the exact winner).
 *   2. Reranks those K candidates using a lexical/token-overlap score against
 *      each candidate's own cleaned food name (lexical is good at fine-grained
 *      exact-detail discrimination - size codes, brand tokens, etc).
 *   3. Picks the candidate with the best COMBINED score.
 *
 * USAGE (from inside scripts/):
 *   node check-vector-rerank.js
 */

const fs = require('fs');
const path = require('path');

const FOOD_VECTORS_PATH = path.join(__dirname, 'food_vectors_jina.json');
const GROUND_TRUTH_PATH = path.join(__dirname, 'ground_truth.json');
// foods.json lives at the repo root, and carries name_de for every entry -
// which is what precompute-food-embeddings.js embedded, so rerank against it.
const FOODS_PATH = path.join(__dirname, '..', 'foods.json');

const { expandGermanAbbreviations, BRAND_STRIP_LIST, CERTIFICATIONS } = require('../app/engine/germanAbbreviations.js');

const OLLAMA_URL = 'http://localhost:11434/api/embed';
const MODEL_NAME = 'jina/jina-embeddings-v2-base-de';

const TOP_K = 10;
const COSINE_WEIGHT = 0.5;
const LEXICAL_WEIGHT = 0.5;
const SIMILARITY_FLOOR = 0.45;

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

function tokenize(text) {
  return new Set(text.toLowerCase().split(/\s+/).filter(Boolean));
}

function lexicalOverlapScore(queryText, candidateText) {
  const qTokens = tokenize(queryText);
  const cTokens = tokenize(candidateText);
  if (qTokens.size === 0 || cTokens.size === 0) return 0;

  let intersection = 0;
  for (const t of qTokens) if (cTokens.has(t)) intersection++;
  const union = new Set([...qTokens, ...cTokens]).size;
  const jaccard = intersection / union;

  const isCode = (t) => /\d/.test(t) || /-/.test(t);
  let codeMatches = 0, codeTotal = 0;
  for (const t of qTokens) {
    if (isCode(t)) { codeTotal++; if (cTokens.has(t)) codeMatches++; }
  }
  const codeBonus = codeTotal > 0 ? codeMatches / codeTotal : 0;

  return Math.min(1, 0.7 * jaccard + 0.3 * codeBonus);
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

function topKByCosine(queryVec, foodVectors, k) {
  const scored = [];
  for (const [id, vec] of Object.entries(foodVectors)) {
    scored.push({ id, cosine: cosSim(queryVec, vec) });
  }
  scored.sort((a, b) => b.cosine - a.cosine);
  return scored.slice(0, k);
}

function loadFoodNames() {
  const raw = JSON.parse(fs.readFileSync(FOODS_PATH, 'utf-8'));
  const lookup = {};
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  for (const item of list) {
    const id = item.id;
    // name_de is what got embedded, so rerank against the same text.
    const name = item.name_de ?? item.name ?? '';
    if (id) lookup[id] = cleanQueryText(name);
  }
  return lookup;
}

function rerank(candidates, queryCleanedText, foodNames) {
  const reranked = candidates.map(c => {
    const candidateText = foodNames[c.id] || '';
    const lexScore = lexicalOverlapScore(queryCleanedText, candidateText);
    const combined = COSINE_WEIGHT * c.cosine + LEXICAL_WEIGHT * lexScore;
    return { ...c, lexScore, combined, candidateText };
  });
  reranked.sort((a, b) => b.combined - a.combined);
  return reranked;
}

async function main() {
  const foodVectors = JSON.parse(fs.readFileSync(FOOD_VECTORS_PATH, 'utf-8'));
  const groundTruth = JSON.parse(fs.readFileSync(GROUND_TRUTH_PATH, 'utf-8'));
  const foodNames = loadFoodNames();

  console.log(`Loaded ${Object.keys(foodVectors).length} food vectors.`);
  console.log(`Loaded ${Object.keys(foodNames).length} food names for reranking.`);
  console.log(`Loaded ${groundTruth.length} labeled receipt lines.`);
  console.log(`Using model: ${MODEL_NAME}`);
  console.log(`TOP_K=${TOP_K}, COSINE_WEIGHT=${COSINE_WEIGHT}, LEXICAL_WEIGHT=${LEXICAL_WEIGHT}\n`);

  const results = [];
  for (let i = 0; i < groundTruth.length; i++) {
    const item = groundTruth[i];
    const cleanedText = cleanQueryText(item.raw_line);
    let queryVec;
    try {
      queryVec = await embed(cleanedText);
    } catch (err) {
      console.error(`Failed to embed "${item.raw_line}": ${err.message}`);
      continue;
    }

    const shortlist = topKByCosine(queryVec, foodVectors, TOP_K);
    const reranked = rerank(shortlist, cleanedText, foodNames);
    const top = reranked[0];

    const vectorMatchId = top ? top.id : null;
    const finalScore = top ? top.combined : -1;
    const vectorShown = finalScore >= SIMILARITY_FLOOR;
    const vectorCorrect = item.correct_id !== null && vectorMatchId === item.correct_id;
    const vectorCorrectlyAbstained = item.correct_id === null && !vectorShown;

    const correctInShortlist = item.correct_id !== null &&
      shortlist.some(c => c.id === item.correct_id);

    results.push({
      ...item, cleanedText, vectorMatchId, finalScore, vectorShown,
      vectorCorrect, vectorCorrectlyAbstained, correctInShortlist,
      topCosine: top ? top.cosine : null, topLex: top ? top.lexScore : null,
    });

    if ((i + 1) % 20 === 0) console.log(`  ${i + 1}/${groundTruth.length} processed...`);
  }

  fs.writeFileSync(path.join(__dirname, 'vector_vs_lexical_results_rerank.json'), JSON.stringify(results, null, 2));

  const byVerdict = { CORRECT: [], WRONG: [], GAP: [] };
  for (const r of results) byVerdict[r.verdict].push(r);

  console.log('\n=== RESULTS (retrieve-then-rerank vs. your CURRENT lexical matcher) ===\n');

  console.log(`CORRECT rows (${byVerdict.CORRECT.length})`);
  console.log(`  Also correct: ${byVerdict.CORRECT.filter(r => r.vectorCorrect).length}/${byVerdict.CORRECT.length}\n`);

  console.log(`WRONG rows (${byVerdict.WRONG.length}) - the real matcher bugs.`);
  console.log(`  Now correct: ${byVerdict.WRONG.filter(r => r.vectorCorrect).length}/${byVerdict.WRONG.length}`);
  const wrongRetrievalFailures = byVerdict.WRONG.filter(r => !r.correctInShortlist).length;
  console.log(`  Of the still-wrong ones, correct answer wasn't even in top ${TOP_K} shortlist: ${wrongRetrievalFailures}`);
  for (const r of byVerdict.WRONG) {
    const mark = r.vectorCorrect ? 'FIXED' : (r.correctInShortlist ? 'still wrong (was in shortlist)' : 'still wrong (NOT in shortlist)');
    console.log(`    [${mark}] "${r.raw_line}" -> "${r.vectorMatchId}" (score ${r.finalScore.toFixed(3)}, cos ${r.topCosine?.toFixed(3)}, lex ${r.topLex?.toFixed(3)}), correct "${r.correct_id}"`);
  }

  console.log(`\nGAP rows (${byVerdict.GAP.length})`);
  console.log(`  Correctly stayed silent: ${byVerdict.GAP.filter(r => r.vectorCorrectlyAbstained).length}/${byVerdict.GAP.length}`);
  console.log(`  Forced a confident guess anyway: ${byVerdict.GAP.filter(r => r.vectorShown).length}/${byVerdict.GAP.length}\n`);

  console.log('Full row-by-row results written to vector_vs_lexical_results_rerank.json.');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
