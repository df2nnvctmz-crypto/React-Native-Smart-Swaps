import * as fs from 'fs';
import * as path from 'path';
import { parseReceiptLine } from '../app/engine/receiptParser';
import { buildFoodIndex } from '../app/useFoods';
import { FoodItem } from '../app/types';

const foodsPath = path.join(process.cwd(), 'foods.json');
const allFoods = JSON.parse(fs.readFileSync(foodsPath, 'utf-8')) as FoodItem[];
const indexData = buildFoodIndex(allFoods);

const TESTS = [
  "Bananen Lose 0,89 B",
  "Edelsalami 150g 1,79 B",
  "Apfel Pink Lady Lose 2,07 B",
  "M... Mozzarella oGt 125g 1,38 B",
  "M...Grana/Para sort.ab125y 2,89 B",
  "NIPizzaSpeciale2ST690g 3,59 B",
  "KW 6er Broetchen 3009 0,69 B"
];

for (const line of TESTS) {
  const result = parseReceiptLine(line, allFoods, indexData);
  if (result) {
    console.log(`\nOCR: ${line}`);
    console.log(`Match: ${result.matchedFood?.name_de || result.matchedFood?.name}`);
    console.log(`Confidence: ${result.confidence.toFixed(3)}`);
  } else {
    console.log(`\nOCR: ${line} -> No match found`);
  }
}
