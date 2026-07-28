/**
 * Fails if assets/smartswaps.db has drifted from foods.json.
 *
 * WHY THIS EXISTS: foods.json is where food data is authored; smartswaps.db is what the
 * app and every offline script actually read, compiled from it by
 * scripts/buildDatabase.ts. Nothing previously enforced that the two agree, and the
 * failure is silent in the worst possible way - edit foods.json, forget to rebuild, and
 * the app keeps serving old data while models get trained on new data. Both halves look
 * fine in isolation; only the combination is wrong.
 *
 * This is not hypothetical. While migrating the scripts onto SQLite, a stale snapshot
 * baseline produced a 35-pool difference that looked exactly like database drift and took
 * a field-by-field comparison to rule out. A check that answers the question in one
 * second is worth more than the reasoning it replaces.
 *
 * WHAT IT COMPARES, and why not a plain file hash: the .db is a binary SQLite file whose
 * bytes change with page layout, vacuum state and insertion order even when every row is
 * identical, so hashing the file would cry wolf constantly. Instead this compares the
 * data that actually matters to consumers - the id set, and a checksum over the fields
 * the swap engine and matcher read. It also skips fields the two formats legitimately
 * represent differently (foods.json omits nova_group where the .db stores null).
 *
 * Run with: npx tsx scripts/check-db-freshness.ts   (also runs as part of `npm test`)
 * Fix a failure with: npx tsx scripts/buildDatabase.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';
import { FoodItem } from '../app/types';
import { loadFoods, FOOD_DB_PATH } from './lib/loadFoods';

const ROOT = path.join(__dirname, '..');
const FOODS_JSON = path.join(ROOT, 'foods.json');

// The fields any consumer actually branches on. Deliberately excludes nova_group
// (undefined in JSON vs null in SQLite - a representation difference, not drift) and
// icon_key (presentation only, added by the icon pipeline rather than authored).
function fingerprint(f: FoodItem): string {
  const n = f.nutrients_per_100 as any;
  return [
    f.id, f.name, f.name_de ?? '', f.category ?? '', f.swiss_category ?? '',
    f.health_score, f.nutri_grade ?? '',
    n.kcal, n.protein_g, n.carbs_g, n.sugars_g, n.fat_g,
    n.saturated_fat_g, n.fiber_g, n.salt_g,
    // Micros are read by evaluateSwap (calcium, iron) - a silent change here would move
    // rankings, so they belong in the fingerprint. Keys are sorted so that a different
    // property order in the JSON does not register as a change.
    JSON.stringify(Object.entries(n.micros ?? {}).sort()),
  ].join('');
}

function checksum(foods: FoodItem[]): string {
  const h = createHash('sha256');
  for (const f of [...foods].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    h.update(fingerprint(f));
    h.update('');
  }
  return h.digest('hex').slice(0, 16);
}

if (!fs.existsSync(FOODS_JSON)) {
  console.log('foods.json not present - skipping freshness check (database is the only source here).');
  process.exit(0);
}

const json: FoodItem[] = JSON.parse(fs.readFileSync(FOODS_JSON, 'utf-8'));
const db = loadFoods();

const jsonIds = new Set(json.map(f => f.id));
const dbIds = new Set(db.map(f => f.id));
const missingFromDb = [...jsonIds].filter(i => !dbIds.has(i));
const extraInDb = [...dbIds].filter(i => !jsonIds.has(i));

const jsonSum = checksum(json);
const dbSum = checksum(db);
const ok = missingFromDb.length === 0 && extraInDb.length === 0 && jsonSum === dbSum;

console.log(`foods.json : ${json.length} foods  checksum ${jsonSum}`);
console.log(`database   : ${db.length} foods  checksum ${dbSum}`);

if (ok) {
  console.log('DB FRESHNESS: OK - database matches foods.json');
  process.exit(0);
}

console.log('\nDB FRESHNESS: FAILED - assets/smartswaps.db is out of sync with foods.json\n');
if (missingFromDb.length) {
  console.log(`  ${missingFromDb.length} food(s) in foods.json but NOT in the database:`);
  missingFromDb.slice(0, 5).forEach(i => console.log(`     ${i}`));
}
if (extraInDb.length) {
  console.log(`  ${extraInDb.length} food(s) in the database but NOT in foods.json:`);
  extraInDb.slice(0, 5).forEach(i => console.log(`     ${i}`));
}
if (!missingFromDb.length && !extraInDb.length) {
  // Same ids, different content - show what actually changed, since "checksums differ"
  // on its own tells you nothing about what to look at.
  const dbById = new Map(db.map(f => [f.id, f]));
  const changed = json.filter(j => {
    const d = dbById.get(j.id);
    return d && fingerprint(j) !== fingerprint(d);
  });
  console.log(`  same ids, but ${changed.length} food(s) differ in content:`);
  for (const j of changed.slice(0, 5)) {
    const d = dbById.get(j.id)!;
    const jn = j.nutrients_per_100 as any, dn = d.nutrients_per_100 as any;
    const fieldDiffs: string[] = [];
    if (j.name !== d.name) fieldDiffs.push(`name: ${JSON.stringify(j.name)} -> ${JSON.stringify(d.name)}`);
    if (j.health_score !== d.health_score) fieldDiffs.push(`health_score: ${j.health_score} -> ${d.health_score}`);
    if (j.swiss_category !== d.swiss_category) fieldDiffs.push(`swiss_category changed`);
    for (const k of ['kcal', 'protein_g', 'sugars_g', 'fat_g', 'saturated_fat_g', 'fiber_g', 'salt_g']) {
      if (jn[k] !== dn[k]) fieldDiffs.push(`${k}: ${jn[k]} -> ${dn[k]}`);
    }
    console.log(`     ${j.id} ${j.name.slice(0, 34)}`);
    fieldDiffs.slice(0, 3).forEach(d2 => console.log(`        ${d2}`));
    if (!fieldDiffs.length) console.log(`        (micros differ)`);
  }
}
console.log(`\n  database: ${FOOD_DB_PATH}`);
console.log('  FIX: npx tsx scripts/buildDatabase.ts');
process.exit(1);
