const fs = require('fs');
const filepath = 'SearchScreen.tsx';
let content = fs.readFileSync(filepath, 'utf-8');

const searchLogic = `
  const searchResults = useMemo(() => {
    if (mode === 'swaps') return [];

    let results: any[] = [];
    const q = searchQuery.toLowerCase();

    // 1. Foods
    if (searchFilter === 'all' || searchFilter === 'foods') {
      let fResults = allFoods;
      if (q) {
        fResults = fResults.filter(f => f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q));
      }
      if (nutriScores.length > 0) {
        fResults = fResults.filter(f => f.nutri_grade && nutriScores.includes(f.nutri_grade.toUpperCase()));
      }
      if (favoritesOnly) {
        fResults = fResults.filter(f => isFavorite('food', f.id.toString()));
      }
      if (maxCalories < 1000) {
        fResults = fResults.filter(f => f.nutrients_per_100.kcal <= maxCalories);
      }
      
      const mappedFoods = fResults.map(f => ({
        id: f.id,
        type: 'food',
        title: f.name,
        category: f.category,
        calories: \`\${Math.round(f.nutrients_per_100.kcal)} kcal / 100g\`,
        score: f.health_score,
        nutriScore: f.nutri_grade ? \`NUTRI SCORE \${f.nutri_grade}\` : 'UNGRADED',
        nutriColor: f.health_score >= 75 ? COLORS.scoreGreen : (f.health_score >= 50 ? '#F5A623' : COLORS.scoreRed),
        nutriBg: f.health_score >= 75 ? COLORS.lightGreenBg : (f.health_score >= 50 ? '#FFF8E1' : '#FFEBEE'),
        iconName: getIconForCategory(f.category),
        isFavorite: isFavorite('food', f.id.toString()),
      }));
      results = [...results, ...mappedFoods];
    }

    // 2. Recipes
    if (searchFilter === 'all' || searchFilter === 'recipes') {
      let rResults = recipes;
      if (q) {
        rResults = rResults.filter(r => r.title.toLowerCase().includes(q));
      }
      const mappedRecipes = rResults.map(r => ({
        id: r.id,
        type: 'recipe',
        title: r.title,
        category: 'Recipe',
        calories: \`\${r.calories} kcal\`,
        score: r.healthScore,
        nutriScore: '',
        nutriColor: r.healthScore >= 75 ? COLORS.scoreGreen : (r.healthScore >= 50 ? '#F5A623' : COLORS.scoreRed),
        nutriBg: r.healthScore >= 75 ? COLORS.lightGreenBg : (r.healthScore >= 50 ? '#FFF8E1' : '#FFEBEE'),
        iconName: 'restaurant',
        isFavorite: false,
      }));
      results = [...results, ...mappedRecipes];
    }

    // 3. Shopping Lists & Receipts
    if (searchFilter === 'all' || searchFilter === 'lists' || searchFilter === 'receipts') {
      let sResults = scans;
      if (searchFilter === 'lists') sResults = sResults.filter(s => s.isShoppingList);
      if (searchFilter === 'receipts') sResults = sResults.filter(s => !s.isShoppingList);
      if (q) {
        sResults = sResults.filter(s => (s.recipeName || s.date).toLowerCase().includes(q));
      }
      const mappedScans = sResults.map(s => ({
        id: s.id,
        type: s.isShoppingList ? 'list' : 'receipt',
        title: s.recipeName || (s.isShoppingList ? 'Shopping List' : 'Receipt'),
        category: s.date,
        calories: \`\${s.items.length} items\`,
        score: s.averageScore,
        nutriScore: '',
        nutriColor: s.averageScore >= 75 ? COLORS.scoreGreen : (s.averageScore >= 50 ? '#F5A623' : COLORS.scoreRed),
        nutriBg: s.averageScore >= 75 ? COLORS.lightGreenBg : (s.averageScore >= 50 ? '#FFF8E1' : '#FFEBEE'),
        iconName: s.isShoppingList ? 'basket' : 'receipt',
        isFavorite: false,
      }));
      results = [...results, ...mappedScans];
    }

    return results;
  }, [allFoods, searchQuery, category, nutriScores, maxCalories, favoritesOnly, favorites.foods, searchFilter, recipes, scans]);
`;

content = content.replace(/const searchResults = useMemo\(\(\) => \{[\s\S]*?\}, \[.*?\]\);/, searchLogic);

fs.writeFileSync(filepath, content, 'utf-8');
