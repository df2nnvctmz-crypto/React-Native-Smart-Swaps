const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const FOODS_JSON_PATH = path.join(process.cwd(), 'foods.json');
const BLS_EXCEL_PATH = path.join(process.cwd(), 'bls_data/BLS_4_0_2025_DE/BLS_4_0_Daten_2025_DE.xlsx');

function main() {
  console.log('Loading foods.json...');
  const foodsData = JSON.parse(fs.readFileSync(FOODS_JSON_PATH, 'utf-8'));

  console.log('Loading BLS Excel dataset...');
  const wb = xlsx.readFile(BLS_EXCEL_PATH);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const blsData = xlsx.utils.sheet_to_json(sheet);

  console.log('Building English to German mapping...');
  const englishToGerman = new Map();
  for (const row of blsData) {
    if (row['Food name'] && row['Lebensmittelbezeichnung']) {
      englishToGerman.set(
        row['Food name'].toLowerCase().trim(),
        row['Lebensmittelbezeichnung'].trim()
      );
    }
  }

  console.log('Updating foods.json...');
  let updatedCount = 0;
  for (const food of foodsData) {
    const key = food.name.toLowerCase().trim();
    if (englishToGerman.has(key)) {
      food.name_de = englishToGerman.get(key);
      updatedCount++;
    } else {
      console.warn(`Warning: Could not find BLS mapping for: ${food.name}`);
    }
  }

  console.log(`Updated ${updatedCount} items.`);

  console.log('Saving foods.json...');
  fs.writeFileSync(FOODS_JSON_PATH, JSON.stringify(foodsData, null, 2), 'utf-8');
  console.log('Done!');
}

main();
