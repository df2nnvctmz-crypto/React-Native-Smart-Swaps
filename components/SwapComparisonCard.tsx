import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../styles';
import { FoodItem } from '../app/types';
import { useFavorites } from '../app/context/FavoritesContext';
import { findRecipesForFood } from '../app/useRecipes';
import { useRouter } from 'expo-router';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SwapComparisonCardProps {
  fromFood: FoodItem;
  toFood: FoodItem;
  onPressFrom?: () => void;
  onPressTo?: () => void;
  improvement: number;
}

export function SwapComparisonCard({ fromFood, toFood, onPressFrom, onPressTo, improvement }: SwapComparisonCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();
  const router = useRouter();
  
  const swapId = `${fromFood.id}-${toFood.id}`;
  const isFav = isFavorite('swap', swapId);

  // Find real recipes that use the "from" food
  const linkedRecipes = findRecipesForFood(fromFood.id).slice(0, 2);

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(!expanded);
  };

  const renderComparisonRow = (label: string, fromVal: number, toVal: number, isLowerBetter: boolean) => {
    const maxVal = Math.max(fromVal, toVal, 1);
    const fromPercentage = (fromVal / maxVal) * 100;
    const toPercentage = (toVal / maxVal) * 100;

    const isFromBetter = isLowerBetter ? fromVal <= toVal : fromVal >= toVal;
    const isToBetter = isLowerBetter ? toVal <= fromVal : toVal >= fromVal;

    const fromColor = isFromBetter ? COLORS.scoreGreen : '#FF9500'; // Orange if worse
    const toColor = isToBetter ? COLORS.scoreGreen : '#FF9500';

    return (
      <View style={styles.comparisonRow} key={label}>
        <View style={styles.comparisonTextRow}>
          <Text style={styles.nutrientLabel}>{label}</Text>
          <View style={styles.nutrientValues}>
            <Text style={[styles.nutrientValueLeft, { color: fromColor }]}>{fromVal % 1 !== 0 ? fromVal.toFixed(1) : fromVal}</Text>
            <Text style={[styles.nutrientValueRight, { color: toColor }]}>{toVal % 1 !== 0 ? toVal.toFixed(1) : toVal}</Text>
          </View>
        </View>
        <View style={styles.barChartContainer}>
          <View style={styles.barLeftContainer}>
            <View style={[styles.barLeftFill, { width: `${fromPercentage}%`, backgroundColor: fromColor }]} />
            <View style={styles.barBackground} />
          </View>
          <View style={styles.barGap} />
          <View style={styles.barRightContainer}>
            <View style={[styles.barRightFill, { width: `${toPercentage}%`, backgroundColor: toColor }]} />
            <View style={styles.barBackground} />
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.card}>
      {/* Badges */}
      <View style={[globalStyles.rowBetween, { marginBottom: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={styles.featuredBadge}>
            <Text style={styles.featuredBadgeText}>FEATURED</Text>
          </View>
          <View style={[styles.improvementBadge, { marginLeft: 8 }]}>
            <Ionicons name="trending-up" size={14} color={COLORS.primaryGreen} />
            <Text style={styles.improvementText}>+{improvement} pt Better Score</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => toggleFavorite('swap', swapId)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name={isFav ? "heart" : "heart-outline"} size={22} color={isFav ? "#FF3B30" : COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Header Comparison */}
      <View style={styles.headerComparison}>
        <TouchableOpacity style={styles.headerCol} onPress={onPressFrom} activeOpacity={0.7}>
          <Text style={styles.foodTitle} numberOfLines={2}>{fromFood.name}</Text>
          <View style={styles.scorePillOrange}>
            <Text style={styles.scoreTextOrange}>{fromFood.health_score} pt</Text>
          </View>
          <Text style={styles.kcalText}>{Math.round(fromFood.nutrients_per_100.kcal)} kcal</Text>
        </TouchableOpacity>

        <View style={styles.arrowContainer}>
          <View style={styles.arrowCircle}>
            <Ionicons name="arrow-forward" size={16} color={COLORS.primaryGreen} />
          </View>
        </View>

        <TouchableOpacity style={styles.headerCol} onPress={onPressTo} activeOpacity={0.7}>
          <Text style={[styles.foodTitle, { textAlign: 'right' }]} numberOfLines={2}>{toFood.name}</Text>
          <View style={[styles.scorePillGreen, { alignSelf: 'flex-end' }]}>
            <Text style={styles.scoreTextGreen}>{toFood.health_score} pt</Text>
          </View>
          <Text style={[styles.kcalText, { textAlign: 'right' }]}>{Math.round(toFood.nutrients_per_100.kcal)} kcal</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      {/* Accordion Toggle */}
      <TouchableOpacity style={styles.toggleRow} onPress={toggleExpanded} activeOpacity={0.8}>
        <Text style={styles.toggleText}>Click to see side-by-side nutrients</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.primaryGreen} />
      </TouchableOpacity>

      {/* Expanded Content */}
      {expanded && (
        <View style={styles.expandedContent}>
          <Text style={styles.expandedTitle}>SIDE-BY-SIDE NUTRITION PROFILE (% DV)</Text>
          
          {renderComparisonRow('Calories', Math.round(fromFood.nutrients_per_100.kcal), Math.round(toFood.nutrients_per_100.kcal), true)}
          {renderComparisonRow('Protein (g)', fromFood.nutrients_per_100.protein_g, toFood.nutrients_per_100.protein_g, false)}
          {renderComparisonRow('Carbs (g)', fromFood.nutrients_per_100.carbs_g, toFood.nutrients_per_100.carbs_g, true)}
          {renderComparisonRow('Sugars (g)', fromFood.nutrients_per_100.sugars_g, toFood.nutrients_per_100.sugars_g, true)}
          {renderComparisonRow('Fat (g)', fromFood.nutrients_per_100.fat_g, toFood.nutrients_per_100.fat_g, true)}
          {renderComparisonRow('Saturated Fat (g)', fromFood.nutrients_per_100.saturated_fat_g, toFood.nutrients_per_100.saturated_fat_g, true)}
          {renderComparisonRow('Fiber (g)', fromFood.nutrients_per_100.fiber_g, toFood.nutrients_per_100.fiber_g, false)}
          {renderComparisonRow('Salt (g)', fromFood.nutrients_per_100.salt_g, toFood.nutrients_per_100.salt_g, true)}

          {/* Recipes Section - Real Data */}
          <View style={styles.recipesSection}>
            <Text style={styles.recipesTitle}>Where to use this swap:</Text>
            {linkedRecipes.length > 0 ? (
              <View style={styles.recipeCardsRow}>
                {linkedRecipes.map(recipe => (
                  <TouchableOpacity
                    key={recipe.id}
                    style={styles.recipeCard}
                    onPress={() => router.push(`/recipe/${recipe.id}`)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.recipeImagePlaceholder}>
                      <Ionicons name="restaurant" size={20} color={COLORS.primaryGreen} />
                    </View>
                    <Text style={styles.recipeName} numberOfLines={2}>{recipe.name}</Text>
                    <Text style={styles.recipeCategory}>{recipe.subcategory}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.noRecipesText}>No linked recipes found for {fromFood.name}</Text>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  featuredBadge: {
    backgroundColor: '#EBF5ED',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  featuredBadgeText: {
    color: COLORS.primaryGreenDark,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  improvementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  improvementText: {
    color: COLORS.primaryGreen,
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 4,
  },
  headerComparison: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerCol: {
    flex: 1,
  },
  foodTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
    minHeight: 40,
  },
  scorePillOrange: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  scoreTextOrange: {
    color: '#D97706',
    fontSize: 12,
    fontWeight: '800',
  },
  scorePillGreen: {
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 4,
  },
  scoreTextGreen: {
    color: COLORS.primaryGreen,
    fontSize: 12,
    fontWeight: '800',
  },
  kcalText: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  arrowContainer: {
    width: 40,
    alignItems: 'center',
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.primaryGreen,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  expandedContent: {
    marginTop: 20,
    backgroundColor: COLORS.background, // White background for the table inside the light green card
    borderRadius: 16,
    padding: 16,
  },
  expandedTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMuted,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  comparisonRow: {
    marginBottom: 12,
  },
  comparisonTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 4,
  },
  nutrientLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  nutrientValues: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  nutrientValueLeft: {
    fontSize: 14,
    fontWeight: '800',
    marginRight: 16,
    width: 40,
    textAlign: 'right',
  },
  nutrientValueRight: {
    fontSize: 14,
    fontWeight: '800',
    width: 40,
    textAlign: 'right',
  },
  barChartContainer: {
    flexDirection: 'row',
    height: 8,
    alignItems: 'center',
  },
  barLeftContainer: {
    flex: 1,
    height: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    position: 'relative',
  },
  barRightContainer: {
    flex: 1,
    height: 8,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  barBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E6EAE5',
    borderRadius: 4,
    zIndex: 0,
  },
  barLeftFill: {
    height: 8,
    borderRadius: 4,
    zIndex: 1,
  },
  barRightFill: {
    height: 8,
    borderRadius: 4,
    zIndex: 1,
  },
  barGap: {
    width: 8,
  },
  recipesSection: {
    marginTop: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
    paddingTop: 16,
  },
  recipesTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  recipeCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  recipeCard: {
    width: '48%',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  recipeImagePlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EBEBEB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  recipeName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  recipeCategory: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.primaryGreen,
    textAlign: 'center',
    marginTop: 2,
  },
  noRecipesText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
});
