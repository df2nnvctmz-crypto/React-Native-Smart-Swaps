import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Switch
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';
import { COLORS, globalStyles } from '../styles';
import { useRecipes } from '../app/useRecipes';
import { useProfile } from '../app/context/ProfileContext';
import { RecipeCard } from './RecipeCard';
import { LiquidSlider } from './LiquidSlider';

import { useFavorites } from '../app/context/FavoritesContext';

interface RecipeSearchModalProps {
  visible: boolean;
  onClose: () => void;
  initialQuery?: string;
}

const CATEGORIES = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Snack', 'Dessert'];

export const RecipeSearchModal: React.FC<RecipeSearchModalProps> = ({ visible, onClose, initialQuery = '' }) => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { isFavorite, favorites } = useFavorites();
  const { recipes } = useRecipes();

  // Search state
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [category, setCategory] = useState('All');
  const [maxCalories, setMaxCalories] = useState(1500);
  const [minScore, setMinScore] = useState(0);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(20);

  React.useEffect(() => {
    setLimit(20);
  }, [searchQuery, category, maxCalories, minScore, favoritesOnly]);

  const clearFilters = () => {
    setCategory('All');
    setMaxCalories(1500);
    setMinScore(0);
    setSearchQuery('');
    setFavoritesOnly(false);
  };

  const searchResults = useMemo(() => {
    let results = recipes;

    // 1. Dietary preferences filter (always active)
    if (profile.dietaryPreference.includes('Vegetarian')) {
      results = results.filter(r => 
        !r.ingredients.some(ing => ing.food?.category === 'Meat' || ing.food?.category === 'Fish')
      );
    }
    if (profile.dietaryPreference.includes('Vegan')) {
      results = results.filter(r => 
        !r.ingredients.some(ing => 
          ing.food?.category === 'Meat' || 
          ing.food?.category === 'Fish' || 
          ing.food?.category === 'Dairy' || 
          ing.food?.swiss_category?.toLowerCase().includes('egg')
        )
      );
    }

    // 2. Text Search
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      results = results.filter(r => 
        r.name.toLowerCase().includes(q) || 
        r.ingredients.some(ing => ing.raw_text.toLowerCase().includes(q) || (ing.food && ing.food.name.toLowerCase().includes(q)))
      );
    }

    // 3. Category Filter
    if (category !== 'All') {
      results = results.filter(r => r.subcategory.toLowerCase().includes(category.toLowerCase()));
    }

    // 4. Max Calories Filter
    if (maxCalories < 1500) {
      results = results.filter(r => (r.totals.kcal / (r.serves || 1)) <= maxCalories);
    }

    // 5. Min Health Score Filter
    if (minScore > 0) {
      results = results.filter(r => r.health_score >= minScore);
    }

    // Sort by health score
    let finalResults = results.sort((a, b) => b.health_score - a.health_score);

    if (favoritesOnly) {
      finalResults = finalResults.filter(r => isFavorite('recipe', r.id.toString()));
    }

    return finalResults;
  }, [searchQuery, category, maxCalories, minScore, profile.dietaryPreference, favoritesOnly, favorites.recipes]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        style={{ flex: 1, backgroundColor: COLORS.white }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 20 : insets.top + 10 }]}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-down" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Search Recipes</Text>
          <TouchableOpacity onPress={() => setShowFilters(!showFilters)} style={styles.filterBtn}>
            <Ionicons name={showFilters ? "options" : "options-outline"} size={22} color={showFilters ? COLORS.primaryGreen : COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or ingredient..."
            placeholderTextColor={COLORS.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
            clearButtonMode="while-editing"
          />
        </View>

        {showFilters && (
          <View style={styles.filtersContainer}>
            <View style={[globalStyles.rowBetween, { marginBottom: 16 }]}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.textPrimary }}>Filters</Text>
              <TouchableOpacity onPress={clearFilters}>
                <Text style={{ color: COLORS.primaryGreen, fontWeight: '600' }}>Clear all</Text>
              </TouchableOpacity>
            </View>

            <View style={[globalStyles.rowBetween, { marginBottom: 20 }]}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.textPrimary }}>Favorites Only</Text>
              <Switch 
                value={favoritesOnly} 
                onValueChange={setFavoritesOnly}
                trackColor={{ false: '#e0e0e0', true: COLORS.primaryGreen }}
              />
            </View>

            <Text style={[styles.filterLabel, { marginTop: 16, marginBottom: 8 }]}>MEAL TYPE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {CATEGORIES.map(c => {
                const isSelected = category === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => setCategory(c)}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{c}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ marginTop: 16 }}>
              <LiquidSlider 
                maxSliderVal={1500}
                initialValue={maxCalories}
                title="Max Calories per serving"
                unit="kcal"
                onValueChangeComplete={setMaxCalories} 
              />
            </View>

            <View style={{ marginTop: 16 }}>
              <LiquidSlider 
                maxSliderVal={100}
                initialValue={minScore}
                title="Min Health Score"
                unit="pts"
                onValueChangeComplete={setMinScore} 
              />
            </View>
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.resultsCount}>{searchResults.length} recipes found</Text>

          {searchResults.slice(0, limit).map(recipe => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              variant="small"
              onPress={() => {
                onClose();
                router.push(`/recipe/${recipe.id}`);
              }}
            />
          ))}

          {searchResults.length > limit && (
            <TouchableOpacity style={styles.loadMoreBtn} onPress={() => setLimit(l => l + 10)}>
              <Text style={styles.loadMoreText}>Load 10 More</Text>
            </TouchableOpacity>
          )}

          {searchResults.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={COLORS.border} />
              <Text style={styles.emptyTitle}>No recipes found</Text>
              <Text style={styles.emptyText}>Try adjusting your search or filters.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    padding: 8,
    marginLeft: -8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  filterBtn: {
    padding: 8,
    marginRight: -8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
    margin: 20,
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textPrimary,
    height: '100%',
  },
  filtersContainer: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
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
  resultsCount: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 16,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  loadMoreBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    marginVertical: 16,
    backgroundColor: COLORS.background,
    borderRadius: 8,
  },
  loadMoreText: {
    color: COLORS.primaryGreen,
    fontWeight: '600',
    fontSize: 16,
  }
});
