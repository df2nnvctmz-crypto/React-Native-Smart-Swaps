# PORTING_NOTES.md

Running record of deviations, reproduced bugs and measurements. Started at Phase 3 rather
than Phase 7 so nothing is reconstructed from memory later. **Phases 0-3 complete; phases
4-7 (UI) not started**, so the icon-mapping and visual-deviation sections are stubs.

---

## Status

| Phase | State |
|---|---|
| 0 Inventory | done — `PORTING_INVENTORY.md` |
| 1 Skeleton | **partial** — SPM package, resources, compat layer done from before; `SmartSwaps.xcodeproj` generated, app target with `Colors`/`GlobalStyles`/`Typography`, `Info.plist`, and a 4-tab `RootView` added. **"Builds and launches to an empty tab bar" is still unverified** — no macOS/Xcode/simulator is available in this container, see below. |
| 2 Data layer | done, verified row-for-row, **plus** `StorageService`, `FoodsStore`, `RecipeStore`/`RecipeMath`, `ProfileStore`/`ProfileMath`, `FavoritesStore`, `InventoryStore` added in Phase 4 (below) — components needed them to type-check at all. `SettingsStore` is the one piece of PORTING_INVENTORY.md §4 still not ported; nothing in Phase 4 needed it. |
| 3 Engine | **done, gate green** — 18 tests, 0 failures. `Micronutrients.swift` and `RecipeMath.swift` (parseGrams/scaleNutrients/addNutrients/divideNutrients/estimateTimeDifficulty/hydrateRecipes) added in Phase 4 — both were named in PORTING_INVENTORY.md's file map but not yet written; neither has a differential test against the TS original the way the rest of the engine does (see below). |
| 4 Components | **all 15 non-dead components ported** (`Header.tsx` stays unported per §9). SwiftUI `#Preview` on every file, but **none have been opened in Xcode/Previews** — no macOS available, see below. |
| 5-7 | not started |

Run the suite with `swift test` in `SmartSwapsNative/` (~4 min, no simulator needed).

---

## What the equivalence suite actually proves

Differential against the **live** TypeScript engine and against V8 itself — not against
hand-written expectations. Floats to `1e-9`, everything else exact.

| Test | Volume | Covers |
|---|---|---|
| `JSSortTests` | 2,104 cases | `Array.prototype.sort` vs V8, incl. the non-transitive comparator |
| `DataLayerTests` | 7,140 + 955 + 8,571 + 85 | foods row-for-row **incl. order**, recipes, ingredients, icons |
| `testStringNormalisation` | 14,632 | `normalize`, `asciiFold` |
| `testPerFoodPredicates` | 7,140 × 13 | `isLiquid`, `isRawIngredient`, `swapSuppressionReason`, `isProduce`, `getProduceGroup`, `getCulinaryFunction`, `containsMeatOrFish`, `containsAnimalProduct`, `isPlantAlternative`, `isAllowedForDiet` ×3, raw attributes |
| `testPairwise` | 6,000 pairs | `embeddingCosine`, `evaluateSwap`, all 20 GBM features **including nil-ness**, `predictSwapQualityGbm`, `culinaryVeto` ×2 flavours |
| `testFindBestSwaps` | 2,000 slates | whole pipeline, 4 policies — candidate ids **and** scores |
| `testDishFlavour` | 300 | `getDishFlavour` |
| `testDictionaryTiers` | 168 | `normalizeOverrideKey`, `matchBrandDict`, `matchExactLookup`, `isKnownNonMatch` |
| `testIndexShape` | 4 index sizes | `buildFoodIndex` (5966/2584/13909/6929) |
| `testGermanAbbreviations` | 168 | `expandGermanAbbreviations` |
| `testParseReceiptLine` | 168 | `matchFoodToOcrText` + `parseReceiptLine` |
| `testRegressionSuite` | 55 | `scripts/regression.cases.ts` — **55/55** |
| `testCulinaryGate` | 37 | `scripts/culinary.test.ts` MUST-VETO / MUST-PASS |
| `testMatchesCurrentTypeScriptBaseline` | 169 | per case **and** per bucket |

