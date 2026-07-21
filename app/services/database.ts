import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import { Asset } from 'expo-asset';
import { FoodItem, Recipe, RecipeIngredient } from '../types';

let db: SQLite.SQLiteDatabase | null = null;
let dbReadyPromise: Promise<void> | null = null;

async function initDatabase(): Promise<void> {
  const dbName = 'smartswaps.db';
  const dbAsset = require('../../assets/smartswaps.db');
  const dbUri = Asset.fromModule(dbAsset).uri;
  const dbFilePath = `${FileSystem.documentDirectory}SQLite/${dbName}`;

  const fileInfo = await FileSystem.getInfoAsync(dbFilePath);
  
  // For simplicity during development, we'll overwrite it to ensure we have the latest version.
  // In a real app, you'd version this and only copy if the asset version is newer.
  if (fileInfo.exists) {
    await FileSystem.deleteAsync(dbFilePath);
  }
  
  const sqliteDir = `${FileSystem.documentDirectory}SQLite`;
  const dirInfo = await FileSystem.getInfoAsync(sqliteDir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
  }
  
  // Download or copy the asset to the local file system
  if (dbUri.startsWith('http')) {
    await FileSystem.downloadAsync(dbUri, dbFilePath);
  } else {
    await FileSystem.copyAsync({
      from: dbUri,
      to: dbFilePath
    });
  }

  // expo-sqlite API (v54+)
  db = await SQLite.openDatabaseAsync(dbName);
}

export const DatabaseService = {
  get isReady() {
    if (!dbReadyPromise) {
      dbReadyPromise = initDatabase();
    }
    return dbReadyPromise;
  },

  async getAllFoods(): Promise<FoodItem[]> {
    await this.isReady;
    const rows = await db!.getAllAsync<any>(`SELECT * FROM foods`);
    return rows.map(row => this.mapFoodRow(row));
  },

  async getAllRecipes(): Promise<any[]> {
    await this.isReady;
    const recipesRows = await db!.getAllAsync<any>(`SELECT * FROM recipes`);
    
    // We can also fetch all ingredients to avoid N queries
    const ingredientsRows = await db!.getAllAsync<any>(`SELECT * FROM recipe_ingredients ORDER BY recipe_id, sort_order`);
    
    const ingredientsByRecipe = new Map<string, any[]>();
    for (const ri of ingredientsRows) {
      if (!ingredientsByRecipe.has(ri.recipe_id)) {
        ingredientsByRecipe.set(ri.recipe_id, []);
      }
      ingredientsByRecipe.get(ri.recipe_id)!.push({
        food_id: ri.food_id,
        raw_text: ri.raw_text,
        grams: ri.grams,
        kcal: ri.kcal
      });
    }

    return recipesRows.map(row => {
      const recipe = { ...row };
      recipe.steps = row.steps ? JSON.parse(row.steps) : [];
      recipe.ingredients = ingredientsByRecipe.get(row.id) || [];
      return recipe;
    });
  },

  mapFoodRow(row: any): FoodItem {
    return {
      id: row.id,
      name: row.name,
      name_de: row.name_de,
      category: row.category,
      swiss_category: row.swiss_category,
      health_score: row.health_score,
      nutri_grade: row.nutri_grade,
      nova_group: row.nova_group,
      swap_suggestion_id: row.swap_suggestion_id,
      nutrients_per_100: {
        kcal: row.kcal,
        protein_g: row.protein_g,
        carbs_g: row.carbs_g,
        sugars_g: row.sugars_g,
        fat_g: row.fat_g,
        saturated_fat_g: row.saturated_fat_g,
        fiber_g: row.fiber_g,
        salt_g: row.salt_g,
        micros: row.micros ? JSON.parse(row.micros) : {}
      }
    };
  }
};
