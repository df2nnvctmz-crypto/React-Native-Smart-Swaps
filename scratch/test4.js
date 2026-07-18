require('ts-node').register({
  compilerOptions: {
    module: 'commonjs'
  }
});
const fs = require('fs');
// Mock React so useFoods doesn't crash
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
  if (path.includes('ProfileContext') || path.includes('vector-icons')) {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

const { parseReceiptLine } = require('../app/engine/receiptParser');
const { buildFoodIndex } = require('../app/useFoods');

const foodsData = JSON.parse(fs.readFileSync('foods.json', 'utf8'));
const indexData = buildFoodIndex(foodsData);

const lines = [
  "Paprika Mix 500g",
  "Grop.Proteinpudding sort. 200g",
  "Gran.Pr.pu.Gr. sort. 500g",
];

for (const line of lines) {
  const result = parseReceiptLine(line, foodsData, indexData);
  if (result && result.matchedFood) {
    console.log(`[+] ${line} -> ${result.matchedFood.name_de || result.matchedFood.name} (${result.confidence.toFixed(2)})`);
  } else {
    console.log(`[-] ${line} -> NO MATCH`);
  }
}
