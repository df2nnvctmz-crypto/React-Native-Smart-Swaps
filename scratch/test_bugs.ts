import { parseReceiptLine } from '../app/engine/receiptParser';
import * as fs from 'fs';
import * as path from 'path';
import { FoodIndexData } from '../app/useFoods';

const foodsPath = path.join(__dirname, '../assets/data/foods.json');
const foods = JSON.parse(fs.readFileSync(foodsPath, 'utf8'));

// Build index exactly like useFoods
const indexData: FoodIndexData = {
  index: new Map(),
  stemIndex: new Map(),
  shingleIndex: new Map(),
  fourGramIndex: new Map(),
  cache: new Map()
};

function normalizeTokens(str: string): string[] {
  return str.toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[\.\-\/]/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t => t.length > 2);
}

for (const food of foods) {
  const nameEn = food.name || '';
  const nameDe = food.name_de || '';
  
  indexData.cache.set(food.id, {
    en: {
      rawStr: nameEn.toLowerCase().replace(/[\.\-\/]/g, ' ').replace(/[^\w\säöüß]/gi, ' ').replace(/\s+/g, ' ').trim(),
      asciiStr: nameEn.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[\.\-\/]/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(),
      tokensRaw: nameEn.toLowerCase().replace(/[\.\-\/]/g, ' ').replace(/[^\w\säöüß]/gi, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter((t: string) => t.length > 2),
      tokensAscii: normalizeTokens(nameEn)
    },
    de: nameDe ? {
      rawStr: nameDe.toLowerCase().replace(/[\.\-\/]/g, ' ').replace(/[^\w\säöüß]/gi, ' ').replace(/\s+/g, ' ').trim(),
      asciiStr: nameDe.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[\.\-\/]/g, ' ').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim(),
      tokensRaw: nameDe.toLowerCase().replace(/[\.\-\/]/g, ' ').replace(/[^\w\säöüß]/gi, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter((t: string) => t.length > 2),
      tokensAscii: normalizeTokens(nameDe)
    } : undefined
  });

  const tokens = new Set<string>();
  if (nameDe) {
    nameDe.toLowerCase().replace(/[\.\-\/]/g, ' ').replace(/[^\w\säöüß]/gi, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter((t: string) => t.length > 2).forEach((t: string) => tokens.add(t));
    normalizeTokens(nameDe).forEach(t => tokens.add(t));
  }
  nameEn.toLowerCase().replace(/[\.\-\/]/g, ' ').replace(/[^\w\säöüß]/gi, ' ').replace(/\s+/g, ' ').trim().split(/\s+/).filter((t: string) => t.length > 2).forEach((t: string) => tokens.add(t));
  normalizeTokens(nameEn).forEach(t => tokens.add(t));

  for (const t of tokens) {
    if (!indexData.index.has(t)) indexData.index.set(t, new Set());
    indexData.index.get(t)!.add(food);

    const stem = t.length > 4 ? t.replace(/(en|e|n|s)$/, '') : t;
    if (stem !== t) {
      if (!indexData.stemIndex!.has(stem)) indexData.stemIndex!.set(stem, new Set());
      indexData.stemIndex!.get(stem)!.add(food);
    }

    if (t.length >= 5) {
      for (let i = 0; i <= t.length - 5; i++) {
        const gram = t.substring(i, i + 5);
        if (!indexData.shingleIndex!.has(gram)) indexData.shingleIndex!.set(gram, new Set());
        indexData.shingleIndex!.get(gram)!.add(t);
      }
    }

    if (t.length >= 4) {
      for (let i = 0; i <= t.length - 4; i++) {
        const gram = t.substring(i, i + 4);
        if (!indexData.fourGramIndex!.has(gram)) indexData.fourGramIndex!.set(gram, new Set());
        indexData.fourGramIndex!.get(gram)!.add(t);
      }
    }
  }
}

const testLines = [
  "Paprika Mix 500g",
  "Ostm. Chiliflocken 45g",
  "Grop.Proteinpudding sort. 200g",
  "Gran.Pr.pu.Gr. sort. 500g",
  "Pringles Original 165g"
];

for (const line of testLines) {
  const parsed = parseReceiptLine(line, foods, indexData);
  console.log('---');
  console.log('Line:', line);
  if (parsed?.matchedFood) {
    console.log('Matched:', parsed.matchedFood.name, '/', parsed.matchedFood.name_de);
    console.log('Confidence:', parsed.confidence);
  } else {
    console.log('Matched: null');
  }
}
