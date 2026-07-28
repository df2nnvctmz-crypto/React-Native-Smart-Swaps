/**
 * PHASE 0 baseline eval set: every labeled line we have, bucketed by WHICH mechanism is
 * supposed to resolve it. This is the fixed yardstick the embedding tier (Phases 1-8) will
 * be judged against in Phase 7 - so nothing here is allowed to change to make a later
 * pipeline look better. If a label is wrong, fix it now, before the baseline run.
 *
 * Buckets
 * -------
 *   'bls-direct'    the line contains a German food noun BLS actually uses, so the existing
 *                   offline lexical matcher (parseReceiptLine) should get it on its own -
 *                   possibly through OCR damage. An embedding tier must NOT regress these.
 *   'semantic'      brand-only or English/loanword product names with no BLS-vocabulary noun
 *                   in them ("Pringles", "Nutella", "Quaker Oats"). Lexical matching has
 *                   nothing to grab; today only the OFF bridge can reach these. This is the
 *                   bucket embeddings are supposed to win.
 *   'unresolvable'  must NOT produce a confident match: receipt noise, non-food, no BLS
 *                   analogue at all, or several equally-defensible BLS neighbours. Measured
 *                   because a confident wrong answer here is worse than "not found" - the
 *                   user sees fabricated nutrition with no signal that it is fabricated.
 *
 * Provenance - three sources, all previously hand-labeled against foods.json content:
 *   1. REGRESSION_CASES  - real OCR lines captured off scanned Netto/Rewe receipts. These are
 *      the only genuinely-real receipt text in the set. All are 'bls-direct' or (expected
 *      null) 'unresolvable' by construction: they were collected to lock in the offline
 *      matcher.
 *   2. OFF_EVAL_CASES    - realistic but SYNTHETIC product lines (clean brand + product +
 *      size, no OCR damage) written for the OFF bridge. Bucketed below by hand.
 *   3. EXTRA_SEMANTIC_CASES - added here, because sources 1-2 left the 'semantic' bucket
 *      thin. Also synthetic.
 *
 * Honest limitation, stated up front: only source 1 is real OCR. The 'semantic' bucket is
 * clean text, so it measures brand/vocabulary knowledge, not OCR robustness. Before Phase 7
 * is load-bearing, this bucket should be topped up with real scanned lines of branded
 * products - see the note at the bottom of this file.
 */

import { REGRESSION_CASES } from './regression.cases';
import { OFF_EVAL_CASES } from './off-eval.cases';

export type Bucket = 'bls-direct' | 'semantic' | 'unresolvable';

export interface BaselineCase {
  /** The line fed to the pipeline, exactly as resolveProductLine would receive it. */
  line: string;
  /** Expected BLS food id, or null when nothing should resolve confidently. */
  expected: string | null;
  bucket: Bucket;
  /** Where the label came from, so a disagreement can be traced to its source file. */
  origin: 'regression' | 'off-eval' | 'extra';
  note: string;
}

/**
 * OFF_EVAL_CASES queries that carry NO German food noun BLS would recognize, so the lexical
 * matcher has nothing to work with. Everything else in that file with a non-null expectation
 * is bucketed 'bls-direct' by the default rule below.
 *
 * Judgement calls, recorded so they can be argued with:
 *   - 'Loewensenf Mittelscharf'  the only "Senf" in the line is inside the brand name.
 *   - 'Barilla Penne'/'De Cecco Fusilli'  neither shape name exists in BLS (BLS says
 *     "Teigwaren"). Fusilli is in the regression set as a passing OCR line, so the lexical
 *     matcher does have some handle on it - it is bucketed semantic anyway because the
 *     grep says the word is absent; the baseline run will settle it either way.
 *   - 'Alnatura Datteln'  BLS has the singular "Dattel"; whether the matcher's stemming
 *     bridges the plural is exactly the kind of thing this baseline is here to measure.
 *   - 'Kuehne Essiggurken'  BLS has no "Essiggurke", only "Gewürzgurke"/"Salzgurke".
 */
