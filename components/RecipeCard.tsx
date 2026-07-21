import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../styles';
import { Recipe } from '../app/types';
import { useFavorites } from '../app/context/FavoritesContext';
import { useInventory } from '../app/context/InventoryContext';
import { getIconForCategory } from '../app/useFoods';

interface RecipeCardProps {
  recipe: Recipe;
  onPress: () => void;
  variant?: 'large' | 'small';
}

function getSubcategoryIcon(subcategory: string): keyof typeof Ionicons.glyphMap {
  const s = subcategory.toLowerCase();
  if (s.includes('breakfast')) return 'sunny-outline';
  if (s.includes('lunch')) return 'partly-sunny-outline';
  if (s.includes('dinner') || s.includes('supper')) return 'moon-outline';
  if (s.includes('snack')) return 'cafe-outline';
  if (s.includes('dessert')) return 'ice-cream-outline';
  return 'restaurant-outline';
}

function getSubcategoryIconColor(subcategory: string): { bg: string; color: string } {
  const s = subcategory.toLowerCase();
  if (s.includes('breakfast')) return { bg: '#FEF3C7', color: '#D97706' };
  if (s.includes('lunch')) return { bg: '#FFF3E0', color: '#F57C00' };
  if (s.includes('dinner') || s.includes('supper')) return { bg: '#EDE7F6', color: '#6D28D9' };
  if (s.includes('snack')) return { bg: '#FFF8E1', color: '#F9A825' };
  if (s.includes('dessert')) return { bg: '#FCE4EC', color: '#C2185B' };
  return { bg: COLORS.lightGreenBg, color: COLORS.primaryGreen };
}

function getScoreColors(val: number) {
  if (val >= 75) return { text: COLORS.scoreGreen, bg: COLORS.lightGreenBg };
  if (val >= 50) return { text: COLORS.scoreYellow, bg: COLORS.scoreYellowLight };
  return { text: COLORS.scoreRed, bg: COLORS.scoreRedLight };
}

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent Health';
  if (score >= 65) return 'Good Health';
  if (score >= 50) return 'Moderate Health';
  return 'Low Health';
}

