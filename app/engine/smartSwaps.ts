import { FoodItem } from '../types';
import { ProfileState } from '../context/ProfileContext';

// Helper to determine if an item is a liquid
const isLiquid = (food: FoodItem): boolean => {
  const name = food.name.toLowerCase();
  const cat = food.category.toLowerCase();
  const scat = food.swiss_category.toLowerCase();
  
  const liquidTerms = ['drink', 'beverage', 'water', 'milk', 'juice', 'soda', 'cola', 'tea', 'coffee'];
  return liquidTerms.some(term => name.includes(term) || cat.includes(term) || scat.includes(term));
};

const normalizeAndTokenize = (text: string): string[] => {
  const stopwords = ['and', 'with', 'fresh', 'organic', 'raw', 'roasted', 'the', 'a', 'in', 'of', 'for'];
  return text
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopwords.includes(word));
};

export function findSmartSwap(currentFood: FoodItem, allFoods: FoodItem[], userProfile: ProfileState | null): string | null {
  let bestCandidateId: string | null = null;
  let maxScore = -1000;

  const currentIsLiquid = isLiquid(currentFood);
  const currentTokens = normalizeAndTokenize(currentFood.name);
  
  const currentSweetTerms = ['sweetened', 'classic', 'sugar', 'syrup'];
  const hasSweetenedTerms = currentSweetTerms.some(t => currentFood.name.toLowerCase().includes(t));
  
  const candUnsweetTerms = ['zero', 'diet', 'unsweetened', 'sugar-free', 'sugar free', 'no sugar'];

  for (const candidate of allFoods) {
    if (candidate.id === currentFood.id) continue;

    // A. Hard Filtering
    if (candidate.health_score <= currentFood.health_score + 5) continue;
    if (candidate.health_score < 65) continue;

    const candName = candidate.name.toLowerCase();
    const candCat = candidate.category.toLowerCase();
    
    // Exclude energy drinks / alcohol
    if (candName.includes('energy drink') || candCat.includes('energy drink')) continue;
    if (['beer', 'wine', 'vodka', 'alcohol', 'liquor', 'spirit'].some(t => candName.includes(t) || candCat.includes(t))) continue;

    // Strict state mismatch
    if (isLiquid(candidate) !== currentIsLiquid) continue;

    // Soft barriers: Decaf
    const currentIsDecaf = currentFood.name.toLowerCase().includes('decaf');
    const candIsDecaf = candName.includes('decaf');
    if (currentIsDecaf !== candIsDecaf && (currentFood.name.toLowerCase().includes('coffee') || candName.includes('coffee'))) continue;

    // B. Scoring Algorithm
    let score = 0;

    // 1. Health Score Improvement
    const scoreDiff = candidate.health_score - currentFood.health_score;
    if (scoreDiff <= 0) continue; // Should be caught by hard filter, but safe guard
    
    score += Math.sqrt(scoreDiff) * 3;
    if (scoreDiff >= 15 && scoreDiff <= 45) {
      score += 35;
    } else if (scoreDiff > 45) {
      score += 10;
    }

    // 2. Category Fit
    if (candidate.swiss_category === currentFood.swiss_category) {
      score += 120; // Granular match
    } else if (candidate.category === currentFood.category) {
      score += 40; // Broad match
      
      // Parent branch match (e.g. "Dairy/Cheese" matches "Dairy/Milk")
      const currBranch = currentFood.swiss_category.split('/')[0];
      const candBranch = candidate.swiss_category.split('/')[0];
      if (currBranch && currBranch === candBranch) {
        score += 45;
      }
    } else {
      score -= 150; // Cross-match (completely different categories)
    }

    // 3. Semantic / Word Similarity
    const candTokens = normalizeAndTokenize(candidate.name);
    let sharedWords = 0;
    for (const token of candTokens) {
      if (currentTokens.includes(token)) {
        sharedWords++;
        score += 40;
      }
    }

    // Dream Swap Check
    if (sharedWords > 0 && hasSweetenedTerms) {
      if (candUnsweetTerms.some(t => candName.includes(t))) {
        score += 150;
      }
    }

    // 4. Nutritional Improvements
    const currN = currentFood.nutrients_per_100;
    const candN = candidate.nutrients_per_100;

    // Sugar
    if (candN.sugars_g < currN.sugars_g) {
      score += (currN.sugars_g - candN.sugars_g) * 4;
    } else if (candN.sugars_g > currN.sugars_g + 2) {
      score -= (candN.sugars_g - currN.sugars_g) * 2;
    }

    // Saturated Fat
    if (candN.saturated_fat_g < currN.saturated_fat_g) {
      score += (currN.saturated_fat_g - candN.saturated_fat_g) * 5;
    }

    // Salt
    if (candN.salt_g < currN.salt_g) {
      score += (currN.salt_g - candN.salt_g) * 25;
    }

    // Protein
    if (candN.protein_g > currN.protein_g) {
      score += (candN.protein_g - currN.protein_g) * 3;
    }

    // Fiber
    if (candN.fiber_g > currN.fiber_g) {
      score += (candN.fiber_g - currN.fiber_g) * 4;
    }

    // 5. Calorie Parity
    const currKcal = currN.kcal || 1;
    const candKcal = candN.kcal || 1;
    const ratio = Math.min(currKcal, candKcal) / Math.max(currKcal, candKcal);
    
    if (ratio >= 0.6) {
      score += 20;
    }
    if (candKcal > 1.5 * currKcal) {
      score -= 15;
    }

    // 6. Processing Level (NOVA)
    if (currentFood.nova_group === 4 && candidate.nova_group && candidate.nova_group < 4) {
      score += 35;
    }
    if (candidate.nova_group === 1) {
      score += 15;
    }

    // 7. Dietary Preferences
    if (userProfile) {
      if (userProfile.dietaryPreference.includes('High Protein') && candN.protein_g > currN.protein_g) {
        score += 25;
      }
      if (userProfile.dietaryPreference.includes('Low Carb') && candN.sugars_g < currN.sugars_g) {
        score += 25;
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestCandidateId = candidate.id;
    }
  }

  return maxScore > -50 ? bestCandidateId : null;
}
