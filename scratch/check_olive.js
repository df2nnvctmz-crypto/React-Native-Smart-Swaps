const foods = require('../foods.json'); console.log(foods.filter(f => (f.name_de||'').toLowerCase().includes('oliven') || (f.name||'').toLowerCase().includes('olive')).map(f => f.name_de));  