export const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onPress, variant = 'small' }) => {
  const { isFavorite, toggleFavorite } = useFavorites();
  const { ownedFoodIds } = useInventory();
  
  const isFav = isFavorite('recipe', recipe.id);
  const iconStyle = getSubcategoryIconColor(recipe.subcategory);
  const scoreColors = getScoreColors(recipe.health_score);

  const ownedCount = recipe.ingredients.reduce((acc, ing) => {
    if (ing.food_id && ownedFoodIds.has(ing.food_id)) return acc + 1;
    return acc;
  }, 0);

  if (variant === 'large') {
    return (
      <TouchableOpacity style={styles.largeCard} onPress={onPress} activeOpacity={0.9}>
        {/* Tags Row */}
        <View style={[globalStyles.rowBetween, { marginBottom: 14 }]}>
          <View style={styles.featuredTag}>
            <Ionicons name="star" size={10} color={COLORS.primaryGreen} />
            <Text style={styles.featuredTagText}>TODAY'S FEATURED RECIPE</Text>
          </View>
          
          {ownedCount > 0 && (
            <View style={styles.ownedTag}>
              <Ionicons name="checkmark-circle-outline" size={12} color={COLORS.white} />
              <Text style={styles.ownedTagText}>
                {ownedCount}/{recipe.ingredients.length} INGREDIENTS
              </Text>
            </View>
          )}
        </View>

        {/* Main row */}
        <View style={globalStyles.row}>
          <View style={[styles.largeIconBox, { backgroundColor: iconStyle.bg }]}>
            <Ionicons name={getSubcategoryIcon(recipe.subcategory)} size={32} color={iconStyle.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.subcategoryLabel}>{recipe.subcategory.toUpperCase()}</Text>
            <Text style={styles.largeTitle} numberOfLines={2}>{recipe.name}</Text>
            <Text style={styles.dishType} numberOfLines={1}>{recipe.dish_type}</Text>
          </View>
          <TouchableOpacity
            style={styles.heartBtn}
            onPress={() => toggleFavorite('recipe', recipe.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isFav ? 'heart' : 'heart-outline'}
              size={20}
              color={isFav ? '#FF3B30' : COLORS.textMuted}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        {/* Bottom row */}
        <View style={[globalStyles.rowBetween, { alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }]}>
          <View style={[globalStyles.row, { flexWrap: 'wrap', gap: 6, flex: 1, paddingRight: 8 }]}>
            <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{recipe.time}</Text>
            <View style={{ width: 6 }} />
            <Ionicons name="speedometer-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{recipe.difficulty}</Text>
            <View style={{ width: 6 }} />
            <Ionicons name="people-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{recipe.serves} servings</Text>
          </View>

          <View style={[styles.scoreBadge, { backgroundColor: scoreColors.bg, borderColor: scoreColors.text + '30' }]}>
            <Ionicons name="ribbon-outline" size={11} color={scoreColors.text} />
            <Text style={[styles.scoreBadgeText, { color: scoreColors.text }]}>
              {getScoreLabel(recipe.health_score)}
            </Text>
          </View>
        </View>

        {/* Kcal row */}
        <View style={[styles.kcalRow, { marginTop: 10 }]}>
          <Text style={styles.kcalText}>
            {Math.round(recipe.kcal_total)} kcal / serving
          </Text>
          <View style={[styles.scoreNumBadge, { backgroundColor: scoreColors.bg }]}>
            <Text style={[styles.scoreNumText, { color: scoreColors.text }]}>{recipe.health_score}</Text>
            <Text style={[styles.scoreNumSuffix, { color: scoreColors.text }]}>/100</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Small variant
  return (
    <TouchableOpacity style={styles.smallCard} onPress={onPress} activeOpacity={0.9}>
      <View style={[styles.smallIconBox, { backgroundColor: iconStyle.bg }]}>
        <Ionicons name={getSubcategoryIcon(recipe.subcategory)} size={20} color={iconStyle.color} />
      </View>

      <View style={styles.smallInfo}>
        <Text style={styles.subcategoryLabel}>{recipe.subcategory.toUpperCase()}</Text>
        <Text style={styles.smallTitle} numberOfLines={1}>{recipe.name}</Text>
        <View style={globalStyles.row}>
          <Ionicons name="time-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.smallMetaText}>{recipe.time}</Text>
          <Text style={styles.smallMetaDot}> · </Text>
          <Ionicons name="speedometer-outline" size={12} color={COLORS.textMuted} />
          <Text style={styles.smallMetaText}>{recipe.difficulty}</Text>
        </View>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={globalStyles.row}>
          {ownedCount > 0 && (
            <View style={[styles.ownedTag, { paddingHorizontal: 5, paddingVertical: 2, marginRight: 8 }]}>
              <Ionicons name="checkmark-circle-outline" size={10} color={COLORS.white} />
              <Text style={[styles.ownedTagText, { fontSize: 8 }]}>{ownedCount}/{recipe.ingredients.length}</Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => toggleFavorite('recipe', recipe.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={isFav ? 'heart' : 'heart-outline'}
              size={17}
              color={isFav ? '#FF3B30' : COLORS.textMuted}
            />
          </TouchableOpacity>
        </View>
        <View style={[styles.scorePill, { backgroundColor: scoreColors.bg }]}>
          <Text style={[styles.scorePillText, { color: scoreColors.text }]}>{recipe.health_score}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // ── Large card ──────────────────────────────────────────────────
  largeCard: {
    ...globalStyles.card,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  featuredTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  featuredTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.primaryGreen,
    marginLeft: 4,
    letterSpacing: 0.4,
  },
  ownedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryGreen,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  ownedTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: COLORS.white,
    marginLeft: 4,
    letterSpacing: 0.4,
  },
  largeIconBox: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  largeTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 3,
    lineHeight: 22,
  },
  dishType: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginLeft: 5,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  scoreBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  kcalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kcalText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  scoreNumBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreNumText: {
    fontSize: 16,
    fontWeight: '800',
  },
  scoreNumSuffix: {
    fontSize: 11,
    fontWeight: '500',
    marginLeft: 1,
  },
  heartBtn: {
    padding: 4,
    marginLeft: 8,
  },

  // ── Small card ──────────────────────────────────────────────────
  smallCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: COLORS.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.03,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
      default: { boxShadow: '0px 2px 6px rgba(15, 29, 17, 0.03)' }
    }),
  },
  smallIconBox: {
    width: 46,
    height: 46,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  smallInfo: {
    flex: 1,
    gap: 2,
  },
  subcategoryLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primaryGreen,
    letterSpacing: 0.3,
  },
  smallTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  smallMetaText: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginLeft: 3,
  },
  smallMetaDot: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  scorePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  scorePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
