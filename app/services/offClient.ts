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
 * search-a-licious (the endpoint below) has observed real-world flakiness - OFF's own
 * status page has shown ~85% uptime for it over a 7-day window, not a hard outage but
 * frequent transient 502/503/504s. A single attempt is fragile against exactly that
 * pattern, so retryable failures get a couple of quick retries before giving up; a
 * genuine "no such product" result is never retried.
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

// search-a-licious has been observed with two distinct failure modes: fast 502s (sub-second)
// and multi-second hangs. A retry budget has to survive the first without the worst case of
// the second compounding into something the user notices mid-scan - so ONE retry, not several,
// and a timeout tight enough that two failed attempts still land under ~7s total.
const DEFAULT_TIMEOUT_MS = 3000;

/** Gateway/availability status codes worth a quick retry - not "no result" (4xx). */
const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

export interface OffLookupOptions {
  timeoutMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  fetchImpl?: typeof fetch;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** One HTTP attempt. Returns the parsed product, null for "no result", or throws for a
 *  retryable failure (network error, timeout, or a 429/502/503/504 response). */
async function attemptLookup(
  q: string,
  doFetch: typeof fetch,
  timeoutMs: number
): Promise<OffProduct | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url =
      `${SEARCH_URL}?q=${encodeURIComponent(q)}` +
      `&page_size=1&fields=product_name,categories_tags,brands`;

    const res = await doFetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!res.ok) {
      if (RETRYABLE_STATUSES.has(res.status)) throw new Error(`retryable status ${res.status}`);
      return null; // a definitive non-result (e.g. 400) - retrying won't help
    }

    const data: any = await res.json();
    const hit = data?.hits?.[0];
    if (!hit) return null;

    const productName: string = hit.product_name ?? '';
    const categoriesTags: string[] = Array.isArray(hit.categories_tags) ? hit.categories_tags : [];
    if (!productName && categoriesTags.length === 0) return null;

    return { productName, categoriesTags, brands: hit.brands };
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupOffProduct(
  query: string,
  opts: OffLookupOptions = {}
): Promise<OffProduct | null> {
  const q = query.trim();
  if (!q) return null;

  const doFetch = opts.fetchImpl ?? globalThis.fetch;
  if (!doFetch) return null; // no fetch available in this environment

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptLookup(q, doFetch, timeoutMs);
    } catch {
      // Offline, aborted, throttled, or a gateway/availability error - all transient.
      // Bad JSON also lands here (res.json() throwing) and is likewise worth one retry.
      const isLastAttempt = attempt === MAX_ATTEMPTS - 1;
      if (isLastAttempt) return null;
      await sleep(RETRY_DELAY_MS);
    }
  }
  return null;
}
