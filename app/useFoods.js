"use strict";
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
exports.getIconForCategory = void 0;
exports.buildFoodIndex = buildFoodIndex;
exports.useFoods = useFoods;
var react_1 = require("react");
var ProfileContext_1 = require("./context/ProfileContext");
var receiptParser_1 = require("./engine/receiptParser");
var foodsData = require('../foods.json');
var getIconForCategory = function (category) {
    var cat = category.toLowerCase();
    if (cat.includes('meat') || cat.includes('sausage') || cat.includes('poultry'))
        return 'restaurant-outline';
    if (cat.includes('fish') || cat.includes('seafood'))
        return 'fish-outline';
    if (cat.includes('dairy') || cat.includes('egg') || cat.includes('milk') || cat.includes('cheese'))
        return 'egg-outline';
    if (cat.includes('fruit') || cat.includes('vegetable'))
        return 'leaf-outline';
    if (cat.includes('drink') || cat.includes('beverage') || cat.includes('water'))
        return 'water-outline';
    if (cat.includes('sweet') || cat.includes('pastry') || cat.includes('sugar'))
        return 'ice-cream-outline';
    if (cat.includes('cereal') || cat.includes('grain') || cat.includes('bread') || cat.includes('pantry'))
        return 'nutrition-outline';
    return 'fast-food-outline';
};
exports.getIconForCategory = getIconForCategory;
var DB_HEAD_NOUN_SUFFIXES = ['brot', 'broetchen', 'wurst', 'kaese', 'milch', 'saft', 'sahne', 'creme', 'schinken', 'salat', 'suppe'];
function withHeadNounSplits(tokens) {
    var out = __spreadArray([], tokens, true);
    for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
        var t = tokens_1[_i];
        if (t.length < 8)
            continue;
        for (var _a = 0, DB_HEAD_NOUN_SUFFIXES_1 = DB_HEAD_NOUN_SUFFIXES; _a < DB_HEAD_NOUN_SUFFIXES_1.length; _a++) {
            var suf = DB_HEAD_NOUN_SUFFIXES_1[_a];
            if (t.endsWith(suf) && t.length > suf.length + 3) {
                out.push(t.slice(0, t.length - suf.length), suf);
                break;
            }
        }
    }
    return out;
}
function buildFoodIndex(foodsData) {
    var index = new Map();
    var cache = new Map();
    var stemIndex = new Map();
    var _loop_1 = function (food) {
        var foodCache = {
            en: {
                rawStr: (0, receiptParser_1.normalize)(food.name),
                asciiStr: (0, receiptParser_1.asciiFold)(food.name),
                tokensRaw: withHeadNounSplits((0, receiptParser_1.normalize)(food.name).split(/\s+/).filter(function (t) { return t.length > 2; })),
                tokensAscii: withHeadNounSplits((0, receiptParser_1.asciiFold)(food.name).split(/\s+/).filter(function (t) { return t.length > 2; }))
            }
        };
        if (food.name_de) {
            foodCache.de = {
                rawStr: (0, receiptParser_1.normalize)(food.name_de),
                asciiStr: (0, receiptParser_1.asciiFold)(food.name_de),
                tokensRaw: withHeadNounSplits((0, receiptParser_1.normalize)(food.name_de).split(/\s+/).filter(function (t) { return t.length > 2; })),
                tokensAscii: withHeadNounSplits((0, receiptParser_1.asciiFold)(food.name_de).split(/\s+/).filter(function (t) { return t.length > 2; }))
            };
        }
        cache.set(food.id, foodCache);
        var allTokens = new Set();
        if (foodCache.de) {
            foodCache.de.tokensRaw.forEach(function (t) { return allTokens.add(t); });
            foodCache.de.tokensAscii.forEach(function (t) { return allTokens.add(t); });
        }
        foodCache.en.tokensRaw.forEach(function (t) { return allTokens.add(t); });
        foodCache.en.tokensAscii.forEach(function (t) { return allTokens.add(t); });
        allTokens.forEach(function (token) {
            if (!index.has(token)) {
                index.set(token, new Set());
            }
            index.get(token).add(food);
        });
        allTokens.forEach(function (t) {
            if (t.length > 4) {
                var s = t.replace(/(en|e|n|s)$/, '');
                if (s.length > 2 && s !== t) {
                    if (!stemIndex.has(s))
                        stemIndex.set(s, new Set());
                    stemIndex.get(s).add(food);
                }
            }
        });
    };
    for (var _i = 0, foodsData_1 = foodsData; _i < foodsData_1.length; _i++) {
        var food = foodsData_1[_i];
        _loop_1(food);
    }
    var SHINGLE_LEN = 5;
    var shingleIndex = new Map(); // shingle -> set of index keys containing it
    for (var _a = 0, _b = index.keys(); _a < _b.length; _a++) {
        var key = _b[_a];
        if (key.length < SHINGLE_LEN) {
            if (!shingleIndex.has(key))
                shingleIndex.set(key, new Set());
            shingleIndex.get(key).add(key);
            continue;
        }
        for (var i = 0; i <= key.length - SHINGLE_LEN; i++) {
            var sh = key.substring(i, i + SHINGLE_LEN);
            if (!shingleIndex.has(sh))
                shingleIndex.set(sh, new Set());
            shingleIndex.get(sh).add(key);
        }
    }
    var fourGramIndex = new Map();
    for (var _c = 0, _d = index.keys(); _c < _d.length; _c++) {
        var key = _d[_c];
        if (key.length < 4 || key.length > 10)
            continue;
        for (var i = 0; i <= key.length - 4; i++) {
            var g = key.substring(i, i + 4);
            if (!fourGramIndex.has(g))
                fourGramIndex.set(g, new Set());
            fourGramIndex.get(g).add(key);
        }
    }
    return { index: index, cache: cache, shingleIndex: shingleIndex, fourGramIndex: fourGramIndex, stemIndex: stemIndex };
}
function useFoods() {
    var profile = (0, ProfileContext_1.useProfile)().profile;
    var foods = (0, react_1.useMemo)(function () {
        var filtered = foodsData;
        if (profile) {
            var prefs = profile.dietaryPreference;
            if (prefs.includes('Vegetarian')) {
                filtered = filtered.filter(function (f) { return !f.category.includes('Meat') && !f.category.includes('Fish'); });
            }
            if (prefs.includes('Vegan')) {
                filtered = filtered.filter(function (f) { return !f.category.includes('Meat') && !f.category.includes('Fish') && !f.category.includes('Dairy') && !f.swiss_category.toLowerCase().includes('egg'); });
            }
            if (prefs.includes('High Protein')) {
                filtered = filtered.filter(function (f) { return f.nutrients_per_100.protein_g >= 15; });
            }
            if (prefs.includes('Low Carb')) {
                filtered = filtered.filter(function (f) { return f.nutrients_per_100.carbs_g <= 20; });
            }
        }
        return filtered;
    }, [profile === null || profile === void 0 ? void 0 : profile.dietaryPreference]);
    var foodIndexData = (0, react_1.useMemo)(function () { return buildFoodIndex(foodsData); }, []); // Only runs once at startup
    return {
        foods: foods,
        allFoods: foodsData,
        foodIndexData: foodIndexData,
        getIconForCategory: exports.getIconForCategory
    };
}
