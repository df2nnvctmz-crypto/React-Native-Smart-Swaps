import { useMemo, useState, useEffect } from 'react';
import { FoodItem, FoodNutrients, Recipe, RecipeIngredient, RecipeRaw } from './types';
import { DatabaseService } from './services/database';
import { useFoods } from './useFoods';

// ─── Unit Conversion Table (to grams) ───────────────────────────────────────
const UNIT_TO_GRAMS: Record<string, number> = {
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5,   teaspoon: 5,   teaspoons: 5,
  cup: 240, cups: 240,
  ml: 1, milliliter: 1, milliliters: 1,
  l: 1000, liter: 1000, liters: 1000,
  g: 1, gram: 1, grams: 1,
  kg: 1000, kilogram: 1000, kilograms: 1000,
  oz: 28.35, ounce: 28.35, ounces: 28.35,
  lb: 453.6, pound: 453.6, pounds: 453.6,
  // Countable items → estimated grams
  egg: 55, eggs: 55,
  onion: 110, onions: 110,
  clove: 5, cloves: 5,
  slice: 30, slices: 30,
  handful: 30, handfuls: 30,
  bunch: 50, bunches: 50,
  pinch: 1, pinches: 1,
  can: 400, cans: 400,
  jar: 300, jars: 300,
};

/** Parse grams from a raw_text ingredient string like "200g spinach", "1 tbsp olive oil", "2 eggs" */
export function parseGrams(raw: string): number {
  if (!raw) return 50;
  const text = raw.toLowerCase().trim();

  // Handle fractions like "½", "¼", "¾"
  const fractionMap: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 0.333, '⅔': 0.667 };
  let normalized = text;
  for (const [frac, val] of Object.entries(fractionMap)) {
    normalized = normalized.replace(frac, String(val));
  }

  // Remove commas (e.g., "1,5 tbsp" → "1.5 tbsp")
  normalized = normalized.replace(/,/g, '.');

  // Pattern: number (optional fraction) + unit
  const match = normalized.match(/(\d+\.?\d*)\s*(tbsp|tablespoon|tsp|teaspoon|cup|ml|l\b|kg|g\b|gram|oz|ounce|lb|pound|egg|onion|clove|slice|handful|bunch|pinch|can|jar)/i);
  if (match) {
    const qty = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    const gramsPerUnit = UNIT_TO_GRAMS[unit] ?? 1;
    return Math.round(qty * gramsPerUnit);
  }

  // Just a number at the start with no unit → assume 100g
  const justNumber = normalized.match(/^(\d+\.?\d*)\s/);
  if (justNumber) {
    const qty = parseFloat(justNumber[1]);
    if (qty <= 10) return Math.round(qty * 30); // e.g., "4 tomatoes" ≈ 4*30g
    return Math.round(qty); // e.g., "250 ml" already has unit-less grams
  }

  return 50; // fallback estimate
}

/** Scale a FoodNutrients (per 100g) to the given gram amount */
export function scaleNutrients(n: FoodNutrients, grams: number): FoodNutrients {
  const f = grams / 100;
  return {
    kcal: n.kcal * f,
    protein_g: n.protein_g * f,
    carbs_g: n.carbs_g * f,
    sugars_g: n.sugars_g * f,
    fat_g: n.fat_g * f,
    saturated_fat_g: n.saturated_fat_g * f,
    fiber_g: n.fiber_g * f,
    salt_g: n.salt_g * f,
    micros: {
      vitamin_a_ug:        (n.micros?.vitamin_a_ug ?? 0) * f,
      betacarotene_ug:     (n.micros?.betacarotene_ug ?? 0) * f,
      vitamin_b1_mg:       (n.micros?.vitamin_b1_mg ?? 0) * f,
      vitamin_b2_mg:       (n.micros?.vitamin_b2_mg ?? 0) * f,
      vitamin_b6_mg:       (n.micros?.vitamin_b6_mg ?? 0) * f,
      vitamin_b12_ug:      (n.micros?.vitamin_b12_ug ?? 0) * f,
      niacin_mg:           (n.micros?.niacin_mg ?? 0) * f,
      folate_ug:           (n.micros?.folate_ug ?? 0) * f,
      pantothenic_acid_mg: (n.micros?.pantothenic_acid_mg ?? 0) * f,
      vitamin_c_mg:        (n.micros?.vitamin_c_mg ?? 0) * f,
      vitamin_d_ug:        (n.micros?.vitamin_d_ug ?? 0) * f,
      vitamin_e_mg:        (n.micros?.vitamin_e_mg ?? 0) * f,
      sodium_mg:           (n.micros?.sodium_mg ?? 0) * f,
      potassium_mg:        (n.micros?.potassium_mg ?? 0) * f,
      chloride_mg:         (n.micros?.chloride_mg ?? 0) * f,
      calcium_mg:          (n.micros?.calcium_mg ?? 0) * f,
      magnesium_mg:        (n.micros?.magnesium_mg ?? 0) * f,
      phosphorus_mg:       (n.micros?.phosphorus_mg ?? 0) * f,
      iron_mg:             (n.micros?.iron_mg ?? 0) * f,
      iodide_ug:           (n.micros?.iodide_ug ?? 0) * f,
      zinc_mg:             (n.micros?.zinc_mg ?? 0) * f,
    }
  };
}

