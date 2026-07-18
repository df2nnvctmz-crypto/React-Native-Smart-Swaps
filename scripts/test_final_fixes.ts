import * as fs from 'fs';
import * as path from 'path';
import { parseReceiptLine } from '../app/engine/receiptParser';
import { buildFoodIndex } from '../app/useFoods';
import { FoodItem } from '../app/types';

const foodsPath = path.join(process.cwd(), 'foods.json');
const allFoods = JSON.parse(fs.readFileSync(foodsPath, 'utf-8')) as FoodItem[];

const t0 = performance.now();
const indexData = buildFoodIndex(allFoods);
const t1 = performance.now();

const TESTS = [
  "GL SanduSHB GOuda o6t2009 2,59 B",
  "NII izzaSpeciale2ST6909 3,59 B",
  "KN 6er Braetchen 3009 0,69 B",
  "AS Nozz.Sticks .Dip 2509 4,58 B",
  "Clirkys Erdnuesse sort.2009 2,58 B",
  "B0 Dinkelvoilkornbrot 5009 1,99 B",
  "Bananen Lose 0,89 B",
  "Edelsalami 150g 1,79 B",
  "Apfel Pink Lady Lose 2,07 B",
  "M... Mozzarella oGt 125g 1,38 B",
  "M...Grana/Para sort.ab125y 2,89 B",
  "NIPizzaSpeciale2ST690g 3,59 B",
  "KW 6er Broetchen 3009 0,69 B",
  "Grip.Proteinpudding sort. 200g 1,98 B",
  "Sp nat-Ricotta-Tortel loni400g 1,89 B",
  "Bai il.Pestu surt.ab 190g 1,99 B"
];

let matchCount = 0;
const t2 = performance.now();
for (const line of TESTS) {
  const result = parseReceiptLine(line, allFoods, indexData);
  if (result) {
    matchCount++;
    console.log(`\nOCR: ${line}`);
    console.log(`Match: ${result.matchedFood?.name_de || result.matchedFood?.name}`);
    console.log(`Confidence: ${result.confidence.toFixed(3)}`);
  } else {
    console.log(`\nOCR: ${line} -> No match found`);
  }
}
const t3 = performance.now();

console.log(`\n--- PERFORMANCE ---`);
console.log(`Index build time: ${(t1 - t0).toFixed(0)}ms`);
console.log(`Parse time for ${TESTS.length} lines: ${(t3 - t2).toFixed(0)}ms`);
