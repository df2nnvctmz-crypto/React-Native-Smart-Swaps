import { FoodItem } from '../types';
import { normalize, asciiFold } from './receiptParser';

/**
 * Pure, dependency-free construction of the food search index.
 *
 * Deliberately kept out of useFoods.ts (which pulls in React and the profile context) so
 * that scripts and the regression suite can build the *real* index in plain Node instead
 * of re-implementing it - a copy would silently drift and make the tests lie.
 */

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

const DB_HEAD_NOUN_SUFFIXES = ['brot','broetchen','wurst','kaese','milch','saft','sahne','creme','oel','öl','schinken','salat','suppe','pudding','paprika','joghurt','fleisch','tee','wasser','wein','bier','pizza','reis','baguette','baguett','mais','quark','nudeln','butter','beutel','tuete','netz','salami','koerner','gemuese'];

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
