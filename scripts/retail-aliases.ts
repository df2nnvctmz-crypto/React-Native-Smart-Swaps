/**
 * Retail -> BLS vocabulary bridge.
 *
 * This is the one layer neither rules nor synthetic generation can produce. Every other
 * dataset in this repo derives receipt lines FROM BLS names, so none of them can encode
 * that "Pringles" means Kartoffelchips or that "Bulette" means Rind Frikadelle - those are
 * arbitrary facts about German retail, not transformations of a string.
 *
 * Each entry maps receipt vocabulary (brands, colloquial names, receipt abbreviations) to a
 * TARGET, which is matched against foods.json name_de at build time. Targets are never
 * written as bls ids by hand: scripts/resolve-retail-aliases.ts resolves them and fails on
 * anything unresolved or ambiguous, so a wrong guess here becomes a build error rather than
 * a silently mislabeled row.
 *
 * CAVEAT: these are knowledge claims about German supermarkets and should be reviewed.
 * Brand->generic mappings age (recipes change, products get discontinued) and some are
 * judgement calls: "Angus Burger" as Frikadelle rather than a steak cut is arguable.
 */

export interface RetailAlias {
  /** Receipt vocabulary: brand names, colloquialisms, common receipt abbreviations. */
  terms: string[];
  /** Exact or distinctive substring of a foods.json name_de. Resolved at build time. */
  target: string;
  note?: string;
}

