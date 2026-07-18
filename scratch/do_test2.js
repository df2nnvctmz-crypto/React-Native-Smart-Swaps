"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
var receiptParser_1 = require("../app/engine/receiptParser");
var fs = require("fs");
var path = require("path");
var foodsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../foods.json'), 'utf-8'));

function withHeadNounSplits(tokens) {
  const DB_HEAD_NOUN_SUFFIXES = ['brot','broetchen','wurst','kaese','milch','saft','sahne','creme','schinken','salat','suppe'];
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

function buildFoodIndex(foodsData) {
  const index = new Map();
  const cache = new Map();
  const stemIndex = new Map();

  for (const food of foodsData) {
    const foodCache = {
      en: {
        rawStr: receiptParser_1.normalize(food.name),
        asciiStr: receiptParser_1.asciiFold(food.name),
        tokensRaw: withHeadNounSplits(receiptParser_1.normalize(food.name).split(/\s+/).filter(t => t.length > 2)),
        tokensAscii: withHeadNounSplits(receiptParser_1.asciiFold(food.name).split(/\s+/).filter(t => t.length > 2))
      }
    };

    if (food.name_de) {
      foodCache.de = {
        rawStr: receiptParser_1.normalize(food.name_de),
        asciiStr: receiptParser_1.asciiFold(food.name_de),
        tokensRaw: withHeadNounSplits(receiptParser_1.normalize(food.name_de).split(/\s+/).filter(t => t.length > 2)),
        tokensAscii: withHeadNounSplits(receiptParser_1.asciiFold(food.name_de).split(/\s+/).filter(t => t.length > 2))
      };
    }

    cache.set(food.id, foodCache);

    const allTokens = new Set();
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
      index.get(token).add(food);
    });

    allTokens.forEach(t => {
      if (t.length > 4) {
        const s = t.replace(/(en|e|n|s)$/,'');
        if (s.length > 2 && s !== t) {
          if (!stemIndex.has(s)) stemIndex.set(s, new Set());
          stemIndex.get(s).add(food);
        }
      }
    });
  }

  const SHINGLE_LEN = 5;
  const shingleIndex = new Map();
  for (const key of index.keys()) {
    if (key.length < SHINGLE_LEN) {
      if (!shingleIndex.has(key)) shingleIndex.set(key, new Set());
      shingleIndex.get(key).add(key);
      continue;
    }
    for (let i = 0; i <= key.length - SHINGLE_LEN; i++) {
      const sh = key.substring(i, i + SHINGLE_LEN);
      if (!shingleIndex.has(sh)) shingleIndex.set(sh, new Set());
      shingleIndex.get(sh).add(key);
    }
  }

  const fourGramIndex = new Map();
  for (const key of index.keys()) {
    if (key.length < 4 || key.length > 10) continue;
    for (let i = 0; i <= key.length - 4; i++) {
      const g = key.substring(i, i + 4);
      if (!fourGramIndex.has(g)) fourGramIndex.set(g, new Set());
      fourGramIndex.get(g).add(key);
    }
  }

  return { index, cache, shingleIndex, fourGramIndex, stemIndex };
}

var indexData = buildFoodIndex(foodsData);
var testLines = [
    "Paprika Mix 500g",
    "Grop.Proteinpudding sort. 200g",
    "Gran.Pr.pu.Gr. sort. 500g",
];
for (var _i = 0, testLines_1 = testLines; _i < testLines_1.length; _i++) {
    var line = testLines_1[_i];
    console.log("\n--- Testing: ".concat(line, " ---"));
    var result = (0, receiptParser_1.parseReceiptLine)(line, foodsData, indexData);
    if (result && result.matchedFood) {
        console.log("Matched: ".concat(result.matchedFood.name, " (confidence: ").concat(result.confidence, ")"));
    }
    else {
        console.log("NO MATCH");
        // Log candidate hits to understand why
        var match = (0, receiptParser_1.parseReceiptLine)(line, foodsData, indexData); 
        // Wait, parseReceiptLine doesn't return alternatives. Let's do nothing here or just accept it's < 0.45.
    }
}
