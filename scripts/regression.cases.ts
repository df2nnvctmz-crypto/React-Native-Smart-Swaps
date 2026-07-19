/**
 * Real OCR lines captured from scanned German grocery receipts (Netto, Rewe), together
 * with the BLS match they are expected to resolve to.
 *
 * `expected` is the food id, or null when the line must NOT produce a usable match
 * (either filtered as receipt noise, or below the display confidence floor).
 *
 * These are ground truth for the matcher. When a change here fails, fix the mechanism -
 * do not retune thresholds to paper over it, and do not edit an expectation unless the
 * new value is genuinely more correct (say so in the commit message).
 */

export interface RegressionCase {
  /** Raw OCR line, exactly as the native OCR produced it. */
  line: string;
  /** Expected BLS food id, or null when the line should not resolve. */
  expected: string | null;
  /** Human-readable note - what the product actually is / why this is the right answer. */
  note?: string;
}

export const REGRESSION_CASES: RegressionCase[] = [
  // ---- receipt noise: must never be treated as a product ----
  { line: '10247 Berlin', expected: null, note: 'postal code + city' },
  { line: '13353 Berlin.', expected: null, note: 'postal code + city, trailing period' },

  // ---- dairy ----
  { line: 'GL Skyr Frucht sort.500g', expected: 'bls0772', note: 'Skyr' },
  { line: 'SKYR HIMB -CRANB', expected: 'bls0772', note: 'Skyr raspberry/cranberry' },
  { line: 'SKR VANILLE', expected: 'bls0772', note: 'Skyr vanilla, OCR dropped the Y' },
  { line: 'Zeus Feta 200g', expected: 'bls0090', note: 'Feta' },
  { line: 'EHFE Mozzarella oGt 125g', expected: 'bls0760', note: 'Mozzarella' },
  { line: 'M... Mozzarella oGt 125g 1.38 B', expected: 'bls0760', note: 'Mozzarella' },
  { line: 'AS Mozz.Sticks m.Dip 250g 1.79 B', expected: 'bls0760', note: 'Mozzarella sticks' },
  { line: 'MOZ2./BUEA MIN', expected: 'bls0760', note: 'Mozzarella, heavy OCR damage' },
  { line: 'GL SandwSHB Gouda oGt200g 2.59 B', expected: 'bls0352', note: 'Gouda' },
  { line: 'CHESTER SKS', expected: 'bls0705', note: 'Chester/Cheddar' },
  { line: 'GL Sahne 30% 200g VLOG', expected: 'bls0699', note: 'cream 30% - must not pick the 36% entry' },
  { line: 'Markenbutter sauer 250g 2.39 B', expected: 'bls0841', note: 'soured cream butter' },
  { line: 'BIO WEIDEMTLCH', expected: 'bls0340', note: 'pasture milk, OCR damaged' },

  // ---- pantry / dry goods ----
  { line: 'Bio BB Teigwaren sort. 500g', expected: 'bls0009', note: 'pasta' },
  { line: 'Mondo Ital.Fusilli 500g 1.58 B', expected: 'bls0009', note: 'fusilli pasta' },
  { line: 'Bio BB rot.Lins.Fusi.250g', expected: 'bls1056', note: 'red lentil fusilli' },
  { line: 'JAY BASMATI REIS', expected: 'bls0007', note: 'basmati rice' },
  { line: 'GOLDNAIS', expected: 'bls0005', note: 'Goldmais (corn), OCR read M as N' },
  { line: 'Bert.Olivenoel sort.500ml', expected: 'bls0830', note: 'olive oil' },
  { line: 'Carat Meersalz Muehle 110g', expected: 'bls0850', note: 'sea salt' },
  { line: 'Ostmann Pfefferkoer.wei. 60g', expected: 'bls0401', note: 'peppercorns - a spice, not gingerbread' },
  { line: 'KIDNEY BOHNEN', expected: 'bls0658', note: 'kidney beans' },
  { line: 'ACETO BALSAMICO', expected: 'bls1148', note: 'balsamic vinegar' },

  // ---- tomato products: the singular/plural trap ----
  { line: 'Tomaten 500g', expected: 'bls0293', note: 'fresh tomatoes - NOT tomato puree' },
  { line: 'TOMATE SNACK', expected: 'bls0293', note: 'snack tomatoes' },
  { line: 'PASSIERT. TOMATEN', expected: 'bls0857', note: 'passata' },
  { line: 'BioBio Tomatenmark 200g', expected: 'bls1149', note: 'tomato paste' },
  { line: 'BE Tomaten ganz,geschaelt 400g', expected: 'bls0636', note: 'peeled canned tomatoes' },

  // ---- produce ----
  { line: 'Apfel Pink Lady Lose', expected: 'bls0237', note: 'apple' },
  { line: 'Bananen Lose 0.89 B', expected: 'bls0249', note: 'bananas' },
  { line: "BANANE OHIQUITA'", expected: 'bls0249', note: 'Chiquita banana, OCR damaged' },
  { line: 'Zitronen 500g VKE 1.00 B', expected: 'bls1031', note: 'lemons' },
  { line: 'GURKE MINI', expected: 'bls0524', note: 'mini cucumber' },
  { line: 'SALATBEUTEL REWE', expected: 'bls0274', note: 'bagged lettuce' },
  { line: 'Suppengemuese 500g', expected: 'bls2399', note: 'soup vegetables' },

  // ---- meat ----
  { line: 'Hackfleisch gem. 500g', expected: 'bls0453', note: 'pork mince' },
  { line: 'BIO HACK SW RO', expected: 'bls0453', note: 'raw pork mince, abbreviated' },
  { line: 'Hackfleisch gemischt 400g', expected: 'bls5105', note: 'mixed beef/pork mince' },
  { line: 'Haehnchen-Innenfilet 400g', expected: 'bls0951', note: 'chicken inner fillet' },
  { line: 'Kochschinken 150g 1.89 B', expected: 'bls0992', note: 'cooked ham' },
  { line: 'Edelsalami 150g 1.79 B', expected: 'bls0978', note: 'salami' },
  { line: 'EDELSAAMI', expected: 'bls0978', note: 'salami, OCR dropped the L' },
  { line: 'Bierschinken 150g 1.19 B', expected: 'bls4021', note: 'Bierschinken' },

  // ---- prepared / composite ----
  { line: 'Wa.Stein.Pizza Thunf.360g', expected: 'bls7140', note: 'tuna pizza' },
  { line: 'NIPizzaSpeciale2ST690g 3.59 B', expected: 'bls7135', note: 'pizza speciale' },
  { line: 'Spinat-Ricotta-Tortelloni400g 1.89 B', expected: 'bls0148', note: 'spinach ricotta tortelloni' },
  { line: 'NI Gnocchi/Tagl.sort.600g 1.99 B', expected: 'bls4492', note: 'gnocchi' },
  { line: 'Gran.Pr.pu.Gr. sort. 500g 7.95 B', expected: 'bls2962', note: 'semolina pudding' },

  // ---- bakery ----
  // No Dinkelvollkornbrot exists in BLS. Generic wholemeal is a better nutritional proxy
  // than "Dinkelbrot" (spelt but not wholemeal), so Vollkornbrot is the accepted answer.
  { line: 'BO Dinkelvollkornbrot 500g 1.99 B', expected: 'bls2123', note: 'spelt wholemeal bread -> generic wholemeal' },
  { line: 'KW 6er Broetchen 300g 0.69 B', expected: 'bls0201', note: 'wheat rolls - not puff pastry' },
  { line: 'KR. BOTTERBAGUETT', expected: 'bls2246', note: 'butter baguette' },
  { line: 'KNOBLAUCHBAGUETT', expected: 'bls2246', note: 'garlic baguette - not the gluten-free entry' },

  // ---- items with no correct BLS entry: must NOT produce a confident match ----
  { line: 'Ostm. Chiliflocken 45g', expected: null, note: 'chili flakes - no BLS entry; must not match the dish Chili sin carne' },
];
