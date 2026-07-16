export interface FoodNutrients {
  kcal: number;
  protein_g: number;
  carbs_g: number;
  sugars_g: number;
  fat_g: number;
  saturated_fat_g: number;
  fiber_g: number;
  salt_g: number;
  micros: {
    vitamin_a_ug: number;
    betacarotene_ug: number;
    vitamin_b1_mg: number;
    vitamin_b2_mg: number;
    vitamin_b6_mg: number;
    vitamin_b12_ug: number;
    niacin_mg: number;
    folate_ug: number;
    pantothenic_acid_mg: number;
    vitamin_c_mg: number;
    vitamin_d_ug: number;
    vitamin_e_mg: number;
    sodium_mg: number;
    potassium_mg: number;
    chloride_mg: number;
    calcium_mg: number;
    magnesium_mg: number;
    phosphorus_mg: number;
    iron_mg: number;
    iodide_ug: number;
    zinc_mg: number;
  };
}

export interface FoodItem {
  id: string;
  name: string;
  name_de: string;
  category: string;
  swiss_category: string;
  health_score: number;
  nutri_grade: string;
  nova_group?: number;
  swap_suggestion_id?: string | null;
  nutrients_per_100: FoodNutrients;
}

export interface RecipeIngredientRaw {
  raw_text: string;
  food_id: string | null;
  food_name: string | null;
  match_score?: number;
  note?: string;
}

export interface RecipeRaw {
  recipe_id: string;
  name: string;
  url: string;
  image?: string;
  serves: number;
  subcategory: string;
  dish_type: string;
  ingredients: RecipeIngredientRaw[];
  steps: string[];
}

export interface RecipeIngredient {
  raw_text: string;
  food_id: string | null;
  food?: FoodItem;
  grams: number; // parsed from raw_text
  kcal: number;  // scaled nutrients
  nutrients?: FoodNutrients; // scaled per grams
}

export interface Recipe {
  id: string;
  name: string;
  url: string;
  image?: string;
  serves: number;
  subcategory: string;
  dish_type: string;
  ingredients: RecipeIngredient[];
  steps: string[];
  totals: FoodNutrients; // full recipe totals (per serving)
  health_score: number;  // weighted average
  kcal_total: number;
  time?: string;
  difficulty?: string;
}

