"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LOANWORD_SYNONYMS = exports.ABBREVIATIONS = exports.CERTIFICATIONS = exports.BRAND_STRIP_LIST = void 0;
exports.expandGermanAbbreviations = expandGermanAbbreviations;
exports.BRAND_STRIP_LIST = [
    'gran', // e.g. Grandiso
    'grandiso',
    'grop', // e.g. Gropper
    'm.i.',
    'm.i',
    'mi',
    'bistro'
];
exports.CERTIFICATIONS = [
    'ogt', // ohne Gentechnik
    'vlog',
    'bio'
];
exports.ABBREVIATIONS = {
    'jogh': 'joghurt',
    'sort': 'sortiert',
    'sort.': 'sortiert',
    'clas': 'classic',
    'clas.': 'classic',
    'pr': 'protein',
    'pu': 'pudding',
    'mozz': 'mozzarella',
    'nozz': 'mozzarella', // common OCR m->n misread
    'pfann': 'pfannengericht',
    'sojajogh': 'soja joghurt',
    'sojadr': 'soja joghurt drink',
    'moz': 'mozzarella',
    'skr': 'skyr',
    'himb': 'himbeere',
    'cranb': 'cranberry',
    'pudd': 'pudding',
};
exports.LOANWORD_SYNONYMS = {
    'fusilli': 'teigwaren pasta',
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
    'pestu': 'pesto', // common OCR misread
    'diavolo': 'pizza scharfe salami',
    'reggiano': 'parmesan hartkaese',
    'pringles': 'chips kartoffel',
    'ravioli': 'teigwaren pasta',
    'angus': 'rind beef',
};
/**
 * Normalizes a German receipt line by expanding abbreviations, stripping brands/certifications,
 * and applying context-dependent rules.
 *
 * @param line The raw OCR receipt line
 * @returns A normalized string
 */
function expandGermanAbbreviations(line) {
    // We want to operate on tokens so we don't accidentally replace substrings of real words.
    // First, let's replace dots and hyphens with spaces for tokenization, as done in receiptParser.
    var cleanLine = line.replace(/[\.\-]/g, ' ');
    // Split common compound prefixes so they tokenize separately
    // This helps "Proteinjogh" become "Protein" "jogh", or "BistroFlammk" become "Bistro" "Flammk"
    var prefixesToSplit = ['protein', 'schoko', 'bistro', 'mini', 'bio', 'vegan', 'veggie', 'chili'];
    prefixesToSplit.forEach(function (prefix) {
        var regex = new RegExp("\\b(".concat(prefix, ")"), 'gi');
        cleanLine = cleanLine.replace(regex, '$1 ');
    });
    // Also remove punctuation that might have been glued
    cleanLine = cleanLine.replace(/[^\w\säöüßÄÖÜ]/g, ' ');
    cleanLine = cleanLine.replace(/\bbio\s*bio\b/gi, 'bio');
    // Split into tokens, keeping only non-empty
    var tokens = cleanLine.split(/\s+/).filter(function (t) { return t.length > 0; });
    // Apply context dependent rules BEFORE generic lowercasing/expansion
    // "Gr" -> "Grieß" if context has dessert tokens (pudding, etc.)
    var dessertTokens = ['pudding', 'dessert', 'joghurt', 'jogh', 'pu', 'pu.'];
    var hasDessertContext = tokens.some(function (t) { return dessertTokens.includes(t.toLowerCase()); });
    tokens = tokens.map(function (token) {
        if (token === 'Gr' || token === 'Gr.') {
            if (hasDessertContext) {
                return 'Grieß';
            }
        }
        return token;
    });
    // Now process brands, certifications, and global abbreviations
    var normalizedTokens = [];
    for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
        var token = tokens_1[_i];
        var lowerToken = token.toLowerCase();
        // Strip brands
        if (exports.BRAND_STRIP_LIST.includes(lowerToken)) {
            continue;
        }
        // Strip certifications
        if (exports.CERTIFICATIONS.includes(lowerToken)) {
            continue;
        }
        // Expand abbreviations
        if (exports.ABBREVIATIONS[lowerToken]) {
            normalizedTokens.push(exports.ABBREVIATIONS[lowerToken]);
            continue;
        }
        if (exports.LOANWORD_SYNONYMS[lowerToken]) {
            normalizedTokens.push(token, exports.LOANWORD_SYNONYMS[lowerToken]);
            continue;
        }
        normalizedTokens.push(token);
    }
    return normalizedTokens.join(' ');
}
