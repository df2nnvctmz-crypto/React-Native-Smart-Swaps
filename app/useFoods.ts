import { useMemo } from 'react';
import { useProfile } from './context/ProfileContext';
import { FoodItem } from './types';
import { Ionicons } from '@expo/vector-icons';
import { normalize, asciiFold } from './engine/receiptParser';

const foodsData = require('../foods.json') as FoodItem[];

export interface FoodTokensCache {
  rawStr: string;
  asciiStr: string;
  tokensRaw: string[];
  tokensAscii: string[];
}

export interface FoodIndexData {
  index: Map<string, Set<FoodItem>>;
  cache: Map<string, { de?: FoodTokensCache, en: FoodTokensCache }>;
  shingleIndex?: Map<string, Set<string>>;
  fourGramIndex?: Map<string, Set<string>>;
  stemIndex?: Map<string, Set<FoodItem>>;
}

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

const DB_HEAD_NOUN_SUFFIXES = ['brot','broetchen','wurst','kaese','milch','saft','sahne','creme','schinken','salat','suppe','pudding','paprika','joghurt','fleisch','tee','wasser','wein','bier','pizza','reis','baguette','baguett','mais','quark','nudeln','butter','beutel','tuete','netz','salami'];
function withHeadNounSplits(tokens: string[]): string[] {
  const out = [...tokens];
  for (const t of tokens) {
    if (t.length < 8) continue;
    for (const suf of DB_HEAD_NOUN_SUFFIXES) {
      if (t.endsWith(suf) && t.length > suf.length + 3) {
        out.push(t.slice(0, t.length - suf.length), suf);
        break;
      }
    }
  }
  return out;
}

export function buildFoodIndex(foodsData: FoodItem[]): FoodIndexData {
  const index = new Map<string, Set<FoodItem>>();
  const cache = new Map<string, { de?: FoodTokensCache, en: FoodTokensCache }>();
  const stemIndex = new Map<string, Set<FoodItem>>();

  for (const food of foodsData) {
    const foodCache: { de?: FoodTokensCache, en: FoodTokensCache } = {
      en: {
        rawStr: normalize(food.name),
        asciiStr: asciiFold(food.name),
        tokensRaw: withHeadNounSplits(normalize(food.name).split(/\s+/).filter(t => t.length > 2)),
        tokensAscii: withHeadNounSplits(asciiFold(food.name).split(/\s+/).filter(t => t.length > 2))
      }
    };

    if (food.name_de) {
      foodCache.de = {
        rawStr: normalize(food.name_de),
        asciiStr: asciiFold(food.name_de),
        tokensRaw: withHeadNounSplits(normalize(food.name_de).split(/\s+/).filter(t => t.length > 2)),
        tokensAscii: withHeadNounSplits(asciiFold(food.name_de).split(/\s+/).filter(t => t.length > 2))
      };
    }

    cache.set(food.id, foodCache);

    const allTokens = new Set<string>();
    if (foodCache.de) {
      foodCache.de.tokensRaw.forEach(t => allTokens.add(t));
      foodCache.de.tokensAscii.forEach(t => allTokens.add(t));
    }
    foodCache.en.tokensRaw.forEach(t => allTokens.add(t));
    foodCache.en.tokensAscii.forEach(t => allTokens.add(t));

    allTokens.forEach(token => {
      if (!index.has(token)) {
        index.set(token, new Set());
      }
      index.get(token)!.add(food);
    });

    allTokens.forEach(t => {
      if (t.length > 4) {
        const s = t.replace(/(en|e|n|s)$/,'');
        if (s.length > 2 && s !== t) {
          if (!stemIndex.has(s)) stemIndex.set(s, new Set());
          stemIndex.get(s)!.add(food);
        }
      }
    });
  }

  const SHINGLE_LEN = 5;
  const shingleIndex = new Map<string, Set<string>>(); // shingle -> set of index keys containing it
  for (const key of index.keys()) {
    if (key.length < SHINGLE_LEN) {
      if (!shingleIndex.has(key)) shingleIndex.set(key, new Set());
      shingleIndex.get(key)!.add(key);
      continue;
    }
    for (let i = 0; i <= key.length - SHINGLE_LEN; i++) {
      const sh = key.substring(i, i + SHINGLE_LEN);
      if (!shingleIndex.has(sh)) shingleIndex.set(sh, new Set());
      shingleIndex.get(sh)!.add(key);
    }
  }

  const fourGramIndex = new Map<string, Set<string>>();
  for (const key of index.keys()) {
    if (key.length < 4 || key.length > 10) continue;
    for (let i = 0; i <= key.length - 4; i++) {
      const g = key.substring(i, i + 4);
      if (!fourGramIndex.has(g)) fourGramIndex.set(g, new Set());
      fourGramIndex.get(g)!.add(key);
    }
  }

  return { index, cache, shingleIndex, fourGramIndex, stemIndex };
}

export function useFoods() {
  const { profile } = useProfile();

  const foods = useMemo(() => {
    let filtered = foodsData;
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
  }, [profile?.dietaryPreference]);

  const foodIndexData = useMemo(() => buildFoodIndex(foodsData), []); // Only runs once at startup

  return {
    foods,
    allFoods: foodsData,
    foodIndexData,
    getIconForCategory
  };
}
