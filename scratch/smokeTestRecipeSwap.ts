import { findBestRecipeSwap, getCulinaryRole } from '../app/engine/recipeSwapAlgorithm';
import { FoodItem } from '../app/types';

const foods: FoodItem[] = require('../foods.json');
const recipes: any[] = require('../recipes.json');

function findFood(name: string): FoodItem | undefined {
  return foods.find(f => f.name.toLowerCase() === name.toLowerCase());
}

// Test a handful of real recipe ingredients across a few recipes.
let tested = 0, swapsFound = 0;
for (const recipe of recipes.slice(0, 30)) {
  for (const ing of recipe.ingredients) {
    if (!ing.food_name) continue;
    const food = findFood(ing.food_name);
    if (!food) continue;
    tested++;
    const swap = findBestRecipeSwap(food, foods, ['Balanced']);
    if (swap) {
      swapsFound++;
      console.log(`[${getCulinaryRole(food)}] ${food.name} (${food.health_score}) -> ${swap.candidate.name} (${swap.candidate.health_score}), vecSim=${swap.vectorSimilarity.toFixed(2)}, score=${swap.score.toFixed(0)}`);
    }
  }
}
console.log(`\n${swapsFound}/${tested} ingredients got a recipe swap suggestion`);
