import { useMemo, useState, useEffect } from 'react';
import { useProfile } from './context/ProfileContext';
import { FoodItem } from './types';
import { Ionicons } from '@expo/vector-icons';
import { buildFoodIndex, FoodIndexData } from './engine/foodIndex';
import { DatabaseService } from './services/database';

export { buildFoodIndex } from './engine/foodIndex';
export type { FoodTokensCache, FoodIndexData } from './engine/foodIndex';

export const getIconForCategory = (category: string): keyof typeof Ionicons.glyphMap => {
  const cat = category.toLowerCase();
  if (cat.includes('meat') || cat.includes('sausage') || cat.includes('poultry')) return 'restaurant-outline';
  if (cat.includes('fish') || cat.includes('seafood')) return 'fish-outline';
  if (cat.includes('dairy') || cat.includes('egg') || cat.includes('milk') || cat.includes('cheese')) return 'egg-outline';
  if (cat.includes('fruit') || cat.includes('vegetable')) return 'leaf-outline';
  if (cat.includes('drink') || cat.includes('beverage') || cat.includes('water')) return 'water-outline';
  if (cat.includes('sweet') || cat.includes('pastry') || cat.includes('sugar')) return 'ice-cream-outline';
  if (cat.includes('cereal') || cat.includes('grain') || cat.includes('bread') || cat.includes('pantry')) return 'nutrition-outline';
  return 'fast-food-outline';
};

export function useFoods() {
  const { profile } = useProfile();
  const [allFoods, setAllFoods] = useState<FoodItem[]>([]);
  const [foodIndexData, setFoodIndexData] = useState<FoodIndexData | null>(null);

  useEffect(() => {
    DatabaseService.getAllFoods().then(data => {
      setAllFoods(data);
      setFoodIndexData(buildFoodIndex(data));
    });
  }, []);

  const foods = useMemo(() => {
    let filtered = allFoods;
    if (profile) {
      const prefs = profile.dietaryPreference;
      if (prefs.includes('Vegetarian')) {
        filtered = filtered.filter(f => !f.category.includes('Meat') && !f.category.includes('Fish'));
      }
      if (prefs.includes('Vegan')) {
        filtered = filtered.filter(f => !f.category.includes('Meat') && !f.category.includes('Fish') && !f.category.includes('Dairy') && !f.swiss_category.toLowerCase().includes('egg'));
      }
      if (prefs.includes('High Protein')) {
        filtered = filtered.filter(f => f.nutrients_per_100.protein_g >= 15);
      }
      if (prefs.includes('Low Carb')) {
        filtered = filtered.filter(f => f.nutrients_per_100.carbs_g <= 20);
      }
    }
    return filtered;
  }, [allFoods, profile?.dietaryPreference]);

  return {
    foods,
    allFoods,
    foodIndexData,
    getIconForCategory,
    isLoaded: allFoods.length > 0
  };
}
