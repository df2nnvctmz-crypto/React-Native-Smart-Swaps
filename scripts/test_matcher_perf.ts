import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { parseReceipt } from '../app/engine/receiptParser';
import { normalize, asciiFold } from '../app/engine/receiptParser';
import { FoodItem } from '../app/types';
import { FoodIndexData, FoodTokensCache } from '../app/useFoods';

const foodsData = require('../foods.json') as FoodItem[];

// Build Index (as done in useFoods at startup)
const buildIndex = (): FoodIndexData => {
  const index = new Map<string, Set<FoodItem>>();
  const cache = new Map<string, { de?: FoodTokensCache, en: FoodTokensCache }>();

  for (const food of foodsData) {
    const foodCache: { de?: FoodTokensCache, en: FoodTokensCache } = {
      en: {
        rawStr: normalize(food.name),
        asciiStr: asciiFold(food.name),
        tokensRaw: normalize(food.name).split(/\s+/).filter(t => t.length > 2),
        tokensAscii: asciiFold(food.name).split(/\s+/).filter(t => t.length > 2)
      }
    };

    if (food.name_de) {
      foodCache.de = {
        rawStr: normalize(food.name_de),
        asciiStr: asciiFold(food.name_de),
        tokensRaw: normalize(food.name_de).split(/\s+/).filter(t => t.length > 2),
        tokensAscii: asciiFold(food.name_de).split(/\s+/).filter(t => t.length > 2)
      };
    }

    cache.set(food.id, foodCache);

    const allTokens = new Set<string>();
    if (foodCache.de) {
      foodCache.de.tokensRaw.forEach(t => allTokens.add(t));
      foodCache.de.tokensAscii.forEach(t => allTokens.add(t));
    }
    foodCache.en.tokensRaw.forEach(t => allTokens.add(t));
    foodCache.en.tokensAscii.forEach(t => allTokens.add(t));

    allTokens.forEach(token => {
      if (!index.has(token)) {
        index.set(token, new Set());
      }
      index.get(token)!.add(food);
    });
  }

  return { index, cache };
};

const runPerfTest = () => {
  console.log('Building index...');
  const t0_index = performance.now();
  const indexData = buildIndex();
  const t1_index = performance.now();
  console.log(`Index build time: ${(t1_index - t0_index).toFixed(2)}ms`);

  const sampleReceiptLines = [
    "BistroFlammk.Elsa.2ST530g    3,69  B",
    "M.I.Mozz.Miniku.Clas.125g VLOG    1,29  B",
    "GL Proteinjogh.sort.200g    0,99  B",
    "2 x        0,89",
    "Grop.Proteinpudding sort. 200g    1,78  B",
    "4 x        1,59",
    "Gran.Pr.pu.Gr. sort. 500g    6,36  B",
    "M.I. Mozzarella oGt 125g    0,85  B",
    "FO Waffeleier ZB 250g    1,49  B",
    "SUMME        17,04",
    "BAR        20,00",
    "RUECKGELD        2,96"
  ];

  console.log('\nRunning Legacy Linear Scan (No Index)...');
  const t0_legacy = performance.now();
  const legacyResults = parseReceipt(sampleReceiptLines, foodsData); // indexData omitted intentionally
  const t1_legacy = performance.now();
  console.log(`Legacy Time: ${(t1_legacy - t0_legacy).toFixed(2)}ms`);

  console.log('\nRunning Indexed & Optimized Scan...');
  const t0_indexed = performance.now();
  const indexedResults = parseReceipt(sampleReceiptLines, foodsData, indexData);
  const t1_indexed = performance.now();
  console.log(`Indexed Time: ${(t1_indexed - t0_indexed).toFixed(2)}ms`);

  console.log(`\nSpeedup Factor: ${((t1_legacy - t0_legacy) / (t1_indexed - t0_indexed)).toFixed(2)}x`);
};

runPerfTest();
