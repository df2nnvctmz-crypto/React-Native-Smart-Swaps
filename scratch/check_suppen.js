const foods = require('../foods.json'); console.log(foods.filter(f => (f.name_de||'').toLowerCase().includes('suppen') || (f.name||'').toLowerCase().includes('suppen')).map(f => f.name_de));  
