/**
 * Packs scripts/food_attributes/ollama_output.json (2.9 MB of JSON) into a compact
 * bundled asset for the app: app/engine/foodAttributes.data.json.
 *
 * WHY THIS EXISTS: the GBM student needs the taste/effect features on-device, and they
 * are not optional - ablating the 7 attribute-derived features costs 12.5 points of
 * balanced accuracy and 9.9 points of AUC (grouped CV, measured). Shipping the raw
 * labeling output would mean bundling 2.9 MB of pretty-printed JSON with long enum
 * strings repeated 7,140 times.
 *
 * Every value is a small bounded integer, so one byte each is enough:
 *   8 sensory axes (0-10), culinary_role (enum), prep_state (enum),
 *   glycemic_load (0-2), satiety (0-2), caffeine (0/1), alcohol (0/1),
 *   time_of_day (5-bit mask)
 * = 15 bytes per food. Base64 of 7,140 x 15 bytes lands around 140 KB, matching the
 * approach foodEmbeddings.data.json already uses for the int8 vectors.
 *
 * Run with: npx tsx scripts/build-food-attributes-asset.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..');
const ATTRS = path.join(ROOT, 'scripts/food_attributes/ollama_output.json');
const OUT = path.join(ROOT, 'app/engine/foodAttributes.data.json');

// Enum orders are FROZEN - the packed bytes are indices into these arrays, so reordering
// or inserting silently reinterprets every food. Append only.
const ROLES = [
  'main_protein', 'side_dish', 'breakfast', 'snack', 'beverage_base',
  'condiment_seasoning', 'dessert_sweet', 'cooking_fat_oil', 'soup_stew_base',
  'raw_produce', 'baked_good', 'base_carb', 'dairy_staple',
];
const PREP = ['raw', 'cooked_ready_to_eat', 'processed_shelf_stable', 'liquid_beverage'];
const LEVEL = ['low', 'medium', 'high'];
const TIMES = ['breakfast', 'lunch', 'dinner', 'snack', 'any'];
const SENSORY = ['sweet', 'salty', 'sour', 'bitter', 'umami', 'fatty_rich', 'creamy', 'crunchy'];

const BYTES_PER_FOOD = 15;

interface Attr {
  id: string;
  sensory: Record<string, number>;
  culinary_role: string;
  prep_state: string;
  effect: {
    glycemic_load: string; satiety: string;
    caffeine: boolean; alcohol: boolean; time_of_day: string[];
  };
}

const attrs: Attr[] = JSON.parse(fs.readFileSync(ATTRS, 'utf-8'));
const ids: string[] = [];
const buf = new Uint8Array(attrs.length * BYTES_PER_FOOD);

let unknownRole = 0, unknownPrep = 0;
attrs.forEach((a, i) => {
  const o = i * BYTES_PER_FOOD;
  ids.push(a.id);
  SENSORY.forEach((axis, k) => {
    buf[o + k] = Math.max(0, Math.min(10, Math.round(a.sensory[axis] ?? 0)));
  });
  const role = ROLES.indexOf(a.culinary_role);
  const prep = PREP.indexOf(a.prep_state);
  if (role < 0) unknownRole++;
  if (prep < 0) unknownPrep++;
  // 255 marks "unknown" rather than silently collapsing into index 0, which would make
  // an unparseable role look like a confident "main_protein".
  buf[o + 8] = role < 0 ? 255 : role;
  buf[o + 9] = prep < 0 ? 255 : prep;
  buf[o + 10] = Math.max(0, LEVEL.indexOf(a.effect.glycemic_load));
  buf[o + 11] = Math.max(0, LEVEL.indexOf(a.effect.satiety));
  buf[o + 12] = a.effect.caffeine ? 1 : 0;
  buf[o + 13] = a.effect.alcohol ? 1 : 0;
  let mask = 0;
  for (const t of a.effect.time_of_day) {
    const bit = TIMES.indexOf(t);
    if (bit >= 0) mask |= 1 << bit;
  }
  buf[o + 14] = mask;
});

// Dependency-free base64 encode (Node Buffer here; the app side decodes without it).
const b64 = Buffer.from(buf).toString('base64');

fs.writeFileSync(OUT, JSON.stringify({
  count: attrs.length,
  bytesPerFood: BYTES_PER_FOOD,
  roles: ROLES, prep: PREP, levels: LEVEL, times: TIMES, sensoryAxes: SENSORY,
  ids,
  q: b64,
}));

const kb = (fs.statSync(OUT).size / 1024).toFixed(0);
const rawKb = (fs.statSync(ATTRS).size / 1024).toFixed(0);
console.log(`packed ${attrs.length} foods -> ${OUT}`);
console.log(`  ${rawKb} KB raw JSON  ->  ${kb} KB asset`);
if (unknownRole || unknownPrep) {
  console.log(`  WARNING: ${unknownRole} unknown culinary_role, ${unknownPrep} unknown prep_state (stored as 255)`);
}
