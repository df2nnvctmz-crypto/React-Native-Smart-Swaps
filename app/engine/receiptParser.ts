import { FoodItem } from '../types';
import type { FoodIndexData } from './foodIndex';

export interface ParsedReceiptItem {
  rawText: string;
  matchedFood: FoodItem | null;
  confidence: number;
}

export const normalize = (text: string) => {
  return text.toLowerCase()
    .replace(/ä/g, '__AUM__').replace(/ö/g, '__OUM__').replace(/ü/g, '__UUM__').replace(/ß/g, '__SZ__')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/__AUM__/g, 'ä').replace(/__OUM__/g, 'ö').replace(/__UUM__/g, 'ü').replace(/__SZ__/g, 'ß')
    .replace(/[\.\-\/]/g, ' ')
    .replace(/[^\w\säöüß]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const asciiFold = (text: string) => {
  return text.toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
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

function candidateKeysFor(token: string, shingleIndex: Map<string, Set<string>>): Set<string> {
  const keys = new Set<string>();
  if (token.length < 5) {
    const direct = shingleIndex.get(token);
    if (direct) direct.forEach(k => keys.add(k));
    return keys;
  }
  for (let i = 0; i <= token.length - 5; i++) {
    const bucket = shingleIndex.get(token.substring(i, i + 5));
    if (bucket) bucket.forEach(k => keys.add(k));
  }
  return keys;
}

const isCoreNoun = (t: string) => /joghurt|yogurt|milch|milk|kaese|cheese|brot|bread|pudding|flammkuchen|griess|granatapfel|apfel|apple|banane|banana|tomate|tomato|zwiebel|onion|kartoffel|potato|zitrone|lemon|salami|schinken|ham|wurst|sausage|nuss|nuesse|nut|peanut|erdnuss|reis|rice|fisch|fish|fleisch|meat|eier|egg|birne|pear|traube|grape|gurke|cucumber|mozzarella|gouda|parmesan|ricotta|feta|camembert|edamer|pesto|gnocchi|tortelloni|quark|butter|teigwaren|chili|paprika|skyr|baguette|baguett|roggen|ravioli|salat|pfeffer|pizza|sahne|rahm|creme|haehnchen|hähnchen|huhn|chicken|pute|truthahn|ente|gefluegel|geflügel/i.test(t);

function candidateKeysFor4Gram(token: string, fourGramIndex: Map<string, Set<string>>): Set<string> {
  const keys = new Set<string>();
  if (token.length < 4) return keys;
  for (let i = 0; i <= token.length - 4; i++) {
    const bucket = fourGramIndex.get(token.substring(i, i + 4));
    if (bucket) for (const k of bucket) {
      if (Math.abs(k.length - token.length) <= 2) keys.add(k);
    }
  }
  return keys;
}

function matchFoodToOcrText(ocrText: string, allFoods: FoodItem[], indexData?: FoodIndexData): { food: FoodItem, confidence: number, hasStrongHit: boolean } | null {
  let lineFatPct: number | null = null;
  const fatMatch = ocrText.match(/(\d+(?:[.,]\d+)?)\s*(?:%|fat|fett)/i);
  if (fatMatch) {
    lineFatPct = parseFloat(fatMatch[1].replace(',', '.'));
  }

  // Apply German abbreviation expansions first
  const caseSplit = ocrText
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')   // "NIPizza" -> "NI Pizza"
    .replace(/([a-z])([A-Z])/g, '$1 $2');          // "PizzaSpeciale" -> "Pizza Speciale"

  // Fix 1: Lookalike digits
  const lookalikes: Record<string, string> = { '0':'o', '1':'l', '5':'s', '6':'g', '8':'b' };
  const replaceDigits = (w: string) => w.replace(/\d/g, d => lookalikes[d] || d);
  // Plain quantity/weight tokens (e.g. "400g", "3st") are never a food name mangled by OCR -
  // running lookalike-digit substitution on them just manufactures garbage tokens (400g -> 4oog).
  const isPlainQuantityToken = (w: string) => /^\d+([.,]\d+)?(g|kg|mg|ml|cl|l|stk|st|er)?$/i.test(w);

  const preExpandStr = caseSplit.replace(/[^\w\säöüßÄÖÜ]/g, ' ');
  const preExpandWords = preExpandStr.split(/\s+/).filter(Boolean);
  const wordsWithVariants: string[] = [];

  for (const w of preExpandWords) {
    wordsWithVariants.push(w);
    if (isPlainQuantityToken(w)) continue;
    if (/^[a-zäöüß]+\d[a-zäöüß]*$/i.test(w)) {
      wordsWithVariants.push(w.replace(/\d/g, ''));
    }
    if (/[a-zäöüß]*\d[a-zäöüß]+|[a-zäöüß]+\d[a-zäöüß]*/i.test(w)) {
      const v = replaceDigits(w);
      if (v !== w) wordsWithVariants.push(v);
    }
  }

  const expandedOcr = expandGermanAbbreviations(wordsWithVariants.join(' '));

  const HEAD_NOUN_SUFFIXES = ['brot','broetchen','wurst','kaese','milch','saft','sahne','creme','oel','öl','schinken','salat','suppe','pudding','paprika','joghurt','fleisch','tee','wasser','wein','bier','pizza','reis','baguette','baguett','mais','quark','nudeln','butter','beutel','tuete','netz','salami','koerner','gemuese'];
  const splitHeads = new Set<string>();
  const headNounSplit = expandedOcr.split(/\s+/).map(word => {
    if (word.length < 8) return word;
    const lower = word.toLowerCase();
    for (const suf of HEAD_NOUN_SUFFIXES) {
      if (lower.endsWith(suf) && lower.length > suf.length + 3) {
        splitHeads.add(suf);
        return word.slice(0, word.length - suf.length) + ' ' + word.slice(word.length - suf.length);
      }
      if (suf.length >= 4) {
        const tail = lower.slice(-suf.length);
        if (tail.length === suf.length && levenshtein(tail, suf) <= 1 && lower.length > suf.length + 3) {
          splitHeads.add(suf);
          return word.slice(0, word.length - suf.length) + ' ' + suf;
        }
        const tailMinus1 = lower.slice(-(suf.length - 1));
        if (tailMinus1.length === suf.length - 1 && levenshtein(tailMinus1, suf) <= 1 && lower.length > suf.length + 2) {
          splitHeads.add(suf);
          return word.slice(0, word.length - tailMinus1.length) + ' ' + suf;
        }
        const tailPlus1 = lower.slice(-(suf.length + 1));
        if (tailPlus1.length === suf.length + 1 && levenshtein(tailPlus1, suf) <= 1 && lower.length > suf.length + 4) {
          splitHeads.add(suf);
          return word.slice(0, word.length - tailPlus1.length) + ' ' + suf;
        }
      }
    }
    return word;
  });

  const finalOcr = headNounSplit.join(' ');
  // Quantity/weight/price tokens (e.g. "400g", "500ml", "3st", "250") never appear in a
  // food's canonical name, so keeping them just dilutes every candidate's confidence equally.
  const isQuantityNoise = (t: string) => /^\d+([.,]\d+)?(g|kg|mg|ml|cl|l|stk|st|er)?$/i.test(t);
  const ocrTokensRaw = normalize(finalOcr).split(/\s+/).filter(t => t.length > 2 && !isQuantityNoise(t));
  const ocrTokensAscii = asciiFold(finalOcr).split(/\s+/).filter(t => t.length > 2 && !isQuantityNoise(t));

  if (ocrTokensRaw.length === 0) return null;

  let allMatches: { food: FoodItem, confidence: number, hasStrongHit: boolean, unmatchedCount: number }[] = [];
  
  const candidateHits = new Map<FoodItem, number>();
  const addCand = (f: FoodItem) => candidateHits.set(f, (candidateHits.get(f) ?? 0) + 1);
  let lineHasRecognizedToken = false;
  
  if (indexData) {
    const searchTokens = Array.from(new Set(ocrTokensRaw.concat(ocrTokensAscii)));
    for (const token of searchTokens) {
      if (token.length < 3) continue;
      const isStop = /^(sort|sortiert|lose|natur|classic|clas|fein|extra|spezial|surt|frisch|hausgemacht|regional|leicht|light|mix|protein|steinofen|ofenfrisch|pur|marken|pikant|toskana|toscana|provence|griechischer|griechische|beutel|tuete|netz|weiss|wei|weisse)$/i.test(token);
      
      const prevHits = candidateHits.size;
      const exact = indexData.index.get(token);
      if (exact) { exact.forEach(f => { addCand(f); addCand(f); }); if (!isStop) lineHasRecognizedToken = true; }
      const stem = token.length > 4 ? token.replace(/(en|e|n|s)$/,'') : token;
      if (stem !== token && indexData.stemIndex) {
        const st = indexData.stemIndex.get(stem) ?? indexData.stemIndex.get(token);
        if (st) { st.forEach(f => { addCand(f); addCand(f); }); if (!isStop) lineHasRecognizedToken = true; }
      }

      if (token.length >= 4 && indexData.shingleIndex) {
        let found5 = false;
        for (const key of candidateKeysFor(token, indexData.shingleIndex)) {
          if (key.includes(token) || token.includes(key) || Math.abs(key.length - token.length) <= 2) {
            indexData.index.get(key)!.forEach(addCand);
            found5 = true;
          }
        }
        if (!found5 && token.length >= 5 && token.length <= 8 && indexData.fourGramIndex) {
          for (const key of candidateKeysFor4Gram(token, indexData.fourGramIndex)) {
            indexData.index.get(key)!.forEach(addCand);
          }
        }
      }

      // Fix 5: Insertion/Deletion variants run IF candidateHits did not increase for this token
      if (candidateHits.size === prevHits && !exact && token.length >= 5 && token.length <= 10) {
        let foundVariant = false;
        const CONF: Record<string, string[]> = { t:['n','i','l'], i:['n','l','t'],
          l:['i','t'], n:['m','t','i','u','w'], m:['n'], o:['0','e','u'], u:['n','v','o'], v:['u'],
          f:['t'], c:['e','o'], e:['c','o','s'], r:['n'], d:['g','b'], g:['d'], s:['e'], q:['o'], w:['n'], b:['d'] };
        for (let p = 0; p < token.length; p++) {
          const alts = CONF[token[p]];
          if (!alts) continue;
          for (const a of alts) {
            const v = token.slice(0, p) + a + token.slice(p + 1);
            const hit = indexData.index.get(v);
            if (hit) { hit.forEach(f => { addCand(f); addCand(f); }); foundVariant = true; }
            if (indexData.stemIndex) {
              const vs = v.length > 4 ? v.replace(/(en|e|n|s)$/,'') : v;
              const hs = indexData.stemIndex.get(vs) ?? indexData.stemIndex.get(v);
              if (hs) { hs.forEach(f => { addCand(f); addCand(f); }); foundVariant = true; }
            }
          }
        }
        
        if (!foundVariant) {
          for (let p = 0; p < token.length; p++) {
            const v = token.slice(0, p) + token.slice(p + 1);
            const hit = indexData.index.get(v);
            if (hit) { hit.forEach(f => { addCand(f); addCand(f); }); foundVariant = true; }
            if (indexData.stemIndex) {
              const vs = v.length > 4 ? v.replace(/(en|e|n|s)$/,'') : v;
              const hs = indexData.stemIndex.get(vs) ?? indexData.stemIndex.get(v);
              if (hs) { hs.forEach(f => { addCand(f); addCand(f); }); foundVariant = true; }
            }
          }
        }
        
        if (!foundVariant && token.length <= 9) {
          const a_z = 'abcdefghijklmnopqrstuvwxyz';
          for (let p = 0; p <= token.length; p++) {
            for (let charIdx = 0; charIdx < 26; charIdx++) {
              const v = token.slice(0, p) + a_z[charIdx] + token.slice(p);
              const hit = indexData.index.get(v);
              if (hit) { hit.forEach(f => { addCand(f); addCand(f); }); foundVariant = true; }
              if (indexData.stemIndex) {
                const vs = v.length > 4 ? v.replace(/(en|e|n|s)$/,'') : v;
                const hs = indexData.stemIndex.get(vs) ?? indexData.stemIndex.get(v);
                if (hs) { hs.forEach(f => { addCand(f); addCand(f); }); foundVariant = true; }
              }
            }
          }
        }
      }
    }
  }

  if (!lineHasRecognizedToken || candidateHits.size === 0) return null;
  // A very common word ("tomaten") hits hundreds of foods, and the hit count that ranks them
  // here is a coarse retrieval prior, not a quality score - so a correct short entry
  // ("Tomate roh", reached only via the stem index) could be evicted before it was ever scored,
  // in favour of long composite dishes that merely mention the word. 120 keeps those entries in
  // play; raising it further starts admitting marginal candidates that win saturated ties.
  const MAX_CANDIDATES = 120;
  let candidatesToScore: FoodItem[];
  if (candidateHits.size <= MAX_CANDIDATES) {
    candidatesToScore = Array.from(candidateHits.keys());
  } else {
    candidatesToScore = Array.from(candidateHits.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_CANDIDATES).map(e => e[0]);
  }

  for (const food of candidatesToScore) {
    const parenTokens = new Set<string>();
    for (const nm of [food.name, food.name_de].filter(Boolean)) {
      const inParens = String(nm).match(/\(([^)]*)\)/g) || [];
      for (const seg of inParens) {
        for (const t of [...normalize(seg).split(/\s+/), ...asciiFold(seg).split(/\s+/)]) {
          if (t.length > 2) parenTokens.add(t);
        }
      }
    }

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
        { ocr: ocrTokensRaw, food: nameData.tokensRaw, fullOcrStr: ocrTokensRaw.join(' '), fullFoodStr: nameData.rawStr },
        { ocr: ocrTokensAscii, food: nameData.tokensAscii, fullOcrStr: ocrTokensAscii.join(' '), fullFoodStr: nameData.asciiStr }
      ];

      for (const tSet of tokenSets) {
        if (tSet.ocr.length === 0) continue;
        
        let overlapScore = 0;
        let totalWeight = 0;
        let hasFirstFoodTokenCoreMatch = false;
        let coreNounFound = false;
        
        for (let i = 0; i < tSet.ocr.length; i++) {
          const oToken = tSet.ocr[i];
          const isFirstOcrToken = (i === 0);
          let bestTokenScore = 0;
          let bestTokenWasFirstFoodToken = false;
          let candidateHasStrongHit = false;
          
          for (let j = 0; j < tSet.food.length; j++) {
            const nToken = tSet.food[j];
            const isFirstFoodToken = (j === 0);
            
            let minLen = Math.min(oToken.length, nToken.length);
            if (minLen < 4 && oToken !== nToken) continue;

            const dfl = (w: string) => w.length > 4 ? w.replace(/(en|e|n|s)$/,'') : w;
            const oS = dfl(oToken), nS = dfl(nToken);
            if (oToken === nToken || oS === nS) {
              candidateHasStrongHit = true;
            }

            let simScore = 0;
            if (oToken === nToken || nToken.startsWith(oToken) || oToken.startsWith(nToken)) {
              const lenRatio = minLen / Math.max(oToken.length, nToken.length);
              if (oToken === nToken) {
                simScore = 1.0;
              } else if (oS === nS) {
                // Pure German inflection (Tomate/Tomaten, Banane/Bananen): same word, so
                // treat as effectively exact. Without this a plural receipt line ("Tomaten")
                // scores higher against an unrelated entry that happens to be spelled
                // plural ("Tomaten passiert") than against its own singular ("Tomate roh").
                simScore = 0.97;
              } else {
                simScore = 0.5 + (0.35 * lenRatio);
              }
            } else {
              const dist = levenshtein(oToken, nToken);
              const maxLen = Math.max(oToken.length, nToken.length);
              let sim = 1 - (dist / maxLen);
              const dfl = (w: string) => w.length > 4 ? w.replace(/(en|e|n|s)$/,'') : w;
              const oS = dfl(oToken), nS = dfl(nToken);
              if (sim > 0.45 && sim <= 0.75 && (oS !== oToken || nS !== nToken)) {
                const sd = 1 - levenshtein(oS, nS) / Math.max(oS.length, nS.length);
                if (sd > sim) sim = sd;
              }
              if (sim > 0.7) {
                simScore = sim;
              } else if (minLen >= 4 && (nToken.startsWith(oToken) || oToken.startsWith(nToken))) {
                const lenRatio = minLen / maxLen;
                simScore = 0.5 + (0.35 * lenRatio); 
              } else if (minLen >= 5 && (nToken.includes(oToken) || oToken.includes(nToken))) {
                const lenRatio = minLen / maxLen;
                simScore = 0.4 + (0.35 * lenRatio);
              } else if (minLen >= 4) {
                 for (let k=0; k<=oToken.length - 4; k++) {
                   const sub = oToken.substring(k, k+4);
                   if (nToken.startsWith(sub) || nToken.endsWith(sub)) {
                     if (oToken.startsWith(sub) || oToken.endsWith(sub)) {
                       simScore = Math.max(simScore, 0.6);
                     }
                   }
                 }
              }
            }
            
            if (simScore > bestTokenScore) {
              bestTokenScore = simScore;
              bestTokenWasFirstFoodToken = isFirstFoodToken;
            }
          }
          
          const isDescriptorStopword = (t: string) => /^(sort|sortiert|lose|natur|classic|clas|fein|extra|spezial|surt|frisch|hausgemacht|regional|leicht|light|mix|protein|steinofen|ofenfrisch|pur|marken|pikant|toskana|toscana|provence|griechischer|griechische|beutel|tuete|netz|weiss|wei|weisse)$/i.test(t);
          const isCore = isCoreNoun(oToken) || splitHeads.has(oToken);
          
          // Fix 4: Zero-weight multiple core nouns
          let effectiveIsCore = isCore;
          if (isCore) {
            if (coreNounFound) {
              effectiveIsCore = false;
            }
            coreNounFound = true;
          }
          
          // A repeated core noun (e.g. a synonym-expansion step that intentionally restates
          // a word) shouldn't get the 3x/5x boost again, but an exact match is still real
          // evidence and must not be discarded outright - fall back to normal weight=1.
          let weight = isDescriptorStopword(oToken) ? 0 : (effectiveIsCore ? 3 : 1);
          if (splitHeads.has(oToken) && effectiveIsCore) weight = 5;
          if (isFirstOcrToken && effectiveIsCore) weight *= 1.5;

          if (bestTokenScore > 0) {
            if (effectiveIsCore && bestTokenWasFirstFoodToken && bestTokenScore > 0.8) {
              hasFirstFoodTokenCoreMatch = true;
            }
            overlapScore += (bestTokenScore * weight);
          }
          totalWeight += weight;
        }

        let confidence = totalWeight > 0 ? overlapScore / totalWeight : 0;
        if (hasFirstFoodTokenCoreMatch) {
          confidence += 0.08;
        }

        // Compute food token coverage (penalize if OCR is missing lots of food words)
        const IMPLICIT_QUALIFIERS = new Set(['roh','raw','natur','plain','frisch','fresh','min','mind','fat','fett',
        'dry','matter','schwein','rind','pute','kalb','haehnchen','huhn','lamm','pork',
        'beef','veal','kochpoekelware','poekelware','konserve','dose','dosenschinken',
        'cured','canned','geroestet','roasted','gesalzen','salted',
        'getrocknet','dried']); // default/assumed prep state for spices & herbs, rarely restated on a receipt
        const coverageRelevantFoodTokens = tSet.food.filter(t => !IMPLICIT_QUALIFIERS.has(t) && !parenTokens.has(t));
        // Weight coverage by how central each food-name token is (core noun vs. minor
        // descriptor). Otherwise a terse single-word DB name (e.g. "Pfefferkuchen") gets an
        // unfair 100%-coverage advantage over an equally-correct but more descriptive
        // multi-word name (e.g. "Pfeffer schwarz, getrocknet") purely for having fewer words -
        // missing a minor adjective like "schwarz" shouldn't cost as much as missing the noun.
        let matchedFoodTokens = 0;
        let matchedCoverageWeight = 0;
        let totalCoverageWeight = 0;
        for (const nToken of coverageRelevantFoodTokens) {
          const tokenWeight = isCoreNoun(nToken) ? 3 : 1;
          totalCoverageWeight += tokenWeight;
          let hasMatch = false;
          for (const oToken of tSet.ocr) {
            if (nToken === oToken) { hasMatch = true; break; }
            const dist = levenshtein(oToken, nToken);
            const sim = 1 - (dist / Math.max(oToken.length, nToken.length));
            if (sim > 0.6 || (nToken.length >= 4 && (nToken.includes(oToken) || oToken.includes(nToken)))) {
              hasMatch = true; break;
            }
          }
          if (hasMatch) { matchedFoodTokens++; matchedCoverageWeight += tokenWeight; }
        }
        const foodTokenCoverage = totalCoverageWeight > 0 ? (matchedCoverageWeight / totalCoverageWeight) : 1;
        confidence = (confidence * 0.65) + (foodTokenCoverage * 0.35);

        // Full string similarity
        const fullDist = levenshtein(tSet.fullOcrStr, tSet.fullFoodStr);
        const fullSim = 1 - (fullDist / Math.max(tSet.fullOcrStr.length, tSet.fullFoodStr.length));
        
        // Tighten fullSim override
        if (fullSim > confidence && fullSim > 0.6 && confidence > 0.1) confidence = fullSim;

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

        // Special-diet descriptor penalty: "gluten-free"/"lactose-free" etc. are niche variants;
        // don't prefer them over the ordinary product unless the receipt actually says so
        // (e.g. "Knoblauchbaguett" should match plain "Weizenbaguette", not "Baguette glutenfrei").
        // Same shape as the plant-based penalty above.
        const dietKeywords = ['glutenfrei', 'glutenfree', 'laktosefrei', 'lactosefree', 'zuckerfrei', 'sugarfree'];
        const ocrHasDiet = tSet.ocr.some(t => dietKeywords.some(kw => t.includes(kw)));
        const dbHasDiet = tSet.food.some(t => dietKeywords.some(kw => t.includes(kw)));
        if (!ocrHasDiet && dbHasDiet) {
          confidence *= 0.7;
        }

        // Processed-form mismatch penalty. In a German compound the LAST element says what the
        // product actually IS, and some heads denote a wholly different product from the base
        // ingredient. If the receipt line doesn't carry that head, deprioritize such candidates:
        //   "...teig"  -> raw dough, not the baked item  ("Pizzateig" for "Steinofen Pizza")
        //   "...eis"   -> ice cream, not the base food   ("Joghurteis" for "Proteinjoghurt")
        // Guards: "teigwaren" is pasta, not dough; "...reis" is rice, not ice ("Milchreis").
        const isProcessedFormToken = (t: string) =>
          t === 'dough' ||
          (t.endsWith('teig') && !t.includes('waren')) ||
          (t.length >= 6 && t.endsWith('eis') && !t.endsWith('reis'));
        const ocrHasForm = tSet.ocr.some(isProcessedFormToken);
        const dbHasForm = tSet.food.some(isProcessedFormToken);
        if (dbHasForm && !ocrHasForm) {
          confidence *= 0.65;
        }

        // Composite dish penalty: prefer PLAIN base nouns over composite/filled dishes (e.g. donuts filled with pudding)
        const compositeKeywords = ['gefüllt', 'mit', 'dessert', 'sauce', 'aromatisiert'];
        const dbIsComposite = tSet.food.some(t => compositeKeywords.some(kw => t.includes(kw)));
        if (dbIsComposite) {
          confidence *= 0.8; // Penalize so a plain version wins if both match the base noun
        }

        // Implausible categories deprioritization (e.g. Additives, Potash)
        // Check the food's own name only, not its BLS category label - broad category
        // buckets like "Seasonings and condiments/Salt and curing salts" also contain
        // ordinary spices (pepper, basil) and condiments (mustard, ketchup), and checking
        // the category text was deprioritizing all of them as if they were the actual
        // additives (nitrite curing salt, potash, E-numbers) that also live in that bucket.
        // "\bE" (word boundary) avoids false positives like "Type 1700" matching "e 170".
        const isAdditive = /\bE[-\s]?\d{3}\b|additive|chemical|curing salt/i.test(food.name);
        if (isAdditive && confidence < 0.95) {
           confidence *= 0.4;
        }

        // Additive bonus (NOT a hard floor/replace) so relative ranking among core-noun
        // matches is preserved based on their other token overlap, rather than collapsing
        // to identical scores or an artificial ceiling.
        let coreNounFloor = 0;
        for (const oToken of tSet.ocr) {
          for (const nToken of tSet.food) {
            if (!isCoreNoun(nToken) && !isCoreNoun(oToken)) continue;
            if (oToken === nToken) { coreNounFloor = Math.max(coreNounFloor, 0.55); continue; }
            const oS2 = oToken.length > 4 ? oToken.replace(/(en|e|n|s)$/,'') : oToken;
            const nS2 = nToken.length > 4 ? nToken.replace(/(en|e|n|s)$/,'') : nToken;
            const d = levenshtein(oS2, nS2);
            const s = 1 - d / Math.max(oS2.length, nS2.length);
            if (s > 0.75) coreNounFloor = Math.max(coreNounFloor, 0.5);
          }
        }
        confidence = Math.min(0.95, confidence + coreNounFloor * 0.2);

        // Fix 2: Fat Percentage tie-breaker logic. Applied last (after the confidence cap
        // above) so it always separates two otherwise-identical candidates (e.g. 30% vs 36%
        // cream) instead of the cap saturating both to the same score first.
        if (lineFatPct !== null) {
          const foodNameStr = nameData.isFallback ? food.name : (food.name_de || food.name);
          const foodFatMatch = foodNameStr.match(/(\d+(?:[.,]\d+)?)\s*(?:%|fat|fett)/i);
          if (foodFatMatch) {
            const foodFatPct = parseFloat(foodFatMatch[1].replace(',', '.'));
            const diff = Math.abs(lineFatPct - foodFatPct);
            confidence -= (diff * 0.01);
          } else {
            // Give a slight penalty to foods that don't specify fat when OCR text does
            confidence -= 0.05;
          }
        }

        const unmatchedCount = coverageRelevantFoodTokens.length - matchedFoodTokens;
        
        let candidateStrongHit = false;
        // Check if any token had a strong hit
        for (const oToken of tSet.ocr) {
          for (const nToken of tSet.food) {
            const dfl = (w: string) => w.length > 4 ? w.replace(/(en|e|n|s)$/,'') : w;
            if (oToken === nToken || dfl(oToken) === dfl(nToken)) candidateStrongHit = true;
          }
        }

        allMatches.push({ food, confidence, hasStrongHit: candidateStrongHit, unmatchedCount });
      }
    }
  }

  if (allMatches.length === 0) return null;

  allMatches.sort((a, b) => {
    if (Math.abs(b.confidence - a.confidence) <= 0.03) {
      return a.unmatchedCount - b.unmatchedCount;
    }
    return b.confidence - a.confidence;
  });

  const bestMatch = allMatches[0];

  // Return matches even with low confidence so UI can flag them
  return { food: bestMatch.food, confidence: bestMatch.confidence, hasStrongHit: lineHasRecognizedToken };
}