const SEMANTIC_OFF_EVAL_QUERIES = new Set<string>([
  'Pringles Original 165g',
  'Nutella 400g',
  'Barilla Penne 500g',
  'De Cecco Fusilli 500g',
  'Kuehne Essiggurken 670g',
  'Alnatura Datteln getrocknet 200g',
  'Loewensenf Mittelscharf 250ml',
]);

/**
 * Brand-only / English-language lines added to give the 'semantic' bucket enough mass to
 * measure. Every id was checked against foods.json content (not recalled), and each was
 * chosen because BLS has exactly ONE defensible analogue - so a miss is a real miss and a
 * hit is a real hit, with no "several close neighbours" excuse either way.
 */
const EXTRA_SEMANTIC_CASES: BaselineCase[] = [
  { line: 'Doritos Nacho Cheese 170g', expected: 'bls0572', bucket: 'semantic', origin: 'extra', note: 'tortilla chips - BLS: "Tortillachips (Nachos)", the single entry' },
  { line: 'Pringles Sour Cream & Onion 165g', expected: 'bls0327', bucket: 'semantic', origin: 'extra', note: 'stacked crisps - BLS lumps all flavours into "Kartoffelchips/Stapelchips, diverse Sorten"' },
  { line: 'Lays Salted 150g', expected: 'bls0327', bucket: 'semantic', origin: 'extra', note: 'crisps, brand + English flavour only, same BLS target as above' },
  { line: 'Alpro Soya Original 1L', expected: 'bls0668', bucket: 'semantic', origin: 'extra', note: 'English "Soya" instead of "Sojadrink" - BLS: "Sojadrink ungesüßt"' },
  { line: 'Bens Original Basmati 500g', expected: 'bls0007', bucket: 'semantic', origin: 'extra', note: 'rice with the word "Reis" absent entirely' },
  { line: 'Bertolli Extra Virgin 500ml', expected: 'bls0830', bucket: 'semantic', origin: 'extra', note: 'olive oil with "Olivenöl" absent - contrast the Bertolli case in off-eval that spells it out' },
  { line: 'Kikkoman Soy Sauce 150ml', expected: 'bls0397', bucket: 'semantic', origin: 'extra', note: 'English label of a product BLS has once: "Sojasauce/Sojasoße"' },
  { line: 'Quaker Oats 500g', expected: 'bls0002', bucket: 'semantic', origin: 'extra', note: 'English "Oats" for BLS oat flakes' },
  { line: 'Bonduelle Sweet Corn 300g', expected: 'bls0295', bucket: 'semantic', origin: 'extra', note: 'English label - BLS: canned sweetcorn, drained' },
];

const fromRegression: BaselineCase[] = REGRESSION_CASES.map(c => ({
  line: c.line,
  expected: c.expected,
  // Real OCR lines: a non-null expectation means the offline matcher is supposed to get it.
  bucket: c.expected === null ? 'unresolvable' : 'bls-direct',
  origin: 'regression',
  note: c.note ?? '',
}));

const fromOffEval: BaselineCase[] = OFF_EVAL_CASES.map(c => ({
  line: c.query,
  expected: c.expected,
  bucket:
    c.expected === null
      ? 'unresolvable'
      : SEMANTIC_OFF_EVAL_QUERIES.has(c.query)
        ? 'semantic'
        : 'bls-direct',
  origin: 'off-eval',
  note: c.note,
}));

export const BASELINE_CASES: BaselineCase[] = [
  ...fromRegression,
  ...fromOffEval,
  ...EXTRA_SEMANTIC_CASES,
];

/** Fails loudly if a query in SEMANTIC_OFF_EVAL_QUERIES no longer exists in off-eval.cases
 *  (a typo or an upstream rename would otherwise silently demote it to 'bls-direct'). */
export function validateBuckets(): string[] {
  const known = new Set(OFF_EVAL_CASES.map(c => c.query));
  return [...SEMANTIC_OFF_EVAL_QUERIES].filter(q => !known.has(q));
}

/**
 * TODO before Phase 7 is treated as decisive: scan ~30 more receipts and capture real OCR
 * lines for BRANDED products (the semantic bucket), the way the regression set captured real
 * OCR for generic ones. Until then the semantic numbers describe clean text, and a model that
 * scores well here may still fall over on "PRNGLS ORIG 165G".
 */