export function addNutrients(a: FoodNutrients, b: FoodNutrients): FoodNutrients {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    carbs_g: a.carbs_g + b.carbs_g,
    sugars_g: a.sugars_g + b.sugars_g,
    fat_g: a.fat_g + b.fat_g,
    saturated_fat_g: a.saturated_fat_g + b.saturated_fat_g,
    fiber_g: a.fiber_g + b.fiber_g,
    salt_g: a.salt_g + b.salt_g,
    micros: {
      vitamin_a_ug:        a.micros.vitamin_a_ug + b.micros.vitamin_a_ug,
      betacarotene_ug:     a.micros.betacarotene_ug + b.micros.betacarotene_ug,
      vitamin_b1_mg:       a.micros.vitamin_b1_mg + b.micros.vitamin_b1_mg,
      vitamin_b2_mg:       a.micros.vitamin_b2_mg + b.micros.vitamin_b2_mg,
      vitamin_b6_mg:       a.micros.vitamin_b6_mg + b.micros.vitamin_b6_mg,
      vitamin_b12_ug:      a.micros.vitamin_b12_ug + b.micros.vitamin_b12_ug,
      niacin_mg:           a.micros.niacin_mg + b.micros.niacin_mg,
      folate_ug:           a.micros.folate_ug + b.micros.folate_ug,
      pantothenic_acid_mg: a.micros.pantothenic_acid_mg + b.micros.pantothenic_acid_mg,
      vitamin_c_mg:        a.micros.vitamin_c_mg + b.micros.vitamin_c_mg,
      vitamin_d_ug:        a.micros.vitamin_d_ug + b.micros.vitamin_d_ug,
      vitamin_e_mg:        a.micros.vitamin_e_mg + b.micros.vitamin_e_mg,
      sodium_mg:           a.micros.sodium_mg + b.micros.sodium_mg,
      potassium_mg:        a.micros.potassium_mg + b.micros.potassium_mg,
      chloride_mg:         a.micros.chloride_mg + b.micros.chloride_mg,
      calcium_mg:          a.micros.calcium_mg + b.micros.calcium_mg,
      magnesium_mg:        a.micros.magnesium_mg + b.micros.magnesium_mg,
      phosphorus_mg:       a.micros.phosphorus_mg + b.micros.phosphorus_mg,
      iron_mg:             a.micros.iron_mg + b.micros.iron_mg,
      iodide_ug:           a.micros.iodide_ug + b.micros.iodide_ug,
      zinc_mg:             a.micros.zinc_mg + b.micros.zinc_mg,
    }
  };
}

export const emptyNutrients = (): FoodNutrients => ({
  kcal: 0, protein_g: 0, carbs_g: 0, sugars_g: 0, fat_g: 0,
  saturated_fat_g: 0, fiber_g: 0, salt_g: 0,
  micros: {
    vitamin_a_ug: 0, betacarotene_ug: 0, vitamin_b1_mg: 0,
    vitamin_b2_mg: 0, vitamin_b6_mg: 0, vitamin_b12_ug: 0,
    niacin_mg: 0, folate_ug: 0, pantothenic_acid_mg: 0,
    vitamin_c_mg: 0, vitamin_d_ug: 0, vitamin_e_mg: 0,
    sodium_mg: 0, potassium_mg: 0, chloride_mg: 0,
    calcium_mg: 0, magnesium_mg: 0, phosphorus_mg: 0,
    iron_mg: 0, iodide_ug: 0, zinc_mg: 0,
  }
});

export const divideNutrients = (n: FoodNutrients, divisor: number): FoodNutrients => {
  if (divisor === 0) return n;
  return scaleNutrients(n, 100 / divisor); // divide by scaling to 1/divisor
};