Baseline buckets, Swift == current TS: bls-direct **96/121** (2 miss, 23 wrong),
semantic **4/16** (6 miss, 6 wrong), unresolvable **13/32** (0 miss, 19 wrong).

---

## Measurements that changed the port

Three things where the obvious implementation was wrong and only measurement caught it.

### 1. V8 does not use TimSort below 8 elements

Found because one differential case (n=7) disagreed. Counting comparator calls on a
descending input separates the algorithms cleanly:

| n | comparator calls | algorithm |
|---|---|---|
| 5 | 8 | binary insertion |
| 6 | 11 | binary insertion |
| 7 | 14 | binary insertion |
| 8 | 7 (= n−1) | TimSort run detection |
| 200 | 199 (= n−1) | TimSort run detection |

**Why it matters.** `matchFoodToOcrText`'s final comparator switches sort key inside a
±0.03 confidence band, so it is not transitive — the winning match is a property of which
comparisons the algorithm performs, not of the comparator alone. My run detector was
swallowing three elements into a "descending" run that V8 never forms, changing the
returned food. `JSSort.swift` now branches to `binaryInsertionSort` for `n < 8`.

### 2. ICU's `\b` disagrees with JS's, in both directions

| pattern / subject | JS | ICU |
|---|---|---|
| `/\bäpfel\b/` on `"äpfel"` | `false` | `true` |
| `/\bmilch\b/` on `"ämilch"` | `true` | `false` |

JS `\w` is ASCII-only; ICU's is Unicode-aware. `dietaryFilter.hasWord` runs against
`name_de`, which is full of umlauts, so this is live, not theoretical — as are
`containsKeywords`, `FUNCTION_REGEXES`, `GROUP_PATTERNS`, `DECLARED_ANIMAL`/`DECLARED_MEAT`.

`JSRegex.swift` rewrites every pattern before compiling: `\w`→`[A-Za-z0-9_]`,
`\d`→`[0-9]`, `\s`→the explicit ECMA whitespace set, and `\b` to a **context-free**
alternation that is true iff exactly one side is an ASCII word char. A naive
`(?<![A-Za-z0-9_])` lookaround is *not* sufficient — it gets `äpfel` wrong. Class-interior
escapes are expanded differently (`\w` contributes members); a comment records that no
pattern in this engine uses `\W`/`\D`/`\S` inside a class, where that expansion would
invert the meaning.

### 3. `scripts/baseline.snapshot.json` is stale

The brief calls it "the frozen expected output" that the Swift engine must reproduce
exactly. It cannot be, because **the TypeScript engine no longer reproduces it either**.
The snapshot is dated `2026-07-19T21:22:59.133Z`; the working tree's engine changes
(`swapAlgorithm.ts`, `dietaryFilter.ts`, the new `culinaryFilter.ts`/`produceGroups.ts`)
moved **30 of its 169 cases**. Running `npx tsx scripts/baseline-eval.ts` today produces
96/2/23, 4/6/6, 13/0/19 — the numbers the Swift port produces.

Resolution: gate on a snapshot regenerated from the current tree
(`Fixtures/baseline-current.json`), and pin the drift in `testCommittedSnapshotDrift` so
it stays visible rather than being quietly absorbed. Examples of the 30:
`Pringles Original 165g` null→`bls0327`, `Landliebe Schlagsahne 30% 200ml`
`bls0699`→`bls0344`, `KIDNEY BOHNEN` `bls0658`→`bls1741`.

**This needs your call**: either regenerate and commit `baseline.snapshot.json` from the
current tree, or treat the 30 moves as regressions to investigate. I have not touched the
committed file.

---

## Deviations from the brief

