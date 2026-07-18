const fs = require('fs'); const foods = JSON.parse(fs.readFileSync('foods.json', 'utf8')); console.log(foods.filter(f => f.name_de.includes('30 % Fett')).map(f => f.name_de));  
