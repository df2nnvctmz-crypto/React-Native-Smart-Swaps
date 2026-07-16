import { parseReceipt } from '../app/engine/receiptParser';
import * as fs from 'fs';
import * as path from 'path';
import { FoodItem } from '../app/types';

const foodsPath = path.join(__dirname, '../foods.json');
const foodsData = JSON.parse(fs.readFileSync(foodsPath, 'utf8')) as FoodItem[];

const testLines = [
  "BistroFlammk.Elsa.2ST530g    3,69  B",
  "M.I.Mozz.Miniku.Clas.125g VLOG    1,29  B",
  "GL Proteinjogh.sort.200g    0,99  B",
  "2 x        0,89",
  "Grop.Proteinpudding sort. 200g    1,78  B",
  "4 x        1,59",
  "Gran.Pr.pu.Gr. sort. 500g    6,36  B",
  "M.I. Mozzarella oGt 125g    0,85  B",
  "FO Waffeleier ZB 250g    1,49  B",
  "GRATIS                   -1,49",
  "SUMME [12]               15,95"
];

console.log("Testing Receipt Parser...");
const results = parseReceipt(testLines, foodsData);

let count = 0;
for (const res of results) {
  count++;
  console.log(`\n--- Item ${count} ---`);
  console.log(`Raw OCR: "${res.rawText}"`);
  if (res.matchedFood) {
    const food = res.matchedFood;
    console.log(`Matched: [${food.id}] ${food.name_de || food.name}`);
    console.log(`Conf: ${res.confidence.toFixed(3)}`);
  } else {
    console.log(`Matched: None (Conf: 0)`);
  }
}
