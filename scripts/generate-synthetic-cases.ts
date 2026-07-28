/**
 * Generates synthetic receipt-line variants for BLS ids that are already VERIFIED in
 * ground_truth.json, for use as training/regression data.
 *
 * IMPORTANT - what this data is and is not:
 *   - It IS useful for augmenting a training set and as regression fixtures.
 *   - It is NOT valid for measuring accuracy. The variants are produced by rules, so a
 *     matcher tuned on those same rules will score well on them regardless of whether it
 *     works on real receipts. Keep scoring on ground_truth.json / baseline.cases.ts.
 *
 * Every transformation applied here was observed in the real 110-line corpus (brand
 * prefixes, dot-truncation, glued pack sizes, umlaut folding, ALL CAPS, tax-class letter),
 * rather than invented, so the synthetic noise distribution stays close to the real one.
 *
 *   npx tsx scripts/generate-synthetic-cases.ts [variantsPerAnchor]
 *
 * Writes scripts/synthetic_cases.json and scripts/synthetic_cases.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { FoodItem } from '../app/types';
import { BASELINE_CASES } from './baseline.cases';
import { REGRESSION_CASES } from './regression.cases';

const PER_ANCHOR = Number(process.argv[2] ?? 26);

interface GroundTruthRow { raw_line: string; correct_id: string | null; }
interface Labeled { line: string; id: string; origin: string; }

const foods = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'foods.json'), 'utf-8')) as FoodItem[];
const gt = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'scripts/ground_truth.json'), 'utf-8')
) as GroundTruthRow[];
const byId = new Map(foods.map(f => [f.id, f]));

/**
 * Anchors are drawn from every labeled corpus in the repo, not just the receipt one.
 * ground_truth.json carries real OCR noise but only covers 61 foods; baseline.cases.ts and
 * regression.cases.ts are curated product names (no receipt noise) but cover 72 further ids.
 *
 * The split matters: the FOOD coverage comes from all three, while the NOISE profile still
 * comes only from the real receipt lines, since that is the only place real OCR damage is
 * recorded. Widening anchors therefore widens what the set teaches about foods, not about
 * how receipts mangle text.
 */
const LABELED: Labeled[] = [
  ...gt.filter(r => r.correct_id).map(r => ({ line: r.raw_line, id: r.correct_id!, origin: 'ground_truth' })),
  ...BASELINE_CASES.filter(c => c.expected).map(c => ({ line: c.line, id: c.expected as string, origin: 'baseline' })),
  ...REGRESSION_CASES.filter(c => c.expected).map(c => ({ line: c.line, id: c.expected as string, origin: 'regression' })),
];

// ---- noise vocabulary, all of it lifted from the real corpus -------------------------
const BRAND_PREFIXES = ['GL', 'M.I.', 'Bio BB', 'VL', 'Grop.', 'Cl.', 'NI', 'AS', 'GW',
  'JA!', 'Liebl.', 'Mondo', 'Zeus', 'BE', 'Frei.Land', 'Gut&Guenstig', 'REWE', 'Ja!'];
const CERTS = ['Bio', 'oGt', 'VLOG', 'QS', 'BIO'];
const SIZES = ['250g', '500g', '400g', '200g', '1kg', '125g', '750g', '150g', '300g'];
const COUNTS = ['6ST', '10ST', '4ST', '2ST', '6er'];
const VOLUMES = ['1L', '500ml', '250ml', '1,5L'];
const TAX = ['A', 'B'];
const FILLERS = ['sort.', 'lose', 'natur', 'frisch', 'Classic'];

const QUANT = /^\d+([.,]\d+)?(g|kg|mg|ml|cl|l|st|stk|er)?$/i;

/**
 * Words that occur inside BLS names but describe a property, not the food. Harvesting them
 * as product terms produced rows like "Bio gemischt 6ST" labelled minced meat - the word
 * passes the lexical-relatedness test (it really is in the BLS name) while carrying none of
 * the product identity.
 */
