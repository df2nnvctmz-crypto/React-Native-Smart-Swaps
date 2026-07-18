import { isLikelyProductLine } from '../app/engine/receiptParser';

const REJECT = [
  "1,168", "EUR/Kg", "SUI NE", "Kai tenzahlung EUR", "1,628 kgx",
  "J-0-EN-B-ELE9-", "Netto", "10247 Berlin, Frankfurter Allee 57-59", "Marken-Disccount",
  "Marken-Discount", "WWW.NETTO-0NL INE.DE", "SUMME 84,81", "Kartenzahlung EUR 84,81",
  "2 x 1,29", "1,02 kg x 2,99 EUR/kg", "K-U-N-D-E-N-B-E-L-E-G"
];

const KEEP = [
  "Clarkys Erdnuesse sort.200g 2.58 B", "AS Mozz.Sticks m.Dip 250g 1.79 B",
  "GL SandwSHB Gouda oGt200g 2.59 B", "NIPizzaSpeciale2ST690g 3.59 B",
  "Markenbutter sauer 250g 2.39 B", "VL Eier BH 10ST 1.99 B", "Bierschinken 150g 1.19 B",
  "Apfel Pink Lady Lose 2.07 B", "Rispentomaten 1.66 B", "Bananen Lose 0.89 B",
  "Kochschinken 150g 1.89 B"
];

let failed = 0;

for (const line of REJECT) {
  if (isLikelyProductLine(line) !== false) {
    console.error(`FAILED: Expected to reject "${line}", but it was kept.`);
    failed++;
  }
}

for (const line of KEEP) {
  if (isLikelyProductLine(line) !== true) {
    console.error(`FAILED: Expected to keep "${line}", but it was rejected.`);
    failed++;
  }
}

if (failed === 0) {
  console.log("SUCCESS: All 27 tests passed.");
  process.exit(0);
} else {
  console.log(`FAILED: ${failed} tests failed.`);
  process.exit(1);
}
