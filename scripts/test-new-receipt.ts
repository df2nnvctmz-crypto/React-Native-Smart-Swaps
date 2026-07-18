import * as fs from 'fs';
import * as path from 'path';
import { parseReceiptLine } from '../app/engine/receiptParser';
import { FoodItem } from '../app/types';

const foodsPath = path.join(process.cwd(), 'foods.json');
const allFoods = JSON.parse(fs.readFileSync(foodsPath, 'utf-8')) as FoodItem[];

const ocrText = [
  "Netto",
  "Marken-Discount",
  "10247 Berlin, Frankfurter Allee 57-59",
  "WWW.NETTO-ONLINE.DE",
  "EUR",
  "2 x 1.29",
  "Clarkys Erdnuesse sort.200g 2.58 B",
  "AS Mozz.Sticks m.Dip 250g 1.79 B",
  "GL SandwSHB Gouda oGt200g 2.59 B",
  "Trad.Pfann.sort.600g 2.99 B",
  "NIPizzaSpeciale2ST690g 3.59 B",
  "NI Pizza Edelsal.3ST1050g 3.99 B",
  "Spinat-Ricotta-Tortelloni400g 1.89 B",
  "GW SchnelleKuechesort.600g 2.99 B",
  "GW SchnelleKuechesort.600g 2.99 B",
  "Baril.Pesto sort.ab 190g 1.99 B",
  "Baril.Pesto sort.ab 190g 1.99 B",
  "Baril.Sauce sort.400g 1.99 B",
  "Baril.Sauce sort.400g 1.99 B",
  "Tom.Blanche-K-St.ca.170g",
  "kg EUR/kg EUR",
  "1.168 x 15.90 2.99 B",
  "NI Gnocchi/Tagl.sort.600g 1.99 B",
  "NI Gnocchi/Tagl.sort.600g 1.99 B",
  "2 x 0.79",
  "Mondo Ital.Fusilli 500g 1.58 B",
  "M...Grana/Parm sort.ab125g 2.89 B",
  "2 x 0.69",
  "M... Mozzarella oGt 125g 1.38 B",
  "5 x 1.59",
  "Gran.Pr.pu.Gr. sort. 500g 7.95 B",
  "Gran.Pr.pu.Gr. sort. 500g 1.59 B",
  "2 x 0.99",
  "Grop.Proteinpudding sort. 200g 1.98 B",
  "Markenbutter sauer 250g 2.39 B",
  "BO Dinkelvollkornbrot 500g 1.99 B",
  "FF Linsenchipssort. 90g 1.99 B",
  "2 x 1.29",
  "AS Sandwich Vollkorn 750g 2.58 B",
  "KW 6er Broetchen 300g 0.69 B",
  "VL Eier BH 10ST 1.99 B",
  "Zitronen 500g VKE 1.00 B",
  "Apfel Pink Lady Lose 2.07 B",
  "1.628 kg x 3.29 EUR/kg",
  "Rispentomaten 1.66 B",
  "1.554 kg x 2.99 EUR/kg",
  "Bananen Lose 0.89 B",
  "1.688 kg x 1.29 EUR/kg",
  "Katenschinkenwuerfel 2x125g 1.99 B",
  "Kochschinken 150g 1.89 B",
  "Edelsalami 150g 1.79 B",
  "Bierschinken 150g 1.19 B",
  "SUMME [45] 81.81",
  "SUMME € 81.81",
  "Kartenzahlung EUR 81.81",
  "-K-U-N-D-E-N-B-E-L-E-G-"
];

console.log('--- NEW RECEIPT TEST RESULTS ---');
for (const tc of ocrText) {
  const result = parseReceiptLine(tc, allFoods);
  if (!result) continue; // Noise filtered out
  
  if (result.matchedFood) {
    const confStr = (result.confidence * 100).toFixed(1) + '%';
    console.log(`[${tc}] -> Match: ${result.matchedFood.name} (${confStr})`);
  } else {
    console.log(`[${tc}] -> Match: NONE (Unverified / Not Found)`);
  }
}
