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
var fs = __importStar(require("fs"));
var path = __importStar(require("path"));
var foodsData = JSON.parse(fs.readFileSync(path.join(__dirname, '../foods.json'), 'utf-8'));
// Only keep the foods we care about to speed it up and debug
var subset = foodsData.filter(function (f) { return f.id === 'bls1937' || f.id === 'bls4284' || f.name.includes('sausage'); });
// Build index
var tokenSets = new Map();
var fourGramIndex = new Map();
subset.forEach(function (food) {
    var tSet = processFoodItem(food);
    tokenSets.set(food.id, tSet);
    for (var _i = 0, _a = tSet.food; _i < _a.length; _i++) {
        var token = _a[_i];
        if (token.length < 4)
            continue;
        for (var i = 0; i <= token.length - 4; i++) {
            var gram = token.substring(i, i + 4);
            if (!fourGramIndex.has(gram))
                fourGramIndex.set(gram, new Set());
            fourGramIndex.get(gram).add(food.id);
        }
    }
});
var indexData = { foods: subset, tokenSets: tokenSets, fourGramIndex: fourGramIndex };
var line = "Grop.Proteinpudding sort. 200g";
console.log("\n--- Testing: ".concat(line, " ---"));
var result = (0, receiptParser_1.parseReceiptLine)(line, indexData);
console.log(result);