export const RETAIL_ALIASES: RetailAlias[] = [
  // ---- snacks -------------------------------------------------------------------------
  { terms: ['pringles', 'lays', 'chio', 'crunchips', 'funny-frisch', 'stapelchips', 'kartoffelchips'],
    target: 'Kartoffelchips/Stapelchips, diverse Sorten', note: 'all stacked/bagged crisps collapse to one BLS entry' },
  { terms: ['doritos', 'nachos', 'tortillachips'], target: 'Tortillachips (Nachos)' },
  { terms: ['erdnussflips', 'flips', 'nicnacs'], target: 'Erdnussflips' },
  { terms: ['haribo', 'goldbaeren', 'goldbären', 'fruchtgummi', 'gummibaerchen'], target: 'Fruchtgummi (Gummibonbon)' },
  { terms: ['salzstangen', 'salzbrezeln', 'brezeln'], target: 'Salzbrezeln/Salzstangen (Laugendauergebäck)' },
  { terms: ['popcorn'], target: 'Popcorn ungesüßt' },
  { terms: ['nutella', 'nussnougatcreme', 'nuss-nougat-creme'], target: 'Nuss-Nougat-Creme' },

  // ---- dairy --------------------------------------------------------------------------
  { terms: ['hirtenkaese', 'hirtenkäse', 'schafskaese', 'schafskäse', 'feta'], target: 'Feta mind. 45 % Fett i. Tr.' },
  { terms: ['mozzarella', 'mozz', 'moz'], target: 'Mozzarella mind. 45 % Fett i. Tr.' },
  { terms: ['gouda'], target: 'Gouda 48 % Fett i. Tr.' },
  { terms: ['butterkaese', 'butterkäse'], target: 'Butterkäse mind. 50 % Fett i. Tr.' },
  { terms: ['philadelphia', 'exquisa', 'frischkaese', 'frischkäse'], target: 'Frischkäsezubereitung Natur, mind. 60 % Fett i. Tr.' },
  { terms: ['schmand', 'sauerrahm'], target: 'Sauerrahm/Schmand, mind. 20 % Fett' },
  { terms: ['magerquark', 'speisequark'], target: 'Speisequark Magerstufe, Magerquark < 10 % Fett i. Tr' },
  { terms: ['ketchup', 'tomatenketchup'], target: 'Tomatenketchup' },

  // ---- meat / sausage -----------------------------------------------------------------
  { terms: ['leberkaese', 'leberkäse', 'fleischkaese', 'fleischkäse'], target: 'Fleischkäse einfach, fein/Original Bayerischer Leber' },
  { terms: ['fleischwurst', 'lyoner'], target: 'Fleischwurst' },
  { terms: ['wiener', 'frankfurter', 'wuerstchen', 'würstchen'], target: 'Wiener Würstchen' },
  { terms: ['rinderhack', 'rinderhackfleisch'], target: 'Rind Hackfleisch, roh',
    note: 'bare "Hackfleisch"/"Hack" is deliberately NOT mapped: unqualified it is ambiguous '
        + 'between beef, pork and mixed, and receipts write "Hackfleisch gem." for the mixed one' },
  { terms: ['hackfleisch gemischt', 'hackfleisch gem', 'hack gem'], target: 'Rind/Schwein, Hackfleisch gemischt, roh' },
  { terms: ['schweinehack', 'schweinehackfleisch'], target: 'Schwein Hackfleisch, roh' },
  { terms: ['frikadelle', 'bulette', 'burgerpatty', 'angusburger', 'angus burger'], target: 'Rind Frikadelle, roh',
    note: 'judgement call: a "burger" on a receipt is a raw patty, not a steak cut. "hamburger" '
        + 'is deliberately excluded - it collides with the bun ("Hamburger Broetchen") and with '
        + 'the BLS dish entry bls6050 "Hamburger"' },
  { terms: ['haehnchenbrust', 'hähnchenbrust', 'innenfilet', 'minutenschnitzel', 'wiesenhof'], target: 'Hähnchen Brustfilet, roh' },
  { terms: ['kochschinken'], target: 'Schwein Kochschinken, Kochpökelware' },
  { terms: ['parmaschinken', 'serranoschinken', 'rohschinken', 'wacholderschinken'], target: 'Schwein Rohschinken, mager, Rohpökelware, geräuchert' },

  // ---- fish ---------------------------------------------------------------------------
  { terms: ['raeucherlachs', 'räucherlachs'], target: 'Lachs geräuchert (Räucherlachs)' },
  { terms: ['matjes', 'matjesfilet'], target: 'Matjesfilet (Heringsfilet) nordische Art' },
  { terms: ['thunfisch'], target: 'Thunfisch roh' },

  // ---- pasta / grains -----------------------------------------------------------------
  { terms: ['barilla', 'penne', 'fusilli', 'spaghetti', 'tagliatelle', 'maccheroni', 'rigatoni', 'farfalle'],
    target: 'Teigwaren eifrei, roh' },
  { terms: ['gnocchi'], target: 'Gnocchi roh' },
  { terms: ['schupfnudeln'], target: 'Schupfnudeln schwäbisch, roh' },
  { terms: ['basmati', 'langkorn', 'oryza'], target: 'Reis poliert, roh',
    note: '"parboiled" deliberately excluded - BLS has a dedicated bls0008 "Reis parboiled, '
        + 'poliert, roh"; mapping it here would override the more specific entry' },
  { terms: ['parboiled'], target: 'Reis parboiled, poliert, roh' },
  { terms: ['couscous'], target: 'Couscous (Hartweizen) roh' },
  { terms: ['bulgur'], target: 'Bulgur (Hartweizen) roh' },
  { terms: ['koelln', 'kölln', 'haferflocken'], target: 'Hafer Flocken' },
  { terms: ['cornflakes', 'kelloggs'], target: 'Cornflakes gesüßt' },

  // ---- bakery -------------------------------------------------------------------------
  { terms: ['toastbrot', 'goldentoast', 'sandwichtoast'], target: 'Weizentoastbrot/Buttertoastbrot' },
  { terms: ['zwieback'], target: 'Zwieback eifrei' },

  // ---- condiments / oils --------------------------------------------------------------
  { terms: ['loewensenf', 'löwensenf', 'senf'], target: 'Senf mittelscharf' },
  { terms: ['essiggurken', 'gewuerzgurken', 'gewürzgurken', 'kuehne'], target: 'Gurke gesäuert (Gewürzgurke) abgetropft' },
  { terms: ['sauerkraut'], target: 'Sauerkraut Konserve, abgetropft' },
  { terms: ['bertolli', 'olivenoel', 'olivenöl'], target: 'Olivenöl' },
  { terms: ['rapsoel', 'rapsöl'], target: 'Rapsöl/Rüböl' },

  // ---- produce (receipt words that differ from BLS) -----------------------------------
  { terms: ['rispentomaten', 'cherrytomaten', 'strauchtomaten', 'minirispentomaten'], target: 'Tomate roh' },
  { terms: ['lauchzwiebeln', 'fruehlingszwiebeln', 'frühlingszwiebeln'], target: 'Frühlingszwiebel/Lauchzwiebel, roh' },
  { terms: ['speisezwiebeln', 'zwiebeln'], target: 'Speisezwiebel roh' },
  { terms: ['fruehkartoffeln', 'frühkartoffeln', 'speisekartoffeln'], target: 'Kartoffel ungeschält, roh' },
  { terms: ['kichererbsen'], target: 'Kichererbse reif' },
  { terms: ['walnusskerne'], target: 'Walnuss' },

  // ---- beverages ----------------------------------------------------------------------
  { terms: ['apfelsaft'], target: 'Apfelsaft' },
  { terms: ['orangensaft'], target: 'Orangensaft' },
  { terms: ['mineralwasser', 'gerolsteiner', 'volvic'], target: 'Natürliches Mineralwasser still' },
];
