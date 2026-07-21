import exactLookupMap from '../data/exactLookup.json';

/**
 * Verified exact-text lookup (332 entries): a raw OCR line, lowercased and trimmed, matched
 * directly against a previously-resolved BLS food name. Highest-trust automated tier - checked
 * before brand_dict's substring matching and before the general fuzzy matcher, since an exact
 * hit here is a known-correct answer for that literal string, not a heuristic guess.
 */
export function matchExactLookup(rawLine: string): string | null {
  const key = rawLine.trim().toLowerCase();
  return (exactLookupMap as Record<string, string>)[key] ?? null;
}
