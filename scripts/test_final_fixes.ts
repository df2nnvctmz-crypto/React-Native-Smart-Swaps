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
  "Bat anen Lose 0,89 B",
  "Api el Pink Lady Lose 2,07 B",
  "No do Ital .Fusilli 5009 1,49 B",
  "Kou hschinken 150g 1,89 B",
  "Bananen Lose 0,89 B",
  "Apfel Pink Lady Lose 2,07 B",
  "Clirkys Erdnuesse sort.2009 2,58 B",
  "B0 Dinkelvoilkornbrot 5009 1,99 B",
  "M... Mozzarella oGt 125g 1,38 B",
  "GL SanduSHB GOuda o6t2009 2,59 B",
  "NII izzaSpeciale2ST6909 3,59 B",
  "Bit rschinken 1509 1,19 B",
  "KI Gnocchi/Tagl .sort.6009 1,99 B",
  "Zit ronen 500g VKE 1,00 B"
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
