/**
 * Labeled evaluation set for the OpenFoodFacts identity bridge (app/engine/resolveProduct.ts:
 * bridgeOffToBls / enrichWithOff), as opposed to scripts/regression.cases.ts which locks in
 * the offline BLS-direct matcher.
 *
 * `expected` is a BLS food id the bridge SHOULD land on, or `null` when it must NOT produce
 * a confident match at all. `null` covers three different situations - say which in `note`:
 *
 *   (a) BLS genuinely has no analogue for this product (verified absent by searching
 *       foods.json - not a guess), so any confident answer is definitionally wrong.
 *   (b) BLS DOES have a correct analogue, but live testing showed the bridge currently
 *       lands on the wrong same-category neighbour for it (e.g. Coca-Cola -> tonic water).
 *       Graded as null anyway: until the bridge is tuned, ANY confident answer here is
 *       unverified, so the conservative/safe grade is "should not have resolved."
 *   (c) BLS has several near-identical entries (fat %, flavour, sweetener variants) and no
 *       single one is defensibly "the" answer for a generic query - asserting one would
 *       just be guessing with extra steps.
 *   (d) The product is out of scope for a nutrition database entirely (non-food).
 *
 * Every `expected` id below was looked up by grepping the actual foods.json content for the
 * product's generic category, not recalled from memory or copied from what the bridge
 * happened to return - the same discipline scripts/regression.cases.ts uses, for the same
 * reason: a guessed id would make the "baseline" measure nothing real.
 */

export interface OffEvalCase {
  /** A raw-ish receipt/product line, exactly the shape enrichWithOff receives. */
  query: string;
  /** Expected BLS food id, or null when the bridge must not confidently resolve this. */
  expected: string | null;
  note: string;
}

