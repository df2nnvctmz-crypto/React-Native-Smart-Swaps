export const BRAND_STRIP_LIST = [
  'gran', // e.g. Grandiso
  'grandiso',
  'grop', // e.g. Gropper
  'm.i.',
  'm.i',
  'mi',
  'bistro',
  'ostmann' // spice/herb-only brand; never a hint towards an unrelated food category
];

export const CERTIFICATIONS = [
  'ogt', // ohne Gentechnik
  'vlog',
  'bio'
];

export const ABBREVIATIONS: Record<string, string> = {
  'jogh': 'joghurt',
  'sort': 'sortiert',
  'sort.': 'sortiert',
  'clas': 'classic',
  'clas.': 'classic',
  'pr': 'protein',
  'pu': 'pudding',
  'mozz': 'mozzarella',
  'nozz': 'mozzarella',   // common OCR m->n misread
  'pfann': 'pfannengericht',
  'sojajogh': 'soja joghurt',
  'sojadr': 'soja joghurt drink',
  'moz': 'mozzarella',
  'skr': 'skyr',
  'himb': 'himbeere',
  'cranb': 'cranberry',
  'pudd': 'pudding',
  'brocc': 'brokkoli',
  'erdbe': 'erdbeere',
  'heidelbe': 'heidelbeere',
  'himbe': 'himbeere',
  'geflueg': 'gefluegel',
  'put': 'pute',
};

export const LOANWORD_SYNONYMS: Record<string, string> = {
  'fusilli': 'teigwaren pasta',
  'nudeln': 'teigwaren pasta',
  'maccheroni': 'teigwaren pasta',
  'aceto': 'essig',
  'balsamico': 'essig balsam',
  'arrabbiata': 'tomatensauce scharf',
  'arrabiat': 'tomatensauce scharf',
  'penne': 'teigwaren pasta',
  'spaghetti': 'teigwaren pasta',
  'tagliatelle': 'teigwaren pasta',
  'lady': 'apfel apple',
  'braeburn': 'apfel apple',
  'elstar': 'apfel apple',
  'jonagold': 'apfel apple',
  'boskoop': 'apfel apple',
  'pinova': 'apfel apple',
  'grana': 'parmesan hartkaese',
  'para': 'parmesan',
  'parmigiano': 'parmesan',
  'tomme': 'kaese cheese',
  'blanche': 'kaese cheese',
  'pestu': 'pesto',   // common OCR misread
  'diavolo': 'pizza scharfe salami',
  'reggiano': 'parmesan hartkaese',
  // NOTE: deliberately no brand->product mappings for snack brands (e.g. Pringles).
  // The database has no crisps/chips entry, so such a mapping only ever resolves to a
  // misleading raw ingredient ("Kartoffel geschält, roh"); better to report no match.
  'ravioli': 'teigwaren pasta',
  'angus': 'rind beef',
  'pfefferkoer': 'pfefferkoerner pfeffer',
  'suppengemuese': 'suppengruen gemuese',
  'innenfilet': 'filet brustfilet',
};

/**
 * Normalizes a German receipt line by expanding abbreviations, stripping brands/certifications,
 * and applying context-dependent rules.
 *
 * @param line The raw OCR receipt line
 * @returns A normalized string
 */
export function expandGermanAbbreviations(line: string): string {
  // We want to operate on tokens so we don't accidentally replace substrings of real words.
  // First, let's replace dots and hyphens with spaces for tokenization, as done in receiptParser.
  let cleanLine = line.replace(/[\.\-]/g, ' ');

  // Split common compound prefixes so they tokenize separately
  // This helps "Proteinjogh" become "Protein" "jogh", or "BistroFlammk" become "Bistro" "Flammk"
  // Only non-food qualifiers belong here. An actual ingredient noun must NOT be listed: in a
  // German compound the LAST element is the head noun, so splitting e.g. "Chiliflocken" would
  // expose "chili" as a standalone exact match while the real head ("flocken") goes unmatched,
  // letting chili flakes match the dish "Chili sin carne".
  const prefixesToSplit = ['protein', 'schoko', 'bistro', 'mini', 'bio', 'vegan', 'veggie'];
  prefixesToSplit.forEach(prefix => {
    const regex = new RegExp(`\\b(${prefix})`, 'gi');
    cleanLine = cleanLine.replace(regex, '$1 ');
  });
  
  // Also remove punctuation that might have been glued
  cleanLine = cleanLine.replace(/[^\w\säöüßÄÖÜ]/g, ' ');

  cleanLine = cleanLine.replace(/\bbio\s*bio\b/gi, 'bio');

  // Split into tokens, keeping only non-empty
  let tokens = cleanLine.split(/\s+/).filter(t => t.length > 0);

  // Apply context dependent rules BEFORE generic lowercasing/expansion
  // "Gr" -> "Grieß" if context has dessert tokens (pudding, etc.)
  const dessertTokens = ['pudding', 'dessert', 'joghurt', 'jogh', 'pu', 'pu.'];
  const hasDessertContext = tokens.some(t => dessertTokens.includes(t.toLowerCase()));

  tokens = tokens.map(token => {
    if (token === 'Gr' || token === 'Gr.') {
      if (hasDessertContext) {
        return 'Grieß';
      }
    }
    return token;
  });

  // Now process brands, certifications, and global abbreviations
  const normalizedTokens: string[] = [];

  for (let token of tokens) {
    const lowerToken = token.toLowerCase();

    // Strip brands
    if (BRAND_STRIP_LIST.includes(lowerToken)) {
      continue;
    }

    // Strip certifications
    if (CERTIFICATIONS.includes(lowerToken)) {
      continue;
    }

    // Expand abbreviations
    if (ABBREVIATIONS[lowerToken]) {
      normalizedTokens.push(ABBREVIATIONS[lowerToken]);
      continue;
    }

    if (LOANWORD_SYNONYMS[lowerToken]) {
      normalizedTokens.push(token, LOANWORD_SYNONYMS[lowerToken]);
      continue;
    }

    normalizedTokens.push(token);
  }

  return normalizedTokens.join(' ');
}
