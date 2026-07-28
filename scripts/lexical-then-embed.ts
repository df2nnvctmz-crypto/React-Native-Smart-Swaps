/**
 * Tests the proposed pipeline: LEXICAL RETRIEVE -> EMBEDDING RERANK.
 *
 * Note this is the opposite order from scripts/check-vector-rerank.js, which did
 * embedding-retrieve -> lexical-rerank and performed badly. The premise here is the
 * more defensible one: the lexical stage already has strong recall, so embeddings only
 * have to break ties inside a shortlist that usually already contains the answer.
 *
 * Measures three things, in order of what actually decides the question:
 *   1. RECALL CEILING - how often is the correct id anywhere in the lexical candidate
 *      list? Reranking can never beat this number, so it caps the whole idea.
 *   2. Current top-1 (what the matcher ships today).
 *   3. Top-1 after blending lexical confidence with cosine similarity.
 *
 * Requires Ollama running locally with the jina model. Measurement only - changes nothing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { matchFoodToOcrText, MatchDebug } from '../app/engine/receiptParser';
import { buildFoodIndex } from '../app/engine/foodIndex';
import { FoodItem } from '../app/types';

const OLLAMA_URL = 'http://localhost:11434/api/embed';
const MODEL_NAME = 'jina/jina-embeddings-v2-base-de';
const TOP_K = 20;                 // shortlist size handed to the reranker
const BLEND = [0, 0.15, 0.3, 0.5, 0.7, 1.0]; // weight on cosine; 0 = today's behaviour

interface GroundTruthRow { raw_line: string; correct_id: string | null; }

const foods = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'foods.json'), 'utf-8')) as FoodItem[];
const rows = (JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'scripts/ground_truth.json'), 'utf-8')
) as GroundTruthRow[]).filter(r => r.correct_id !== null);

const foodVectors: Record<string, number[]> = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'scripts/food_vectors_jina.json'), 'utf-8')
);
const indexData = buildFoodIndex(foods);
const byId = new Map(foods.map(f => [f.id, f]));

function cosSim(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function embed(text: string): Promise<number[]> {
  const res = await fetch(OLLAMA_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL_NAME, input: text }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  return (await res.json()).embeddings[0];
}

async function main() {
  let inCandidates = 0, inTopK = 0, currentTop1 = 0;
  const perBlend = new Map<number, number>(BLEND.map(b => [b, 0]));
  const rescued: string[] = [];
  const broken: string[] = [];

  for (const row of rows) {
    const debug: MatchDebug = {};
    const match = matchFoodToOcrText(row.raw_line, foods, indexData, debug);
    const ranked = debug.ranked ?? [];

    if (match && match.food.id === row.correct_id) currentTop1++;
    if (ranked.some(r => r.food.id === row.correct_id)) inCandidates++;

    const shortlist = ranked.slice(0, TOP_K);
    if (shortlist.some(r => r.food.id === row.correct_id)) inTopK++;
    if (shortlist.length === 0) continue;

    const qVec = await embed(row.raw_line);
    const scored = shortlist.map(c => {
      const v = foodVectors[c.food.id];
      return { id: c.food.id, lex: c.confidence, cos: v ? cosSim(qVec, v) : 0 };
    });

    for (const w of BLEND) {
      const best = [...scored].sort((a, b) => ((1 - w) * b.lex + w * b.cos) - ((1 - w) * a.lex + w * a.cos))[0];
      if (best.id === row.correct_id) perBlend.set(w, perBlend.get(w)! + 1);
      if (w === 0.3) {
        const before = match?.food.id === row.correct_id;
        const after = best.id === row.correct_id;
        if (!before && after) rescued.push(`  + "${row.raw_line}" -> ${byId.get(best.id)?.name_de}`);
        if (before && !after) broken.push(`  - "${row.raw_line}" now ${byId.get(best.id)?.name_de}`);
      }
    }
  }

  const n = rows.length;
  console.log(`\nLexical retrieve -> embedding rerank, ${n} answerable rows, TOP_K=${TOP_K}\n`);
  console.log(`RECALL CEILING`);
  console.log(`  correct id anywhere in lexical candidates: ${inCandidates}/${n} (${(100 * inCandidates / n).toFixed(1)}%)`);
  console.log(`  correct id within top ${TOP_K} by lexical conf: ${inTopK}/${n} (${(100 * inTopK / n).toFixed(1)}%)`);
  console.log(`  <- no reranker can score above the second number.\n`);
  console.log(`TOP-1 ACCURACY by cosine weight (0.0 = today's matcher)`);
  for (const w of BLEND) {
    const c = perBlend.get(w)!;
    console.log(`  w=${w.toFixed(2)}   ${c}/${n}  (${(100 * c / n).toFixed(1)}%)`);
  }
  console.log(`\n  [reference] shipped matcher top-1: ${currentTop1}/${n}`);
  if (rescued.length) console.log(`\nRescued at w=0.3:\n${rescued.join('\n')}`);
  if (broken.length) console.log(`\nBroken at w=0.3:\n${broken.join('\n')}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
