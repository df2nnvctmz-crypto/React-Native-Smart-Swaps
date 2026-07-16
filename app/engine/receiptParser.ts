import { FoodItem } from '../types';

export interface ParsedReceiptItem {
  rawText: string;
  matchedFood: FoodItem | null;
  confidence: number;
}

const normalize = (text: string) => text.toLowerCase().replace(/[^\w\säöüß]/gi, '').trim();

const asciiFold = (text: string) => {
  return text.toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^\w\s]/g, '')
    .trim();
};
function levenshtein(a: string, b: string): number {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = new Array<number[]>(bn + 1);
  for (let i = 0; i <= bn; ++i) {
    let row = matrix[i] = new Array<number>(an + 1);
    row[0] = i;
  }
  const firstRow = matrix[0];
  for (let j = 1; j <= an; ++j) {
    firstRow[j] = j;
  }
  for (let i = 1; i <= bn; ++i) {
    for (let j = 1; j <= an; ++j) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }
  return matrix[bn][an];
}

function stripNoise(text: string): string {
  let cleaned = text.toLowerCase();
  
  // Remove German decimal prices: "1,99 B", quantities "2 x 0,89"
  cleaned = cleaned.replace(/\b\d+,\d{2}\b/g, ' ');
  // English prices
  cleaned = cleaned.replace(/\b\d+\.\d{2}\b/g, ' ');
  // Weights/volumes e.g., 500g, 1.5kg, 500,00g, 250g
  cleaned = cleaned.replace(/\b\d+([.,]\d+)?\s*(g|kg|ml|l|oz|lb)\b/gi, ' ');
  // Quantities e.g., 1x, 2 x, 2ST
  cleaned = cleaned.replace(/\b\d+\s*(x|st|stk)\b/gi, ' ');
  // German unit abbreviations
  cleaned = cleaned.replace(/\b(stk|st|pck|pkg|bd|pack|btl)\b/gi, ' ');
  // Receipt qualifiers
  cleaned = cleaned.replace(/\b(tk|h-milch|frischmilch|ger|gem|vlog|ogt|zb|sort)\b/gi, ' ');
  // Tax letters (A, B) at end of line
  cleaned = cleaned.replace(/\s\b[a-c]\b$/i, ' ');
  
  return cleaned;
}

function matchFoodToOcrText(ocrText: string, allFoods: FoodItem[]): { food: FoodItem, confidence: number } | null {
  const cleanedOcr = stripNoise(ocrText);
  const ocrTokensRaw = normalize(cleanedOcr).split(/\s+/).filter(t => t.length > 2);
  const ocrTokensAscii = asciiFold(cleanedOcr).split(/\s+/).filter(t => t.length > 2);
  
  if (ocrTokensRaw.length === 0 && ocrTokensAscii.length === 0) return null;

  let bestMatch: FoodItem | null = null;
  let maxScore = 0;

  for (const food of allFoods) {
    // Check DE name first, fallback to EN name
    const namesToTest = [];
    if (food.name_de) {
      namesToTest.push({
        rawStr: normalize(food.name_de),
        asciiStr: asciiFold(food.name_de),
        tokensRaw: normalize(food.name_de).split(/\s+/),
        tokensAscii: asciiFold(food.name_de).split(/\s+/)
      });
    }
    namesToTest.push({
      rawStr: normalize(food.name),
      asciiStr: asciiFold(food.name),
      tokensRaw: normalize(food.name).split(/\s+/),
      tokensAscii: asciiFold(food.name).split(/\s+/)
    });

    for (const nameData of namesToTest) {
      // Test both raw tokens and ascii tokens against food names
      const tokenSets = [
        { ocr: ocrTokensRaw, food: nameData.tokensRaw, fullOcrStr: normalize(cleanedOcr), fullFoodStr: nameData.rawStr },
        { ocr: ocrTokensAscii, food: nameData.tokensAscii, fullOcrStr: asciiFold(cleanedOcr), fullFoodStr: nameData.asciiStr }
      ];

      for (const tSet of tokenSets) {
        if (tSet.ocr.length === 0) continue;
        
        let overlapScore = 0;
        for (const oToken of tSet.ocr) {
          let bestTokenScore = 0;
          for (const nToken of tSet.food) {
            if (nToken === oToken) {
              bestTokenScore = Math.max(bestTokenScore, 1);
            } else {
              const dist = levenshtein(oToken, nToken);
              const maxLen = Math.max(oToken.length, nToken.length);
              const sim = 1 - (dist / maxLen);
              if (sim > 0.75) {
                bestTokenScore = Math.max(bestTokenScore, sim);
              }
            }
          }
          overlapScore += bestTokenScore;
        }

        let confidence = overlapScore / tSet.ocr.length;

        // Full string similarity
        const fullDist = levenshtein(tSet.fullOcrStr, tSet.fullFoodStr);
        const fullSim = 1 - (fullDist / Math.max(tSet.fullOcrStr.length, tSet.fullFoodStr.length));
        
        if (fullSim > confidence) confidence = fullSim;

        if (confidence > maxScore) {
          maxScore = confidence;
          bestMatch = food;
        }
      }
    }
  }

  // Return matches even with low confidence so UI can flag them
  if (bestMatch && maxScore > 0.3) {
    return { food: bestMatch, confidence: maxScore };
  }

  return null;
}

export function parseReceipt(ocrLines: string[], allFoods: FoodItem[]): ParsedReceiptItem[] {
  const results: ParsedReceiptItem[] = [];

  for (const line of ocrLines) {
    if (line.length < 4) continue;
    if (/^\d+[\.,]\d{2}$/.test(line.trim())) continue;
    if (/date|time|total|tax|cash|change|datum|uhrzeit|summe|mwst|bar|ec-karte|rückgeld|pfand|gratis/i.test(line)) continue;

    const match = matchFoodToOcrText(line, allFoods);
    
    results.push({
      rawText: line,
      matchedFood: match ? match.food : null,
      confidence: match ? match.confidence : 0
    });
  }

  // We no longer filter out nulls so the UI can show unidentified items
  return results;
}