const asciiLow = (s: string) => s.toLowerCase()
  .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');

const META_TOKENS = new Set([
  'pfand', 'leergut', 'summe', 'total', 'mwst', 'steuer', 'rabatt', 'coupon',
  'aktions', 'gutschein', 'rueckgeld', 'visa', 'mastercard', 'maestro',
  'girocard', 'ec-karte', 'gegeben', 'rueck', 'kasse', 'bediener', 'nr',
  'datum', 'uhrzeit', 'artikel', 'netto', 'brutto', 'eur', 'euro',
  'kartenzahlung', 'barzahlung', 'zahlen', 'kreditkarte', 'kontaktlos',
  'kundenbeleg', 'kunden', 'beleg', 'geg', 'bezahlung', 'contactless'
]);
const UNIT = new Set(['st','stk','pck','pkg','btl','lose','vke','sort','ca','ab','pk']);

export function isLikelyProductLine(line: string): boolean {
  const low = line.toLowerCase();
  const asciiLowStr = asciiLow(line);

  // Reject street names (e.g., "Müllerstraße 141")
  if (/[a-z]+strasse(\s+\d+)?$/.test(asciiLowStr)) return false;

  const tokens1 = asciiLowStr.split(/\s+/);
  const wordTokens1 = tokens1.filter(t => /[a-z]{3,}/.test(t) && !UNIT.has(t));
  if (wordTokens1.length === 0) return false;
  
  // Reject legal entity / person names headers
  const legalEntities = new Set(['ohg', 'ohb', 'gmbh', 'inhaber', 'ust', 'uid']);
  if (wordTokens1.some(t => legalEntities.has(t))) return false;

  const hasPrice1 = /\d[.,]\d{2}/.test(low);

  if (line.length < 4) return false;
  if (/^-?\d+([.,]\d+)?\s*(kgx|kg|g|x)?$/.test(low)) return false;
  if (/^\d+\s*x\s*-?\d+[.,]\d{2}/i.test(low)) return false;
  if (/\beur\s*\/\s*kg\b/i.test(low)) return false;
  if (/^\d+[.,]\d+\s*(kg|g)\b/i.test(low)) return false;
  if (/^-?\d+[.,]\d{2}\s*[a-c]?$/i.test(low)) return false;
  if (/www|http|\.de\b|\.com\b|online/i.test(low)) return false;
  if (/[a-zäöü]+stra(ß|ss)e$/i.test(low)) return false;
  if (/^\d+\s*stk\.?\s*x?$/i.test(low)) return false;
  
  const tokens2 = low.replace(/[^\w\s]/g,' ').split(/\s+/).filter(Boolean);
  if (tokens2.some(t => META_TOKENS.has(t))) { return false; }
  
  const storeNames = new Set(['rewe', 'aldi', 'lidl', 'edeka', 'kaufland', 'netto', 'penny']);
  if (tokens2.length > 0 && storeNames.has(tokens2[0])) return false;
  
  const addrWords = new Set(['allee','strasse','straße','platz','weg','gasse','damm','ring','ufer']);
  const hasAddrWord = tokens2.some(t => addrWords.has(t));
  const hasNumberPattern = /\d+(-\d+)?/.test(low);
  const hasPriceSuffix = /[a-c]$/i.test(low);
  const hasPriceForAddr = /\d[.,]\d{2}/.test(low);
  if (hasAddrWord && hasNumberPattern && !hasPriceForAddr && !hasPriceSuffix) {
    return false;
  }

  // Reject postal-code + place-name lines (e.g. "10247 Berlin", "13353 Berlin."): a leading
  // 4-5 digit number followed only by plain word tokens, with no price anywhere on the line.
  // Strip surrounding punctuation from each token first so a trailing "." (e.g. "Berlin.")
  // still counts as a plain place name.
  if (/^\d{4,5}\b/.test(asciiLowStr) && !hasPrice1) {
    const restTokens = tokens1.slice(1).map(t => t.replace(/[^a-z]/g, '')).filter(Boolean);
    if (restTokens.length > 0 && restTokens.every(t => /^[a-z]+$/.test(t))) {
      return false;
    }
  }
  
  if (((line.match(/-/g)||[]).length >= 3) && !/\d[.,]\d{2}/.test(line)) return false;
  
  const wordTokens2 = tokens2.filter(t => /[a-z]{3,}/.test(t) && !UNIT.has(t));
  if (wordTokens2.length === 0) { return false; }
  const hasPrice2 = /\d[.,]\d{2}/.test(low);
  if (!hasPrice2 && wordTokens2.length < 2 && !wordTokens2.some(t => t.length >= 4)) { return false; }
  return true;
}

export function parseReceiptLine(line: string, allFoods: FoodItem[], indexData?: FoodIndexData): ParsedReceiptItem | null {
  if (!isLikelyProductLine(line)) return null;

  const match = matchFoodToOcrText(line, allFoods, indexData);
  
  if (!match || !match.hasStrongHit) {
    const wordTokens = asciiLow(line).split(/\s+/).filter(t => /[a-z]{3,}/.test(t));
    if (wordTokens.length <= 2) {
      return null;
    }
  }

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
