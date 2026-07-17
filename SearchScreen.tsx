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
import { findBestSwaps } from './app/engine/swapAlgorithm';
import { LiquidSlider } from './components/LiquidSlider';
import { SwapComparisonCard } from './components/SwapComparisonCard';

interface SearchScreenProps {
  onBack: () => void;
  mode?: 'foods' | 'swaps';
  onSelect?: (food: any) => void;
}

export const SearchScreen: React.FC<SearchScreenProps> = ({ onBack, mode = 'foods', onSelect }) => {
  const quickSearches = ['Dairy', 'Produce', 'Snacks', 'Beverages', 'Pantry'];
  
  // App State
  const { allFoods, getIconForCategory, foods } = useFoods(); // use unfiltered list for global search
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isFavorite, toggleFavorite, favorites } = useFavorites();
  const { profile } = useProfile();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
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
    let results = allFoods;

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      results = results.filter(f => 
        f.name.toLowerCase().includes(q) || 
        f.category.toLowerCase().includes(q) || 
        f.swiss_category.toLowerCase().includes(q)
      );

      // Relevance sort
      results.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        
        const aExact = aName === q ? 1 : 0;
        const bExact = bName === q ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;
        
        const aStart = aName.startsWith(q) ? 1 : 0;
        const bStart = bName.startsWith(q) ? 1 : 0;
        if (aStart !== bStart) return bStart - aStart;
        
        return 0; 
      });
    }

    if (category !== 'All') {
      results = results.filter(f => f.category === category);
    }

    if (nutriScores.length > 0) {
      results = results.filter(f => f.nutri_grade && nutriScores.includes(f.nutri_grade.toUpperCase()));
    }

    if (favoritesOnly) {
      results = results.filter(f => isFavorite('food', f.id.toString()));
    }

    if (maxCalories < 1000) {
      results = results.filter(f => f.nutrients_per_100.kcal <= maxCalories);
    }

    // Return mapped UI array, NOT capped here (capped in render for pagination)
    return results.map(f => ({
      id: f.id,
      title: f.name,
      category: f.category,
      calories: `${Math.round(f.nutrients_per_100.kcal)} kcal / 100g`,
      score: f.health_score,
      nutriScore: `NUTRI SCORE ${f.nutri_grade || 'A'}`,
      nutriColor: f.health_score >= 75 ? COLORS.scoreGreen : (f.health_score >= 50 ? '#F5A623' : COLORS.scoreRed),
      nutriBg: f.health_score >= 75 ? COLORS.lightGreenBg : (f.health_score >= 50 ? '#FFF8E1' : '#FFEBEE'),
      iconName: getIconForCategory(f.category),
      isFavorite: isFavorite('food', f.id.toString()),
    }));
  }, [allFoods, searchQuery, category, nutriScores, maxCalories, favoritesOnly, favorites.foods]);

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

  const isSearching = searchQuery.length > 0 || showFilters;

  return (
    <View style={globalStyles.safeArea}>
      
      {/* Sticky Header */}
      <BlurView 
        intensity={80} 
        tint="light" 
        style={[styles.headerBlur, { paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 10 }]}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Ionicons name="chevron-down" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Search</Text>
          <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={styles.filterBtn}>
            <Ionicons name={showFilters ? "options" : "options-outline"} size={22} color={showFilters ? COLORS.primaryGreen : COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
      </BlurView>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={globalStyles.container}
          contentContainerStyle={[globalStyles.scrollContent, { paddingTop: Platform.OS === 'ios' ? 70 : insets.top + 70, paddingHorizontal: 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Search Bar */}
          <View style={[globalStyles.rowBetween, { marginTop: 16 }]}>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={20} color={COLORS.textMuted} />
              <TextInput 
                style={styles.searchInput}
                placeholder="Search over 20+ foods..."
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
                    onPressFrom={() => { onBack(); router.push(`/food/${swap.from.id}`); }}
                    onPressTo={() => { onBack(); router.push(`/food/${swap.to.id}`); }}
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
                        onBack();
                      } else {
                        onBack(); 
                        router.push(`/food/${food.id}`); 
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
                      <View style={[styles.nutriBadge, { backgroundColor: food.nutriBg }]}>
                        <Text style={[styles.nutriText, { color: food.nutriColor }]}>
                          {food.nutriScore}
                        </Text>
                      </View>
                    </View>

                    {/* Right side: Heart and Score ring */}
                    <View style={styles.rightActionsContainer}>
                      <TouchableOpacity style={styles.heartButton} onPress={() => toggleFavorite('food', food.id)}>
                        <Ionicons 
                          name={isFavorite('food', food.id) ? "heart" : "heart-outline"} 
                          size={20} 
                          color={isFavorite('food', food.id) ? "#FF3B30" : COLORS.textMuted} 
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
