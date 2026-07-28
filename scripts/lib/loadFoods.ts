/**
 * Single read-path for the food database in offline scripts.
 *
 * assets/smartswaps.db is the authoritative source. Scripts used to each do their own
 * `JSON.parse(fs.readFileSync('foods.json'))`, which meant the offline pipeline (slate
 * building, model training, evals) and the app could silently diverge the moment the
 * database was regenerated without foods.json being updated in lockstep - and nothing
 * would have failed, the models would just quietly have been trained on stale data.
 *
 * WHY node:sqlite RATHER THAN sql.js: scripts/buildDatabase.ts uses sql.js, but its
 * initialization is async, and every consumer here loads foods synchronously at module
 * level. Migrating them would mean restructuring ~20 scripts around top-level await for
 * no behavioural gain. Node 22+ ships a synchronous SQLite driver in core, so this needs
 * no new dependency and no restructuring.
 *
 * VERIFIED EQUIVALENT: before this was adopted, foods loaded through here were checked
 * against the old foods.json path - identical ids (7,140, zero on either side only),
 * 100% embedding and attribute coverage, micros present for every row, and byte-identical
 * top-3 swap results for every sampled food. Switching the read path changes nothing
 * about the output; it only removes the chance of drift.
 *
 * NOTE ON foods.json: it has NOT gone away, and this does not make it dead. It remains
 * the human-editable input that scripts/buildDatabase.ts compiles into the .db - a binary
 * SQLite file cannot be diffed or code-reviewed, so content edits still belong there.
 * The distinction is: foods.json is where food data is AUTHORED, smartswaps.db is what
 * everything READS. Regenerate with `npx tsx scripts/buildDatabase.ts` after editing.
 */

import * as fs from 'fs';
import * as path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { FoodItem } from '../../app/types';

const DB_PATH = path.join(__dirname, '..', '..', 'assets', 'smartswaps.db');

let cache: FoodItem[] | null = null;

/**
 * Every food, shaped exactly as app/services/database.ts shapes it for the app - the
 * flat nutrient columns folded back into `nutrients_per_100` and `micros` parsed from
 * its JSON string. Keeping the two mappings identical is what lets a script and the app
 * agree on what a FoodItem is.
 *
 * Cached: several scripts call this more than once, and re-reading a 7 MB database each
 * time is pure waste.
 */
export function loadFoods(): FoodItem[] {
  if (cache) return cache;
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(
      `Food database not found at ${DB_PATH}.\n` +
      `Build it with: npx tsx scripts/buildDatabase.ts`
    );
  }

  const db = new DatabaseSync(DB_PATH, { readOnly: true });
  try {
    const rows = db.prepare('SELECT * FROM foods').all() as any[];
    cache = rows.map(r => ({
      id: r.id,
      name: r.name,
      name_de: r.name_de,
      category: r.category,
      swiss_category: r.swiss_category,
      health_score: r.health_score,
      nutri_grade: r.nutri_grade,
      nova_group: r.nova_group,
      swap_suggestion_id: r.swap_suggestion_id,
      icon_key: r.icon_key,
      nutrients_per_100: {
        kcal: r.kcal,
        protein_g: r.protein_g,
        carbs_g: r.carbs_g,
        sugars_g: r.sugars_g,
        fat_g: r.fat_g,
        saturated_fat_g: r.saturated_fat_g,
        fiber_g: r.fiber_g,
        salt_g: r.salt_g,
        micros: r.micros ? JSON.parse(r.micros) : {},
      },
    })) as FoodItem[];
    return cache;
  } finally {
    db.close();
  }
}

/** Path to the authoritative database, for scripts that need to report it. */
export const FOOD_DB_PATH = DB_PATH;
