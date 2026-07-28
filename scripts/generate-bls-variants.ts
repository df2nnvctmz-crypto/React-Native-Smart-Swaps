/**
 * Projects the receipt-noise patterns learned from the real 110-line corpus onto EVERY
 * food in the BLS database, producing (synthetic receipt line -> BLS id) pairs at scale.
 *
 * WHAT THIS CAN AND CANNOT TEACH
 *   CAN:    noise invariance - that "TOMATE500G", "Bio Tomaten 250g", "Tomat. 1kg" and
 *           "TOMATEN" all denote the same entry. This is the truncation/casing/glued-size
 *           damage that dominates real receipts.
 *   CANNOT: retail->nutrition vocabulary. Every line here is derived FROM the BLS name, so
 *           nothing in this file teaches that "Pringles" means Kartoffelchips or that
 *           "Angus Burger" means Rind Frikadelle. Those mappings are arbitrary world
 *           knowledge and must come from labeled receipts or an alias table.
 *   NEVER:  use for accuracy measurement. Rules in, rules out.
 *
 * CANONICAL OWNER ELECTION
 *   1035 head words are shared by more than one BLS entry ("Tomate" covers roh, gekocht,
 *   Pulver, getrocknet...). Dropping all of them would discard 5581 of 7070 entries, so
 *   instead one entry per head word is elected canonical and receives the bare variants.
 *   The election prefers the least-qualified entry, and "roh" over other preparations -
 *   grounded in the ground-truth corpus, where 36 of 40 preparation-labeled answers were
 *   the "roh" form. Non-canonical entries are skipped rather than mislabeled.
 *
 *   npx tsx scripts/generate-bls-variants.ts [variantsPerAnchor] [--category=Produce]
 *
 * Writes scripts/bls_variants.jsonl (one JSON object per line) + a markdown sample.
 */

import * as fs from 'fs';
import * as path from 'path';
import { FoodItem } from '../app/types';

const args = process.argv.slice(2);
const PER_ANCHOR = Number(args.find(a => /^\d+$/.test(a)) ?? 14);
const CATEGORY = args.find(a => a.startsWith('--category='))?.split('=')[1];

const foods = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'foods.json'), 'utf-8')) as FoodItem[];

// ---- noise vocabulary, lifted from the real receipt corpus ---------------------------
const BRAND_PREFIXES = ['GL', 'M.I.', 'Bio BB', 'VL', 'Grop.', 'Cl.', 'NI', 'AS', 'GW',
  'JA!', 'Liebl.', 'Mondo', 'Zeus', 'BE', 'Frei.Land', 'REWE'];
const CERTS = ['Bio', 'oGt', 'VLOG', 'QS'];
const SIZES = ['250g', '500g', '400g', '200g', '1kg', '125g', '750g', '150g', '300g'];
const COUNTS = ['6ST', '10ST', '4ST', '2ST'];
const VOLUMES = ['1L', '500ml', '250ml', '1,5L'];
const TAX = ['A', 'B'];
const FILLERS = ['sort.', 'lose', 'natur', 'frisch'];

const MODIFIERS = new Set([
  'roh', 'gekocht', 'gebraten', 'gebacken', 'gedünstet', 'gegart', 'gegrillt', 'frittiert',
  'geräuchert', 'gesäuert', 'paniert', 'getrocknet', 'geröstet', 'gemischt', 'gemahlen',
  'gesalzen', 'gesüßt', 'ungesüßt', 'ungefüllt', 'entrahmt', 'poliert', 'passiert',
  'mild', 'fein', 'ganz', 'frisch', 'natur', 'extra', 'süß', 'sauer', 'mager', 'fettarm',
  'türkische', 'türkisch', 'italienische', 'griechische', 'diverse', 'sorten', 'einfach',
  'klassisch', 'original', 'pasteurisiert', 'abgetropft', 'konserve', 'tiefgefroren',
]);

const foldUmlaut = (s: string) =>
  s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
   .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue');

const pick = <T,>(arr: T[], i: number): T => arr[i % arr.length];

/**
 * German adjectives inflect, so an exact stoplist misses them: "ganz" is listed but the
 * name "Hafer ganzes Korn, roh" contains "ganzes", which then won the longest-word contest
 * and produced rows like "ganzes 250g" labelled oats. Strip declension endings before the
 * lookup so every inflected form of a listed modifier is caught.
 */
function isModifier(word: string): boolean {
  const w = word.toLowerCase();
  if (MODIFIERS.has(w)) return true;
  const stem = w.replace(/(es|er|en|em|e)$/, '');
  return stem.length >= 3 && MODIFIERS.has(stem);
}

