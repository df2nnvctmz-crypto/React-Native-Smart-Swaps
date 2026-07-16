import { FoodItem } from '../types';

export interface ParsedReceiptItem {
  rawText: string;
  matchedFood: FoodItem | null;
  confidence: number;
}

const normalize = (text: string) => text.toLowerCase().replace(/[^\w\s]/g, '').trim();

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
  // Remove weights/volumes e.g., 500g, 1.5kg, 200ml, 1l
  cleaned = cleaned.replace(/\b\d+(\.\d+)?\s*(g|kg|ml|l|oz|lb)\b/g, ' ');
  // Remove quantities e.g., 1x, 2 x
  cleaned = cleaned.replace(/\b\d+\s*x\b/g, ' ');
  // Remove prices at the end
  cleaned = cleaned.replace(/\b\d+[\.,]\d{2}\b/g, ' ');
  // Remove common abbreviations
  cleaned = cleaned.replace(/\b(stk|pack|btl)\b/g, ' ');
  return cleaned;
}

function matchFoodToOcrText(ocrText: string, allFoods: FoodItem[]): { food: FoodItem, confidence: number } | null {
  const cleanedOcr = stripNoise(ocrText);
  const ocrTokens = normalize(cleanedOcr).split(/\s+/).filter(t => t.length > 2);
  if (ocrTokens.length === 0) return null;

  let bestMatch: FoodItem | null = null;
  let maxScore = 0;

  for (const food of allFoods) {
    const foodNameStr = normalize(food.name);
    const nameTokens = foodNameStr.split(/\s+/);
    let overlapScore = 0;

    for (const oToken of ocrTokens) {
      let bestTokenScore = 0;
      for (const nToken of nameTokens) {
        if (nToken === oToken) {
          bestTokenScore = Math.max(bestTokenScore, 1);
        } else {
          const dist = levenshtein(oToken, nToken);
          const maxLen = Math.max(oToken.length, nToken.length);
          const sim = 1 - (dist / maxLen);
          if (sim > 0.75) {
            bestTokenScore = Math.max(bestTokenScore, sim);
          } else if (nToken.includes(oToken) || oToken.includes(nToken)) {
            bestTokenScore = Math.max(bestTokenScore, 0.6);
          }
        }
      }
      overlapScore += bestTokenScore;
    }

    let confidence = overlapScore / ocrTokens.length;

    const fullDist = levenshtein(normalize(cleanedOcr), foodNameStr);
    const fullSim = 1 - (fullDist / Math.max(normalize(cleanedOcr).length, foodNameStr.length));
    
    if (fullSim > confidence) confidence = fullSim;

    if (confidence > maxScore) {
      maxScore = confidence;
      bestMatch = food;
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
    if (/date|time|total|tax|cash|change/i.test(line)) continue;

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
