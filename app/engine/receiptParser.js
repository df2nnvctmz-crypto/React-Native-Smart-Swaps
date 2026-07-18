"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.asciiFold = exports.normalize = void 0;
exports.isLikelyProductLine = isLikelyProductLine;
exports.parseReceiptLine = parseReceiptLine;
exports.parseReceipt = parseReceipt;
var normalize = function (text) {
    return text.toLowerCase()
        .replace(/ä/g, '__AUM__').replace(/ö/g, '__OUM__').replace(/ü/g, '__UUM__').replace(/ß/g, '__SZ__')
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/__AUM__/g, 'ä').replace(/__OUM__/g, 'ö').replace(/__UUM__/g, 'ü').replace(/__SZ__/g, 'ß')
        .replace(/[\.\-\/]/g, ' ')
        .replace(/[^\w\säöüß]/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};
exports.normalize = normalize;
var asciiFold = function (text) {
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
exports.asciiFold = asciiFold;
function levenshtein(a, b) {
    var an = a ? a.length : 0;
    var bn = b ? b.length : 0;
    if (an === 0)
        return bn;
    if (bn === 0)
        return an;
    var matrix = new Array(bn + 1);
    for (var i = 0; i <= bn; ++i) {
        var row = matrix[i] = new Array(an + 1);
        row[0] = i;
    }
    var firstRow = matrix[0];
    for (var j = 1; j <= an; ++j) {
        firstRow[j] = j;
    }
    for (var i = 1; i <= bn; ++i) {
        for (var j = 1; j <= an; ++j) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            }
            else {
                matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, // substitution
                matrix[i][j - 1] + 1, // insertion
                matrix[i - 1][j] + 1 // deletion
                );
            }
        }
    }
    return matrix[bn][an];
}
var germanAbbreviations_1 = require("./germanAbbreviations");
function stripNoise(text) {
    var cleaned = text.toLowerCase();
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
function candidateKeysFor(token, shingleIndex) {
    var keys = new Set();
    if (token.length < 5) {
        var direct = shingleIndex.get(token);
        if (direct)
            direct.forEach(function (k) { return keys.add(k); });
        return keys;
    }
    for (var i = 0; i <= token.length - 5; i++) {
        var bucket = shingleIndex.get(token.substring(i, i + 5));
        if (bucket)
            bucket.forEach(function (k) { return keys.add(k); });
    }
    return keys;
}
var isCoreNoun = function (t) { return /joghurt|yogurt|milch|milk|kaese|cheese|brot|bread|pudding|flammkuchen|griess|granatapfel|apfel|apple|banane|banana|tomate|tomato|zwiebel|onion|kartoffel|potato|zitrone|lemon|salami|schinken|ham|wurst|sausage|nuss|nuesse|nut|peanut|erdnuss|reis|rice|fisch|fish|fleisch|meat|eier|egg|birne|pear|traube|grape|gurke|cucumber|mozzarella|gouda|parmesan|ricotta|feta|camembert|edamer|pesto|gnocchi|tortelloni|quark|butter|teigwaren|chili|paprika|skyr|baguette|baguett|roggen|ravioli/i.test(t); };
function candidateKeysFor4Gram(token, fourGramIndex) {
    var keys = new Set();
    if (token.length < 4)
        return keys;
    for (var i = 0; i <= token.length - 4; i++) {
        var bucket = fourGramIndex.get(token.substring(i, i + 4));
        if (bucket)
            for (var _i = 0, bucket_1 = bucket; _i < bucket_1.length; _i++) {
                var k = bucket_1[_i];
                if (Math.abs(k.length - token.length) <= 2)
                    keys.add(k);
            }
    }
    return keys;
}
function matchFoodToOcrText(ocrText, allFoods, indexData) {
    var _a, _b, _c, _d, _e;
    // Apply German abbreviation expansions first
    var caseSplit = ocrText
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // "NIPizza" -> "NI Pizza"
        .replace(/([a-z])([A-Z])/g, '$1 $2'); // "PizzaSpeciale" -> "Pizza Speciale"
    var HEAD_NOUN_SUFFIXES = ['brot', 'wurst', 'kaese', 'käse', 'milch', 'saft', 'sahne', 'creme', 'oel', 'öl', 'schinken', 'pudding', 'paprika', 'joghurt', 'salat', 'suppe', 'fleisch', 'tee', 'wasser', 'wein', 'bier', 'pizza', 'reis', 'baguette', 'baguett', 'mais', 'quark', 'nudeln', 'butter'];
    var splitHeads = new Set();
    var headNounSplit = caseSplit.split(/\s+/).map(function (word) {
        if (word.length < 8)
            return word;
        var lower = word.toLowerCase();
        for (var _i = 0, HEAD_NOUN_SUFFIXES_1 = HEAD_NOUN_SUFFIXES; _i < HEAD_NOUN_SUFFIXES_1.length; _i++) {
            var suf = HEAD_NOUN_SUFFIXES_1[_i];
            if (lower.endsWith(suf) && lower.length > suf.length + 3) {
                splitHeads.add(suf);
                return word.slice(0, word.length - suf.length) + ' ' + word.slice(word.length - suf.length);
            }
            var tail = lower.slice(-suf.length);
            if (tail.length === suf.length && levenshtein(tail, suf) <= 1 && lower.length > suf.length + 3) {
                splitHeads.add(suf);
                return word.slice(0, word.length - suf.length) + ' ' + suf;
            }
            if (suf.length > 3) {
                var tailMinus1 = lower.slice(-(suf.length - 1));
                if (tailMinus1.length === suf.length - 1 && levenshtein(tailMinus1, suf) <= 1 && lower.length > suf.length + 2) {
                    splitHeads.add(suf);
                    return word.slice(0, word.length - tailMinus1.length) + ' ' + suf;
                }
                var tailPlus1 = lower.slice(-(suf.length + 1));
                if (tailPlus1.length === suf.length + 1 && levenshtein(tailPlus1, suf) <= 1 && lower.length > suf.length + 4) {
                    splitHeads.add(suf);
                    return word.slice(0, word.length - tailPlus1.length) + ' ' + suf;
                }
            }
        }
        return word;
    }).join(' ');
    // Re-glue spuriously space-split short fragments as an ADDITIONAL variant
    // ("Bai anen"->"Baianen", "Edi isalani"->"Ediisalani")
    var wl = headNounSplit.split(/\s+/);
    var reglued = [];
    for (var i = 0; i < wl.length; i++) {
        var w = wl[i], nx = wl[i + 1];
        if (nx && (w.length <= 4 || nx.length <= 4) && (w.length + nx.length) <= 14 && /^[a-zA-ZäöüÄÖÜß]+$/.test(w) && /^[a-zA-ZäöüÄÖÜß]+$/.test(nx)) {
            reglued.push(w + nx);
            i++;
        }
        else
            reglued.push(w);
    }
    // Keep the ORIGINAL un-case-split text as a variant too: the case-split regex
    // mangles OCR miscapitalizations like "GOuda" -> "G Ouda" (VERIFIED this made
    // "GOuda" return NULL entirely).
    var expandedOcr = (0, germanAbbreviations_1.expandGermanAbbreviations)(headNounSplit) + ' '
        + (0, germanAbbreviations_1.expandGermanAbbreviations)(reglued.join(' ')) + ' '
        + (0, germanAbbreviations_1.expandGermanAbbreviations)(ocrText);
    var cleanedOcr = stripNoise(expandedOcr);
    cleanedOcr = cleanedOcr.replace(/\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
    var ocrTokensRaw = (0, exports.normalize)(cleanedOcr).split(/\s+/).filter(function (t) { return t.length > 2; });
    var ocrTokensAscii = (0, exports.asciiFold)(cleanedOcr).split(/\s+/).filter(function (t) { return t.length > 2; });
    if (ocrTokensRaw.length === 0 && ocrTokensAscii.length === 0)
        return null;
    var bestMatch = null;
    var maxScore = 0;
    var candidateHits = new Map();
    var addCand = function (f) { var _a; return candidateHits.set(f, ((_a = candidateHits.get(f)) !== null && _a !== void 0 ? _a : 0) + 1); };
    if (indexData) {
        var searchTokens = Array.from(new Set(ocrTokensRaw.concat(ocrTokensAscii)));
        for (var _i = 0, searchTokens_1 = searchTokens; _i < searchTokens_1.length; _i++) {
            var token = searchTokens_1[_i];
            if (token.length < 3)
                continue;
            var exact = indexData.index.get(token);
            if (exact)
                exact.forEach(function (f) { addCand(f); addCand(f); }); // exact hits weigh double
            var stem = token.length > 4 ? token.replace(/(en|e|n|s)$/, '') : token;
            if (stem !== token && indexData.stemIndex) {
                var st = (_a = indexData.stemIndex.get(stem)) !== null && _a !== void 0 ? _a : indexData.stemIndex.get(token);
                if (st)
                    st.forEach(function (f) { addCand(f); addCand(f); });
            }
            // OCR-confusion variants: single-char substitutions with common misread pairs,
            // looked up EXACTLY (cheap Map.gets). Recovers mid-word typos that poison every
            // n-gram (VERIFIED: "Bat anen" -> "Bananen" -> Banana raw; unreachable before).
            var foundVariant = false;
            if (!exact && token.length >= 5 && token.length <= 10) {
                var CONF = { t: ['n', 'i', 'l'], i: ['n', 'l', 't'],
                    l: ['i', 't'], n: ['m', 't', 'i', 'u', 'w'], m: ['n'], o: ['0', 'e', 'u'], u: ['n', 'v', 'o'], v: ['u'],
                    f: ['t'], c: ['e', 'o'], e: ['c', 'o', 's'], r: ['n'], d: ['g', 'b'], g: ['d'], s: ['e'], q: ['o'], w: ['n'], b: ['d'] };
                for (var p = 0; p < token.length; p++) {
                    var alts = CONF[token[p]];
                    if (!alts)
                        continue;
                    for (var _f = 0, alts_1 = alts; _f < alts_1.length; _f++) {
                        var a = alts_1[_f];
                        var v = token.slice(0, p) + a + token.slice(p + 1);
                        var hit = indexData.index.get(v);
                        if (hit) {
                            hit.forEach(function (f) { addCand(f); addCand(f); });
                            foundVariant = true;
                        }
                        if (indexData.stemIndex) {
                            var vs = v.length > 4 ? v.replace(/(en|e|n|s)$/, '') : v;
                            var hs = (_b = indexData.stemIndex.get(vs)) !== null && _b !== void 0 ? _b : indexData.stemIndex.get(v);
                            if (hs) {
                                hs.forEach(function (f) { addCand(f); addCand(f); });
                                foundVariant = true;
                            }
                        }
                    }
                }
                // Deletion variants
                if (!foundVariant) {
                    for (var p = 0; p < token.length; p++) {
                        var v = token.slice(0, p) + token.slice(p + 1);
                        var hit = indexData.index.get(v);
                        if (hit) {
                            hit.forEach(function (f) { addCand(f); addCand(f); });
                            foundVariant = true;
                        }
                        if (indexData.stemIndex) {
                            var vs = v.length > 4 ? v.replace(/(en|e|n|s)$/, '') : v;
                            var hs = (_c = indexData.stemIndex.get(vs)) !== null && _c !== void 0 ? _c : indexData.stemIndex.get(v);
                            if (hs) {
                                hs.forEach(function (f) { addCand(f); addCand(f); });
                                foundVariant = true;
                            }
                        }
                    }
                }
                // Insertion variants
                if (!foundVariant && token.length <= 9) {
                    var a_z = 'abcdefghijklmnopqrstuvwxyz';
                    for (var p = 0; p <= token.length; p++) {
                        for (var charIdx = 0; charIdx < 26; charIdx++) {
                            var v = token.slice(0, p) + a_z[charIdx] + token.slice(p);
                            var hit = indexData.index.get(v);
                            if (hit) {
                                hit.forEach(function (f) { addCand(f); addCand(f); });
                                foundVariant = true;
                            }
                            if (indexData.stemIndex) {
                                var vs = v.length > 4 ? v.replace(/(en|e|n|s)$/, '') : v;
                                var hs = (_d = indexData.stemIndex.get(vs)) !== null && _d !== void 0 ? _d : indexData.stemIndex.get(v);
                                if (hs) {
                                    hs.forEach(function (f) { addCand(f); addCand(f); });
                                    foundVariant = true;
                                }
                            }
                        }
                    }
                }
            }
            if (token.length >= 4 && indexData.shingleIndex) {
                var found5 = false;
                for (var _g = 0, _h = candidateKeysFor(token, indexData.shingleIndex); _g < _h.length; _g++) {
                    var key = _h[_g];
                    // Relaxed acceptance: near-equal length is enough — same-length one-letter
                    // typos ("nozzarella"/"mozzarella") can never pass a substring test
                    if (key.includes(token) || token.includes(key) || Math.abs(key.length - token.length) <= 2) {
                        indexData.index.get(key).forEach(addCand);
                        found5 = true;
                    }
                }
                // 4-gram fallback ONLY for short tokens where one typo kills all 5-grams
                if (!found5 && token.length >= 5 && token.length <= 8 && indexData.fourGramIndex) {
                    for (var _j = 0, _k = candidateKeysFor4Gram(token, indexData.fourGramIndex); _j < _k.length; _j++) {
                        var key = _k[_j];
                        indexData.index.get(key).forEach(addCand);
                    }
                }
            }
        }
    }
    if (ocrText.includes('Mix') || ocrText.includes('Grop')) {
        console.log("[DEBUG] ".concat(ocrText, " -> candidateHits size: ").concat(candidateHits.size));
    }
    if (candidateHits.size === 0)
        return null;
    // Score only the most-promising candidates (performance: VERIFIED this halves
    // per-receipt time with zero accuracy loss across the regression suite)
    var MAX_CANDIDATES = 80;
    var candidatesToScore;
    if (candidateHits.size <= MAX_CANDIDATES) {
        candidatesToScore = Array.from(candidateHits.keys());
    }
    else {
        candidatesToScore = Array.from(candidateHits.entries())
            .sort(function (a, b) { return b[1] - a[1]; }).slice(0, MAX_CANDIDATES).map(function (e) { return e[0]; });
    }
    var _loop_1 = function (food) {
        var parenTokens = new Set();
        for (var _m = 0, _o = [food.name, food.name_de].filter(Boolean); _m < _o.length; _m++) {
            var nm = _o[_m];
            var inParens = String(nm).match(/\(([^)]*)\)/g) || [];
            for (var _p = 0, inParens_1 = inParens; _p < inParens_1.length; _p++) {
                var seg = inParens_1[_p];
                for (var _q = 0, _r = __spreadArray(__spreadArray([], (0, exports.normalize)(seg).split(/\s+/), true), (0, exports.asciiFold)(seg).split(/\s+/), true); _q < _r.length; _q++) {
                    var t = _r[_q];
                    if (t.length > 2)
                        parenTokens.add(t);
                }
            }
        }
        var namesToTest = [];
        if ((_e = indexData === null || indexData === void 0 ? void 0 : indexData.cache) === null || _e === void 0 ? void 0 : _e.has(food.id)) {
            var cached = indexData.cache.get(food.id);
            if (cached.de) {
                namesToTest.push(__assign(__assign({}, cached.de), { isFallback: false }));
            }
            namesToTest.push(__assign(__assign({}, cached.en), { isFallback: true }));
        }
        else {
            // Fallback if no cache
            if (food.name_de) {
                namesToTest.push({
                    rawStr: (0, exports.normalize)(food.name_de),
                    asciiStr: (0, exports.asciiFold)(food.name_de),
                    tokensRaw: (0, exports.normalize)(food.name_de).split(/\s+/).filter(function (t) { return t.length > 2; }),
                    tokensAscii: (0, exports.asciiFold)(food.name_de).split(/\s+/).filter(function (t) { return t.length > 2; }),
                    isFallback: false
                });
            }
            namesToTest.push({
                rawStr: (0, exports.normalize)(food.name),
                asciiStr: (0, exports.asciiFold)(food.name),
                tokensRaw: (0, exports.normalize)(food.name).split(/\s+/).filter(function (t) { return t.length > 2; }),
                tokensAscii: (0, exports.asciiFold)(food.name).split(/\s+/).filter(function (t) { return t.length > 2; }),
                isFallback: true
            });
        }
        for (var _s = 0, namesToTest_1 = namesToTest; _s < namesToTest_1.length; _s++) {
            var nameData = namesToTest_1[_s];
            // Test both raw tokens and ascii tokens against food names
            var tokenSets = [
                { ocr: ocrTokensRaw, food: nameData.tokensRaw, fullOcrStr: ocrTokensRaw.join(' '), fullFoodStr: nameData.rawStr },
                { ocr: ocrTokensAscii, food: nameData.tokensAscii, fullOcrStr: ocrTokensAscii.join(' '), fullFoodStr: nameData.asciiStr }
            ];
            var _loop_2 = function (tSet) {
                if (tSet.ocr.length === 0)
                    return "continue";
                var overlapScore = 0;
                var totalWeight = 0;
                for (var i = 0; i < tSet.ocr.length; i++) {
                    var oToken = tSet.ocr[i];
                    var isFirstOcrToken = (i === 0);
                    var bestTokenScore = 0;
                    var bestTokenWasFirstFoodToken = false;
                    for (var j = 0; j < tSet.food.length; j++) {
                        var nToken = tSet.food[j];
                        var isFirstFoodToken = (j === 0);
                        var minLen = Math.min(oToken.length, nToken.length);
                        if (minLen < 4 && oToken !== nToken)
                            continue;
                        var simScore = 0;
                        if (oToken === nToken || nToken.startsWith(oToken) || oToken.startsWith(nToken)) {
                            var lenRatio = minLen / Math.max(oToken.length, nToken.length);
                            simScore = oToken === nToken ? 1.0 : 0.5 + (0.35 * lenRatio);
                        }
                        else {
                            var dist = levenshtein(oToken, nToken);
                            var maxLen = Math.max(oToken.length, nToken.length);
                            var sim = 1 - (dist / maxLen);
                            var dfl = function (w) { return w.length > 4 ? w.replace(/(en|e|n|s)$/, '') : w; };
                            var oS = dfl(oToken), nS = dfl(nToken);
                            if (sim > 0.45 && sim <= 0.75 && (oS !== oToken || nS !== nToken)) {
                                var sd = 1 - levenshtein(oS, nS) / Math.max(oS.length, nS.length);
                                if (sd > sim)
                                    sim = sd;
                            }
                            if (sim > 0.7) {
                                simScore = sim;
                            }
                            else if (minLen >= 4 && (nToken.startsWith(oToken) || oToken.startsWith(nToken))) {
                                var lenRatio = minLen / maxLen;
                                simScore = 0.5 + (0.35 * lenRatio);
                            }
                            else if (minLen >= 5 && (nToken.includes(oToken) || oToken.includes(nToken))) {
                                var lenRatio = minLen / maxLen;
                                simScore = 0.4 + (0.35 * lenRatio);
                            }
                            else if (minLen >= 4) {
                                for (var k = 0; k <= oToken.length - 4; k++) {
                                    var sub = oToken.substring(k, k + 4);
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
                    var isDescriptorStopword = function (t) { return /^(sort|sortiert|lose|natur|classic|clas|fein|extra|spezial|surt|frisch|hausgemacht|regional|leicht|light|mix|protein|steinofen|ofenfrisch|pur|marken|pikant|toskana|toscana|provence|griechischer|griechische)$/i.test(t); };
                    var isCore = isCoreNoun(oToken) || splitHeads.has(oToken);
                    var weight = isDescriptorStopword(oToken) ? 0 : (isCore ? 3 : 1);
                    if (splitHeads.has(oToken))
                        weight = 5;
                    if (isFirstOcrToken && isCore)
                        weight *= 1.5;
                    if (bestTokenScore > 0) {
                        var adjustedScore = bestTokenScore;
                        // First food token bonus (+0.08)
                        if (isCore && bestTokenWasFirstFoodToken && bestTokenScore > 0.8) {
                            adjustedScore += 0.08;
                        }
                        overlapScore += (adjustedScore * weight);
                    }
                    totalWeight += weight;
                }
                var confidence = totalWeight > 0 ? overlapScore / totalWeight : 0;
                // Compute food token coverage (penalize if OCR is missing lots of food words)
                var IMPLICIT_QUALIFIERS = new Set(['roh', 'raw', 'natur', 'plain', 'frisch', 'fresh', 'min', 'mind', 'fat', 'fett',
                    'dry', 'matter', 'schwein', 'rind', 'pute', 'kalb', 'haehnchen', 'huhn', 'lamm', 'pork',
                    'beef', 'veal', 'kochpoekelware', 'poekelware', 'konserve', 'dose', 'dosenschinken',
                    'cured', 'canned', 'geroestet', 'roasted', 'gesalzen', 'salted']);
                var coverageRelevantFoodTokens = tSet.food.filter(function (t) { return !IMPLICIT_QUALIFIERS.has(t) && !parenTokens.has(t); });
                var matchedFoodTokens = 0;
                for (var _u = 0, coverageRelevantFoodTokens_1 = coverageRelevantFoodTokens; _u < coverageRelevantFoodTokens_1.length; _u++) {
                    var nToken = coverageRelevantFoodTokens_1[_u];
                    var hasMatch = false;
                    for (var _v = 0, _w = tSet.ocr; _v < _w.length; _v++) {
                        var oToken = _w[_v];
                        if (nToken === oToken) {
                            hasMatch = true;
                            break;
                        }
                        var dist = levenshtein(oToken, nToken);
                        var sim = 1 - (dist / Math.max(oToken.length, nToken.length));
                        if (sim > 0.6 || (nToken.length >= 4 && (nToken.includes(oToken) || oToken.includes(nToken)))) {
                            hasMatch = true;
                            break;
                        }
                    }
                    if (hasMatch)
                        matchedFoodTokens++;
                }
                var foodTokenCoverage = coverageRelevantFoodTokens.length > 0 ? (matchedFoodTokens / coverageRelevantFoodTokens.length) : 1;
                confidence = (confidence * 0.65) + (foodTokenCoverage * 0.35);
                // Full string similarity
                var fullDist = levenshtein(tSet.fullOcrStr, tSet.fullFoodStr);
                var fullSim = 1 - (fullDist / Math.max(tSet.fullOcrStr.length, tSet.fullFoodStr.length));
                // Tighten fullSim override
                if (fullSim > confidence && fullSim > 0.6 && confidence > 0.1)
                    confidence = fullSim;
                // Apply fallback penalty: English matches need to be much better to beat German native matches
                if (nameData.isFallback) {
                    confidence *= 0.85;
                }
                // Category switch penalty: if OCR doesn't mention plant-based terms, don't fallback to them
                var plantBasedKeywords = ['vegan', 'soja', 'pflanzlich', 'vegetarisch', 'alternative', 'tofu'];
                var ocrHasPlant = tSet.ocr.some(function (t) { return plantBasedKeywords.some(function (kw) { return t.includes(kw); }); });
                var dbHasPlant = tSet.food.some(function (t) { return plantBasedKeywords.some(function (kw) { return t.includes(kw); }); });
                if (!ocrHasPlant && dbHasPlant) {
                    confidence *= 0.6; // Heavy penalty
                }
                // Composite dish penalty: prefer PLAIN base nouns over composite/filled dishes (e.g. donuts filled with pudding)
                var compositeKeywords = ['gefüllt', 'mit', 'dessert', 'sauce', 'aromatisiert'];
                var dbIsComposite = tSet.food.some(function (t) { return compositeKeywords.some(function (kw) { return t.includes(kw); }); });
                if (dbIsComposite) {
                    confidence *= 0.8; // Penalize so a plain version wins if both match the base noun
                }
                // Implausible categories deprioritization (e.g. Additives, Potash)
                var isAdditive = /E\s?\d{3}|additive|chemical|curing salt|ingredient/i.test(food.name + ' ' + food.swiss_category);
                if (isAdditive && confidence < 0.95) {
                    confidence *= 0.4;
                }
                // Additive bonus (NOT a hard floor/replace) so relative ranking among core-noun
                // matches is preserved based on their other token overlap, rather than collapsing
                // to identical scores or an artificial ceiling.
                var coreNounFloor = 0;
                for (var _x = 0, _y = tSet.ocr; _x < _y.length; _x++) {
                    var oToken = _y[_x];
                    for (var _z = 0, _0 = tSet.food; _z < _0.length; _z++) {
                        var nToken = _0[_z];
                        if (!isCoreNoun(nToken) && !isCoreNoun(oToken))
                            continue;
                        if (oToken === nToken) {
                            coreNounFloor = Math.max(coreNounFloor, 0.55);
                            continue;
                        }
                        var oS2 = oToken.length > 4 ? oToken.replace(/(en|e|n|s)$/, '') : oToken;
                        var nS2 = nToken.length > 4 ? nToken.replace(/(en|e|n|s)$/, '') : nToken;
                        var d = levenshtein(oS2, nS2);
                        var s = 1 - d / Math.max(oS2.length, nS2.length);
                        if (s > 0.75)
                            coreNounFloor = Math.max(coreNounFloor, 0.5);
                    }
                }
                confidence = Math.min(0.95, confidence + coreNounFloor * 0.2);
                if (confidence > maxScore) {
                    maxScore = confidence;
                    bestMatch = food;
                }
                // Early Exit (only for non-fallback native matches)
                if (maxScore > 0.95 && bestMatch && !nameData.isFallback) {
                    return { value: { food: bestMatch, confidence: maxScore } };
                }
            };
            for (var _t = 0, tokenSets_1 = tokenSets; _t < tokenSets_1.length; _t++) {
                var tSet = tokenSets_1[_t];
                var state_2 = _loop_2(tSet);
                if (typeof state_2 === "object")
                    return state_2;
            }
        }
        // DEBUG:
        if (ocrText.includes('Mix') || ocrText.includes('Grop')) {
            // console.log(`[DEBUG] ${food.name_de || food.name} -> score: ${confidence}`);
        }
    };
    for (var _l = 0, candidatesToScore_1 = candidatesToScore; _l < candidatesToScore_1.length; _l++) {
        var food = candidatesToScore_1[_l];
        var state_1 = _loop_1(food);
        if (typeof state_1 === "object")
            return state_1.value;
    }
    // Return matches even with low confidence so UI can flag them
    if (bestMatch) {
        if (ocrText.includes('Mix') || ocrText.includes('Grop'))
            console.log("[DEBUG WINNER] ".concat(bestMatch.name_de || bestMatch.name, " with score ").concat(maxScore));
        return { food: bestMatch, confidence: maxScore };
    }
    return null;
}
var asciiLow = function (s) { return s.toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'); };
var META_TOKENS = new Set([
    'pfand', 'leergut', 'summe', 'total', 'mwst', 'steuer', 'rabatt', 'coupon',
    'aktions', 'gutschein', 'rueckgeld', 'visa', 'mastercard', 'maestro',
    'girocard', 'ec-karte', 'gegeben', 'rueck', 'kasse', 'bediener', 'nr',
    'datum', 'uhrzeit', 'artikel', 'netto', 'brutto', 'eur', 'euro',
    'kartenzahlung', 'barzahlung', 'zahlen', 'kreditkarte', 'kontaktlos',
    'kundenbeleg', 'kunden', 'beleg', 'geg'
]);
var UNIT = new Set(['st', 'stk', 'pck', 'pkg', 'btl', 'lose', 'vke', 'sort', 'ca', 'ab', 'pk']);
function isLikelyProductLine(line) {
    var low = line.toLowerCase();
    var asciiLowStr = asciiLow(line);
    // Reject street names (e.g., "Müllerstraße 141")
    if (/[a-z]+strasse(\s+\d+)?$/.test(asciiLowStr))
        return false;
    var tokens1 = asciiLowStr.split(/\s+/);
    var wordTokens1 = tokens1.filter(function (t) { return /[a-z]{3,}/.test(t) && !UNIT.has(t); });
    if (wordTokens1.length === 0)
        return false;
    // Reject legal entity / person names headers
    var legalEntities = new Set(['ohg', 'ohb', 'gmbh', 'inhaber', 'ust', 'uid']);
    if (wordTokens1.some(function (t) { return legalEntities.has(t); }))
        return false;
    var hasPrice1 = /\d[.,]\d{2}/.test(low);
    if (line.length < 4)
        return false;
    if (/^-?\d+([.,]\d+)?\s*(kgx|kg|g|x)?$/.test(low))
        return false;
    if (/^\d+\s*x\s*-?\d+[.,]\d{2}/i.test(low))
        return false;
    if (/\beur\s*\/\s*kg\b/i.test(low))
        return false;
    if (/^\d+[.,]\d+\s*(kg|g)\b/i.test(low))
        return false;
    if (/^-?\d+[.,]\d{2}\s*[a-c]?$/i.test(low))
        return false;
    if (/www|http|\.de\b|\.com\b|online/i.test(low))
        return false;
    if (/[a-zäöü]+stra(ß|ss)e$/i.test(low))
        return false;
    if (/^\d+\s*stk\.?\s*x?$/i.test(low))
        return false;
    if (/\b\d{4,5}\b/.test(low) && /(allee|strasse|str\.|platz|weg|berlin|hamburg)/i.test(low))
        return false;
    if (((line.match(/-/g) || []).length >= 3) && !/\d[.,]\d{2}/.test(line))
        return false;
    var tokens2 = low.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (tokens2.some(function (t) { return META_TOKENS.has(t); })) {
        return false;
    }
    var wordTokens2 = tokens2.filter(function (t) { return /[a-z]{3,}/.test(t) && !UNIT.has(t); });
    if (wordTokens2.length === 0) {
        return false;
    }
    var hasPrice2 = /\d[.,]\d{2}/.test(low);
    if (!hasPrice2 && wordTokens2.length < 2 && !wordTokens2.some(function (t) { return t.length >= 4; })) {
        return false;
    }
    return true;
}
function parseReceiptLine(line, allFoods, indexData) {
    if (!isLikelyProductLine(line))
        return null;
    var match = matchFoodToOcrText(line, allFoods, indexData);
    return {
        rawText: line,
        matchedFood: match ? match.food : null,
        confidence: match ? match.confidence : 0
    };
}
// Keep synchronous version around for non-chunked tests or legacy usage
function parseReceipt(ocrLines, allFoods, indexData) {
    var results = [];
    for (var _i = 0, ocrLines_1 = ocrLines; _i < ocrLines_1.length; _i++) {
        var line = ocrLines_1[_i];
        var parsed = parseReceiptLine(line, allFoods, indexData);
        if (parsed) {
            results.push(parsed);
        }
    }
    return results;
}
