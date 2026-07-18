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

const isCoreNoun = (t: string) => /joghurt|yogurt|milch|milk|kaese|cheese|brot|bread|pudding|flammkuchen|griess|granatapfel|apfel|apple|banane|banana|tomate|tomato|zwiebel|onion|kartoffel|potato|zitrone|lemon|salami|schinken|ham|wurst|sausage|nuss|nuesse|nut|peanut|erdnuss|reis|rice|fisch|fish|fleisch|meat|eier|egg|birne|pear|traube|grape|gurke|cucumber|mozzarella|gouda|parmesan|ricotta|feta|camembert|edamer|pesto|gnocchi|tortelloni|quark|butter|teigwaren|chili|paprika/i.test(t);

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

function matchFoodToOcrText(ocrText: string, allFoods: FoodItem[], indexData?: FoodIndexData): { food: FoodItem, confidence: number } | null {
  // Apply German abbreviation expansions first
  const caseSplit = ocrText
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')   // "NIPizza" -> "NI Pizza"
    .replace(/([a-z])([A-Z])/g, '$1 $2');          // "PizzaSpeciale" -> "Pizza Speciale"

  const HEAD_NOUN_SUFFIXES = ['brot','wurst','kaese','käse','milch','saft','sahne','creme','oel','öl','schinken','pudding','paprika','joghurt','salat','suppe','fleisch','tee','wasser','wein','bier','pizza','reis'];
  const headNounSplit = caseSplit.split(/\s+/).map(word => {
    if (word.length < 8) return word;
    const lower = word.toLowerCase();
    for (const suf of HEAD_NOUN_SUFFIXES) {
      if (lower.endsWith(suf) && lower.length > suf.length + 3) {
        return word.slice(0, word.length - suf.length) + ' ' + word.slice(word.length - suf.length);
      }
    }
    return word;
  }).join(' ');
  // Re-glue spuriously space-split short fragments as an ADDITIONAL variant
  // ("Bai anen"->"Baianen", "Edi isalani"->"Ediisalani")
  const wl = headNounSplit.split(/\s+/);
  const reglued: string[] = [];
  for (let i = 0; i < wl.length; i++) {
    const w = wl[i], nx = wl[i+1];
    if (w.length <= 4 && /^[a-zA-ZäöüÄÖÜß]+$/.test(w) && nx && /^[a-zA-Z]/.test(nx) && nx.length <= 12) {
      reglued.push(w + nx); i++;
    } else reglued.push(w);
  }
  // Keep the ORIGINAL un-case-split text as a variant too: the case-split regex
  // mangles OCR miscapitalizations like "GOuda" -> "G Ouda" (VERIFIED this made
  // "GOuda" return NULL entirely).
  const expandedOcr = expandGermanAbbreviations(headNounSplit) + ' '
    + expandGermanAbbreviations(reglued.join(' ')) + ' '
    + expandGermanAbbreviations(ocrText);
  
  let cleanedOcr = stripNoise(expandedOcr);
  cleanedOcr = cleanedOcr.replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
  const ocrTokensRaw = normalize(cleanedOcr).split(/\s+/).filter(t => t.length > 2);
  const ocrTokensAscii = asciiFold(cleanedOcr).split(/\s+/).filter(t => t.length > 2);
  
  if (ocrTokensRaw.length === 0 && ocrTokensAscii.length === 0) return null;

  let bestMatch: FoodItem | null = null;
  let maxScore = 0;
  
  const candidateHits = new Map<FoodItem, number>();
  const addCand = (f: FoodItem) => candidateHits.set(f, (candidateHits.get(f) ?? 0) + 1);
  if (indexData) {
    const searchTokens = [...new Set([...ocrTokensRaw, ...ocrTokensAscii])];
    for (const token of searchTokens) {
      if (token.length < 3) continue;
      const exact = indexData.index.get(token);
      if (exact) exact.forEach(f => { addCand(f); addCand(f); }); // exact hits weigh double
      const stem = token.length > 4 ? token.replace(/(en|e|n|s)$/,'') : token;
      if (stem !== token && indexData.stemIndex) {
        const st = indexData.stemIndex.get(stem) ?? indexData.stemIndex.get(token);
        if (st) st.forEach(f => { addCand(f); addCand(f); });
      }
      // OCR-confusion variants: single-char substitutions with common misread pairs,
      // looked up EXACTLY (cheap Map.gets). Recovers mid-word typos that poison every
      // n-gram (VERIFIED: "Bat anen" -> "Bananen" -> Banana raw; unreachable before).
      if (!exact && token.length >= 5 && token.length <= 10) {
        const CONF: Record<string, string[]> = { t:['n','i','l'], i:['n','l','t'],
          l:['i','t'], n:['m','t','i','u'], m:['n'], o:['0','e'], u:['n','v'], v:['u'],
          f:['t'], c:['e','o'], e:['c','o'], r:['n'] };
        for (let p = 0; p < token.length; p++) {
          const alts = CONF[token[p]];
          if (!alts) continue;
          for (const a of alts) {
            const v = token.slice(0, p) + a + token.slice(p + 1);
            const hit = indexData.index.get(v);
            if (hit) hit.forEach(f => { addCand(f); addCand(f); });
            if (indexData.stemIndex) {
              const vs = v.length > 4 ? v.replace(/(en|e|n|s)$/,'') : v;
              const hs = indexData.stemIndex.get(vs) ?? indexData.stemIndex.get(v);
              if (hs) hs.forEach(f => { addCand(f); addCand(f); });
            }
          }
        }
      }
      if (token.length >= 4 && indexData.shingleIndex) {
        let found5 = false;
        for (const key of candidateKeysFor(token, indexData.shingleIndex)) {
          // Relaxed acceptance: near-equal length is enough — same-length one-letter
          // typos ("nozzarella"/"mozzarella") can never pass a substring test
          if (key.includes(token) || token.includes(key) || Math.abs(key.length - token.length) <= 2) {
            indexData.index.get(key)!.forEach(addCand);
            found5 = true;
          }
        }
        // 4-gram fallback ONLY for short tokens where one typo kills all 5-grams
        if (!found5 && token.length >= 5 && token.length <= 8 && indexData.fourGramIndex) {
          for (const key of candidateKeysFor4Gram(token, indexData.fourGramIndex)) {
            indexData.index.get(key)!.forEach(addCand);
          }
        }
      }
    }
  }

  if (ocrText.includes('Mix') || ocrText.includes('Grop')) {
    console.log(`[DEBUG] ${ocrText} -> candidateHits size: ${candidateHits.size}`);
  }
  if (candidateHits.size === 0) return null;
  // Score only the most-promising candidates (performance: VERIFIED this halves
  // per-receipt time with zero accuracy loss across the regression suite)
  const MAX_CANDIDATES = 80;
  let candidatesToScore: FoodItem[];
  if (candidateHits.size <= MAX_CANDIDATES) {
    candidatesToScore = Array.from(candidateHits.keys());
  } else {
    candidatesToScore = Array.from(candidateHits.entries())
      .sort((a, b) => b[1] - a[1]).slice(0, MAX_CANDIDATES).map(e => e[0]);
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
        for (const oToken of tSet.ocr) {
          let bestTokenScore = 0;
          for (const nToken of tSet.food) {
            if (nToken === oToken) {
              bestTokenScore = Math.max(bestTokenScore, 1);
            } else {
              const dist = levenshtein(oToken, nToken);
              const maxLen = Math.max(oToken.length, nToken.length);
              const minLen = Math.min(oToken.length, nToken.length);
              let sim = 1 - (dist / maxLen);
              const dfl = (w: string) => w.length > 4 ? w.replace(/(en|e|n|s)$/,'') : w;
              const oS = dfl(oToken), nS = dfl(nToken);
              if (sim > 0.45 && sim <= 0.75 && (oS !== oToken || nS !== nToken)) {
                const sd = 1 - levenshtein(oS, nS) / Math.max(oS.length, nS.length);
                if (sd > sim) sim = sd;
              }
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
          const isDescriptorStopword = (t: string) => /^(sort|sortiert|lose|natur|classic|clas|fein|extra|spezial|surt|frisch|hausgemacht|regional|leicht|light|mix|protein)$/i.test(t);
          const weight = isDescriptorStopword(oToken) ? 0 : (isCoreNoun(oToken) ? 3 : 1);
          
          overlapScore += (bestTokenScore * weight);
          totalWeight += weight;
        }

        let confidence = totalWeight > 0 ? overlapScore / totalWeight : 0;

        // Compute food token coverage (penalize if OCR is missing lots of food words)
        const IMPLICIT_QUALIFIERS = new Set(['roh','raw','natur','plain','frisch','fresh','min','mind','fat','fett',
        'dry','matter','schwein','rind','pute','kalb','haehnchen','huhn','lamm','pork',
        'beef','veal','kochpoekelware','poekelware','konserve','dose','dosenschinken',
        'cured','canned','geroestet','roasted','gesalzen','salted']);
        const coverageRelevantFoodTokens = tSet.food.filter(t => !IMPLICIT_QUALIFIERS.has(t) && !parenTokens.has(t));
        let matchedFoodTokens = 0;
        for (const nToken of coverageRelevantFoodTokens) {
          let hasMatch = false;
          for (const oToken of tSet.ocr) {
            if (nToken === oToken) { hasMatch = true; break; }
            const dist = levenshtein(oToken, nToken);
            const sim = 1 - (dist / Math.max(oToken.length, nToken.length));
            if (sim > 0.6 || (nToken.length >= 4 && (nToken.includes(oToken) || oToken.includes(nToken)))) {
              hasMatch = true; break;
            }
          }
          if (hasMatch) matchedFoodTokens++;
        }
        const foodTokenCoverage = coverageRelevantFoodTokens.length > 0 ? (matchedFoodTokens / coverageRelevantFoodTokens.length) : 1;
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

        // Composite dish penalty: prefer PLAIN base nouns over composite/filled dishes (e.g. donuts filled with pudding)
        const compositeKeywords = ['gefüllt', 'mit', 'dessert', 'sauce', 'aromatisiert'];
        const dbIsComposite = tSet.food.some(t => compositeKeywords.some(kw => t.includes(kw)));
        if (dbIsComposite) {
          confidence *= 0.8; // Penalize so a plain version wins if both match the base noun
        }

        // Implausible categories deprioritization (e.g. Additives, Potash)
        const isAdditive = /E\s?\d{3}|additive|chemical|curing salt|ingredient/i.test(food.name + ' ' + food.swiss_category);
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

        if (confidence > maxScore) {
          maxScore = confidence;
          bestMatch = food;
        }
        
          // Early Exit (only for non-fallback native matches)
        if (maxScore > 0.95 && bestMatch && !nameData.isFallback) {
          // console.log(`[DEBUG] Early exit for ${bestMatch.name_de} with score ${maxScore}`);
          return { food: bestMatch, confidence: maxScore };
        }
      }
    }
    
    // DEBUG:
    if (ocrText.includes('Mix') || ocrText.includes('Grop')) {
       // console.log(`[DEBUG] ${food.name_de || food.name} -> score: ${confidence}`);
    }
  }

  // Return matches even with low confidence so UI can flag them
  if (bestMatch) {
    if (ocrText.includes('Mix') || ocrText.includes('Grop')) console.log(`[DEBUG WINNER] ${bestMatch.name_de || bestMatch.name} with score ${maxScore}`);
    return { food: bestMatch, confidence: maxScore };
  }
  return null;
}

