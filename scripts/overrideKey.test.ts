/**
 * Unit checks for the override-cache key normalizer.
 *   npx tsx scripts/overrideKey.test.ts
 *
 * The two properties that matter:
 *   - same product at different size/price -> SAME key (so a correction generalizes)
 *   - different flavour/variety            -> DIFFERENT key (so it doesn't over-collapse)
 */

import { normalizeOverrideKey } from '../app/engine/overrideKey';

let failures = 0;
const k = normalizeOverrideKey;

function eq(a: string, b: string, msg: string) {
  const ka = k(a), kb = k(b);
  if (ka === kb) {
    console.log(`PASS  same: "${a}" == "${b}"  -> "${ka}"`);
  } else {
    failures++;
    console.log(`FAIL  should match: "${a}" ("${ka}") != "${b}" ("${kb}")  [${msg}]`);
  }
}

function ne(a: string, b: string, msg: string) {
  const ka = k(a), kb = k(b);
  if (ka !== kb) {
    console.log(`PASS  distinct: "${a}" ("${ka}") != "${b}" ("${kb}")`);
  } else {
    failures++;
    console.log(`FAIL  should differ but collapsed: "${a}" & "${b}" -> "${ka}"  [${msg}]`);
  }
}

// Size / price / unit / tax-letter must not affect the key.
eq('Zeus Feta 200g', 'Zeus Feta 400g', 'pack size');
eq('GL Sahne 30% 200g VLOG', 'GL Sahne 30% 500g VLOG', 'pack size with percentage kept');
eq('Bananen Lose 0.89 B', 'Bananen Lose 1.29 B', 'price + tax letter');
eq('Mon.Ital.Pesto sort.190g', 'Mon.Ital.Pesto sort.190g 0,99 B', 'trailing price/tax');
eq('KW 6er Broetchen 300g', 'KW Broetchen', 'count prefix');

// Distinct flavours / varieties MUST stay distinct.
ne('GL Skyr Frucht sort.500g', 'SKR VANILLE', 'fruit vs vanilla skyr');
ne('Skyr Frucht', 'Skyr Vanille', 'flavour words carry identity');
ne('Gemuesepaprika rot', 'Gemuesepaprika gruen', 'colour variety');
ne('Apfelsaft', 'Orangensaft', 'different juice');

// Percentages that distinguish products must survive.
ne('GL Sahne 10% 200g', 'GL Sahne 30% 200g', 'fat percentage is identity here');

console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
process.exit(failures === 0 ? 0 : 1);
