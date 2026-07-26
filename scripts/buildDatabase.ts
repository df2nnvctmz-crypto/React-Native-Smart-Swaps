import fs from 'fs';
import path from 'path';
import initSqlJs from 'sql.js';
import { getIconAnnotationForFood } from './foodIconMapping';

// Load the raw JSON data
const foodsData = require('../foods.json');
const recipesData = require('../recipes.json');

const ASSETS_DIR = path.join(__dirname, '../assets');
const DB_PATH = path.join(ASSETS_DIR, 'smartswaps.db');

// OpenMoji (CC BY-SA 4.0, openmoji.org) is a build-time-only devDependency — only the raw SVG
// markup for icons we actually use gets embedded into smartswaps.db below. The app never fetches
// anything from the openmoji package or the network at runtime; icons ship inside the sqlite file.
const OPENMOJI_DIR = path.join(__dirname, '../node_modules/openmoji');
const openmojiData: { hexcode: string; annotation: string; group: string }[] = require(
  path.join(OPENMOJI_DIR, 'data/openmoji.json')
);
const ANNOTATION_TO_HEXCODE: Record<string, string> = {};
for (const entry of openmojiData) {
  if (entry.group === 'food-drink') {
    ANNOTATION_TO_HEXCODE[entry.annotation] = entry.hexcode;
  }
}
// A handful of OpenMoji icons live outside the food-drink group (e.g. under
// animals-nature) but are visually apt as food icons — no fish or raw-grain icon
// exists inside food-drink itself, so these fill genuine gaps rather than being
// arbitrary substitutes.
const EXTRA_ANNOTATIONS: Record<string, string> = {
  fish: '1F41F',
  'sheaf of rice': '1F33E',
  herb: '1F33F',
};
Object.assign(ANNOTATION_TO_HEXCODE, EXTRA_ANNOTATIONS);

function readIconSvg(annotation: string): string {
  const hexcode = ANNOTATION_TO_HEXCODE[annotation];
  if (!hexcode) throw new Error(`No OpenMoji food-drink icon found for annotation "${annotation}"`);
  const svgPath = path.join(OPENMOJI_DIR, 'color/svg', `${hexcode}.svg`);
  return fs.readFileSync(svgPath, 'utf-8');
}

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
      icon_key TEXT,
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

    CREATE TABLE icon_library (
      icon_key TEXT PRIMARY KEY,
      svg_content TEXT NOT NULL,
      source TEXT NOT NULL
    );

    CREATE INDEX idx_foods_category ON foods(category);
    CREATE INDEX idx_foods_health_score ON foods(health_score);
    CREATE INDEX idx_foods_icon_key ON foods(icon_key);
    CREATE INDEX idx_ri_recipe_id ON recipe_ingredients(recipe_id);
    CREATE INDEX idx_ri_food_id ON recipe_ingredients(food_id);
  `);

  console.log(`Inserting ${foodsData.length} foods...`);
  
  // Use a transaction for speed
  db.run('BEGIN TRANSACTION;');

  const insertFood = db.prepare(`
    INSERT INTO foods (
      id, name, name_de, category, swiss_category, health_score, nutri_grade, nova_group, swap_suggestion_id, icon_key,
      kcal, protein_g, carbs_g, sugars_g, fat_g, saturated_fat_g, fiber_g, salt_g, micros
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const usedAnnotations = new Set<string>();

  for (const food of foodsData) {
    const iconKey = getIconAnnotationForFood(food);
    usedAnnotations.add(iconKey);
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
      iconKey,
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

  console.log(`Embedding ${usedAnnotations.size} distinct OpenMoji icons (of the 131 real food-drink icons available)...`);
  const insertIcon = db.prepare(`INSERT INTO icon_library (icon_key, svg_content, source) VALUES (?, ?, ?)`);
  for (const annotation of usedAnnotations) {
    insertIcon.run([annotation, readIconSvg(annotation), 'openmoji']);
  }
  insertIcon.free();

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