/** Most specific content word of a BLS name; parentheticals and qualifiers removed. */
function headWord(name: string): string | undefined {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s,/\-]+/)
    .map(w => w.replace(/[^\wäöüßÄÖÜ]/g, ''))
    .filter(w => w.length >= 4 && !isModifier(w) && !/\d/.test(w))
    .filter(w => !/(füllung|fuellung|zubereitung)$/i.test(w))
    .sort((a, b) => b.length - a.length)[0];
}

/** Lower is more canonical: fewer qualifying words, and "roh" beats other preparations. */
function qualifyScore(name: string): number {
  const words = name.split(/[\s,/]+/).filter(Boolean);
  const isRaw = /\broh\b/i.test(name);
  const isPrepared = /\b(gekocht|gebraten|gebacken|gedünstet|gegart|gegrillt|frittiert|geräuchert|paniert|getrocknet|geröstet)\b/i.test(name);
  return words.length + (isRaw ? -3 : 0) + (isPrepared ? 4 : 0) + (/\d/.test(name) ? 2 : 0);
}

const pool = CATEGORY ? foods.filter(f => f.category === CATEGORY) : foods;

// Group by head word, then elect one canonical owner per group.
const groups = new Map<string, FoodItem[]>();
for (const f of pool) {
  const h = headWord(f.name_de || f.name || '');
  if (!h) continue;
  const k = h.toLowerCase();
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k)!.push(f);
}

interface Row { line: string; expected: string; name: string; category: string; synthetic: true; }
const rows: Row[] = [];
const seen = new Set<string>();
let contested = 0;

for (const [, members] of groups) {
  if (members.length > 1) contested++;
  const canonical = [...members].sort((a, b) => {
    const d = qualifyScore(a.name_de || a.name) - qualifyScore(b.name_de || b.name);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  })[0];

  const name = canonical.name_de || canonical.name;
  const term = headWord(name)!;
  const isCountable = /\b(Ei|Eier|Hühnerei)\b/i.test(name);
  const isLiquid = /milch|drink|saft|öl|oel|limonade|wasser|bier|wein/i.test(name);
  const units = isCountable ? COUNTS : isLiquid ? VOLUMES : SIZES;

  for (let i = 0; i < PER_ANCHOR; i++) {
    const size = pick(units, i), brand = pick(BRAND_PREFIXES, i);
    const cert = pick(CERTS, i), filler = pick(FILLERS, i);
    const trunc = term.length > 6 ? term.slice(0, Math.max(4, term.length - 3)) + '.' : term;

    const shapes = [
      `${term} ${size}`,
      `${brand} ${term} ${size}`,
      `${cert} ${term} ${size}`,
      `${term}${size}`,
      `${trunc}${size}`,
      foldUmlaut(`${brand} ${term} ${size}`),
      foldUmlaut(term).toUpperCase(),
      `${term.toUpperCase()} ${size.toUpperCase()}`,
      `${brand} ${trunc}${filler}${size}`,
      `${term} ${filler} ${size} ${pick(TAX, i)}`,
      `${cert} ${brand} ${term} ${size}`,
      foldUmlaut(`${trunc} ${size}`),
      term,
      foldUmlaut(`${cert} ${term}${size}`),
    ];
    const line = shapes[i % shapes.length].replace(/\s+/g, ' ').trim();
    const key = line.toLowerCase();
    if (!line || seen.has(key)) continue;
    seen.add(key);
    rows.push({ line, expected: canonical.id, name, category: canonical.category, synthetic: true });
  }
}

const outPath = path.join(process.cwd(), 'scripts/bls_variants.jsonl');
fs.writeFileSync(outPath, rows.map(r => JSON.stringify(r)).join('\n') + '\n');

const sample = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 40)) === 0).slice(0, 40);
fs.writeFileSync(path.join(process.cwd(), 'scripts/bls_variants_sample.md'),
  `# BLS-wide synthetic variants (sample of ${rows.length})\n\n` +
  `Generated by scripts/generate-bls-variants.ts. Training data only - see header for what\n` +
  `this can and cannot teach.\n\n` +
  '| Synthetic receipt-line variant | Correct match (food ID) |\n| --- | --- |\n' +
  sample.map(r => `| "${r.line}" | ${r.expected} (${r.name.split(/[,/]/)[0]}) |`).join('\n') + '\n');

console.log(`pool:                ${pool.length} foods${CATEGORY ? ` (category=${CATEGORY})` : ''}`);
console.log(`head-word groups:    ${groups.size}   (${contested} contested, one canonical elected each)`);
console.log(`anchors used:        ${groups.size}`);
console.log(`variants written:    ${rows.length}`);
console.log(`\n-> scripts/bls_variants.jsonl`);
console.log(`-> scripts/bls_variants_sample.md`);
