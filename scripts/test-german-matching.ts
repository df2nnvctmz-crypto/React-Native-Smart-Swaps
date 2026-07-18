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
  "FO Waffeleier ZB 250g",
  "NIPizz Speciale 2ST690g",
  "NIPizz Diavola 2ST700g",
  "NI Pas egericht sort. 750g",
  "Satori GW Pfann.sort. 750g",
  "Seagold 15 Fischstaebchen 450g",
  "AS Mozzarella Sticks m.Dip 250g",
  "GL Sandwich Gouda 2.59 B",
  "Clarky Erdnuesse sort. 200g",
  "N. I. Tomaten gehackt 400g",
  "ff Spezialit.sort. ab 75g",
  "Bio BB Apfelsaft 1L PK",
  "BioBio Sojadr. Natur 1L",
  "N.I. Pirnig.Reggiano 200g",
  "Sawy.Instantn.Carbonara 130g",
  "N.I. Tomatenmark 200g",
  "Markenbutter sauer 250g",
  "GW Kräuterbutterbaguette 175g",
  "vehapp Sojag. Natur 500g",
  "GL Skyr Natur 500g",
  "Gran.P .pu.Gr. sort. 500g",
  "GL Naturjogh. 3,5% 500g",
  "AS Sandwich Weizen 750g",
  "N.I. Mozzarella leicht 125g",
  "N.I. Mozzarella oel 125g",
  "GL Speisequark mager 500g",
  "GL Fruchtjog. sort. 3,8% 200g",
  "Clarky Chips sort. 200g",
  "VL Eier BH 10ST",
  "Suppengemuese 500g",
  "Fleischtomaten",
  "Apfel Pink Lady 1 kg",
  "Banane Chiquita Lose",
  "Avocado vorgereift ST",
  "Hackfleisch gemischt 500g",
  "Bierschinken 150g",
  "Edelsalami 150g",
  "4,38 B",
  "4.47 B",
  "3,99 B",
  "-K-U-N-D-E-N-B-E-L-E-G-",
  "-K-U-K O-E-N-3-E-L-E-6",
  "Rum 80 % vol",
  "Rum 37.5/40 % vol"
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