| Deviation | Why |
|---|---|
| **System `SQLite3`, not GRDB/SQLite.swift** | Four read-only queries, no JOIN, no writes. An ORM adds a network-fetched dependency and a layer between the port and SQLite's row order, which §3.2 established is load-bearing. |
| **`foodEmbeddings`/`foodAttributes` `.data.json` → `.bin` + meta at build time** | Explicitly allowed by the brief. 3.8 MB JSON with a 3.6 M-char base64 payload became a 2.74 MB mmap-able blob. Numbers untouched — the 6,000-pair cosine diff at 1e-9 is the proof, so the hand-rolled Hermes base64 decoder has no Swift counterpart. |
| **SF Pro, not Nunito** | Your decision, and it matches the running app: the tab bar names `Nunito_500Medium` but no font file is bundled, nothing calls `useFonts()`, and no other `fontFamily` appears anywhere. |
| **`SmartSwapsKit` as an SPM package** | Lets the Phase 3 gate run as `swift test` in ~4 min with no simulator. The app target will depend on it. |
| **App target has no separate `Resources/` data bundle** | `smartswaps.db` and the `.data.json`→`.bin` assets already ship as `SmartSwapsKit`'s package resources (Phase 2/3). The app target consumes them through the package's `Bundle.module` rather than duplicating a second copy, per PORTING_INVENTORY.md §0's own target layout listing `Resources/` once. Not a behavioral change, just avoids two copies of a 7.6 MB DB. |

---

## Phase 4 — shared components

All 15 non-dead `components/*.tsx` ported to `SmartSwapsNative/SmartSwaps/Components/*.swift`,
one file each, same names. `Header.tsx` stays unported (§9 — never imported anywhere).

**What this needed that didn't exist yet.** Several components reach into RN contexts/hooks
(`useFavorites`, `useProfile`, `useInventory`, `useRecipes`, `useFoods`) that PORTING_INVENTORY.md
§4 scoped to Phase 2 but were never written — Phase 2's "done" status only covered
`DatabaseService`/`KeyValueStore`. Rather than stub these out, they were built for real now,
since a component that can't reach its data isn't a faithful port of one that can:

- `Models/Recipe.swift`, `Models/Profile.swift`, `Models/Inventory.swift` (new `SmartSwapsKit`
  types: `Recipe`, `RecipeIngredient`, `Profile` + its enums, `ScanRecord`, `FavoritesState`).
