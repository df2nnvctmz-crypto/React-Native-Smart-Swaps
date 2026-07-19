/**
 * Offline checks for the OFF -> BLS bridge and the enrich pass.
 *   npx tsx scripts/offBridge.test.ts
 *
 * Uses canned OFF responses (no network) so the mapping logic is tested deterministically.
 * Network behaviour of the client itself (timeout, offline -> null) is not exercised here.
 */

// Stub AsyncStorage before importing anything that pulls it in transitively.
const AsyncStorageMock: any = { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} };
AsyncStorageMock.default = AsyncStorageMock;
import Module from 'module';
const origLoad = (Module as any)._load;
(Module as any)._load = function (req: string, ...rest: any[]) {
  if (req === '@react-native-async-storage/async-storage') return AsyncStorageMock;
  return origLoad.call(this, req, ...rest);
};

import * as fs from 'fs';
import * as path from 'path';

(async () => {
  const { bridgeOffToBls, enrichWithOff } = await import('../app/engine/resolveProduct');
  const { buildFoodIndex } = await import('../app/engine/foodIndex');
  const foods = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'foods.json'), 'utf-8'));
  const deps = { allFoods: foods, foodIndexData: buildFoodIndex(foods) };

  let failures = 0;
  const check = (name: string, cond: boolean, detail = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
    if (!cond) failures++;
  };

  // 1. Pringles: OFF category -> Kartoffelchips
  const pringles = {
    productName: 'Pringles Original',
    categoriesTags: ['en:snacks', 'en:salty-snacks', 'en:crisps', 'en:potato-crisps'],
  } as any;
  const bridged = bridgeOffToBls(pringles, deps);
  check('Pringles bridges to a BLS food', !!bridged, 'got null');
  check('  -> resolves to Kartoffelchips (bls0327)', bridged?.matchedFood?.id === 'bls0327', bridged?.matchedFood?.id ?? 'none');
  check('  -> marked source=off', bridged?.source === 'off');
  check('  -> keeps OFF product name', bridged?.displayName === 'Pringles Original');

  // 2. A product with no BLS analogue must NOT be forced onto a wrong row.
  const obscure = { productName: 'Weird Energy Gel', categoriesTags: ['en:dietary-supplements', 'en:sports-nutrition'] } as any;
  const noBridge = bridgeOffToBls(obscure, deps);
  check('No-analogue product returns null (no forced match)', noBridge === null, JSON.stringify(noBridge?.matchedFood?.name));

  // 3. enrichWithOff upgrades only the weak line, leaves good ones untouched, and never
  //    calls OFF for a strong match.
  const items = [
    { rawText: 'Zeus Feta 200g', matchedFood: foods.find((f: any) => f.id === 'bls0090'), confidence: 0.95, source: 'bls' as const },
    { rawText: 'Pringles Original 165g', matchedFood: foods.find((f: any) => f.id === 'bls0327'), confidence: 0.36, source: 'bls' as const },
    { rawText: 'Corrected Item', matchedFood: foods.find((f: any) => f.id === 'bls0001'), confidence: 1.0, source: 'override' as const },
  ];
  let lookupCalls = 0;
  const fakeLookup = async (q: string) => {
    lookupCalls++;
    // enrichWithOff cleans the query (lowercase, sizes stripped) before calling lookup.
    if (q.toLowerCase().includes('pringles')) return pringles as any;
    return null;
  };
  const enriched = await enrichWithOff(items as any, deps, true, { lookup: fakeLookup as any });
  check('enrich only queried OFF for the weak line', lookupCalls === 1, `called ${lookupCalls}x`);
  check('strong BLS line untouched', enriched[0].source === 'bls' && enriched[0].matchedFood?.id === 'bls0090');
  check('weak line upgraded via OFF', enriched[1].source === 'off' && enriched[1].matchedFood?.id === 'bls0327');
  check('weak line kept its raw OCR text', enriched[1].rawText === 'Pringles Original 165g');
  check('override line never touched by OFF', enriched[2].source === 'override');

  // 4. The gate itself: enabled=false must make zero network calls and return items untouched.
  lookupCalls = 0;
  const gatedOff = await enrichWithOff(items as any, deps, false, { lookup: fakeLookup as any });
  check('disabled: zero OFF calls', lookupCalls === 0, `called ${lookupCalls}x`);
  check('disabled: items returned unchanged (same weak bls source)', gatedOff[1].source === 'bls' && gatedOff[1].confidence === 0.36);
  check('disabled: returns the identical array reference', gatedOff === (items as any));

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
