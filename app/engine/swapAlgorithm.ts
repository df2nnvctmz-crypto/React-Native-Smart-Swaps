import { FoodItem } from '../types';

const STOP_WORDS = new Set(['and', 'the', 'with', 'organic', 'raw', 'fried', 'without', 'fat', 'pan', 'in', 'of', 'for', 'a']);
const UNSWEETENED_KEYWORDS = ['zero', 'diet', 'plain', 'unsweetened', 'no sugar'];
const SWEETENED_KEYWORDS = ['sweet', 'sugar', 'syrup', 'honey', 'sweetened', 'chocolate', 'candy', 'pastry', 'cola', 'cookie', 'cake'];

const LIQUID_KEYWORDS = ['drink', 'juice', 'beverage', 'milk', 'soda', 'water', 'cola', 'liquid', 'tea', 'coffee', 'stock', 'broth'];
const RESTRICTED_KEYWORDS = ['alcohol', 'beer', 'wine', 'energy drink', 'liquor', 'vodka', 'rum', 'whiskey', 'spirit'];

function normalizeString(str: string): string[] {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

function isLiquid(food: FoodItem): boolean {
  const normName = food.name.toLowerCase();
  const normCat = (food.category + ' ' + food.swiss_category).toLowerCase();
  return LIQUID_KEYWORDS.some(kw => normName.includes(kw) || normCat.includes(kw));
}

function containsKeywords(str: string, keywords: string[]): boolean {
  const lowerStr = str.toLowerCase();
  return keywords.some(kw => lowerStr.includes(kw));
}

function isRestricted(food: FoodItem): boolean {
  const normName = food.name.toLowerCase();
  const normCat = (food.category + ' ' + food.swiss_category).toLowerCase();
  return RESTRICTED_KEYWORDS.some(kw => normName.includes(kw) || normCat.includes(kw));
}

// Map broad Swiss categories to equivalence groups to allow vegan swaps for dairy/meat
function getEquivalenceGroup(swissCategory: string, name: string): string {
  const lowerCat = swissCategory.toLowerCase();
  const lowerName = name.toLowerCase();

  if (lowerCat.includes('oil') || lowerCat.includes('fat') || lowerName.includes('oil')) return 'OILS_FATS';
  if (lowerCat.includes('meat') || lowerCat.includes('poultry') || lowerName.includes('mince') || lowerName.includes('sausage')) return 'MEAT_ALT';
  if (lowerCat.includes('milk') || lowerCat.includes('dairy') || lowerCat.includes('cheese') || lowerCat.includes('yoghurt') || lowerName.includes('yoghurt') || lowerName.includes('cheese') || lowerName.includes('milk')) return 'DAIRY_ALT';
  if (lowerCat.includes('cereal') || lowerCat.includes('bread') || lowerCat.includes('pasta') || lowerCat.includes('rice') || lowerCat.includes('grain')) return 'GRAINS';
  if (lowerCat.includes('vegetable') || lowerName.includes('vegetable')) return 'VEG';
  if (lowerCat.includes('fruit')) return 'FRUIT';
  if (lowerCat.includes('sweet') || lowerCat.includes('sugar') || lowerCat.includes('chocolate')) return 'SWEETS';
  if (lowerCat.includes('beverage') || lowerCat.includes('drink') || lowerCat.includes('juice')) return 'BEVERAGES';
  
  // Default to the first part of the swiss category string
  return lowerCat.split('/')[0];
}

export interface SwapResult {
  candidate: FoodItem;
  score: number;
}

export function evaluateSwap(currentFood: FoodItem, candidate: FoodItem): number {
  let score = 0;
  
  // 1. Core Health Score Jumps
  const scoreDiff = candidate.health_score - currentFood.health_score;
  if (scoreDiff > 0) {
    score += Math.sqrt(scoreDiff) * 5;
    if (scoreDiff >= 10 && scoreDiff <= 40) {
      score += 40; // Realistic Jump Bonus
    }
  }

  // 2. Exact Swiss Category Match (Very High Bonus)
  if (currentFood.swiss_category === candidate.swiss_category) {
    score += 300;
  }

  // 3. Name Overlap (Semantic Similarity)
  const currentWords = normalizeString(currentFood.name);
  const candidateWords = normalizeString(candidate.name);
  const overlap = currentWords.filter(w => candidateWords.includes(w)).length;
  // Massive bonus for sharing base nouns (e.g. Yoghurt -> Yoghurt)
  if (overlap > 0) {
    score += (overlap * 150);
  }

  // Sweet-to-Unsweet Bonus
  const currentIsSweet = containsKeywords(currentFood.name, SWEETENED_KEYWORDS) || !containsKeywords(currentFood.name, UNSWEETENED_KEYWORDS);
  const candidateIsUnsweet = containsKeywords(candidate.name, UNSWEETENED_KEYWORDS);
  if (currentIsSweet && candidateIsUnsweet) {
    score += 150;
  }

  // 4. Targeted Macro Optimizations based on category group
  const group = getEquivalenceGroup(currentFood.swiss_category, currentFood.name);
  const currNutrients = currentFood.nutrients_per_100;
  const candNutrients = candidate.nutrients_per_100;

  if (group === 'OILS_FATS') {
    // Oils are judged almost entirely on Saturated Fat profile
    const satFatDiff = currNutrients.saturated_fat_g - candNutrients.saturated_fat_g;
    score += satFatDiff * 15; // heavily reward lower saturated fat
  } 
  else if (group === 'DAIRY_ALT') {
    // Dairy/Yogurts are judged on Sugar and Fat
    const sugarDiff = currNutrients.sugars_g - candNutrients.sugars_g;
    const fatDiff = currNutrients.fat_g - candNutrients.fat_g;
    score += sugarDiff * 8; 
    score += fatDiff * 6;
  }
  else if (group === 'MEAT_ALT') {
    // Meats judged on Protein retention and lower saturated fat/salt
    const proteinDiff = candNutrients.protein_g - currNutrients.protein_g;
    const satFatDiff = currNutrients.saturated_fat_g - candNutrients.saturated_fat_g;
    const saltDiff = currNutrients.salt_g - candNutrients.salt_g;
    score += proteinDiff * 8; 
    score += satFatDiff * 10;
    score += saltDiff * 20;
  }
  else {
    // General heuristics for other categories
    const sugarDiff = currNutrients.sugars_g - candNutrients.sugars_g;
    const saltDiff = currNutrients.salt_g - candNutrients.salt_g;
    const fiberDiff = candNutrients.fiber_g - currNutrients.fiber_g;
    score += (sugarDiff > 0 ? sugarDiff * 4 : sugarDiff * 2);
    score += saltDiff * 20;
    score += fiberDiff * 5;
  }

  // 5. Calorie Parity constraint
  const currentKcal = currNutrients.kcal || 1; 
  const candKcal = candNutrients.kcal;
  const kcalRatio = candKcal / currentKcal;

  if (kcalRatio >= 0.8 && kcalRatio <= 1.2) {
    score += 40; 
  }
  if (kcalRatio > 1.5 || kcalRatio < 0.5) {
    score -= 100; // Penalize wild calorie swings
  }

  return score;
}

export function findBestSwaps(badFood: FoodItem, allFoods: FoodItem[], count: number = 3, dietaryPreference: string[] = ['Balanced']): SwapResult[] {
  if (badFood.health_score >= 80) {
    return []; // Already a great food
  }

  // Determine the broad equivalence group of the target food
  const targetGroup = getEquivalenceGroup(badFood.swiss_category, badFood.name);
  const targetIsLiquid = isLiquid(badFood);

  let candidates = allFoods.filter(f => f.id !== badFood.id && f.health_score >= badFood.health_score + 10);

  // STRICT CATEGORIZATION FILTER:
  // Must either share the EXACT same swiss_category or belong to the same equivalence group (e.g. Dairy <-> Soy alternative)
  candidates = candidates.filter(f => {
    if (f.swiss_category === badFood.swiss_category) return true;
    
    const candGroup = getEquivalenceGroup(f.swiss_category, f.name);
    if (candGroup === targetGroup) {
       const broadGroups = ['VEG', 'FRUIT', 'GRAINS', 'SWEETS', 'SNACKS'];
       if (broadGroups.includes(targetGroup)) {
          // Require them to be much closer, like same subcategory
          const fSub = f.swiss_category.split('/')[1];
          const bSub = badFood.swiss_category.split('/')[1];
          return fSub && bSub && fSub === bSub;
       }
       return true;
    }
    return false;
  });

  // Physical State strictness
  candidates = candidates.filter(f => isLiquid(f) === targetIsLiquid);

  // Apply Dietary Filters
  if (dietaryPreference.includes('Vegetarian')) {
    candidates = candidates.filter(f => f.category !== 'Meat' && f.category !== 'Fish');
  }
  if (dietaryPreference.includes('Vegan')) {
    candidates = candidates.filter(f => f.category !== 'Meat' && f.category !== 'Fish' && f.category !== 'Dairy');
  }

  // Score remaining eligible candidates
  const eligibleCandidates = candidates.filter(f => !isRestricted(f));
  const scoredCandidates: SwapResult[] = eligibleCandidates.map(candidate => ({
    candidate,
    score: evaluateSwap(badFood, candidate)
  }));

  // Sort by score descending and take the top requested amount
  scoredCandidates.sort((a, b) => b.score - a.score);
  return scoredCandidates.slice(0, count);
}
