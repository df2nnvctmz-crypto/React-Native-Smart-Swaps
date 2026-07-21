const fs = require('fs');
const filepath = 'SearchScreen.tsx';
let content = fs.readFileSync(filepath, 'utf8');

const oldMapping = `              {searchResults.slice(0, limit).map((item: any) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.7}
                  onPress={() => onSelect ? onSelect(allFoods.find(f => f.id === item.id)) : router.push(\`/food/\${item.id}\`)}
                  style={styles.resultItem}
                >
                  <View style={[styles.iconBox, { backgroundColor: item.nutriBg }]}>
                    <Ionicons name={item.iconName as any} size={20} color={item.nutriColor} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemCategory}>{item.category} • {item.calories}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                    <CircularScoreRing score={item.score} size={40} strokeWidth={3} showBadge={false} />
                  </View>
                </TouchableOpacity>
              ))}`;

const newMapping = `              {searchResults.slice(0, limit).map((item: any) => (
                <TouchableOpacity
                  key={item.id + item.type}
                  activeOpacity={0.7}
                  onPress={() => handleItemPress(item)}
                  style={styles.resultItem}
                >
                  <View style={[styles.iconBox, { backgroundColor: item.nutriBg }]}>
                    <Ionicons name={item.iconName as any} size={20} color={item.nutriColor} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemCategory}>{item.category} • {item.calories}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginLeft: 12 }}>
                    <CircularScoreRing score={item.score} size={40} strokeWidth={3} showBadge={false} />
                  </View>
                </TouchableOpacity>
              ))}`;

content = content.replace(oldMapping, newMapping);
fs.writeFileSync(filepath, content, 'utf8');
