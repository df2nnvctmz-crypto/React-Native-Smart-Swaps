const foods = require('../foods.json');
const matches = foods.filter((f: any) => f.name_de && f.name_de.toLowerCase().includes('joghurt'));
console.log(matches.slice(0, 10).map((f: any) => f.name_de));
