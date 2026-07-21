import knownNonMatches from '../data/knownNonMatches.json';

/**
 * Specific OCR strings where every automated tier's confident answer is known to be wrong -
 * and, in some cases, actively misleading in a nutrition app (e.g. "Bacon vegan" resolving to
 * literal pork). A confident wrong match here is worse than an honest no-match, so this check
 * overrides whatever exact_lookup/brand_dict/bls-direct produced, regardless of its confidence
 * score. Checked as a direct lowercase-trimmed match against the raw OCR line, same
 * normalization as exact_lookup.
 */
export function isKnownNonMatch(rawLine: string): boolean {
  const key = rawLine.trim().toLowerCase();
  return key in (knownNonMatches as Record<string, string>);
}
