const fs = require('fs');
const path = require('path');

const FOODS_FILE = path.join(__dirname, '../foods.json');

async function translateBatch(texts) {
  const text = texts.join('\n');
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=de&dt=t`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `q=${encodeURIComponent(text)}`
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    
    // Google translate returns an array of sentences
    let fullTranslated = "";
    if (data && data[0]) {
      for (const segment of data[0]) {
        if (segment[0]) {
          fullTranslated += segment[0];
        }
      }
    }
    
    return fullTranslated.split('\n').map(s => s.trim());
  } catch (error) {
    console.error(`Error translating batch:`, error);
    return null;
  }
}

async function main() {
  console.log('Loading foods...');
  const foodsData = fs.readFileSync(FOODS_FILE, 'utf8');
  const foods = JSON.parse(foodsData);
  
  console.log(`Loaded ${foods.length} items. Translating missing name_de...`);
  
  const BATCH_SIZE = 50;
  let toTranslateIndices = [];
  
  for (let i = 0; i < foods.length; i++) {
    if (!foods[i].name_de) {
      toTranslateIndices.push(i);
    }
  }
  
  console.log(`Found ${toTranslateIndices.length} items needing translation.`);
  
  for (let i = 0; i < toTranslateIndices.length; i += BATCH_SIZE) {
    const batchIndices = toTranslateIndices.slice(i, i + BATCH_SIZE);
    const texts = batchIndices.map(idx => foods[idx].name);
    
    console.log(`Translating batch ${i} to ${i + batchIndices.length}...`);
    const translatedTexts = await translateBatch(texts);
    
    if (translatedTexts && translatedTexts.length >= batchIndices.length) {
      for (let j = 0; j < batchIndices.length; j++) {
        foods[batchIndices[j]].name_de = translatedTexts[j];
      }
    } else {
      console.log(`Batch translation failed or length mismatch (${translatedTexts?.length} vs ${batchIndices.length}). Falling back to original names.`);
      for (let j = 0; j < batchIndices.length; j++) {
        foods[batchIndices[j]].name_de = foods[batchIndices[j]].name;
      }
    }
    
    fs.writeFileSync(FOODS_FILE, JSON.stringify(foods, null, 2));
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log(`Done translating. Total items processed: ${toTranslateIndices.length}`);
}

main().catch(console.error);
