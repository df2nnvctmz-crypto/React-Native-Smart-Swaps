const fs = require('fs');
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path) {
  if (path.includes('ProfileContext') || path.includes('vector-icons')) {
    return {};
  }
  return originalRequire.apply(this, arguments);
};

const { parseReceiptLine, isLikelyProductLine } = require('../app/engine/receiptParser');
const { buildFoodIndex } = require('../app/useFoods');

const foodsData = JSON.parse(fs.readFileSync('foods.json', 'utf8'));
const indexData = buildFoodIndex(foodsData);

const tests = [
  "Müllerstraße 141",
  "RENE Joset Seifert oHb",
  "KNOBLAUCHBAGUETT",
  "KR. BOTTERBAGUETT",
  "PAPRIKA ORANGE",
  "STEINOFEN PIZZA",
  "RODGEN PUR",
  "JA! MARKENBUTTÉR",
  "ACETO BALSAMICO",
  "SAUCE ARRABBIATA",
  "RAVIOLI PIKANT",
  "SKYR HIMB",
  "VANILLE",
  "ANGUS BURGER",
  "TORTELL ONI",
  "BIO WEIDEMTLCH",
  "RAVIOLI ARRABIAT",
  "BANANE CHIQUITA",
  "TOMATE SNACK",
  "GURKE MINI",
  "WAGNER",
  "SALATBEUTEL REWE",
  "PHOTEIYPUbD. SCH",
  "GOLDNAIS",
  "Bezahlung",
  "Contactless",
  "AURJOGHURT 3,5",
  "EDELSAAMI",
  "MOZ2./BUEA MIN",
  "TOMATE CHERRY",
  "APFEL ROT",
  "SKYR HIMB -CRANB",
  "KIDNEY BOHNEN",
  "Bert.0livenoel sort.50Oml",
  "Knotenbeutel",
  "Ostmann Pfefferkoer.wei. 60g",
  "Mon.Ital.Pesto sort.190g",
  "GL Sahne 30% 200g VLOG",
  "Suppengemuese 500g",
  "Frankf. Allee 57-59"
];

for (const t of tests) {
  console.log(`\n--- Testing: ${t} ---`);
  if (!isLikelyProductLine(t)) {
    console.log(`Filtered out by isLikelyProductLine!`);
  } else {
    const match = parseReceiptLine(t, foodsData, indexData);
    if (match && match.matchedFood) {
      console.log(`Matched: ${match.matchedFood.name_de || match.matchedFood.name} (confidence: ${match.confidence})`);
    } else {
      console.log(`NO MATCH`);
    }
  }
}
