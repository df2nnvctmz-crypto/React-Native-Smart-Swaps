import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';

// Load the raw JSON data
const foodsData = require('../foods.json');
const recipesData = require('../recipes.json');

const ASSETS_DIR = path.join(__dirname, '../assets');
const DB_PATH = path.join(ASSETS_DIR, 'smartswaps.db');

async function buildDatabase() {
  console.log('Initializing sql.js...');
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  console.log('Creating tables...');
  db.run(`
    CREATE TABLE foods (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_de TEXT,
      category TEXT,
      swiss_category TEXT,
      health_score INTEGER,
      nutri_grade TEXT,
      nova_group INTEGER,
      swap_suggestion_id TEXT,
      kcal REAL, 
      protein_g REAL, 
      carbs_g REAL, 
      sugars_g REAL,
      fat_g REAL, 
      saturated_fat_g REAL, 
      fiber_g REAL, 
      salt_g REAL,
      micros TEXT
    );

    CREATE TABLE recipes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT,
      image TEXT,
      serves INTEGER,
      subcategory TEXT,
      dish_type TEXT,
      steps TEXT,
      health_score REAL,
      kcal_total REAL,
      time TEXT,
      difficulty TEXT
    );

    CREATE TABLE recipe_ingredients (
      recipe_id TEXT NOT NULL,
      food_id TEXT,
      raw_text TEXT,
      grams REAL,
      kcal REAL,
      sort_order INTEGER,
      FOREIGN KEY (recipe_id) REFERENCES recipes(id)
    );

    CREATE INDEX idx_foods_category ON foods(category);
    CREATE INDEX idx_foods_health_score ON foods(health_score);
    CREATE INDEX idx_ri_recipe_id ON recipe_ingredients(recipe_id);
    CREATE INDEX idx_ri_food_id ON recipe_ingredients(food_id);
  `);

  console.log(`Inserting ${foodsData.length} foods...`);
  
  // Use a transaction for speed
  db.run('BEGIN TRANSACTION;');

  const insertFood = db.prepare(`
    INSERT INTO foods (
      id, name, name_de, category, swiss_category, health_score, nutri_grade, nova_group, swap_suggestion_id,
      kcal, protein_g, carbs_g, sugars_g, fat_g, saturated_fat_g, fiber_g, salt_g, micros
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const food of foodsData) {
    insertFood.run([
      food.id,
      food.name,
      food.name_de || null,
      food.category || null,
      food.swiss_category || null,
      food.health_score ?? null,
      food.nutri_grade || null,
      food.nova_group ?? null,
      food.swap_suggestion_id || null,
      food.nutrients_per_100?.kcal ?? null,
      food.nutrients_per_100?.protein_g ?? null,
      food.nutrients_per_100?.carbs_g ?? null,
      food.nutrients_per_100?.sugars_g ?? null,
      food.nutrients_per_100?.fat_g ?? null,
      food.nutrients_per_100?.saturated_fat_g ?? null,
      food.nutrients_per_100?.fiber_g ?? null,
      food.nutrients_per_100?.salt_g ?? null,
      JSON.stringify(food.nutrients_per_100?.micros || {})
    ]);
  }
  insertFood.free();

  console.log(`Inserting ${recipesData.length} recipes...`);
  const insertRecipe = db.prepare(`
    INSERT INTO recipes (
      id, name, url, image, serves, subcategory, dish_type, steps,
      health_score, kcal_total, time, difficulty
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertRI = db.prepare(`
    INSERT INTO recipe_ingredients (
      recipe_id, food_id, raw_text, grams, kcal, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?)
  `);

  for (const recipe of recipesData) {
    const rId = recipe.id || recipe.recipe_id;
    insertRecipe.run([
      rId,
      recipe.name,
      recipe.url || null,
      recipe.image || null,
      recipe.serves ?? null,
      recipe.subcategory || null,
      recipe.dish_type || null,
      JSON.stringify(recipe.steps || []),
      recipe.health_score ?? null,
      recipe.kcal_total ?? null,
      recipe.time || null,
      recipe.difficulty || null
    ]);

    if (recipe.ingredients) {
      for (let i = 0; i < recipe.ingredients.length; i++) {
        const ri = recipe.ingredients[i];
        insertRI.run([
          rId,
          ri.food_id || null,
          ri.raw_text || null,
          ri.grams ?? null,
          ri.kcal ?? null,
          i
        ]);
      }
    }
  }
  insertRecipe.free();
  insertRI.free();

  db.run('COMMIT;');

  console.log('Vacuuming database...');
  db.run('VACUUM;');
  db.run('ANALYZE;');

  console.log('Saving to disk...');
  const data = db.export();
  const buffer = Buffer.from(data);
  
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_PATH, buffer);
  console.log(`✓ Wrote ${buffer.length} bytes to ${DB_PATH}`);
}

buildDatabase().catch(err => {
  console.error(err);
  process.exit(1);
});
