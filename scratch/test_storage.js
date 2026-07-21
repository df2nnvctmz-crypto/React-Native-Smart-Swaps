const fs = require('fs');

const scanData = fs.readFileSync('c:/Users/oleen/antigravity/smart-swaps-mobile/app/services/storage.ts', 'utf8');
console.log(scanData.indexOf('SCANS_KEY'));
