## Summary

Receipt-scanning coverage has been limited by BLS being a generic-food nutrition database, not a retail-product catalog (e.g. "Pringles" has no direct entry). This PR adds a resolution layer that fixes that gap in three ways, in priority order, while keeping nutrition sourced from BLS at every step so health scores stay comparable:

1. **Regression suite** — locks in matcher behavior against 55 real scanned OCR lines so future changes can't silently regress it.
2. **Offline override cache** — a user's manual correction (the existing edit-pencil flow) is remembered and reused on every future receipt, fully offline. This is the biggest practical coverage win and needs no external data.
3. **On-demand OpenFoodFacts bridge** — for branded lines the offline matcher can't place, OFF identifies the product and its category is matched back through the *same* BLS matcher, so nutrition is still 100% BLS. **Ships disabled by default** behind a new "Look up branded products online (beta)" setting (Task in this PR) — see Known limitation below.

Nothing here changes existing matcher behavior when the new setting is off: resolution is exactly override-cache → BLS-direct matcher, byte-for-byte identical to before this PR (verified, see Testing).

## What's solid vs. provisional

**Solid, always on:**
- Regression suite (`npm test`, 55/55) — real scanned lines, including negative cases (postal codes must not match, no BLS-analogue items must stay "not found").
- Override cache — unit tested for both required properties: same product at different pack size → same key (correction generalizes); different flavor/variety → different key (doesn't over-collapse, e.g. Skyr Frucht vs. Vanille stay distinct).
- Resolution scaffold — proven equivalent to the pre-existing direct-matcher path across the full regression corpus.

**Provisional, opt-in, off by default:**
- The OFF category-bridge. It works well for its headline case (Pringles → Kartoffelchips, 0.63 confidence) but can pick a wrong *same-category* neighbor for others (Coca-Cola → tonic water, 0.66) — see Known limitation.

## Deviations from the original plan, and why

- **`app/engine/foodIndex.ts` extraction.** `buildFoodIndex` lived inside `useFoods.ts`, which imports React and the profile context. For the regression suite to test the *real* index (not a hand-copied stand-in that would silently drift from production behavior), I extracted it into a dependency-free module. `useFoods.ts` re-exports it, so no existing import site changed.
- **On-demand OFF API instead of a bundled dump.** The original plan called for `scripts/prepare-off.ts` filtering a multi-GB OFF dump into a bundled local subset. That dump isn't something this environment can download, and — more importantly — isn't necessary: OFF's REST API is called live, only for lines the offline matcher already left weak (confidence < 0.45), keeping traffic minimal. There is no bundled category→BLS mapping table either: OFF's own category tags are fed straight through the existing BLS matcher, so BLS itself is the "curated list," with no separate mapping data to maintain.
- **Two guards found only by testing against the live API**, not guessable in advance:
  - *Query cleaning.* The raw OCR line ("Nutella 400g") pollutes OFF's full-text search with size/price noise and returns junk; the query is now cleaned with the same normalizer used for override-cache keys before it's sent.
  - *Short-tag-only bridging.* OFF's longer, more descriptive category tags ("salty-snacks-made-from-potato") aren't food names and fuzzy-matched an unrelated BLS entry (potato dumplings) more strongly than the correct short tag ("crisps"/"potato-crisps"). Category tags over 3 words are now ignored — short + specific is exactly what maps cleanly onto a BLS name.
  - Also switched off the legacy OFF search endpoints (`search.pl`, `v2 search_terms`), which returned "temporarily unavailable" under light load during testing, in favor of the supported `search-a-licious` endpoint.

## Known limitation (committed, not hidden)

Mapping an OFF category *phrase* through the fuzzy BLS matcher can land on a wrong neighbor *within the right category* — e.g. Coca-Cola resolves to a chinine-containing tonic-water entry (0.66) instead of the cola entry that does exist in BLS. This is a different failure mode from the resolved Pringles/potato-dumpling bug: that one was categorically wrong, this one is a same-category near-miss, and I could not find a confidence threshold that separates the two using the current data.

**This is why the feature ships opt-in and off by default** (new `settings.offLookupEnabled`, defaults `false`) rather than blocking the PR on fixing it. When disabled: zero network calls, resolution is exactly the pre-existing path. When a user opts in, a "Nutrition based on: [BLS food]" disclosure line makes the OFF-derived basis visible, and the override cache means any wrong bridge gets corrected once and never recurs for that user.

This PR also adds `scripts/off-eval.ts` + `scripts/off-eval.cases.ts`, a labeled-eval harness (mirroring the regression suite above, but for the OFF bridge specifically) with precision/recall/confident-wrong metrics, 105 hand-verified cases, and a preflight reachability check — so any future tuning of the bridge is driven by data rather than guesswork. **Its baseline is not yet captured**: every attempt during this work hit a genuine, sustained outage of OFF's `search-a-licious` endpoint (confirmed independently 3 times over 25+ minutes via direct 502 responses, with OFF's legacy v2 API remaining reachable throughout — the fault is isolated to that one endpoint, not this network). The harness's own preflight check caught this and correctly refused to report the resulting all-null run as a real baseline. Next step once OFF recovers: `npx tsx scripts/off-eval.ts`.

## Test plan

- [x] `npm test` (matcher regression, 55 real OCR lines) — 55/55, unaffected by this PR
- [x] `npx tsx scripts/overrideKey.test.ts` — override-cache key normalizer, 10/10
- [x] `npx tsx scripts/offBridge.test.ts` — OFF bridge + enrich pass + setting-gate, all pass (offline, canned responses)
- [x] Verified live against the real OpenFoodFacts API (Pringles → Kartoffelchips; confirmed the Coca-Cola limitation)
- [x] Verified the full app-level path (`resolveProductLine` + `enrichWithOff`), not just the underlying matcher directly, matches all 55 regression expectations with the setting **both on and off**
- [x] Verified with the setting off: an intentionally-exploding fake OFF lookup proves zero network calls occur
- [x] `tsc --noEmit` clean across `app/`
- [x] `scripts/off-eval.ts` built and typechecks; ran end-to-end (105/105 cases execute, correct summary structure) but against a degraded OFF endpoint - see Known limitation for why these numbers aren't the real baseline

🤖 Generated with [Claude Code](https://claude.com/claude-code)
