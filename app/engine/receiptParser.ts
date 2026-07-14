import { FoodItem } from '../types';

export interface ParsedReceiptItem {
  rawText: string;
  matchedFood: FoodItem | null;
  confidence: number;
}

const normalize = (text: string) => text.toLowerCase().replace(/[^\w\s]/g, '').trim();

// A simple fuzzy matcher based on token overlap
function matchFoodToOcrText(ocrText: string, allFoods: FoodItem[]): { food: FoodItem, confidence: number } | null {
  const ocrTokens = normalize(ocrText).split(/\s+/).filter(t => t.length > 2);
  if (ocrTokens.length === 0) return null;

  let bestMatch: FoodItem | null = null;
  let maxScore = 0;

  for (const food of allFoods) {
    const nameTokens = normalize(food.name).split(/\s+/);
    let overlapCount = 0;

    for (const oToken of ocrTokens) {
      if (nameTokens.includes(oToken)) {
        overlapCount++;
      } else {
        // Partial matching for plurals or slight misspellings (e.g. "almonds" vs "almond")
        if (nameTokens.some(nToken => nToken.includes(oToken) || oToken.includes(nToken))) {
          overlapCount += 0.5;
        }
      }
    }

    const confidence = overlapCount / Math.max(ocrTokens.length, nameTokens.length);

    if (confidence > maxScore) {
      maxScore = confidence;
      bestMatch = food;
    }
  }

  if (bestMatch && maxScore > 0.2) {
    return { food: bestMatch, confidence: maxScore };
  }

  return null;
}

export function parseReceipt(ocrLines: string[], allFoods: FoodItem[]): ParsedReceiptItem[] {
  const results: ParsedReceiptItem[] = [];

  for (const line of ocrLines) {
    // Ignore lines that are obviously just prices, dates, or pure numbers
    if (line.length < 4) continue;
    if (/^\d+[\.,]\d{2}$/.test(line.trim())) continue; // e.g. "1.99"
    if (/date|time|total|tax|cash|change/i.test(line)) continue;

    const match = matchFoodToOcrText(line, allFoods);
    
    results.push({
      rawText: line,
      matchedFood: match ? match.food : null,
      confidence: match ? match.confidence : 0
    });
  }

  // Filter out the null matches to return only successfully parsed groceries
  return results.filter(r => r.matchedFood !== null);
}
