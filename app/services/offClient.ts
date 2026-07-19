/**
 * Minimal OpenFoodFacts client.
 *
 * OFF is used only to turn a branded receipt line the offline matcher couldn't place
 * (e.g. "Pringles Original 165g") into a generic product description (its category tags,
 * e.g. "en:potato-crisps"). That description is then matched against the BLS database, so
 * nutrition still comes entirely from BLS - OFF only helps with product IDENTITY.
 *
 * Best-effort by design: a short timeout, and ANY failure (offline, throttling, timeout,
 * empty result, bad JSON) resolves to null so the caller silently keeps the BLS-only
 * result. Never throws.
 *
 * Data © OpenFoodFacts contributors, licensed under the Open Database License (ODbL).
 */

export interface OffProduct {
  /** OFF's product name, shown to the user as the item title when OFF resolved it. */
  productName: string;
  /** Category tags, coarse-to-specific, e.g. ["en:snacks", ..., "en:potato-crisps"]. */
  categoriesTags: string[];
  brands?: string;
}

// Search-a-licious full-text endpoint. The legacy search.pl / v2 search_terms endpoints are
// frequently rate-limited ("page temporarily unavailable"); this one is the supported search.
const SEARCH_URL = 'https://search.openfoodfacts.org/search';

// OFF requires a descriptive User-Agent. Keep it identifying and contactable.
const USER_AGENT = 'SmartSwaps/1.0 (Expo receipt scanner; https://github.com/smart-swaps)';

const DEFAULT_TIMEOUT_MS = 4000;

export interface OffLookupOptions {
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

export async function lookupOffProduct(
  query: string,
  opts: OffLookupOptions = {}
): Promise<OffProduct | null> {
  const q = query.trim();
  if (!q) return null;

  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  if (!doFetch) return null; // no fetch available in this environment

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const url =
      `${SEARCH_URL}?q=${encodeURIComponent(q)}` +
      `&page_size=1&fields=product_name,categories_tags,brands`;

    const res = await doFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const data: any = await res.json();
    const hit = data?.hits?.[0];
    if (!hit) return null;

    const productName: string = hit.product_name ?? '';
    const categoriesTags: string[] = Array.isArray(hit.categories_tags) ? hit.categories_tags : [];
    if (!productName && categoriesTags.length === 0) return null;

    return { productName, categoriesTags, brands: hit.brands };
  } catch {
    // Offline, aborted, throttled, malformed - all treated the same: no OFF result.
    return null;
  } finally {
    clearTimeout(timer);
  }
}
