import React, { useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  PanResponder,
  Animated,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { COLORS, globalStyles } from './styles';
import { useFoods } from './app/useFoods';
import { useFavorites } from './app/context/FavoritesContext';
import { useProfile } from './app/context/ProfileContext';
import { useRecipes } from './app/useRecipes';
import { StorageService, ScanRecord } from './app/services/storage';
import { useFocusEffect } from 'expo-router';
import { findBestSwaps } from './app/engine/swapAlgorithm';
import { LiquidSlider } from './components/LiquidSlider';
import { SwapComparisonCard } from './components/SwapComparisonCard';

interface SearchScreenProps {
  onBack?: () => void;
  mode?: 'foods' | 'swaps';
  onSelect?: (food: any) => void;
  rawText?: string;
}

export const SearchScreen: React.FC<SearchScreenProps> = ({ onBack, mode = 'foods', onSelect, rawText }) => {
  const quickSearches = ['Dairy', 'Produce', 'Snacks', 'Beverages', 'Pantry'];
  
  // App State
  const { allFoods, getIconForCategory, foods } = useFoods(); // use unfiltered list for global search
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite, favorites } = useFavorites();
  const { profile } = useProfile();
  const { recipes } = useRecipes();

  useFocusEffect(
    React.useCallback(() => {
      StorageService.getScans().then(setScans);
    }, [])
  );

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFilter, setSearchFilter] = useState<'all'|'foods'|'recipes'|'lists'|'receipts'>('all');
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [category, setCategory] = useState('All');
  const [nutriScores, setNutriScores] = useState<string[]>([]);
  const [maxCalories, setMaxCalories] = useState(1000);
  const [limit, setLimit] = useState(20);

  const clearFilters = () => {
    setCategory('All');
    setMaxCalories(1000);
    setNutriScores([]);
    setFavoritesOnly(false);
    setSearchQuery('');
  };

  // Derive categories for Picker dynamically
  const uniqueCategories = useMemo(() => {
    const cats = new Set(allFoods.map(f => f.category));
    return ['All', ...Array.from(cats)].sort();
  }, [allFoods]);

  // Filtering Engine
  
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
        calories: `${Math.round(f.nutrients_per_100.kcal)} kcal / 100g`,
        score: f.health_score,
        nutriScore: f.nutri_grade ? `NUTRI SCORE ${f.nutri_grade}` : 'UNGRADED',
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
        rResults = rResults.filter(r => r.name.toLowerCase().includes(q));
      }
      const mappedRecipes = rResults.map(r => ({
        id: r.id,
        type: 'recipe',
        title: r.name,
        category: 'Recipe',
        calories: `${Math.round(r.totals?.kcal || 0)} kcal`,
        score: r.health_score,
        nutriScore: '',
        nutriColor: r.health_score >= 75 ? COLORS.scoreGreen : (r.health_score >= 50 ? '#F5A623' : COLORS.scoreRed),
        nutriBg: r.health_score >= 75 ? COLORS.lightGreenBg : (r.health_score >= 50 ? '#FFF8E1' : '#FFEBEE'),
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
        calories: `${s.items.length} items`,
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


  const swapResults = useMemo(() => {
    if (mode !== 'swaps') return [];
    
    let baseFoods = allFoods;
    
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      baseFoods = baseFoods.filter(f => 
        f.name.toLowerCase().includes(q) || 
        f.category.toLowerCase().includes(q)
      );
      // When searching, we only care about showing top results
      baseFoods = baseFoods.slice(0, 10);
    } else {
      // If no query, only show low-score foods as random swaps
      baseFoods = baseFoods.filter(f => f.health_score < 50).sort(() => 0.5 - Math.random()).slice(0, 20);
    }

    const safeFoods = foods.length > 0 ? foods : allFoods;

    // Generate swaps for these foods
    return baseFoods.map(badFood => {
      const bestSwaps = findBestSwaps(badFood, safeFoods, 1, profile.dietaryPreference);
      if (bestSwaps.length === 0) return null;
      return {
        id: `${badFood.id}-${bestSwaps[0].candidate.id}`,
        from: badFood,
        to: bestSwaps[0].candidate,
        improvement: bestSwaps[0].candidate.health_score - badFood.health_score,
      };
    }).filter(Boolean);
  }, [allFoods, foods, searchQuery, mode, profile.dietaryPreference]);

  const toggleNutriScore = (score: string) => {
    setNutriScores(prev => prev.includes(score) ? prev.filter(s => s !== score) : [...prev, score]);
  };

  const getScoreColor = (val: number) => {
    if (val >= 75) return COLORS.scoreGreen;
    if (val >= 50) return COLORS.scoreYellow;
    return COLORS.scoreRed;
  };

  
  const handleItemPress = (item: any) => {
    if (onSelect) {
      if (item.type === 'food') {
        onSelect(allFoods.find(f => f.id === item.id));
      }
      return;
    }
    
    if (item.type === 'food') {
      router.push(`/food/${item.id}`);
    } else if (item.type === 'recipe') {
      router.push(`/recipe/${item.id}`);
    } else if (item.type === 'list' || item.type === 'receipt') {
      router.push(`/receipt/${item.id}`);
    }
  };

  const isSearching = searchQuery.length > 0 || showFilters;

  return (
    <View style={globalStyles.safeArea}>
      
      {/* Sticky Header */}
      <BlurView intensity={90} tint="light" style={[styles.headerBlur, { paddingTop: insets.top + (Platform.OS === 'ios' ? 20 : 20) }]}>
        <View style={styles.header}>
          {onBack && (
            <TouchableOpacity onPress={onBack} style={styles.backButton} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={28} color={COLORS.textPrimary} />
            </TouchableOpacity>
          )}
          <View style={{ flex: 1, alignItems: 'flex-start', marginLeft: onBack ? 0 : 0 }}>
            <Text style={globalStyles.title}>Search</Text>
          </View>
          <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={styles.filterBtn}>
            <Ionicons name={showFilters ? "options" : "options-outline"} size={22} color={showFilters ? COLORS.primaryGreen : COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
      </BlurView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={globalStyles.container}
          contentContainerStyle={[globalStyles.scrollContent, { paddingTop: insets.top + 90, paddingHorizontal: 0 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {rawText && (
            <View style={{ marginBottom: 16, marginHorizontal: 20, backgroundColor: COLORS.lightGreenBg, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: COLORS.scoreGreen }}>
              <Text style={{ fontSize: 13, color: COLORS.primaryGreenDark, fontWeight: '700', marginBottom: 4 }}>CORRECTING ITEM</Text>
              <Text style={{ fontSize: 16, color: COLORS.textPrimary, fontStyle: 'italic' }}>"{rawText}"</Text>
            </View>
          )}


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

          {/* Search Bar */}
          <View style={[globalStyles.rowBetween, { marginTop: rawText ? 0 : 0, paddingHorizontal: 20, marginBottom: 16 }]}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
              <TextInput 
                style={styles.searchInput}
                placeholder="Search thousands of foods..."
                placeholderTextColor={COLORS.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
              />
            </View>
          </View>

          {/* Collapsible Filter Panel */}
          {showFilters && (
            <BlurView intensity={40} tint="light" style={styles.filterPanel}>
              
              <View style={[globalStyles.rowBetween, { marginBottom: 20 }]}>
                <Text style={styles.filterLabelHeader}>Favorites Only</Text>
                <Switch 
                  value={favoritesOnly} 
                  onValueChange={setFavoritesOnly}
                  trackColor={{ false: '#e0e0e0', true: COLORS.primaryGreen }}
                />
              </View>

              <View style={[globalStyles.rowBetween, { marginBottom: 16 }]}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>Filters</Text>
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={{ color: COLORS.primaryGreen, fontWeight: '600' }}>Clear all</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.filterLabel, { marginTop: 16, marginBottom: 8 }]}>CATEGORY</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
                {uniqueCategories.map(cat => {
                  const isSelected = category === cat;
                  return (
                    <TouchableOpacity
                      key={cat}
                      style={[styles.chip, isSelected && styles.chipActive]}
                      onPress={() => setCategory(cat)}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={[styles.filterLabel, { marginTop: 16 }]}>NUTRI SCORE</Text>
              <View style={styles.bubblesRow}>
                {['A', 'B', 'C', 'D', 'E'].map(score => {
                  const isSelected = nutriScores.includes(score);
                  return (
                    <TouchableOpacity
                      key={score}
                      style={[styles.bubble, isSelected && styles.bubbleActive]}
                      onPress={() => {
                        if (isSelected) {
                          setNutriScores(prev => prev.filter(s => s !== score));
                        } else {
                          setNutriScores(prev => [...prev, score]);
                        }
                      }}
                    >
                      <Text style={[styles.bubbleText, isSelected && styles.bubbleTextActive]}>{score}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <LiquidSlider 
                maxSliderVal={1000}
                initialValue={maxCalories}
                title="Max Calories (/ 100g)"
                unit="kcal"
                onValueChangeComplete={setMaxCalories} 
              />
            </BlurView>
          )}

          {/* Results List */}
          <Text style={[styles.sectionLabel, { marginTop: isSearching ? 24 : 10 }]}>
            {mode === 'swaps' 
              ? (isSearching ? `SWAP RESULTS (${swapResults.length})` : 'DISCOVER SMART SWAPS')
              : (isSearching ? `RESULTS (${searchResults.length})` : 'POPULAR FOODS')
            }
          </Text>
          
          <View style={styles.listContainer}>
            {mode === 'swaps' ? (
              // render swap comparison cards
              swapResults.slice(0, limit).map((swap: any) => (
                <View key={swap.id} style={{ marginBottom: 16 }}>
                  <SwapComparisonCard 
                    fromFood={swap.from} 
                    toFood={swap.to} 
                    improvement={swap.improvement}
                    onPressFrom={() => { onBack?.(); router.push(`/food/${swap.from.id}`); }}
                    onPressTo={() => { onBack?.(); router.push(`/food/${swap.to.id}`); }}
                  />
                </View>
              ))
            ) : (
              // render standard food cards
              searchResults.slice(0, limit).map((food) => {
                const scoreColor = getScoreColor(food.score);
                return (
                  <TouchableOpacity 
                    key={food.id} 
                    style={styles.foodCard} 
                    activeOpacity={0.7} 
                    onPress={() => { 
                      if (onSelect) {
                        const fullFood = allFoods.find(f => f.id === food.id);
                        if (fullFood) onSelect(fullFood);
                        onBack?.();
                      } else {
                        onBack?.();
                        if (food.type === 'receipt' || food.type === 'list') {
                          router.push(`/receipt/${food.id}`);
                        } else if (food.type === 'recipe') {
                          router.push(`/recipe/${food.id}`);
                        } else {
                          router.push(`/food/${food.id}`);
                        }
                      }
                    }}
                  >
                    {/* Left side: Icon inside square box */}
                    <View style={styles.foodIconBox}>
                      <Ionicons name={food.iconName} size={22} color={COLORS.primaryGreen} />
                    </View>

                    {/* Center details */}
                    <View style={styles.foodInfoContainer}>
                      <Text style={styles.foodTitle} numberOfLines={1}>
                        {food.title}
                      </Text>
                      
                      <View style={globalStyles.row}>
                        <Text style={styles.foodMetaText}>{food.category} • </Text>
                        <Text style={styles.foodMetaText}>{food.calories}</Text>
                      </View>

                      {/* Nutri Score tag */}
                      {food.nutriScore ? (
                        <View style={[styles.nutriBadge, { backgroundColor: food.nutriBg }]}>
                          <Text style={[styles.nutriText, { color: food.nutriColor }]}>
                            {food.nutriScore}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Right side: Heart and Score ring */}
                    <View style={styles.rightActionsContainer}>
                      <TouchableOpacity style={styles.heartButton} onPress={() => toggleFavorite('food', food.id.toString())}>
                        <Ionicons 
                          name={isFavorite('food', food.id.toString()) ? "heart" : "heart-outline"} 
                          size={20} 
                          color={isFavorite('food', food.id.toString()) ? "#FF3B30" : COLORS.textMuted} 
                        />
                      </TouchableOpacity>
                      
                      <View style={[styles.scoreRing, { borderColor: scoreColor }]}>
                        <Text style={[styles.scoreText, { color: scoreColor }]}>
                          {food.score}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
            
            {(mode === 'swaps' ? swapResults : searchResults).length > limit && (
              <TouchableOpacity 
                style={styles.loadMoreButton}
                onPress={() => setLimit(prev => prev + 20)}
              >
                <Text style={styles.loadMoreText}>Load 20 More</Text>
              </TouchableOpacity>
            )}

            {(mode === 'swaps' ? swapResults : searchResults).length === 0 && (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <Ionicons name="search" size={40} color={COLORS.border} />
                <Text style={{ marginTop: 10, color: COLORS.textMuted, fontWeight: '500' }}>No results match your criteria.</Text>
              </View>
            )}
          </View>
      <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  headerBlur: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  backButton: {
    marginRight: 16,
    marginTop: 6,
    padding: 4,
  },
  searchBar: {
    flex: 1,
    height: 48,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  searchInput: {
    flex: 1,
    color: COLORS.textPrimary,
    fontSize: 16,
    marginLeft: 10,
    fontWeight: '500'
  },
  filterBtn: {
    padding: 8,
    marginRight: -8,
  },
  filterPanel: {
    marginTop: 16,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  filterLabelHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipActive: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.primaryGreen,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  chipTextActive: {
    color: COLORS.white,
  },
  bubblesRow: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 8,
  },
  bubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleActive: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.primaryGreen,
  },
  bubbleText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  bubbleTextActive: {
    color: COLORS.white,
  },
  maxCalValue: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primaryGreen,
  },
  sliderContainer: {
    marginTop: 10,
  },
  sliderTrack: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    marginBottom: 10,
    justifyContent: 'center'
  },
  sliderThumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: COLORS.primaryGreen,
    backgroundColor: 'rgba(255,255,255,0.4)',
    shadowColor: COLORS.primaryGreen,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 4,
  },
  thumbGlass: {
    width: '100%',
    height: '100%',
  },
  sliderLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginTop: 24,
    marginBottom: 10,
    letterSpacing: 0.8,
  },
  quickSearchScroll: {
    flexGrow: 0,
    marginBottom: 10,
  },
  tag: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.cardBackground,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  selectedTag: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.primaryGreen,
  },
  tagText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontWeight: '500',
  },
  selectedTagText: {
    color: COLORS.white,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  foodCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBackground,
    padding: 12,
    borderRadius: 20,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 2,
  },
  foodIconBox: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: COLORS.lightGreenBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  foodInfoContainer: {
    flex: 1,
    marginRight: 8,
  },
  foodTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  foodMetaText: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 6,
  },
  nutriBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  nutriText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rightActionsContainer: {
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 60,
  },
  heartButton: {
    padding: 4,
  },
  scoreRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 12,
    fontWeight: '800',
  },
  loadMoreButton: {
    marginTop: 10,
    padding: 16,
    borderRadius: 14,
    backgroundColor: COLORS.lightGreenBg,
    alignItems: 'center',
  },
  loadMoreText: {
    color: COLORS.primaryGreen,
    fontWeight: '700',
    fontSize: 15,
  },
});
