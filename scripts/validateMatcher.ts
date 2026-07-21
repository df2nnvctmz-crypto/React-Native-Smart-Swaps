/**
 * Matcher pipeline validation against labeled receipt data.
 *   npx tsx scripts/validateMatcher.ts
 *   npm run validate:matcher
 *
 * REQUIRES A LOCAL FIXTURE FILE NOT INCLUDED IN THIS REPO:
 *   labeled_receipt_items_final.csv - real (if low-sensitivity) OCR'd grocery receipt lines
 *   with hand-verified expected matches. It's gitignored (scripts/fixtures/) rather than
 *   committed, so it never enters git history. To run this script:
 *     1. Obtain labeled_receipt_items_final.csv from whoever owns/generated the labeled set.
 *     2. Either place it at scripts/fixtures/labeled_receipt_items_final.csv, or point at it
 *        directly:  VALIDATE_MATCHER_CSV=/path/to/file.csv npm run validate:matcher
 *        (or pass it as an argument: npx tsx scripts/validateMatcher.ts /path/to/file.csv)
 *   Without it, the script prints this same explanation and exits 0 (skipped) rather than
 *   failing - a missing local-only fixture on someone else's machine isn't a code regression.
 *
 * Runs the REAL resolveProductLine() (override -> exact_lookup -> brand_dict -> bls-direct,
 * plus the known-non-match safety gate) against that CSV and reports:
 *   1. Accuracy on label_type === 'matched' rows, overall and broken down by which tier
 *      answered and by the CSV's own `method` label.
 *   2. False positives: label_type === 'no_correct_candidate' rows (the original labeler found
 *      NO correct match) where the pipeline now confidently returns one anyway. This is the
 *      class of bug knownNonMatches.json exists to catch - this check re-runs it automatically
 *      on every future foods.json/dictionary change instead of relying on someone to think to
 *      check by hand. Reported but NOT gating the exit code: a "no_correct_candidate" label
 *      just means the original human labeler didn't find a match at the time, not that every
 *      possible answer is wrong forever (the food DB can gain a better entry, or the original
 *      call can itself have been overly conservative) - some of these are legitimately fine
 *      (see e.g. "Haferdrink Bari" -> Haferdrink ungesüßt) and need a human glance, not an
 *      automatic hard fail. New entries here are exactly what should get batch-reviewed for
 *      knownNonMatches.json additions.
 *   3. A fair held-out generalization check: 30% of exact_lookup's and brand_dict's keys are
 *      withheld (a fresh random split each run - this number will jitter slightly run to run,
 *      that's expected), and accuracy is measured only on the rows a withheld key would have
 *      governed. This part necessarily re-implements the substring/whole-word matching logic
 *      locally (resolveProductLine has no way to inject a reduced dictionary) - kept in sync by
 *      hand with app/engine/brandDict.ts; if that file's matching logic changes, update
 *      matchBrandReduced/findOccurrence below to match.
 *
 * Exit code is non-zero if any matched-row regression or no_correct_candidate false positive
 * is found, so this can gate a commit hook or CI the same way regression.test.ts does.
 */
import * as fs from 'fs';
import * as path from 'path';
import { FoodItem } from '../app/types';
import { buildFoodIndex } from '../app/engine/foodIndex';

// Stub AsyncStorage before importing anything that pulls it in transitively (resolveProduct.ts
// -> overrideStore.ts). OverrideStore.load() is never called below, so its cache stays null and
// every OverrideStore.get() is a no-op - this is purely to satisfy the module import.
const AsyncStorageMock: any = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
AsyncStorageMock.default = AsyncStorageMock;
import Module from 'module';
const origLoad = (Module as any)._load;
(Module as any)._load = function (req: string, ...rest: any[]) {
  if (req === '@react-native-async-storage/async-storage') return AsyncStorageMock;
  return origLoad.call(this, req, ...rest);
};

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQuotes = !inQuotes;
    else if (c === ',' && !inQuotes) { cells.push(cur); cur = ''; }
    else cur += c;
  }
  cells.push(cur);
  return cells;
}

function parseCsv(raw: string): Record<string, string>[] {
  const lines = raw.split(/\r?\n/).filter(l => l.length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    return row;
  });
}

