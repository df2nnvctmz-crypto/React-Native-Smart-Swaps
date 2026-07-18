import * as fs from 'fs';
import * as path from 'path';
import { isLikelyProductLine, parseReceiptLine } from '../app/engine/receiptParser';
import { buildFoodIndex } from '../app/useFoods';
import { FoodItem } from '../app/types';

const foodsPath = path.join(process.cwd(), 'foods.json');
const allFoods = JSON.parse(fs.readFileSync(foodsPath, 'utf-8')) as FoodItem[];
const indexData = buildFoodIndex(allFoods);

const REJECT = [
  "1,168", "EUR/Kg", "SUI NE", "Kai tenzahlung EUR", "1,628 kgx",
  "J-0-EN-B-ELE9-", "Netto", "10247 Berlin, Frankfurter Allee 57-59", "Marken-Disccount",
  "Marken-Discount", "WWW.NETTO-0NL INE.DE", "SUMME 84,81", "Kartenzahlung EUR 84,81",
  "2 x 1,29", "1,02 kg x 2,99 EUR/kg", "K-U-N-D-E-N-B-E-L-E-G"
];

const KEEP = [
  "Clarkys Erdnuesse sort.200g 2.58 B", "AS Mozz.Sticks m.Dip 250g 1.79 B",
  "GL SandwSHB Gouda oGt200g 2.59 B", "NIPizzaSpeciale2ST690g 3.59 B",
  "Markenbutter sauer 250g 2.39 B", "VL Eier BH 10ST 1.99 B", "Bierschinken 150g 1.19 B",
  "Apfel Pink Lady Lose 2.07 B", "Rispentomaten 1.66 B", "Bananen Lose 0.89 B",
  "Kochschinken 150g 1.89 B"
];

let failedFilter = 0;

console.log('--- TEST 1: isLikelyProductLine ---');
for (const line of REJECT) {
  if (isLikelyProductLine(line) !== false) {
    console.error(`FAILED: Expected to reject "${line}", but it was kept.`);
    failedFilter++;
  }
}

for (const line of KEEP) {
  if (isLikelyProductLine(line) !== true) {
    console.error(`FAILED: Expected to keep "${line}", but it was rejected.`);
    failedFilter++;
  }
}

if (failedFilter === 0) {
  console.log("SUCCESS: All 27 filter tests passed.");
} else {
  console.error(`FAILED: ${failedFilter} filter tests failed.`);
  process.exit(1);
}

const SHINGLE_TEST = [
  "Clarkys Erdnuesse sort.200g", "AS Mozz.Sticks m.Dip 250g",
  "GL SandwSHB Gouda oGt200g", "Trad.Pfann.sort.600g", "NIPizzaSpeciale2ST690g",
  "NI Pizza Edelsal.3ST1050g", "Spinat-Ricotta-Tortelloni400g",
  "M...Grana/Parm sort.ab125g", "M... Mozzarella oGt 125g", "Gran.Pr.pu.Gr. sort. 500g",
  "Grop.Proteinpudding sort. 200g", "Markenbutter sauer 250g",
  "BO Dinkelvollkornbrot 500g", "FF Linsenchipssort. 90g", "AS Sandwich Vollkorn 750g",
  "KW 6er Broetchen 300g", "VL Eier BH 10ST", "Zitronen 500g VKE",
  "Apfel Pink Lady Lose", "Rispentomaten", "Bananen Lose",
  "Katenschinkenwuerfel 2x125g", "Kochschinken 150g", "Edelsalami 150g",
  "Bierschinken 150g"
];

let failedShingle = 0;

console.log('\n--- TEST 2: Shingle Index Recall ---');
for (const line of SHINGLE_TEST) {
  // Try passing the exact bare text
  let result = parseReceiptLine(line, allFoods, indexData);
  
  if (result === null) {
     // If it failed because of the product line filter (which requires prices for small strings), append a price
     result = parseReceiptLine(line + " 1.99 B", allFoods, indexData);
  }

  // The fallback returns null now if no candidates found in the shingle index.
  if (result === null) {
     console.error(`FAILED: No candidates found for "${line}" (returned null)`);
     failedShingle++;
  }
}

if (failedShingle > 1) {
  console.error(`FAILED: ${failedShingle} shingle recall tests failed (max 1 allowed).`);
  process.exit(1);
} else {
  console.log(`SUCCESS: Shingle tests passed (${failedShingle} failed, max 1 allowed).`);
  process.exit(0);
}