// Simple estimated time and difficulty from step count / length
function estimateTimeDifficulty(recipe: any): { time: string; difficulty: string } {
  const stepCount = recipe.steps ? recipe.steps.length : 0;
  const totalLength = recipe.steps ? recipe.steps.join('').length : 0;
  const ingredientCount = recipe.ingredients ? recipe.ingredients.filter((i: any) => i.food_id).length : 0;

  const difficulty = ingredientCount >= 7 || totalLength > 600 ? 'Medium' : 'Easy';
  const minutes = 10 + stepCount * 5 + ingredientCount * 2;
  const time = minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60 * 10) / 10} hr`;
  return { time, difficulty };
}

export function useRecipes() {
  const { allFoods, isLoaded: foodsLoaded } = useFoods();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!foodsLoaded) return;

    const foodMap = new Map<string, FoodItem>(allFoods.map(f => [f.id, f]));

    DatabaseService.getAllRecipes().then(recipesRaw => {
      const hydratedRecipes = recipesRaw.map((raw): Recipe => {
        const { time, difficulty } = estimateTimeDifficulty(raw);

        const ingredients: RecipeIngredient[] = (raw.ingredients || []).map((ing: any) => {
          const grams = parseGrams(ing.raw_text);
          const food = ing.food_id ? foodMap.get(ing.food_id) : undefined;
          const scaledNutrients = food ? scaleNutrients(food.nutrients_per_100, grams) : undefined;
          return {
            raw_text: ing.raw_text,
            food_id: ing.food_id,
            food,
            grams,
            kcal: scaledNutrients?.kcal ?? 0,
            nutrients: scaledNutrients,
          };
        });

        // Sum totals across all ingredients with known food
        const totalRaw = ingredients.reduce((acc, ing) => {
          if (ing.nutrients) return addNutrients(acc, ing.nutrients);
          return acc;
        }, emptyNutrients());

        // Per-serving totals
        const serves = raw.serves || 1;
        const totals: FoodNutrients = {
          kcal: totalRaw.kcal / serves,
          protein_g: totalRaw.protein_g / serves,
          carbs_g: totalRaw.carbs_g / serves,
          sugars_g: totalRaw.sugars_g / serves,
          fat_g: totalRaw.fat_g / serves,
          saturated_fat_g: totalRaw.saturated_fat_g / serves,
          fiber_g: totalRaw.fiber_g / serves,
          salt_g: totalRaw.salt_g / serves,
          micros: {
            vitamin_a_ug:        totalRaw.micros.vitamin_a_ug / serves,
            betacarotene_ug:     totalRaw.micros.betacarotene_ug / serves,
            vitamin_b1_mg:       totalRaw.micros.vitamin_b1_mg / serves,
            vitamin_b2_mg:       totalRaw.micros.vitamin_b2_mg / serves,
            vitamin_b6_mg:       totalRaw.micros.vitamin_b6_mg / serves,
            vitamin_b12_ug:      totalRaw.micros.vitamin_b12_ug / serves,
            niacin_mg:           totalRaw.micros.niacin_mg / serves,
            folate_ug:           totalRaw.micros.folate_ug / serves,
            pantothenic_acid_mg: totalRaw.micros.pantothenic_acid_mg / serves,
            vitamin_c_mg:        totalRaw.micros.vitamin_c_mg / serves,
            vitamin_d_ug:        totalRaw.micros.vitamin_d_ug / serves,
            vitamin_e_mg:        totalRaw.micros.vitamin_e_mg / serves,
            sodium_mg:           totalRaw.micros.sodium_mg / serves,
            potassium_mg:        totalRaw.micros.potassium_mg / serves,
            chloride_mg:         totalRaw.micros.chloride_mg / serves,
            calcium_mg:          totalRaw.micros.calcium_mg / serves,
            magnesium_mg:        totalRaw.micros.magnesium_mg / serves,
            phosphorus_mg:       totalRaw.micros.phosphorus_mg / serves,
            iron_mg:             totalRaw.micros.iron_mg / serves,
            iodide_ug:           totalRaw.micros.iodide_ug / serves,
            zinc_mg:             totalRaw.micros.zinc_mg / serves,
          }
        };

        // Weighted health score: weighted by kcal contribution
        const linkedIngredients = ingredients.filter(i => i.food && i.kcal > 0);
        const totalKcal = linkedIngredients.reduce((sum, i) => sum + i.kcal, 0);
        const health_score = totalKcal > 0
          ? Math.round(linkedIngredients.reduce((sum, i) => sum + (i.food!.health_score * i.kcal), 0) / totalKcal)
          : 50;

        return {
          id: raw.id,
          name: raw.name,
          url: raw.url,
          image: raw.image,
          serves: raw.serves,
          subcategory: raw.subcategory,
          dish_type: raw.dish_type,
          ingredients,
          steps: raw.steps || [],
          totals,
          health_score,
          kcal_total: totals.kcal,
          time,
          difficulty,
        };
      });

      setRecipes(hydratedRecipes);
      setIsLoaded(true);
    });
  }, [foodsLoaded, allFoods]);

  const findRecipesForFood = useMemo(() => {
    return (foodId: string): Recipe[] => {
      return recipes.filter(r => r.ingredients.some(ing => ing.food_id === foodId));
    };
  }, [recipes]);

  return { recipes, findRecipesForFood, isLoaded };
}