const asciiLow = (s: string) => s.toLowerCase()
  .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss');

const META_TOKENS = new Set([
  'summe','zwischensumme','gesamt','total','betrag','eur','euro','ust','mwst','steuer',
  'kartenzahlung','karte','karten','bar','ec','girocard','visa','mastercard','maestro',
  'rueckgeld','wechselgeld','gegeben','geg','kundenbeleg','beleg','filiale','markt',
  'discount','marken','netto','rewe','edeka','lidl','aldi','kaufland','penny',
  'www','http','https','de','com','uid','ustid','tel','telefon','datum','uhrzeit','bon','id',
  'terminal','trace','berlin','hamburg','muenchen','koeln','allee','strasse','platz','weg'
]);
const UNIT = new Set(['st','stk','pck','pkg','btl','lose','vke','sort','ca','ab','pk']);

export function isLikelyProductLine(raw: string): boolean {
  const line = raw.trim();
  if (line.length < 4) return false;
  const low = asciiLow(line);
  if (/^-?\d+([.,]\d+)?\s*(kgx|kg|g|x)?$/.test(low)) return false;
  if (/^\d+\s*x\s*-?\d+[.,]\d{2}/i.test(low)) return false;
  if (/\beur\s*\/\s*kg\b/i.test(low)) return false;
  if (/^\d+[.,]\d+\s*(kg|g)\b/i.test(low)) return false;
  if (/^-?\d+[.,]\d{2}\s*[a-c]?$/i.test(low)) return false;
  if (/www|http|\.de\b|\.com\b|online/i.test(low)) return false;
  if (/\b\d{4,5}\b/.test(low) && /(allee|strasse|str\.|platz|weg|berlin|hamburg)/i.test(low)) return false;
  if (((line.match(/-/g)||[]).length >= 3) && !/\d[.,]\d{2}/.test(line)) return false;
  const tokens = low.replace(/[^\w\s]/g,' ').split(/\s+/).filter(Boolean);
  if (tokens.some(t => META_TOKENS.has(t))) { console.log('META_TOKENS'); return false; }
  const wordTokens = tokens.filter(t => /[a-z]{3,}/.test(t) && !UNIT.has(t));
  if (wordTokens.length === 0) { console.log('wordTokens === 0'); return false; }
  const hasPrice = /\d[.,]\d{2}/.test(low);
  if (!hasPrice && wordTokens.length < 2 && !wordTokens.some(t => t.length >= 4)) { console.log('no price and short'); return false; }
  return true;
}

export function parseReceiptLine(line: string, allFoods: FoodItem[], indexData?: FoodIndexData): ParsedReceiptItem | null {
  if (!isLikelyProductLine(line)) return null;

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
