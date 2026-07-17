import { FoodItem } from '../types';
import type { FoodIndexData } from '../useFoods';

export interface ParsedReceiptItem {
  rawText: string;
  matchedFood: FoodItem | null;
  confidence: number;
}

export const normalize = (text: string) => text.toLowerCase().replace(/[\.\-\/]/g, ' ').replace(/[^\w\säöüß]/gi, ' ').replace(/\s+/g, ' ').trim();

export const asciiFold = (text: string) => {
  return text.toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[\.\-\/]/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
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

import { expandGermanAbbreviations } from './germanAbbreviations';

function stripNoise(text: string): string {
  let cleaned = text.toLowerCase();
  
  // Split fused letters and numbers (e.g. "2ST530g" -> "2 ST 530 g")
  // We do this carefully: insert space between letter and digit
  cleaned = cleaned.replace(/([a-zäöüß])(\d)/gi, '$1 $2').replace(/(\d)([a-zäöüß])/gi, '$1 $2');
  
  // Split common compound descriptors to allow core noun weighting to work properly
  cleaned = cleaned.replace(/(protein|bio|vegan|veggie|mini|schoko)/gi, '$1 ');
  
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

function matchFoodToOcrText(ocrText: string, allFoods: FoodItem[], indexData?: FoodIndexData): { food: FoodItem, confidence: number } | null {
  // Apply German abbreviation expansions first
  const expandedOcr = expandGermanAbbreviations(ocrText);
  
  const cleanedOcr = stripNoise(expandedOcr);
  const ocrTokensRaw = normalize(cleanedOcr).split(/\s+/).filter(t => t.length > 2);
  const ocrTokensAscii = asciiFold(cleanedOcr).split(/\s+/).filter(t => t.length > 2);
  
  if (ocrTokensRaw.length === 0 && ocrTokensAscii.length === 0) return null;

  let bestMatch: FoodItem | null = null;
  let maxScore = 0;
  
  // Step 1: Use index to drastically reduce candidate pool
  let candidateSet = new Set<FoodItem>();
  
  if (indexData) {
    const searchTokens = [...ocrTokensRaw, ...ocrTokensAscii];
    for (const token of searchTokens) {
      if (token.length < 3) continue;
      
      // Allow partial matches on the index keys to catch abbreviated OCR like 'mozz' -> 'mozzarella'
      for (const [key, foodsWithToken] of indexData.index.entries()) {
        if (key.includes(token) || token.includes(key)) {
          foodsWithToken.forEach(f => candidateSet.add(f));
        }
      }
    }
  }

  // If index found nothing (due to typos), fallback to all foods
  const candidatesToScore = candidateSet.size > 0 ? Array.from(candidateSet) : allFoods;
  
  if (indexData) {
    console.log(`OCR: ${ocrText} -> Expanded: ${expandedOcr} -> Candidates: ${candidatesToScore.length}`);
  }

  for (const food of candidatesToScore) {
    let namesToTest: {rawStr: string, asciiStr: string, tokensRaw: string[], tokensAscii: string[], isFallback?: boolean}[] = [];
    
    if (indexData?.cache?.has(food.id)) {
      const cached = indexData.cache.get(food.id)!;
      if (cached.de) {
        namesToTest.push({ ...cached.de, isFallback: false });
      }
      namesToTest.push({ ...cached.en, isFallback: true });
    } else {
      // Fallback if no cache
      if (food.name_de) {
        namesToTest.push({
          rawStr: normalize(food.name_de),
          asciiStr: asciiFold(food.name_de),
          tokensRaw: normalize(food.name_de).split(/\s+/).filter(t => t.length > 2),
          tokensAscii: asciiFold(food.name_de).split(/\s+/).filter(t => t.length > 2),
          isFallback: false
        });
      }
      namesToTest.push({
        rawStr: normalize(food.name),
        asciiStr: asciiFold(food.name),
        tokensRaw: normalize(food.name).split(/\s+/).filter(t => t.length > 2),
        tokensAscii: asciiFold(food.name).split(/\s+/).filter(t => t.length > 2),
        isFallback: true
      });
    }

    for (const nameData of namesToTest) {
      // Test both raw tokens and ascii tokens against food names
      const tokenSets = [
        { ocr: ocrTokensRaw, food: nameData.tokensRaw, fullOcrStr: normalize(cleanedOcr), fullFoodStr: nameData.rawStr },
        { ocr: ocrTokensAscii, food: nameData.tokensAscii, fullOcrStr: asciiFold(cleanedOcr), fullFoodStr: nameData.asciiStr }
      ];

      for (const tSet of tokenSets) {
        if (tSet.ocr.length === 0) continue;
        
        let overlapScore = 0;
        let totalWeight = 0;
        for (const oToken of tSet.ocr) {
          let bestTokenScore = 0;
          for (const nToken of tSet.food) {
            if (nToken === oToken) {
              bestTokenScore = Math.max(bestTokenScore, 1);
            } else {
              const dist = levenshtein(oToken, nToken);
              const maxLen = Math.max(oToken.length, nToken.length);
              const minLen = Math.min(oToken.length, nToken.length);
              const sim = 1 - (dist / maxLen);
              if (sim > 0.7) {
                bestTokenScore = Math.max(bestTokenScore, sim);
              } else if (minLen >= 4 && (nToken.startsWith(oToken) || oToken.startsWith(nToken))) {
                // Scale prefix match by length ratio so short prefixes don't over-score
                const lenRatio = minLen / maxLen;
                const score = 0.5 + (0.35 * lenRatio); 
                bestTokenScore = Math.max(bestTokenScore, score);
              } else if (minLen >= 5 && (nToken.includes(oToken) || oToken.includes(nToken))) {
                const lenRatio = minLen / maxLen;
                const score = 0.4 + (0.35 * lenRatio);
                bestTokenScore = Math.max(bestTokenScore, score);
              } else if (minLen >= 4) {
                 for (let i=0; i<=oToken.length - 4; i++) {
                   const sub = oToken.substring(i, i+4);
                   if (nToken.startsWith(sub) || nToken.endsWith(sub)) {
                     if (oToken.startsWith(sub) || oToken.endsWith(sub)) {
                       bestTokenScore = Math.max(bestTokenScore, 0.6);
                     }
                   }
                 }
              }
            }
          }
          
          // TASK 2: Weight category-defining nouns over descriptors
          const isCoreNoun = (t: string) => /joghurt|yogurt|milch|milk|käse|kaese|brot|bread|pudding|flammkuchen|grieß|griess|granatapfel/i.test(t);
          const weight = isCoreNoun(oToken) ? 3 : 1;
          
          overlapScore += (bestTokenScore * weight);
          totalWeight += weight;
        }

        let confidence = totalWeight > 0 ? overlapScore / totalWeight : 0;

        // Full string similarity
        const fullDist = levenshtein(tSet.fullOcrStr, tSet.fullFoodStr);
        const fullSim = 1 - (fullDist / Math.max(tSet.fullOcrStr.length, tSet.fullFoodStr.length));
        
        if (fullSim > confidence) confidence = fullSim;

        // Apply fallback penalty: English matches need to be much better to beat German native matches
        if (nameData.isFallback) {
           confidence *= 0.85; 
        }

        // Category switch penalty: if OCR doesn't mention plant-based terms, don't fallback to them
        const plantBasedKeywords = ['vegan', 'soja', 'pflanzlich', 'vegetarisch', 'alternative', 'tofu'];
        const ocrHasPlant = tSet.ocr.some(t => plantBasedKeywords.some(kw => t.includes(kw)));
        const dbHasPlant = tSet.food.some(t => plantBasedKeywords.some(kw => t.includes(kw)));
        if (!ocrHasPlant && dbHasPlant) {
          confidence *= 0.6; // Heavy penalty
        }

        // Composite dish penalty: prefer PLAIN base nouns over composite/filled dishes (e.g. donuts filled with pudding)
        const compositeKeywords = ['gefüllt', 'mit', 'dessert', 'sauce', 'aromatisiert'];
        const dbIsComposite = tSet.food.some(t => compositeKeywords.some(kw => t.includes(kw)));
        if (dbIsComposite) {
          confidence *= 0.8; // Penalize so a plain version wins if both match the base noun
        }

        if (confidence > maxScore) {
          maxScore = confidence;
          bestMatch = food;
        }
        
        // Early Exit (only for non-fallback native matches)
        if (maxScore > 0.95 && bestMatch && !nameData.isFallback) {
          return { food: bestMatch, confidence: maxScore };
        }
      }
    }
  }

  // Return matches even with low confidence so UI can flag them
  if (bestMatch) {
    return { food: bestMatch, confidence: maxScore };
  }
  return null;
}

export function parseReceiptLine(line: string, allFoods: FoodItem[], indexData?: FoodIndexData): ParsedReceiptItem | null {
  if (line.length < 4) return null;
  if (/^\d+[\.,]\d{2}$/.test(line.trim())) return null;
  // Filter out noise lines: e.g. "4 x 1,59", "0, 85", "-1,49"
  if (/^-?\d+\s*[\.,]\s*\d{2}$/.test(line.trim())) return null;
  if (/^\d+\s*x\s*-?\d+\s*[\.,]\s*\d{2}$/i.test(line.trim())) return null;
  if (/date|time|total|tax|cash|change|datum|uhrzeit|summe|mwst|bar|ec-karte|rückgeld|rueckgeld|pfand|gratis|rabatt/i.test(line)) return null;

  const match = matchFoodToOcrText(line, allFoods, indexData);
  
  return {
    rawText: line,
    matchedFood: match ? match.food : null,
    confidence: match ? match.confidence : 0
  };
}

// Keep synchronous version around for non-chunked tests or legacy usage
export function parseReceipt(ocrLines: string[], allFoods: FoodItem[], indexData?: FoodIndexData): ParsedReceiptItem[] {
  const results: ParsedReceiptItem[] = [];

  for (const line of ocrLines) {
    const parsed = parseReceiptLine(line, allFoods, indexData);
    if (parsed) {
      results.push(parsed);
    }
  }

  return results;
}
