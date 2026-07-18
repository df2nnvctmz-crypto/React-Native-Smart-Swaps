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
var normalize = function (text) { return text.toLowerCase().replace(/[\.\-\/]/g, ' ').replace(/[^\w\säöüß]/gi, ' ').replace(/\s+/g, ' ').trim(); };
exports.normalize = normalize;
var asciiFold = function (text) {
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
var isCoreNoun = function (t) { return /joghurt|yogurt|milch|milk|kaese|cheese|brot|bread|pudding|flammkuchen|griess|granatapfel|apfel|apple|banane|banana|tomate|tomato|zwiebel|onion|kartoffel|potato|zitrone|lemon|salami|schinken|ham|wurst|sausage|nuss|nuesse|nut|peanut|erdnuss|reis|rice|fisch|fish|fleisch|meat|eier|egg|birne|pear|traube|grape|gurke|cucumber|mozzarella|gouda|parmesan|ricotta|feta|camembert|edamer|pesto|gnocchi|tortelloni|quark|butter|teigwaren|chili|paprika/i.test(t); };
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
    var _a, _b, _c;
    // Apply German abbreviation expansions first
    var caseSplit = ocrText
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2') // "NIPizza" -> "NI Pizza"
        .replace(/([a-z])([A-Z])/g, '$1 $2'); // "PizzaSpeciale" -> "Pizza Speciale"
    var HEAD_NOUN_SUFFIXES = ['brot', 'wurst', 'kaese', 'käse', 'milch', 'saft', 'sahne', 'creme', 'oel', 'öl', 'schinken', 'pudding', 'paprika', 'joghurt', 'salat', 'suppe', 'fleisch', 'tee', 'wasser', 'wein', 'bier', 'pizza', 'reis'];
    var headNounSplit = caseSplit.split(/\s+/).map(function (word) {
        if (word.length < 8)
            return word;
        var lower = word.toLowerCase();
        for (var _i = 0, HEAD_NOUN_SUFFIXES_1 = HEAD_NOUN_SUFFIXES; _i < HEAD_NOUN_SUFFIXES_1.length; _i++) {
            var suf = HEAD_NOUN_SUFFIXES_1[_i];
            if (lower.endsWith(suf) && lower.length > suf.length + 3) {
                return word.slice(0, word.length - suf.length) + ' ' + word.slice(word.length - suf.length);
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
        if (w.length <= 4 && /^[a-zA-ZäöüÄÖÜß]+$/.test(w) && nx && /^[a-zA-Z]/.test(nx) && nx.length <= 12) {
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
        var searchTokens = __spreadArray([], new Set(__spreadArray(__spreadArray([], ocrTokensRaw, true), ocrTokensAscii, true)), true);
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
            if (!exact && token.length >= 5 && token.length <= 10) {
                var CONF = { t: ['n', 'i', 'l'], i: ['n', 'l', 't'],
                    l: ['i', 't'], n: ['m', 't', 'i', 'u'], m: ['n'], o: ['0', 'e'], u: ['n', 'v'], v: ['u'],
                    f: ['t'], c: ['e', 'o'], e: ['c', 'o'], r: ['n'] };
                for (var p = 0; p < token.length; p++) {
                    var alts = CONF[token[p]];
                    if (!alts)
                        continue;
                    for (var _d = 0, alts_1 = alts; _d < alts_1.length; _d++) {
                        var a = alts_1[_d];
                        var v = token.slice(0, p) + a + token.slice(p + 1);
                        var hit = indexData.index.get(v);
                        if (hit)
                            hit.forEach(function (f) { addCand(f); addCand(f); });
                        if (indexData.stemIndex) {
                            var vs = v.length > 4 ? v.replace(/(en|e|n|s)$/, '') : v;
                            var hs = (_b = indexData.stemIndex.get(vs)) !== null && _b !== void 0 ? _b : indexData.stemIndex.get(v);
                            if (hs)
                                hs.forEach(function (f) { addCand(f); addCand(f); });
                        }
                    }
                }
            }
            if (token.length >= 4 && indexData.shingleIndex) {
                var found5 = false;
                for (var _e = 0, _f = candidateKeysFor(token, indexData.shingleIndex); _e < _f.length; _e++) {
                    var key = _f[_e];
                    // Relaxed acceptance: near-equal length is enough — same-length one-letter
                    // typos ("nozzarella"/"mozzarella") can never pass a substring test
                    if (key.includes(token) || token.includes(key) || Math.abs(key.length - token.length) <= 2) {
                        indexData.index.get(key).forEach(addCand);
                        found5 = true;
                    }
                }
                // 4-gram fallback ONLY for short tokens where one typo kills all 5-grams
                if (!found5 && token.length >= 5 && token.length <= 8 && indexData.fourGramIndex) {
                    for (var _g = 0, _h = candidateKeysFor4Gram(token, indexData.fourGramIndex); _g < _h.length; _g++) {
                        var key = _h[_g];
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
        for (var _k = 0, _l = [food.name, food.name_de].filter(Boolean); _k < _l.length; _k++) {
            var nm = _l[_k];
            var inParens = String(nm).match(/\(([^)]*)\)/g) || [];
            for (var _m = 0, inParens_1 = inParens; _m < inParens_1.length; _m++) {
                var seg = inParens_1[_m];
                for (var _o = 0, _p = __spreadArray(__spreadArray([], (0, exports.normalize)(seg).split(/\s+/), true), (0, exports.asciiFold)(seg).split(/\s+/), true); _o < _p.length; _o++) {
                    var t = _p[_o];
                    if (t.length > 2)
                        parenTokens.add(t);
                }
            }
        }
        var namesToTest = [];
        if ((_c = indexData === null || indexData === void 0 ? void 0 : indexData.cache) === null || _c === void 0 ? void 0 : _c.has(food.id)) {
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
        for (var _q = 0, namesToTest_1 = namesToTest; _q < namesToTest_1.length; _q++) {
            var nameData = namesToTest_1[_q];
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
                for (var _s = 0, _t = tSet.ocr; _s < _t.length; _s++) {
                    var oToken = _t[_s];
                    var bestTokenScore = 0;
                    for (var _u = 0, _v = tSet.food; _u < _v.length; _u++) {
                        var nToken = _v[_u];
                        if (nToken === oToken) {
                            bestTokenScore = Math.max(bestTokenScore, 1);
                        }
                        else {
                            var dist = levenshtein(oToken, nToken);
                            var maxLen = Math.max(oToken.length, nToken.length);
                            var minLen = Math.min(oToken.length, nToken.length);
                            var sim = 1 - (dist / maxLen);
                            var dfl = function (w) { return w.length > 4 ? w.replace(/(en|e|n|s)$/, '') : w; };
                            var oS = dfl(oToken), nS = dfl(nToken);
                            if (sim > 0.45 && sim <= 0.75 && (oS !== oToken || nS !== nToken)) {
                                var sd = 1 - levenshtein(oS, nS) / Math.max(oS.length, nS.length);
                                if (sd > sim)
                                    sim = sd;
                            }
                            if (sim > 0.7) {
                                bestTokenScore = Math.max(bestTokenScore, sim);
                            }
                            else if (minLen >= 4 && (nToken.startsWith(oToken) || oToken.startsWith(nToken))) {
                                // Scale prefix match by length ratio so short prefixes don't over-score
                                var lenRatio = minLen / maxLen;
                                var score = 0.5 + (0.35 * lenRatio);
                                bestTokenScore = Math.max(bestTokenScore, score);
                            }
                            else if (minLen >= 5 && (nToken.includes(oToken) || oToken.includes(nToken))) {
                                var lenRatio = minLen / maxLen;
                                var score = 0.4 + (0.35 * lenRatio);
                                bestTokenScore = Math.max(bestTokenScore, score);
                            }
                            else if (minLen >= 4) {
                                for (var i = 0; i <= oToken.length - 4; i++) {
                                    var sub = oToken.substring(i, i + 4);
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
                    var isDescriptorStopword = function (t) { return /^(sort|sortiert|lose|natur|classic|clas|fein|extra|spezial|surt|frisch|hausgemacht|regional|leicht|light|mix|protein)$/i.test(t); };
                    var weight = isDescriptorStopword(oToken) ? 0 : (isCoreNoun(oToken) ? 3 : 1);
                    overlapScore += (bestTokenScore * weight);
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
                for (var _w = 0, coverageRelevantFoodTokens_1 = coverageRelevantFoodTokens; _w < coverageRelevantFoodTokens_1.length; _w++) {
                    var nToken = coverageRelevantFoodTokens_1[_w];
                    var hasMatch = false;
                    for (var _x = 0, _y = tSet.ocr; _x < _y.length; _x++) {
                        var oToken = _y[_x];
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
                for (var _z = 0, _0 = tSet.ocr; _z < _0.length; _z++) {
                    var oToken = _0[_z];
                    for (var _1 = 0, _2 = tSet.food; _1 < _2.length; _1++) {
                        var nToken = _2[_1];
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
            for (var _r = 0, tokenSets_1 = tokenSets; _r < tokenSets_1.length; _r++) {
                var tSet = tokenSets_1[_r];
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
    for (var _j = 0, candidatesToScore_1 = candidatesToScore; _j < candidatesToScore_1.length; _j++) {
        var food = candidatesToScore_1[_j];
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
    'summe', 'zwischensumme', 'gesamt', 'total', 'betrag', 'eur', 'euro', 'ust', 'mwst', 'steuer',
    'kartenzahlung', 'karte', 'karten', 'bar', 'ec', 'girocard', 'visa', 'mastercard', 'maestro',
    'rueckgeld', 'wechselgeld', 'gegeben', 'geg', 'kundenbeleg', 'beleg', 'filiale', 'markt',
    'discount', 'marken', 'netto', 'rewe', 'edeka', 'lidl', 'aldi', 'kaufland', 'penny',
    'www', 'http', 'https', 'de', 'com', 'uid', 'ustid', 'tel', 'telefon', 'datum', 'uhrzeit', 'bon', 'id',
    'terminal', 'trace', 'berlin', 'hamburg', 'muenchen', 'koeln', 'allee', 'strasse', 'platz', 'weg'
]);
var UNIT = new Set(['st', 'stk', 'pck', 'pkg', 'btl', 'lose', 'vke', 'sort', 'ca', 'ab', 'pk']);
function isLikelyProductLine(raw) {
    var line = raw.trim();
    if (line.length < 4)
        return false;
    var low = asciiLow(line);
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
    if (/\b\d{4,5}\b/.test(low) && /(allee|strasse|str\.|platz|weg|berlin|hamburg)/i.test(low))
        return false;
    if (((line.match(/-/g) || []).length >= 3) && !/\d[.,]\d{2}/.test(line))
        return false;
    var tokens = low.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (tokens.some(function (t) { return META_TOKENS.has(t); })) {
        console.log('META_TOKENS');
        return false;
    }
    var wordTokens = tokens.filter(function (t) { return /[a-z]{3,}/.test(t) && !UNIT.has(t); });
    if (wordTokens.length === 0) {
        console.log('wordTokens === 0');
        return false;
    }
    var hasPrice = /\d[.,]\d{2}/.test(low);
    if (!hasPrice && wordTokens.length < 2 && !wordTokens.some(function (t) { return t.length >= 4; })) {
        console.log('no price and short');
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
