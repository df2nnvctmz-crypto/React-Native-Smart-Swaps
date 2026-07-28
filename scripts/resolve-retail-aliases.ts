/**
 * Resolves RETAIL_ALIASES targets to real foods.json ids and emits receipt-style variants.
 *
 * The resolver is deliberately strict: a target that matches zero entries, or matches
 * several equally well, is reported as an ERROR rather than guessed at. A wrong knowledge
 * claim in retail-aliases.ts must surface here, not as a quietly mislabeled training row.
 *
 *   npx tsx scripts/resolve-retail-aliases.ts
 *
 * Writes scripts/retail_variants.jsonl + scripts/retail_aliases_resolved.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { FoodItem } from '../app/types';
import { RETAIL_ALIASES } from './retail-aliases';

const foods = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'foods.json'), 'utf-8')) as FoodItem[];

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Exact name_de wins; otherwise a unique substring hit; otherwise report the ambiguity. */
function resolve(target: string): { id?: string; name?: string; error?: string } {
  const t = norm(target);
  const exact = foods.filter(f => norm(f.name_de || '') === t);
  if (exact.length === 1) return { id: exact[0].id, name: exact[0].name_de! };
  if (exact.length > 1) return { error: `ambiguous exact (${exact.length}): ${exact.map(f => f.id).join(', ')}` };

  const subs = foods.filter(f => norm(f.name_de || '').includes(t));
  if (subs.length === 1) return { id: subs[0].id, name: subs[0].name_de! };
  if (subs.length === 0) return { error: 'no BLS entry matches this target' };

  // Several contain it - prefer the shortest name, which is the least-qualified entry,
  // but only accept when it is unambiguously shorter than the runner-up.
  const sorted = [...subs].sort((a, b) => (a.name_de || '').length - (b.name_de || '').length);
  if ((sorted[0].name_de || '').length < (sorted[1].name_de || '').length) {
    return { id: sorted[0].id, name: sorted[0].name_de! };
  }
  return { error: `ambiguous substring (${subs.length}): ${sorted.slice(0, 3).map(f => f.id + ' ' + f.name_de).join(' | ')}` };
}

// ---- receipt noise shapes, same vocabulary as the other generators -------------------
const BRANDS = ['GL', 'M.I.', 'Bio BB', 'VL', 'Cl.', 'NI', 'AS', 'JA!', 'Liebl.', 'REWE', 'Gut&Guenstig'];
const CERTS = ['Bio', 'oGt', 'VLOG'];
const SIZES = ['250g', '500g', '400g', '200g', '1kg', '125g', '150g'];
const fold = (s: string) => s.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');

interface Row { line: string; expected: string; name: string; term: string; synthetic: true; }
const rows: Row[] = [];
const errors: string[] = [];
const resolved: { term: string; id: string; name: string }[] = [];
const seen = new Set<string>();

for (const alias of RETAIL_ALIASES) {
  const r = resolve(alias.target);
  if (!r.id) { errors.push(`  ${alias.target}\n      -> ${r.error}\n      (terms: ${alias.terms.join(', ')})`); continue; }

  for (const term of alias.terms) {
    resolved.push({ term, id: r.id, name: r.name! });
    const shapes = [
      term, `${term} ${SIZES[0]}`, `${term.toUpperCase()}`,
      ...SIZES.slice(0, 4).map((s, i) => `${BRANDS[i % BRANDS.length]} ${term} ${s}`),
      ...SIZES.slice(0, 2).map(s => `${term}${s}`),
      `${CERTS[0]} ${term} ${SIZES[1]}`,
      fold(`${term.toUpperCase()} ${SIZES[2].toUpperCase()}`),
      term.length > 7 ? `${term.slice(0, term.length - 3)}. ${SIZES[1]}` : `${term} sort. ${SIZES[1]}`,
    ];
    for (const shape of shapes) {
      const line = shape.replace(/\s+/g, ' ').trim();
      const key = line.toLowerCase();
      if (!line || seen.has(key)) continue;
      seen.add(key);
      rows.push({ line, expected: r.id, name: r.name!, term, synthetic: true });
    }
  }
}

fs.writeFileSync(path.join(process.cwd(), 'scripts/retail_variants.jsonl'),
  rows.map(r => JSON.stringify(r)).join('\n') + '\n');

fs.writeFileSync(path.join(process.cwd(), 'scripts/retail_aliases_resolved.md'),
  `# Retail -> BLS bridge (${resolved.length} terms -> ${new Set(resolved.map(r => r.id)).size} ids)\n\n` +
  `Authored knowledge, resolved against foods.json. Review before trusting.\n\n` +
  '| Receipt term | BLS id | BLS name |\n| --- | --- | --- |\n' +
  resolved.map(r => `| ${r.term} | ${r.id} | ${r.name} |`).join('\n') + '\n');

console.log(`alias groups:      ${RETAIL_ALIASES.length}`);
console.log(`resolved terms:    ${resolved.length} -> ${new Set(resolved.map(r => r.id)).size} distinct BLS ids`);
console.log(`variants written:  ${rows.length}`);
if (errors.length) {
  console.log(`\nUNRESOLVED TARGETS (${errors.length}) - fix these in retail-aliases.ts:\n`);
  console.log(errors.join('\n'));
}
