import React, { useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, globalStyles } from '../../styles';
import { GlassHeader, HEADER_CONTENT_HEIGHT } from '../../components/GlassHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { allRecipes } from '../useRecipes';
import { RecipeCard } from '../../components/RecipeCard';
import { useProfile } from '../context/ProfileContext';
import { useFavorites } from '../context/FavoritesContext';
import { RecipeSearchModal } from '../../components/RecipeSearchModal';
import { StorageService, ScanRecord } from '../services/storage';
import { findBestSwaps } from '../engine/swapAlgorithm';
import { FoodItem } from '../types';
import { useFocusEffect } from 'expo-router';
import { useFoods } from '../useFoods';

const CATEGORIES = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];

export default function RecipesTab() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { isFavorite } = useFavorites();
  const { allFoods, foods } = useFoods();
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;
  
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchVisible, setSearchVisible] = useState(false);
  const [limit, setLimit] = useState(10);
  const [scans, setScans] = useState<ScanRecord[]>([]);

  useFocusEffect(
    React.useCallback(() => {
      StorageService.getScans().then(setScans);
    }, [])
  );

  const relevantFoodIds = useMemo(() => {
    const ids = new Set<string>();
    const safeFoods = foods.length > 0 ? foods : allFoods;
    
    for (const scan of scans) {
      for (const item of scan.items) {
        if (item.matchedFood) {
          ids.add(item.matchedFood.id);
          const swaps = findBestSwaps(item.matchedFood, safeFoods, 2, profile.dietaryPreference);
          for (const swap of swaps) {
            ids.add(swap.candidate.id);
          }
        }
      }
    }
    return ids;
  }, [scans, foods, allFoods, profile.dietaryPreference]);

  // Reset limit when category changes
  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setLimit(10);
  };

  const filtered = useMemo(() => {
    let recipes = allRecipes;
    
    // Apply dietary preferences
    if (profile.dietaryPreference.includes('Vegetarian')) {
      recipes = recipes.filter(r => 
        !r.ingredients.some(ing => ing.food?.category === 'Meat' || ing.food?.category === 'Fish')
      );
    }
    if (profile.dietaryPreference.includes('Vegan')) {
      recipes = recipes.filter(r => 
        !r.ingredients.some(ing => ing.food?.category === 'Meat' || ing.food?.category === 'Fish' || ing.food?.category === 'Dairy' || ing.food?.swiss_category?.toLowerCase().includes('egg'))
      );
    }
    
    if (selectedCategory !== 'All') {
      recipes = recipes.filter(r =>
        r.subcategory.toLowerCase().includes(selectedCategory.toLowerCase())
      );
    }
    
    const scoredRecipes = recipes.map(r => {
      let relevance = 0;
      for (const ing of r.ingredients) {
        if (ing.food && relevantFoodIds.has(ing.food.id)) {
          relevance += 1;
        }
      }
      return { ...r, relevance_score: relevance };
    });

    return scoredRecipes.sort((a, b) => {
      if (b.relevance_score !== a.relevance_score) {
        return b.relevance_score - a.relevance_score;
      }
      return b.health_score - a.health_score;
    });
  }, [selectedCategory, profile.dietaryPreference, relevantFoodIds]);

  const featured = filtered[0];
  const rest = filtered.slice(1);
  const visibleRest = rest.slice(0, limit);
  const hasMore = rest.length > limit;

  const likedRecipes = useMemo(() => {
    return allRecipes.filter(r => isFavorite('recipe', r.id));
  }, [isFavorite]);

  return (
    <View style={globalStyles.safeArea}>
      <GlassHeader title="Recipes" scrollY={scrollY} onSearchPress={() => setSearchVisible(true)} />
      <Animated.ScrollView
        style={globalStyles.container}
        contentInset={{
          top: Platform.OS === 'ios' ? headerHeight : 0,
          bottom: Platform.OS === 'ios' ? 100 : 0,
        }}
        contentOffset={{
          x: 0,
          y: Platform.OS === 'ios' ? -headerHeight : 0,
        }}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: Platform.OS === 'android' ? 100 : 0,
          paddingTop: Platform.OS === 'android' ? headerHeight + 12 : 12,
        }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Header Section */}
        <View style={[styles.headerContainer, { marginBottom: 16 }]}>
          <View style={styles.engineBadge}>
            <Ionicons name="sparkles-sharp" size={12} color={COLORS.primaryGreen} />
            <Text style={styles.engineText}>SMART RECIPE ENGINE · {allRecipes.length} RECIPES</Text>
          </View>
          <Text style={globalStyles.subtitle}>
            Personalized recipes matched to your dietary goals. Tap any to see full nutrition & smart swaps.
          </Text>
        </View>

        {/* Category filter bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 20, marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
        >
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[
                styles.categoryChip,
                selectedCategory === cat && styles.categoryChipActive,
              ]}
              onPress={() => handleCategoryChange(cat)}
            >
              <Text style={[
                styles.categoryChipText,
                selectedCategory === cat && styles.categoryChipTextActive,
              ]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Featured Recipe */}
        {featured && (
          <RecipeCard
            recipe={featured}
            variant="large"
            onPress={() => router.push(`/recipe/${featured.id}`)}
          />
        )}

        {/* Favorite Recipes Carousel */}
        <View style={{ marginTop: 24, marginBottom: 8, marginHorizontal: -20 }}>
          <Text style={[globalStyles.sectionTitle, { paddingHorizontal: 20, marginBottom: 12 }]}>Your Favorite Recipes</Text>
          {likedRecipes.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
            >
              {likedRecipes.map(recipe => (
                <View key={recipe.id} style={{ width: 280 }}>
                  <RecipeCard
                    recipe={recipe}
                    variant="small"
                    onPress={() => router.push(`/recipe/${recipe.id}`)}
                  />
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
              <Text style={{ color: COLORS.textMuted, fontStyle: 'italic', fontSize: 14 }}>
                No favorite recipes yet. Tap the heart on any recipe to save it here!
              </Text>
            </View>
          )}
        </View>

        {/* More Recipes */}
        {rest.length > 0 && (
          <View style={{ marginTop: likedRecipes.length > 0 ? 16 : 24 }}>
            <Text style={[globalStyles.sectionTitle, { marginBottom: 8 }]}>Popular Recipes</Text>
            {visibleRest.map(recipe => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                variant="small"
                onPress={() => router.push(`/recipe/${recipe.id}`)}
              />
            ))}
            
            {hasMore && (
              <TouchableOpacity 
                style={styles.loadMoreBtn}
                onPress={() => setLimit(l => l + 20)}
              >
                <Text style={styles.loadMoreText}>Load 20 More</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {filtered.length === 0 && (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="restaurant-outline" size={40} color={COLORS.border} />
            <Text style={{ marginTop: 12, color: COLORS.textMuted, fontWeight: '500' }}>
              No recipes in this category yet.
            </Text>
          </View>
        )}
      </Animated.ScrollView>

      <RecipeSearchModal
        visible={searchVisible}
        onClose={() => setSearchVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingVertical: 4,
  },
  engineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 10,
  },
  engineText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primaryGreen,
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryChipActive: {
    backgroundColor: COLORS.primaryGreen,
    borderColor: COLORS.primaryGreen,
  },
  categoryChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  categoryChipTextActive: {
    color: COLORS.white,
  },
  loadMoreBtn: {
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryGreen,
  },
});
