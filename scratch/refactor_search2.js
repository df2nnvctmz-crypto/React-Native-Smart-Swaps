const fs = require('fs');
const filepath = 'SearchScreen.tsx';
let content = fs.readFileSync(filepath, 'utf-8');

const filterPillsCode = `
          {/* Quick Filters */}
          {!rawText && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 16 }}>
              {['all', 'foods', 'recipes', 'lists', 'receipts'].map(f => (
                <TouchableOpacity 
                  key={f}
                  style={[styles.chip, searchFilter === f && styles.chipActive]}
                  onPress={() => setSearchFilter(f as any)}
                >
                  <Text style={[styles.chipText, searchFilter === f && styles.chipTextActive]}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
`;

content = content.replace("{/* Search Bar */}", filterPillsCode + "\n          {/* Search Bar */}");

const renderItemLogic = `
  const handleItemPress = (item: any) => {
    if (onSelect) {
      if (item.type === 'food') {
        onSelect(allFoods.find(f => f.id === item.id));
      }
      return;
    }
    
    if (item.type === 'food') {
      router.push(\`/food/\${item.id}\`);
    } else if (item.type === 'recipe') {
      router.push(\`/recipe/\${item.id}\`);
    } else if (item.type === 'list' || item.type === 'receipt') {
      router.push(\`/receipt/\${item.id}\`);
    }
  };
`;

content = content.replace("const isSearching = searchQuery.length > 0 || showFilters;", renderItemLogic + "\n  const isSearching = searchQuery.length > 0 || showFilters;");

fs.writeFileSync(filepath, content, 'utf-8');