const MODIFIERS = new Set([
  'roh', 'gekocht', 'gebraten', 'gebacken', 'gedünstet', 'gegart', 'gegrillt', 'frittiert',
  'geräuchert', 'gesäuert', 'paniert', 'getrocknet', 'geröstet', 'gemischt', 'gemahlen',
  'gesalzen', 'gesüßt', 'ungesüßt', 'ungefüllt', 'entrahmt', 'poliert', 'passiert',
  'mild', 'fein', 'ganz', 'frisch', 'natur', 'extra', 'süß', 'sauer', 'mager', 'fettarm',
  'türkische', 'türkisch', 'italienische', 'griechische', 'diverse', 'sorten', 'einfach',
  'klassisch', 'original', 'pasteurisiert', 'abgetropft', 'konserve', 'tiefgefroren',
]);
const NOISE = new Set([...BRAND_PREFIXES, ...CERTS, ...FILLERS, ...TAX]
  .map(s => s.toLowerCase().replace(/[.!]/g, '')));

const foldUmlaut = (s: string) =>
  s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
   .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue');

const pick = <T,>(arr: T[], i: number): T => arr[i % arr.length];

/**
 * Product words for an anchor: the BLS head word plus content words from real lines.
 *
 * A word lifted from a real line is only kept if it is lexically related to the BLS entry
 * it is being labelled with. Without that guard the harvester picks up modifiers as if
 * they were the product: the line "PAPRIKA ORANGE" yielded "ORANGE", which then produced
 * rows like "Bio ORANGE 250g" labelled Gemüsepaprika - wrong labels, and exactly the kind
 * of silent poison a training set must not contain.
 */
