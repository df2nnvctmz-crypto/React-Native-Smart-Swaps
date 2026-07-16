import fs from 'fs';
import { parseReceiptLine, normalize } from '../app/engine/receiptParser';
import { FoodItem } from '../app/types';

const foodsData = require('../foods.json') as FoodItem[];

const testLines = [
  "BistroFlammk.Elsa.2ST530g",
  "M.I.Mozz.Miniku.Clas.125g VLOG",
  "GL Proteinjogh.sort.200g",
  "Grop.Proteinpudding sort. 200g",
  "Gran.Pr.pu.Gr. sort. 500g",
  "M.I. Mozzarella oGt 125g",
  "FO Waffeleier ZB 250g"
];

console.log('--- TEST RUN ---');
for (const line of testLines) {
  const result = parseReceiptLine(line, foodsData);
  if (result && result.matchedFood) {
    console.log(`"${line}"`);
    console.log(`  -> Matched: [${result.matchedFood.id}] ${result.matchedFood.name} (Conf: ${result.confidence.toFixed(3)})`);
    if (result.matchedFood.name_de) console.log(`  -> Matched DE: ${result.matchedFood.name_de}`);
  } else {
    console.log(`"${line}"`);
    console.log(`  -> Matched: None`);
  }
}