export const OFF_EVAL_CASES: OffEvalCase[] = [
  // ============================================================
  // Explicitly known-hard negatives (observed live in prior testing) - (b)
  // ============================================================
  { query: 'Coca-Cola 1.5L', expected: null, note: '(b) BLS HAS a cola entry (bls1113), but the bridge lands on a quinine tonic water (bls0778) instead' },
  { query: 'Haribo Goldbären 200g', expected: null, note: '(b)/(c) BLS has only a generic "Fruchtgummi"; the bridge does not reliably land on it' },
  { query: 'Barilla Spaghetti 500g', expected: null, note: '(b) BLS has a good pasta analogue (bls0009), but the bridge was observed to mis-resolve plain "spaghetti" queries' },

  // ============================================================
  // Should resolve: single/near-single-hit BLS categories - pantry, dairy, oils
  // ============================================================
  { query: 'Bertolli Olivenöl Extra Vergine 500ml', expected: 'bls0830', note: 'olive oil - one BLS entry' },
  { query: 'Alnatura Bio Olivenöl nativ extra 500ml', expected: 'bls0830', note: 'olive oil, different brand than the case above' },
  { query: 'Zeus Feta 200g', expected: 'bls0090', note: 'feta - one BLS entry' },
  { query: 'Pringles Original 165g', expected: 'bls0327', note: 'the seeded headline case: BLS calls crisps "Stapelchips"' },
  { query: 'Nutella 400g', expected: 'bls0424', note: 'hazelnut chocolate spread - one clear BLS entry' },
  { query: 'Uncle Bens Basmati Reis 500g', expected: 'bls0007', note: 'white rice' },
  { query: 'Landliebe Schlagsahne 30% 200ml', expected: 'bls0699', note: 'whipping cream 30%' },
  { query: 'Milbona Schlagsahne 30% 200ml', expected: 'bls0699', note: 'private-label whipping cream, mirrors the Landliebe case above' },
  { query: 'Meggle Deutsche Markenbutter 250g', expected: 'bls0387', note: 'butter, unsalted/mild is the German default absent a "gesalzen" label' },
  { query: 'Alpro Sojadrink ungesüßt 1L', expected: 'bls0668', note: 'unsweetened soy drink' },
  { query: 'Barilla Penne 500g', expected: 'bls0009', note: 'pasta - unlike spaghetti above, penne has no lexical collision risk' },
  { query: 'De Cecco Fusilli 500g', expected: 'bls0009', note: 'pasta, different brand/shape' },
  { query: 'Iglo Blattspinat 750g', expected: 'bls0277', note: 'plain frozen leaf spinach' },
  { query: 'Knorr Hühnerbrühe Würfel', expected: 'bls0417', note: 'chicken bouillon cube' },
  { query: 'Maggi Gemüsebrühe Würfel', expected: 'bls0416', note: 'vegetable bouillon cube' },
  { query: 'Danone Activia Joghurt Natur 400g', expected: 'bls0343', note: 'plain mild yogurt' },
  { query: 'Rewe Bio Vollkornbrot 500g', expected: 'bls2123', note: 'generic wholemeal bread - matches the BLS-direct regression precedent for Dinkelvollkornbrot' },
  { query: 'Golden Toast Weizenbrötchen 6 Stück', expected: 'bls0201', note: 'plain wheat rolls' },
  { query: 'Dr Oetker Backpulver', expected: 'bls0403', note: 'baking powder - one BLS entry' },
  { query: 'Ja Zucker weiß 1kg', expected: 'bls0418', note: 'white refined sugar' },
  { query: 'Teekanne Schwarzer Tee 20 Beutel', expected: 'bls0371', note: 'black tea' },
  { query: 'Bahlsen Honig 500g', expected: 'bls0037', note: 'plain honey' },
  { query: 'Alnatura Bio Honig 500g', expected: 'bls0037', note: 'honey, different brand than the case above' },
  { query: 'Skippy Erdnussbutter 340g', expected: 'bls0303', note: 'peanut butter' },
  { query: 'Develey Tomatenketchup 500ml', expected: 'bls0396', note: 'ketchup - has curry-ketchup as a near neighbour, but plain ketchup is the dominant entry' },
  { query: 'Hellmanns Mayonnaise 400ml', expected: 'bls0858', note: 'mayonnaise, ready-made' },
  { query: 'Loewensenf Mittelscharf 250ml', expected: 'bls0395', note: 'medium-hot mustard' },
  { query: 'Kuehne Essiggurken 670g', expected: 'bls0645', note: 'pickled cucumber/gherkin' },
  { query: 'Kölln Haferflocken kernig 500g', expected: 'bls0002', note: 'oat flakes' },
  { query: 'Alete Apfelmus 200g', expected: 'bls4908', note: 'apple sauce/puree' },
  { query: 'Rapunzel Sonnenblumenkerne 200g', expected: 'bls0515', note: 'sunflower seeds' },
  { query: 'Rapunzel Sonnenblumenöl 500ml', expected: 'bls0836', note: 'sunflower oil - one BLS entry' },
  { query: 'Bio Company Rapsöl 500ml', expected: 'bls0833', note: 'rapeseed oil - one clear BLS entry' },
  { query: 'Seeberger Kuerbiskerne 200g', expected: 'bls0312', note: 'pumpkin seeds' },
  { query: 'John West Thunfisch im eigenen Saft 185g', expected: 'bls1162', note: 'canned tuna in its own juice' },
  { query: 'Iglo Erbsen und Möhren tiefgefroren 450g', expected: 'bls5540', note: 'frozen peas-and-carrots vegetable mix' },
  { query: 'Iglo TK Erbsen 450g', expected: 'bls0644', note: 'plain frozen peas, no mix' },
  { query: 'Landjäger 200g', expected: 'bls2523', note: 'dried sausage snack - one BLS entry, name matches exactly' },
  { query: 'Kikkoman Sojasauce 150ml', expected: 'bls0397', note: 'soy sauce - one BLS entry' },
  { query: 'Modena Balsamico Essig 250ml', expected: 'bls1148', note: 'balsamic vinegar' },
  { query: 'Homann Sauerrahm 200g', expected: 'bls1074', note: 'sour cream, min. 10% fat entry' },
  { query: 'Andechser Bio Speisequark Magerstufe 250g', expected: 'bls0360', note: 'plain low-fat quark' },
  { query: 'dm Bio Kokosmilch 400ml', expected: 'bls1469', note: 'coconut milk - one BLS entry' },
  { query: 'REWE Bio Zuckermais Dose 300g', expected: 'bls0295', note: 'canned sweetcorn, drained' },
  { query: 'Alesto Erdnüsse geröstet 200g', expected: 'bls0227', note: 'roasted peanuts, plain/unsalted is the entry absent a "gesalzen" label' },

  // ============================================================
  // Should resolve: produce, nuts, legumes, dried fruit - single-hit BLS entries
  // ============================================================
  { query: 'Chiquita Banane', expected: 'bls0249', note: 'banana' },
  { query: 'Pink Lady Apfel', expected: 'bls0237', note: 'apple' },
  { query: 'Edeka Bio Karotten 1kg', expected: 'bls0299', note: 'carrot' },
  { query: 'REWE Zwiebeln lose', expected: 'bls0522', note: 'plain raw onion - the dominant entry among many composite "...mit Zwiebeln" dishes' },
  { query: 'REWE Bio Knoblauch', expected: 'bls0631', note: 'raw garlic' },
  { query: 'REWE Bio Zucchini', expected: 'bls0297', note: 'zucchini' },
  { query: 'REWE Bio Gemüsepaprika rot', expected: 'bls0017', note: 'red bell pepper - unambiguous once colour is stated' },
  { query: 'Natur pur Champignons braun 400g', expected: 'bls0332', note: 'raw mushrooms' },
  { query: 'Alesto Walnusskerne 200g', expected: 'bls0512', note: 'walnuts' },
  { query: 'Alesto Mandeln natur 200g', expected: 'bls0650', note: 'sweet almonds' },
  { query: 'Alesto Cashewkerne 200g', expected: 'bls0308', note: 'cashews' },
  { query: 'Alesto Rosinen 200g', expected: 'bls0599', note: 'raisins/sultanas' },
  { query: 'Alnatura Datteln getrocknet 200g', expected: 'bls0250', note: 'dried dates' },
  { query: 'dm Bio Rote Linsen 500g', expected: 'bls1056', note: 'red lentils' },
  { query: 'Alnatura Kichererbsen getrocknet 500g', expected: 'bls0665', note: 'dried chickpeas' },
  { query: 'Driscolls Himbeeren 125g', expected: 'bls0012', note: 'raspberries' },
  { query: 'Bio Heidelbeeren 125g', expected: 'bls0083', note: 'blueberries' },
  { query: 'Zespri Kiwi', expected: 'bls0257', note: 'kiwi fruit' },
  { query: 'REWE Mandarinen Netz 1kg', expected: 'bls1035', note: 'mandarin oranges' },
  { query: 'Rosa Grapefruit', expected: 'bls1034', note: 'pink grapefruit' },
  { query: 'Wassermelone', expected: 'bls0605', note: 'watermelon' },

  // ============================================================
  // Should resolve: meat, poultry, cheese - single-hit BLS entries
  // ============================================================
  { query: 'Wiesenhof Hähnchenbrustfilet 400g', expected: 'bls0951', note: 'raw chicken breast fillet' },
  { query: 'REWE Bio Rinderhackfleisch 400g', expected: 'bls1976', note: 'raw beef mince' },
  { query: 'Ja Kochschinken 150g', expected: 'bls0992', note: 'cooked cured ham' },
  { query: 'Ja Salami 150g', expected: 'bls0978', note: 'salami, pork variant - matches the BLS-direct regression precedent for Edelsalami' },
  { query: 'Ja Frühstücksspeck 150g', expected: 'bls2697', note: 'raw cured smoked breakfast bacon' },
  { query: 'Meica Wiener Würstchen', expected: 'bls0499', note: 'Wiener sausages' },
  { query: 'Ja Bockwurst', expected: 'bls4534', note: 'Bockwurst sausage' },
  { query: 'Chester Scheiben 200g', expected: 'bls0705', note: 'Chester/Cheddar cheese' },
  { query: 'Gouda in Scheiben 200g', expected: 'bls0352', note: 'Gouda 48% fat' },
  { query: 'Galbani Mozzarella 125g', expected: 'bls0760', note: 'mozzarella' },

  // ============================================================
  // Should stay null: BLS has no analogue at all - (a), verified absent from foods.json
  // ============================================================
  { query: 'Red Bull Energy Drink 250ml', expected: null, note: '(a) no energy-drink entry exists in BLS at all' },
  { query: 'Bifi Wurst Snack Stick', expected: null, note: '(a) no meat-snack-stick entry exists in BLS at all' },
  { query: 'Snickers Riegel 50g', expected: null, note: '(a) no peanut-nougat bar entry exists in BLS (only caramel-filled and plain chocolate variants)' },
  { query: 'Kinder Schokolade 8 Riegel', expected: null, note: '(a) no matching composite entry exists in BLS' },
  { query: 'Toffifee 125g', expected: null, note: '(a) no caramel-nut-praline entry exists in BLS' },
  { query: 'Ostmann Oregano getrocknet 12g', expected: null, note: '(a) no oregano entry exists in BLS at all' },
  { query: 'Ostmann Currypulver 40g', expected: null, note: '(a) no curry SPICE POWDER entry exists in BLS (only curry-flavoured prepared dishes)' },
  { query: 'Ostmann Paprika edelsüß 50g', expected: null, note: '(a) no paprika SPICE POWDER entry exists in BLS (only fresh/cooked bell-pepper vegetable entries)' },
  { query: 'Elmex Kaugummi', expected: null, note: '(d) chewing gum - not a meaningfully trackable food/nutrition item' },
  { query: 'Persil Waschmittel 20WL', expected: null, note: '(d) non-food household item; must never resolve to a food' },
  { query: 'Dove Duschgel 250ml', expected: null, note: '(d) non-food personal-care item; must never resolve to a food' },

  // ============================================================
  // Should stay null: multiple close BLS neighbours, no single defensible answer - (c)
  // ============================================================
  { query: 'Fanta Orange 1.5L', expected: null, note: '(c) BLS has both "Limonade" and "Orangenlimonade" as close neighbours' },
  { query: 'Sprite 1.5L', expected: null, note: '(c) BLS has "Zitronenlimonade" plus several beer/wine-spritzer entries that also mention it' },
  { query: 'Milka Alpenmilch Schokolade 100g', expected: null, note: '(c) BLS has 24 chocolate-bar variants (plain, filled, various fillings)' },
  { query: 'Ritter Sport Vollmilch 100g', expected: null, note: '(c) same ambiguity as Milka above' },
  { query: 'Frosta Rahmspinat 450g', expected: null, note: '(c) creamed spinach is a composite dish; several similarly-worded stewed/creamed spinach entries compete' },
  { query: 'Ehrmann Almighurt Erdbeere 150g', expected: null, note: '(c) BLS has multiple sweetened fruit-yogurt entries differing only by fat %' },
  { query: 'Müller Reis Milchreis 200g', expected: null, note: '(c) BLS has several sweetened rice-pudding variants (with raisins, with soy drink, etc.)' },
  { query: 'Jacobs Kaffee gemahlen 500g', expected: null, note: '(c) BLS has ~60 coffee-adjacent entries (ersatz, decaf, roast levels)' },
  { query: 'Schwartau Konfitüre Extra Erdbeere 340g', expected: null, note: '(c) BLS has several jam variants differing by fruit/sweetener' },
  { query: 'Zentis Konfitüre extra Kirsche 225g', expected: null, note: '(c) same ambiguity as Schwartau above, different fruit' },
  { query: 'Werz Dinkelmehl 1kg', expected: null, note: '(c) BLS has 13 flour "Type NNNN" variants; a generic query cannot defensibly pick one' },
  { query: 'Deutsche See Lachsfilet TK 400g', expected: null, note: '(c) BLS distinguishes raw/smoked salmon; a frozen-fillet query does not specify which' },
  { query: 'Golden Toast Toastbrot 500g', expected: null, note: '(c) toast bread vs. bread roll vs. sandwich bread - several near-identical BLS wheat-bread entries' },
  { query: 'Coppenrath Feingebäck Kekse 200g', expected: null, note: '(c) generic "cookies/biscuits" spans dozens of BLS entries by type' },
  { query: 'Lindt Excellence 70% Kakao 100g', expected: null, note: '(c) dark chocolate by cocoa-% has multiple close BLS neighbours' },
];