function coreTerms(id: string): string[] {
  const out = new Set<string>();
  const name = foldUmlaut(byId.get(id)?.name_de ?? '').toLowerCase();
  // Take the most specific content word, not the first. BLS names like "Schwein Hackfleisch,
  // roh" lead with the animal, but the product is the compound: "Schwein 750g" would be a
  // label claiming any cut of pork is mince. The longest surviving word is reliably the
  // compound head in this naming scheme ("Hackfleisch", "Hühnerei", "Lahmacun").
  // Parenthetical text is a qualifier (a filling, a preparation), never the product, and it
  // is dropped before choosing a head. Hyphens split rather than collapse: without that,
  // "(Ricotta-Spinat-Füllung)" welded into "RicottaSpinatFüllung" - the longest "word" in
  // the entry, so it won the head contest and produced 24 rows no receipt would ever print.
  const head = (byId.get(id)?.name_de ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .split(/[\s,/()\-]+/)
    .map(w => w.replace(/[^\wäöüßÄÖÜ]/g, ''))
    .filter(w => w.length >= 5 && !MODIFIERS.has(w.toLowerCase()) && !/\d/.test(w))
    .filter(w => !/(füllung|fuellung|zubereitung|sauce|soße)$/i.test(w))
    .sort((a, b) => b.length - a.length)[0];
  if (head) out.add(head);

  const nameWords = name.split(/[^a-z]+/).filter(w => w.length >= 4);
  const related = (term: string) => {
    const t = foldUmlaut(term).toLowerCase();
    return nameWords.some(w => {
      const stem = w.slice(0, Math.min(6, w.length));
      const tStem = t.slice(0, Math.min(6, t.length));
      return t.includes(stem) || w.includes(tStem);
    });
  };

  for (const row of LABELED) {
    if (row.id !== id) continue;
    for (const tok of row.line.split(/\s+/)) {
      const t = tok.replace(/[^\wäöüßÄÖÜ.]/g, '');
      const bare = t.replace(/\.$/, '');
      if (bare.length < 5) continue;
      if (QUANT.test(bare) || NOISE.has(bare.toLowerCase())) continue;
      if (/\d/.test(bare)) continue;
      if (MODIFIERS.has(bare.toLowerCase())) continue;
      if (!related(bare)) continue;
      out.add(bare);
    }
  }
  return [...out];
}

// A truncated stem is only safe if it can't also be read as a different anchor's product.
const anchorIds = [...new Set(LABELED.map(r => r.id))];
const termOwners = new Map<string, Set<string>>();
for (const id of anchorIds) {
  for (const term of coreTerms(id)) {
    const k = term.toLowerCase().slice(0, 4);
    if (!termOwners.has(k)) termOwners.set(k, new Set());
    termOwners.get(k)!.add(id);
  }
}
const isAmbiguous = (term: string, id: string) => {
  const owners = termOwners.get(term.toLowerCase().slice(0, 4));
  return !!owners && owners.size > 1 && !(owners.size === 1 && owners.has(id));
};

interface Case { line: string; id: string; }
const cases: Case[] = [];
const seen = new Set<string>();
const push = (line: string, id: string) => {
  const clean = line.replace(/\s+/g, ' ').trim();
  const key = clean.toLowerCase();
  if (!clean || seen.has(key)) return;
  seen.add(key);
  cases.push({ line: clean, id });
};

for (const id of anchorIds) {
  const terms = coreTerms(id).filter(t => !isAmbiguous(t, id));
  if (terms.length === 0) continue;
  const isCountable = /\b(Ei|Eier|Hühnerei)\b/i.test(byId.get(id)?.name_de ?? '');
  const isLiquid = /milch|drink|saft|öl|oel/i.test(byId.get(id)?.name_de ?? '');
  const units = isCountable ? COUNTS : isLiquid ? VOLUMES : SIZES;

  for (let i = 0; i < PER_ANCHOR; i++) {
    const term = pick(terms, i);
    const size = pick(units, i);
    const brand = pick(BRAND_PREFIXES, i);
    const cert = pick(CERTS, i);
    const filler = pick(FILLERS, i);
    // dot-truncation, as receipts do: keep >=4 chars so the word stays readable
    const trunc = term.length > 6 ? term.slice(0, Math.max(4, term.length - 3)) + '.' : term;

    switch (i % 13) {
      case 0:  push(`${term} ${size}`, id); break;
      case 1:  push(`${brand} ${term} ${size}`, id); break;
      case 2:  push(`${cert} ${term} ${size}`, id); break;
      case 3:  push(`${term}${size}`, id); break;                       // glued pack size
      case 4:  push(`${trunc}${size}`, id); break;
      case 5:  push(foldUmlaut(`${brand} ${term} ${size}`), id); break;
      case 6:  push(foldUmlaut(term).toUpperCase(), id); break;
      case 7:  push(`${term.toUpperCase()} ${size.toUpperCase()}`, id); break;
      case 8:  push(`${brand} ${trunc}${filler}${size}`, id); break;
      case 9:  push(`${term} ${filler} ${size} ${pick(TAX, i)}`, id); break;
      case 10: push(`${cert} ${brand} ${term} ${size}`, id); break;
      case 11: push(foldUmlaut(`${trunc} ${size}`), id); break;
      case 12: push(`${term}`, id); break;                              // bare, no packaging
    }
  }
}

cases.sort((a, b) => (a.id === b.id ? a.line.localeCompare(b.line) : a.id.localeCompare(b.id)));

fs.writeFileSync(
  path.join(process.cwd(), 'scripts/synthetic_cases.json'),
  JSON.stringify(cases.map(c => ({
    line: c.line, expected: c.id, name: byId.get(c.id)?.name_de ?? '', synthetic: true,
  })), null, 2)
);

const md = [
  '| Synthetic receipt-line variant | Correct match (food ID) |',
  '| --- | --- |',
  ...cases.map(c => `| "${c.line}" | ${c.id} (${(byId.get(c.id)?.name_de ?? '').split(/[,/]/)[0]}) |`),
].join('\n');
fs.writeFileSync(path.join(process.cwd(), 'scripts/synthetic_cases.md'),
  `# Synthetic receipt-line variants\n\nGenerated by scripts/generate-synthetic-cases.ts. ` +
  `Training/regression data only - not valid for measuring accuracy (see header comment).\n\n${md}\n`);

console.log(`anchors used:      ${anchorIds.length}`);
console.log(`variants written:  ${cases.length}`);
console.log(`ids covered:       ${new Set(cases.map(c => c.id)).size}`);
console.log(`\n-> scripts/synthetic_cases.json`);
console.log(`-> scripts/synthetic_cases.md`);