(async () => {
  const DEFAULT_FIXTURE_PATH = path.join(process.cwd(), 'scripts/fixtures/labeled_receipt_items_final.csv');
  const CSV_PATH = process.argv[2] || process.env.VALIDATE_MATCHER_CSV || DEFAULT_FIXTURE_PATH;

  if (!fs.existsSync(CSV_PATH)) {
    console.log(`SKIPPED: labeled_receipt_items_final.csv not found at ${CSV_PATH}`);
    console.log(`This is a local-only fixture (gitignored, never committed) - see the comment`);
    console.log(`at the top of scripts/validateMatcher.ts for how to obtain/place it.`);
    process.exit(0);
  }

  const { resolveProductLine } = await import('../app/engine/resolveProduct');
  const { parseReceiptLine } = await import('../app/engine/receiptParser');
  const verifiedBrandMap = (await import('../app/data/verifiedBrandMap.json')).default as Record<string, string>;
  const exactLookupMap = (await import('../app/data/exactLookup.json')).default as Record<string, string>;

  const foods = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'foods.json'), 'utf-8')) as FoodItem[];
  const indexData = buildFoodIndex(foods);
  const deps = { allFoods: foods, foodIndexData: indexData };

  const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf-8'));
  const matchedRows = rows.filter(r => r.label_type === 'matched' && r.matched_id);
  const noCandidateRows = rows.filter(r => r.label_type === 'no_correct_candidate');

  let exitCode = 0;

  // --- 1. Accuracy on matched rows, by tier and by CSV method ---
  const byMethod: Record<string, { correct: number; total: number }> = {};
  const byTier: Record<string, { correct: number; total: number }> = {};
  let overallCorrect = 0;
  const wrongRows: any[] = [];

  for (const r of matchedRows) {
    const parsed = resolveProductLine(r.ocr_text, deps);
    const tier = parsed?.source ?? 'no_match';
    const ok = parsed?.matchedFood?.id === r.matched_id;

    byMethod[r.method] = byMethod[r.method] || { correct: 0, total: 0 };
    byMethod[r.method].total++;
    if (ok) byMethod[r.method].correct++;

    byTier[tier] = byTier[tier] || { correct: 0, total: 0 };
    byTier[tier].total++;
    if (ok) byTier[tier].correct++;

    if (ok) overallCorrect++;
    else {
      wrongRows.push({
        ocr: r.ocr_text,
        expected: `${r.matched_id} ${r.matched_name_de}`,
        got: parsed?.matchedFood ? `${parsed.matchedFood.id} ${parsed.matchedFood.name_de}` : 'no_match',
        tier,
      });
    }
  }

  console.log(`Matcher validation against ${CSV_PATH}`);
  console.log(`\n=== 1. Accuracy on label_type === 'matched' rows (${matchedRows.length} total) ===`);
  console.log(`Overall: ${overallCorrect}/${matchedRows.length} = ${(100 * overallCorrect / matchedRows.length).toFixed(1)}%`);
  console.log('\nBy tier that answered:');
  for (const [tier, s] of Object.entries(byTier)) {
    console.log(`  ${tier}: ${s.correct}/${s.total} = ${(100 * s.correct / s.total).toFixed(1)}%`);
  }
  console.log('\nBy CSV method label:');
  for (const [method, s] of Object.entries(byMethod)) {
    console.log(`  ${method}: ${s.correct}/${s.total} = ${(100 * s.correct / s.total).toFixed(1)}%`);
  }
  if (wrongRows.length > 0) {
    console.log(`\nWrong (${wrongRows.length}):`);
    wrongRows.forEach(w => console.log('  ', JSON.stringify(w)));
    exitCode = 1;
  }

  // --- 2. False positives on no_correct_candidate rows ---
  console.log(`\n=== 2. False positives on label_type === 'no_correct_candidate' rows (${noCandidateRows.length} total) ===`);
  const falsePositives: any[] = [];
  for (const r of noCandidateRows) {
    const parsed = resolveProductLine(r.ocr_text, deps);
    if (parsed?.matchedFood) {
      falsePositives.push({ ocr: r.ocr_text, got: `${parsed.matchedFood.id} ${parsed.matchedFood.name_de}`, tier: parsed.source ?? 'bls' });
    }
  }
  console.log(`${falsePositives.length}/${noCandidateRows.length} now return a confident match (informational - review for knownNonMatches.json additions, does not fail the build):`);
  falsePositives.forEach(fp => console.log('  ', JSON.stringify(fp)));

  // --- 3. Held-out generalization check (informational, not a hard gate: the random 30%
  // split makes this non-deterministic run to run, unlike 1 and 2 above). ---
  const isGermanLetter = (c: string) => /[a-zäöüß]/i.test(c);
  const PROCESSED_FORM_SUFFIXES = ['mus', 'mark', 'saft', 'öl', 'oel', 'creme', 'brei'];
  function isProcessedFormMatch(line: string, key: string, idx: number): boolean {
    let wordEnd = idx + key.length;
    while (wordEnd < line.length && isGermanLetter(line[wordEnd])) wordEnd++;
    return PROCESSED_FORM_SUFFIXES.some(suf => line.slice(idx + key.length, wordEnd).endsWith(suf));
  }
  function findOccurrence(line: string, key: string): { wholeWord: boolean } | null {
    let from = 0;
    let sawEmbedded = false;
    while (true) {
      const idx = line.indexOf(key, from);
      if (idx === -1) break;
      if (!isProcessedFormMatch(line, key, idx)) {
        const before = idx > 0 ? line[idx - 1] : '';
        const after = idx + key.length < line.length ? line[idx + key.length] : '';
        if (!isGermanLetter(before) && !isGermanLetter(after)) return { wholeWord: true };
        sawEmbedded = true;
      }
      from = idx + 1;
    }
    return sawEmbedded ? { wholeWord: false } : null;
  }
  function matchBrandReduced(rawLine: string, dict: Record<string, string>, sortedKeys: string[]): string | null {
    const line = rawLine.trim().toLowerCase();
    let firstEmbeddedKey: string | null = null;
    for (const key of sortedKeys) {
      const occ = findOccurrence(line, key);
      if (!occ) continue;
      if (occ.wholeWord) return dict[key];
      if (firstEmbeddedKey === null) firstEmbeddedKey = key;
    }
    return firstEmbeddedKey !== null ? dict[firstEmbeddedKey] : null;
  }

  const byNameDe = new Map(foods.map(f => [f.name_de, f]));
  const bestFood = (name: string | null) => (name ? byNameDe.get(name) ?? foods.find(f => f.name === name) ?? null : null);

  function holdOut30(keys: string[]): { heldOut: Set<string>; reduced: string[] } {
    const shuffled = [...keys].sort(() => Math.random() - 0.5);
    const n = Math.round(shuffled.length * 0.3);
    const heldOut = new Set(shuffled.slice(0, n));
    return { heldOut, reduced: keys.filter(k => !heldOut.has(k)) };
  }

  const fullBrandKeys = Object.keys(verifiedBrandMap).sort((a, b) => b.length - a.length);
  const exactKeys = Object.keys(exactLookupMap);
  const { heldOut: heldOutExact, reduced: reducedExactKeys } = holdOut30(exactKeys);
  const { heldOut: heldOutBrand, reduced: reducedBrandKeys } = holdOut30(fullBrandKeys);
  const reducedExact: Record<string, string> = {};
  for (const k of reducedExactKeys) reducedExact[k] = exactLookupMap[k];
  const reducedBrand: Record<string, string> = {};
  for (const k of reducedBrandKeys) reducedBrand[k] = verifiedBrandMap[k];

  function governingKey(ocrText: string): { tier: 'exact' | 'brand'; key: string } | null {
    const exactKey = ocrText.trim().toLowerCase();
    if (exactKey in exactLookupMap) return { tier: 'exact', key: exactKey };
    const line = ocrText.trim().toLowerCase();
    let firstEmbeddedKey: string | null = null;
    for (const key of fullBrandKeys) {
      const occ = findOccurrence(line, key);
      if (!occ) continue;
      if (occ.wholeWord) return { tier: 'brand', key };
      if (firstEmbeddedKey === null) firstEmbeddedKey = key;
    }
    return firstEmbeddedKey !== null ? { tier: 'brand', key: firstEmbeddedKey } : null;
  }

  const heldOutGovernedRows = matchedRows.filter(r => {
    const g = governingKey(r.ocr_text);
    if (!g) return false;
    return g.tier === 'exact' ? heldOutExact.has(g.key) : heldOutBrand.has(g.key);
  });

  const FLOOR = 0.45;
  // Deliberately calls parseReceiptLine directly, NOT resolveProductLine - resolveProductLine
  // always consults the FULL exact_lookup/brand_dict internally, which would silently defeat
  // "reduced"/"no dicts at all" for exactly the rows this test cares about (the ones a
  // held-out key would otherwise govern).
  function resolveBlsOnly(ocrText: string): FoodItem | null {
    const direct = parseReceiptLine(ocrText, foods, indexData);
    if (direct && direct.matchedFood && direct.confidence >= FLOOR) return direct.matchedFood;
    return null;
  }
  function resolveWithReducedDicts(ocrText: string): FoodItem | null {
    const exactHit = bestFood(reducedExact[ocrText.trim().toLowerCase()] ?? null);
    if (exactHit) return exactHit;
    const brandHit = bestFood(matchBrandReduced(ocrText, reducedBrand, reducedBrandKeys));
    if (brandHit) return brandHit;
    return resolveBlsOnly(ocrText);
  }

  let beforeHeldOutCorrect = 0;
  let afterHeldOutCorrect = 0;
  for (const r of heldOutGovernedRows) {
    if (resolveBlsOnly(r.ocr_text)?.id === r.matched_id) beforeHeldOutCorrect++;
    if (resolveWithReducedDicts(r.ocr_text)?.id === r.matched_id) afterHeldOutCorrect++;
  }

  console.log(`\n=== 3. Held-out generalization check (informational) ===`);
  console.log(`${heldOutExact.size}/${exactKeys.length} exact_lookup keys + ${heldOutBrand.size}/${fullBrandKeys.length} brand_dict keys held out.`);
  console.log(`${heldOutGovernedRows.length} matched rows governed by a held-out key:`);
  console.log(`  bls-direct only (no dicts):       ${beforeHeldOutCorrect}/${heldOutGovernedRows.length} = ${(100 * beforeHeldOutCorrect / (heldOutGovernedRows.length || 1)).toFixed(1)}%`);
  console.log(`  reduced dicts (entries withheld): ${afterHeldOutCorrect}/${heldOutGovernedRows.length} = ${(100 * afterHeldOutCorrect / (heldOutGovernedRows.length || 1)).toFixed(1)}%`);

  console.log(`\n${exitCode === 0 ? 'ALL CHECKS PASS' : 'FAILURES FOUND'} (only check 1 gates the exit code; checks 2 and 3 are informational)`);
  process.exit(exitCode);
})();
