import verifiedBrandMap from '../data/verifiedBrandMap.json';

/**
 * Verified brand-name / bare-noun -> canonical BLS food name dictionary (978 entries, each
 * value hand-confirmed to exist in the food database). Distinct from OverrideStore: these are
 * pre-seeded, project-wide mappings, not a given user's own corrections.
 *
 * Checked as a substring of the (lowercased) OCR line. Keys are sorted longest-first so a
 * specific match ("eistee pfirsich") is tried before a generic one ("pfirsich") that would
 * otherwise win merely by being iterated first - though matchBrandDict below overrides this
 * ordering whenever a shorter key matches as a whole word and a longer one only matches
 * embedded in a larger word (see its docstring).
 */
const sortedBrandKeys = Object.keys(verifiedBrandMap).sort((a, b) => b.length - a.length);

const isGermanLetter = (c: string) => /[a-zäöüß]/i.test(c);

/**
 * Processed-form suffixes: in a German compound the LAST element says what the product
 * actually IS, and these heads denote a wholly different (processed) product from the base
 * ingredient a bare-noun key names - e.g. "Apfelmus" (applesauce) is not "Apfel" (raw apple).
 * Mirrors the isProcessedFormToken guard in receiptParser.ts (which does the same thing for
 * "...teig"/"...eis" during fuzzy scoring), applied here to substring dictionary matches.
 *
 * Deliberately narrow: a general word-boundary requirement was tried and reverted (see git
 * history) because German compounds routinely embed a bare-noun key legitimately as the SAME
 * product ("Rispentomaten" is still a tomato, "Müllermilch" is still milk) - blocking those
 * cost far more correct matches than the processed-form suffixes below prevent.
 */
const PROCESSED_FORM_SUFFIXES = ['mus', 'mark', 'saft', 'öl', 'oel', 'creme', 'brei'];

/**
 * True if `key` matches inside `line` at a position where the surrounding word ends in a
 * processed-form suffix NOT covered by the key's own match - i.e. the compound's real head
 * noun is the processed form, not the bare ingredient the key names.
 */
function isProcessedFormMatch(line: string, key: string, idx: number): boolean {
  let wordEnd = idx + key.length;
  while (wordEnd < line.length && isGermanLetter(line[wordEnd])) wordEnd++;
  const remainder = line.slice(idx + key.length, wordEnd);
  return PROCESSED_FORM_SUFFIXES.some(suf => remainder.endsWith(suf));
}

/**
 * Scans every occurrence of `key` in `line` (skipping ones blocked by the processed-form
 * guard) and reports whether any of them is a COMPLETE WHOLE WORD (bounded by a non-letter
 * or the start/end of the string on both sides). A key can appear both as a whole word and
 * embedded elsewhere in the same line; a whole-word occurrence anywhere is enough to count.
 */
function findOccurrence(line: string, key: string): { wholeWord: boolean } | null {
  let from = 0;
  let sawEmbedded = false;
  while (true) {
    const idx = line.indexOf(key, from);
    if (idx === -1) break;
    if (!isProcessedFormMatch(line, key, idx)) {
      const before = idx > 0 ? line[idx - 1] : '';
      const after = idx + key.length < line.length ? line[idx + key.length] : '';
      if (!isGermanLetter(before) && !isGermanLetter(after)) {
        return { wholeWord: true };
      }
      sawEmbedded = true;
    }
    from = idx + 1;
  }
  return sawEmbedded ? { wholeWord: false } : null;
}

/**
 * Returns the matched food's canonical name (name_de or name), or null.
 *
 * A key that matches as a complete whole word always wins over a key that only matches
 * embedded inside a larger word, regardless of which key is longer - e.g. in "Minipflaumen
 * Tomaten", the standalone word "tomaten" must win over "pflaumen" merely appearing (embedded,
 * as part of "minipflaumen") despite being one letter longer. Length only tiebreaks within the
 * same category (two whole-word matches, or two embedded matches) - achieved here by scanning
 * keys longest-first and preferring the first whole-word hit over the first embedded hit.
 */
export function matchBrandDict(rawLine: string): string | null {
  const line = rawLine.trim().toLowerCase();
  let firstEmbeddedKey: string | null = null;
  for (const key of sortedBrandKeys) {
    const occurrence = findOccurrence(line, key);
    if (!occurrence) continue;
    if (occurrence.wholeWord) {
      return (verifiedBrandMap as Record<string, string>)[key];
    }
    if (firstEmbeddedKey === null) firstEmbeddedKey = key;
  }
  return firstEmbeddedKey !== null ? (verifiedBrandMap as Record<string, string>)[firstEmbeddedKey] : null;
}