- `Engine/Micronutrients.swift`, `Engine/RecipeMath.swift` (new `SmartSwapsKit` pure functions —
  named in PORTING_INVENTORY.md's file map, not yet written).
- `Data/StorageService.swift` (new — port of `services/storage.ts`, the scan/interaction log).
- `State/{Foods,Profile,Favorites,Inventory,Recipe}Store.swift` (new, app-target
  `ObservableObject`s — `SettingsStore` is the one PORTING_INVENTORY.md §4 store nothing here
  needed, so it's still unwritten). Components take these via `@EnvironmentObject`, matching
  the RN pattern of reaching into context internally rather than through props — `RootView`
  now instantiates and injects all five, nested Profile → Favorites → Inventory (Settings
  omitted) per §4, and reproduces its "renders nothing until Profile+Favorites finish loading"
  correction to the brief.

**Not differentially tested.** Unlike the Phase 3 engine, `RecipeMath`/`Micronutrients`/
`ProfileMath` have no `swift test` gate diffing them against the live TS originals — Phase 3's
proof method (dump-then-diff via `npx tsx`) wasn't run for them here. `ProfileMath`'s BMR/macro
arithmetic and `RecipeMath.parseGrams`'s regex were checked by hand against
`ProfileContext.tsx`/`useRecipes.ts`, which is weaker than the rest of this port's standard.
Recommend a proper differential fixture before Phase 3's gate is considered to cover them.

**Not verified in Xcode at all.** No macOS/Xcode is available in any container this port has
run in, so none of these 15 `#Preview`s have actually been rendered, and the code has only been
checked by reading it and a brace/paren balance script — not compiled. Treat every file here as
unverified until opened on a Mac.

**Deviations and approximations, each disclosed in the file's own header comment:**

| File | Deviation |
|---|---|
| `FoodIcon.swift` | Always takes the SF Symbol fallback path — the OpenMoji SVG rendering pipeline (pre-rasterise at build time, per PORTING_INVENTORY.md §7.3) needs a build step this container can't run. `iconLibrary` is threaded through so wiring the real path later doesn't change the call signature. |
| `FoodsStore.swift` (`getIconForCategory`) | Ionicons → SF Symbol map is a best-effort guess (`fork.knife`, `fish`, `carton`, `leaf`, `drop`, `birthday.cake`, `basket`, `takeoutbag.and.cup.and.straw`), **not checked against a live SF Symbols catalog**. `egg-outline` (→ `carton`) and `nutrition-outline` (→ `basket`) have no close SF equivalent at all, exactly the two PORTING_INVENTORY.md §7.3 already flagged as needing bundled originals instead — this port approximates rather than bundling. Verify every name in Xcode's SF Symbols app before shipping. |
| `CoverFlowCarousel.swift` | Reimplemented on `DragGesture` over a fixed `HStack` rather than a real `ScrollView`, because view-aligned scroll-snap is iOS 17+ and the deployment target is 16.4. Geometry (scale/opacity/±45° Y-rotation/inward translateX) and the tripled-data loop-jump are faithful; the momentum/deceleration feel of `decelerationRate="fast"` is a SwiftUI spring, not UIScrollView physics — different curve, same idea. |
| `GlassHeader.swift` | `.bar` material stands in for `tint="systemChromeMaterial"` (closest SwiftUI equivalent — same material UIKit's own nav/tab bars use). `scrollY` is a plain `CGFloat` a hosting screen must feed in (no `Animated.Value` equivalent exists); Phase 5 screens need to track their own scroll offset via a `PreferenceKey` and pass it through. The `isLiquidGlassAvailable()`/`NativeTabs`-style liquid-glass button branch is still not implemented — `GlassCircleButton` always renders the white-circle fallback, same open item as `RootView`'s tab bar. |
| `ReceiptItemList.swift` | The shopping-list `recipeName` grouping (`(item as any).recipeName` in the source) has no home on `ParsedReceiptItem`/`ScanRecord` — that's an ad-hoc field the RN scan object carries, not part of either type's real shape. Renders one ungrouped "Other Items"-style section for now; revisit when Phase 6 wires up real scan data and it's clear where that field should live. `router.push` calls become an `onSelectFood: (String) -> Void` closure, same style already used by `RecipeCard`/`SwapComparisonCard`. |
| `Models/Inventory.swift` (`PersistedReceiptItem`) | `ParsedReceiptItem` (Phase 3) holds a live `FoodItem` **class** reference, which is correct for in-memory matching but can't round-trip through `Codable` the way JS serializes the matched food's plain object into `@smart_swaps_scans`. Added a separate `Codable` shape (`matchedFoodId: String?`) with a `resolved(in:)` bridge back to `ParsedReceiptItem`, rather than making the engine's own matched-object identity semantics (§5.2c) `Codable`. |
| `SearchModal.swift` | RN's `SearchModal` self-presents a `<Modal>`; this port renders bare content and expects the caller to present it via SwiftUI's `.sheet(...)` modifier instead (see `ReceiptItemList.swift`'s usage) — modifier-driven presentation is the SwiftUI idiom, RN's self-presenting component isn't. `SearchScreen()` itself is still the Phase 1 placeholder. |
| `Data/DatabaseService.swift` / `RecipeMath.hydrateRecipes` | `recipe_ingredients` has `grams`/`kcal` DB columns that `RecipeIngredientRaw` already reads (Phase 2), but `RecipeMath.hydrateRecipes` ignores both and recomputes them from `raw_text` via `parseGrams`/`scaleNutrients`, because that's what the TS source actually does (`useRecipes.ts` never reads those DB columns either). Whatever those columns hold is unused by the real app — flagging so a future reader doesn't assume it's a bug that they're dead. |

---

## Bugs faithfully reproduced

Per rule 3 — ported as-is, recorded here.

1. **DB delete-and-recopy on every launch.** `initDatabase()` deletes the working copy and
   re-copies from the bundle each time ("For simplicity during development..."). A user's
   database never survives a restart. Preserved.
2. **`nova_group` is NULL for all 7,140 rows**, so every NOVA branch in
   `smartSwaps.findSmartSwap` is dead. (That module is itself unreferenced.)
3. **83 NULL macro cells** (protein 23, satfat 23, fibre 27, fat 10). TS carries `null`
   into arithmetic. Verified 0.0 is behaviourally identical here: JS coerces `null`→0 in
   arithmetic *and* relational comparison, `||` treats them alike, and nothing compares a
   nutrient with `==`/`===` — checked by grep across `app/`, `components/`, `SearchScreen.tsx`.
4. **`OverrideStore.get()` returns null until `load()` completes.** The offline eval never
   calls `load()`, so tier 1 is inert there — and reproducing the baseline depends on it.
5. **`brandDict` keys with dots** (`sort.`, `clas.`, `m.i.`) can never match, because dots
   are stripped before the lookup. Preserved.
6. **Unrounded nutrient rendering.** `food/[id].tsx` renders `{value}{unit}`, so a macro can
   display as `3.4000000000000004g`. `JSNumber.toString` implements ECMA-262
   `Number::toString` for this. *(UI phase — not yet exercised.)*
7. **Dead code** — ported or skipped as noted in `PORTING_INVENTORY.md` §9:
   `components/Header.tsx` never imported (not ported); `RecommendedCard` imported but
   never rendered; `SearchScreen.quickSearches` unused; **`SearchScreen`'s CATEGORY filter
   is wired to state that no filter ever reads**, so selecting a category does nothing;
   `app/_layout.tsx` registers a `profile` modal route with no file; `(tabs)/_layout.tsx`
   registers a `settings` tab route that lives outside the tabs group; `settings.tsx`
   shadows `expo-clipboard` with a mock that only `console.log`s, so Export/Import Shopping
   Lists silently do nothing.

---

## Still uncertain / open

- **`sort(() => 0.5 - Math.random())`** (Home carousel filler, SearchScreen placeholder).
  An inconsistent comparator is not a specification and `Math.random()` is unseeded, so
  byte-identical output is impossible in principle. Plan: same algorithm via `JSSort`, same
  non-uniform bias, different sequence. Both sites are purely decorative. **Not yet reached.**
- **Case-insensitive matching (`i` flag).** ICU does full Unicode case folding, JS's
  non-unicode mode does simple folding; `ß`/`ss` could in principle differ. No divergence
  appeared across 14,632 strings and 168 parse lines, but it is unproven in general.
- **Xcode app target exists but is unbuilt-and-unverified.** `SmartSwaps.xcodeproj` is now
  generated (`Tools/generate-xcodeproj.rb`, via the `xcodeproj` Ruby gem — no `xcodegen`
  available, same as before) and references the app-target sources, `Info.plist`, and a
  local package dependency on `SmartSwapsKit`. It round-trips through `xcodeproj` cleanly,
  but **no `xcodebuild`/simulator is available in any container this port has run in**, so
  "builds and launches to an empty tab bar" has never actually been demonstrated. Needs a
  real Mac to confirm; flagging rather than claiming a gate that isn't proven.
- **`(tabs)/_layout.tsx`'s `NativeTabs` (Liquid Glass, iOS 26+) branch not ported.**
  `RootView.swift` only implements the `ClassicTabLayout` fallback (blurred/transparent
  `UITabBar`, tinted `primaryGreen`/`textMuted`, SF Symbols, 10pt labels). The
  `isLiquidGlassAvailable()` branch is deferred rather than guessed at with no real tab
  content yet to verify it against — revisit alongside Phase 5/6.

---

## Icon mappings

`getIconForCategory` (`State/FoodsStore.swift`) has a first-pass Ionicons → SF Symbol table —
see the Phase 4 deviations table above for the full mapping and the two categories
(egg/dairy, cereal/grain) with no close SF equivalent, approximated rather than resolved.
**Not verified against a live SF Symbols catalog** (no Xcode in this container) — check every
name before shipping.

`FoodIcon`'s 85 OpenMoji SVGs are still not rendered at all (Phase 4's `FoodIcon.swift` always
takes the fallback path above) — pre-rasterising them at build time is unstarted, and needs a
build step this container can't run.
