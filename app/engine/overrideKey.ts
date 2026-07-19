/**
 * Key normalization for the user-correction override cache.
 *
 * Turns a raw OCR receipt line into a stable lookup key, so the same product recognised
 * on a later receipt reuses the correction even though the pack size or price differs.
 *
 * The balance that matters here: strip enough that "Zeus Feta 200g" and "Zeus Feta 400g"
 * share a key, but NOT so much that genuinely different products collapse onto one key.
 * Flavour/variety words carry the product identity, so only quantities, prices, units and
 * the trailing tax letter are removed - never words.
 *
 * Pure and dependency-free so it can be unit tested without React Native.
 */

/** Returns '' when nothing usable is left; callers must not store an empty key. */
export function normalizeOverrideKey(rawLine: string): string {
  let s = rawLine.toLowerCase();

  // Prices, incl. the German comma form: "1.99", "0,89"
  s = s.replace(/\b\d+[.,]\d{2}\b/g, ' ');
  // Weights and volumes attached to a unit: "500g", "1,5 kg", "500ml"
  s = s.replace(/\b\d+([.,]\d+)?\s*(mg|kg|g|ml|cl|l)\b/g, ' ');
  // Counts and multipliers: "2x", "3 st", "10stk", "6er"
  s = s.replace(/\b\d+\s*(x|st|stk|er)\b/g, ' ');
  // Trailing German receipt tax class letter ("... 1,99 B")
  s = s.replace(/\s+[a-c]\s*$/, ' ');

  // Punctuation to spaces. Deliberately after the numeric passes, so "3,5" is still intact
  // above and only splits into "3 5" here - it stays distinct from "1,5".
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ');

  return s.replace(/\s+/g, ' ').trim();
}
