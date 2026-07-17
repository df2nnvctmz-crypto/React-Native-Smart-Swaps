import * as fs from 'fs';
import * as path from 'path';
import { parseReceiptLine } from '../app/engine/receiptParser';
import { FoodItem } from '../app/types';

const foodsPath = path.join(process.cwd(), 'foods.json');
const allFoods = JSON.parse(fs.readFileSync(foodsPath, 'utf-8')) as FoodItem[];

const testCases = [
  "BistroFlammk.Elsa.2ST530g",
  "M.I.Mozz.Miniku.Clas.125g VLOG",
  "GL Proteinjogh.sort.200g",
  "Grop.Proteinpudding sort. 200g",
  "Gran.Pr.pu.Gr. sort. 500g",
  "M.I. Mozzarella oGt 125g",
  "FO Waffeleier ZB 250g"
];

console.log('--- TEST RESULTS ---');
for (const tc of testCases) {
  const result = parseReceiptLine(tc, allFoods);
  if (result && result.matchedFood) {
    const confStr = (result.confidence * 100).toFixed(1) + '%';
    console.log(`[${tc}]`);
    console.log(`  -> Match: ${result.matchedFood.name} / ${result.matchedFood.name_de} (${confStr})`);
  } else {
    console.log(`[${tc}]`);
    console.log(`  -> Match: NONE`);
  }
}
