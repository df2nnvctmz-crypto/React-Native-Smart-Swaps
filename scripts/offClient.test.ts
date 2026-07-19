/**
 * Offline checks for app/services/offClient.ts's retry policy.
 *   npx tsx scripts/offClient.test.ts
 *
 * search-a-licious has observed real-world flakiness (OFF's own status page has shown
 * ~85% uptime for it over a 7-day window - frequent transient 502/503/504s, not a hard
 * outage). This exercises the retry behaviour that's meant to survive that, using a fake
 * fetchImpl so it's deterministic and makes no real network calls.
 */

import { lookupOffProduct } from '../app/services/offClient';

const okResponse = (body: any): Response =>
  ({ ok: true, status: 200, json: async () => body } as unknown as Response);
const statusResponse = (status: number): Response =>
  ({ ok: false, status, json: async () => ({}) } as unknown as Response);

(async () => {
  let failures = 0;
  const check = (name: string, cond: boolean, detail = '') => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + detail}`);
    if (!cond) failures++;
  };

  const product = { product_name: 'Pringles Original', categories_tags: ['en:crisps'], brands: 'Pringles' };

  // 1. Succeeds first try - exactly one call, no retry overhead.
  {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return okResponse({ hits: [product] }); }) as typeof fetch;
    const result = await lookupOffProduct('Pringles', { fetchImpl });
    check('immediate success: returns the product', result?.productName === 'Pringles Original');
    check('immediate success: exactly one fetch call', calls === 1, `made ${calls}`);
  }

  // 2. A 502 then a 200 - the flaky-but-not-dead case this fix targets. Must retry and succeed.
  {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return calls === 1 ? statusResponse(502) : okResponse({ hits: [product] });
    }) as typeof fetch;
    const result = await lookupOffProduct('Pringles', { fetchImpl });
    check('502 then success: recovers via retry', result?.productName === 'Pringles Original');
    check('502 then success: took exactly 2 calls', calls === 2, `made ${calls}`);
  }

  // 3. 502 on every attempt - must exhaust retries and fail closed (null), never throw.
  //    Deliberately a SMALL budget (2 attempts, not more): search-a-licious has been observed
  //    both fast-failing (502) and hanging for several seconds, and a longer retry budget
  //    would let the hanging case compound into a multi-attempt wait the user notices mid-scan.
  {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return statusResponse(502); }) as typeof fetch;
    const result = await lookupOffProduct('Pringles', { fetchImpl });
    check('persistent 502: gives up and returns null', result === null);
    check('persistent 502: made exactly 2 attempts (not more, not fewer)', calls === 2, `made ${calls}`);
  }

  // 4. 504 (gateway timeout) is retryable too, same as 502/503.
  {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return calls === 1 ? statusResponse(504) : okResponse({ hits: [product] });
    }) as typeof fetch;
    const result = await lookupOffProduct('Pringles', { fetchImpl });
    check('504 then success: recovers within the 2-attempt budget', result?.productName === 'Pringles Original');
  }

  // 5. A network-level throw (offline, DNS failure, abort) is retryable, same as a bad status.
  {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) throw new Error('network error');
      return okResponse({ hits: [product] });
    }) as typeof fetch;
    const result = await lookupOffProduct('Pringles', { fetchImpl });
    check('network throw then success: retries past it', result?.productName === 'Pringles Original');
  }

  // 6. A definitive non-retryable failure (400 Bad Request) must NOT be retried - retrying a
  //    client error just wastes time for an answer that will never change.
  {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return statusResponse(400); }) as typeof fetch;
    const result = await lookupOffProduct('Pringles', { fetchImpl });
    check('400: returns null', result === null);
    check('400: exactly one call, no retry', calls === 1, `made ${calls}`);
  }

  // 7. A genuine "no such product" (200 OK, empty hits) must NOT be retried either - it's a
  //    real answer, not a transient failure, and retrying it would only add latency.
  {
    let calls = 0;
    const fetchImpl = (async () => { calls++; return okResponse({ hits: [] }); }) as typeof fetch;
    const result = await lookupOffProduct('Some Nonexistent Product Xyz', { fetchImpl });
    check('empty result: returns null', result === null);
    check('empty result: exactly one call, no retry', calls === 1, `made ${calls}`);
  }

  console.log(`\n${failures === 0 ? 'ALL PASS' : failures + ' FAILURE(S)'}`);
  process.exit(failures === 0 ? 0 : 1);
})();
