import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Platform, Linking, Switch
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, globalStyles } from '../../styles';
import { allRecipes, findRecipesForFood, scaleNutrients, emptyNutrients, addNutrients, divideNutrients } from '../useRecipes';
import { findBestSwaps } from '../engine/swapAlgorithm';
import { FoodNutrients, Recipe, RecipeIngredient, FoodItem } from '../types';
import { useProfile } from '../context/ProfileContext';

// We use dynamic targets from useProfile, but still need standard micro targets
const MICRO_TARGETS = {
  calcium_mg: 1000, iron_mg: 14, magnesium_mg: 375, potassium_mg: 2000,
  zinc_mg: 10, vitamin_c_mg: 80, vitamin_d_ug: 5, vitamin_a_ug: 800,
  vitamin_e_mg: 12, vitamin_b1_mg: 1.1, vitamin_b2_mg: 1.4, vitamin_b6_mg: 1.4,
  vitamin_b12_ug: 2.5, niacin_mg: 16, folate_ug: 200, pantothenic_acid_mg: 6,
  phosphorus_mg: 700, sodium_mg: 2400, chloride_mg: 800, iodide_ug: 150, betacarotene_ug: 7000,
};

function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent Health';
  if (score >= 65) return 'Good Health';
  if (score >= 50) return 'Moderate Health';
  return 'Low Health';
}
function getScoreColors(val: number) {
  if (val >= 75) return { text: COLORS.scoreGreen, bg: COLORS.lightGreenBg };
  if (val >= 50) return { text: COLORS.scoreYellow, bg: COLORS.scoreYellowLight };
  return { text: COLORS.scoreRed, bg: COLORS.scoreRedLight };
}
function pct(val: number, target: number) {
  return Math.min(100, Math.round((val / target) * 100));
}
function fmt(val: number, dec = 1) {
  return val % 1 !== 0 ? val.toFixed(dec) : String(Math.round(val));
}

const BAR_COLORS = ['#34C759', '#007AFF', '#FF9500', '#FF3B30', '#AF52DE', '#00C7BE', '#FF6B35', '#5856D6'];

function NutrientRow({
  label, value, target, unit,
}: {
  label: string; value: number; target: number; unit: string;
}) {
  const pctVal = pct(value, target);
  const barColor = COLORS.primaryGreen; // Uniform bar color
  return (
    <View style={styles.nutrientRow}>
      <View style={globalStyles.rowBetween}>
        <View>
          <Text style={styles.nutrientName}>{label}</Text>
          <Text style={styles.nutrientBase}>Base: {fmt(value)}{unit}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.nutrientValue}>{fmt(value)} {unit}</Text>
          <Text style={styles.nutrientPct}>{pctVal}% of target</Text>
        </View>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pctVal}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, targetCalories, targetMacros } = useProfile();
  const [swapsEnabled, setSwapsEnabled] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const recipe = allRecipes.find(r => r.id === id);
  if (!recipe) {
    return (
      <View style={[globalStyles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: COLORS.textMuted }}>Recipe not found.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: COLORS.primaryGreen, fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const allFoods = require('../../foods.json') as FoodItem[];

  // For each ingredient with a food, try to find best swap
  const ingredientSwaps: Record<string, { name: string; improvement: number; swapId: string; candidate: FoodItem } | null> = useMemo(() => {
    const swaps: Record<string, any> = {};
    recipe.ingredients.forEach(ing => {
      if (!ing.food || ing.food.health_score >= 70) {
        swaps[ing.food_id ?? ''] = null;
        return;
      }
      const candidates = findBestSwaps(ing.food, allFoods, 1, profile.dietaryPreference);
      if (candidates.length > 0) {
        swaps[ing.food_id ?? ''] = {
          name: candidates[0].candidate.name,
          improvement: candidates[0].candidate.health_score - ing.food.health_score,
          swapId: `${ing.food.id}-${candidates[0].candidate.id}`,
          candidate: candidates[0].candidate,
        };
      } else {
        swaps[ing.food_id ?? ''] = null;
      }
    });
    return swaps;
  }, [recipe, profile.dietaryPreference]);

  const { activeTotals, activeHealthScore } = useMemo(() => {
    if (!swapsEnabled) return { activeTotals: recipe.totals, activeHealthScore: recipe.health_score };
    
    let currentTotal = emptyNutrients();
    let totalKcal = 0;
    let scoreSum = 0;
    
    recipe.ingredients.forEach(ing => {
      const swap = ing.food_id ? ingredientSwaps[ing.food_id] : null;
      if (swap && swap.candidate && ing.grams) {
        const newNuts = scaleNutrients(swap.candidate.nutrients_per_100, ing.grams);
        currentTotal = addNutrients(currentTotal, newNuts);
        totalKcal += newNuts.kcal;
        scoreSum += swap.candidate.health_score * newNuts.kcal;
      } else if (ing.nutrients) {
        currentTotal = addNutrients(currentTotal, ing.nutrients);
        totalKcal += ing.nutrients.kcal;
        if (ing.food) scoreSum += ing.food.health_score * ing.nutrients.kcal;
      }
    });
    
    const serves = recipe.serves || 1;
    const finalTotals = divideNutrients(currentTotal, serves);
    const hScore = totalKcal > 0 ? Math.round(scoreSum / totalKcal) : 50;
    return { activeTotals: finalTotals, activeHealthScore: hScore };
  }, [swapsEnabled, recipe, ingredientSwaps]);

  const scoreColors = getScoreColors(activeHealthScore);
  const t = activeTotals;


  const activeSwaps = Object.values(ingredientSwaps).filter(Boolean);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }}>
      {/* Floating Header Actions */}
      <View style={styles.headerActionsAbsolute}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
          <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
      </View>

      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 60 : insets.top + 60 }}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        scrollEventThrottle={16}
      >
        {/* ─── Title Block ─────────────────────────────────── */}
        <View style={styles.titleBlock}>
          <Text style={styles.headerCategory}>{recipe.subcategory.toUpperCase()}</Text>
          <Text style={styles.recipeTitle}>{recipe.name}</Text>
          <View style={globalStyles.row}>
            <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{recipe.time}</Text>
            <View style={styles.metaSep} />
            <Ionicons name="speedometer-outline" size={14} color={COLORS.textSecondary} />
            <Text style={styles.metaText}>{recipe.difficulty}</Text>
            {recipe.serves > 1 && (
              <>
                <View style={styles.metaSep} />
                <Ionicons name="people-outline" size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>{recipe.serves} servings</Text>
              </>
            )}
          </View>
          <Text style={styles.dishType}>{recipe.dish_type}</Text>
        </View>

        {/* ─── Health Score Card ────────────────────────────── */}
        <View style={styles.scoreCard}>
          <Text style={styles.scoreCardLabel}>MEAL HEALTH SCORE</Text>
          <View style={globalStyles.rowBetween}>
            <View style={globalStyles.row}>
              <Text style={[styles.scoreNumber, { color: scoreColors.text }]}>{activeHealthScore}</Text>
              <Text style={styles.scoreOutOf}>/100</Text>
            </View>
            <TouchableOpacity style={[styles.scoreLabelBadge, { borderColor: scoreColors.text + '40' }]}>
              <Ionicons name="ribbon-outline" size={14} color={scoreColors.text} />
              <Text style={[styles.scoreLabelText, { color: scoreColors.text }]}>{getScoreLabel(activeHealthScore)}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Smart Swaps Card ────────────────────────────── */}
        <View style={styles.swapsCard}>
          <View style={globalStyles.rowBetween}>
            <View style={globalStyles.row}>
              <Ionicons name="sparkles" size={18} color={COLORS.primaryGreen} style={{ marginRight: 8 }} />
              <View>
                <Text style={styles.swapsTitle}>Smart Swaps</Text>
                <Text style={styles.swapsSubtitle}>Instantly substitute items to maximize health score</Text>
              </View>
            </View>
            <Switch
              value={swapsEnabled}
              onValueChange={setSwapsEnabled}
              trackColor={{ false: COLORS.border, true: COLORS.primaryGreen }}
              thumbColor={COLORS.white}
              ios_backgroundColor={COLORS.border}
            />
          </View>

          {activeSwaps.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.activeSwapsLabel}>Active Swaps in this recipe:</Text>
              {recipe.ingredients.map(ing => {
                if (!ing.food_id || !ingredientSwaps[ing.food_id]) return null;
                const swap = ingredientSwaps[ing.food_id]!;
                return (
                  <View key={ing.food_id} style={styles.swapRow}>
                    <Text style={styles.swapFrom} numberOfLines={1}>{ing.food?.name ?? ing.raw_text}</Text>
                    <Ionicons name="arrow-forward" size={13} color={COLORS.textMuted} style={{ marginHorizontal: 4 }} />
                    <Text style={styles.swapTo} numberOfLines={1}>{swap.name}</Text>
                    <View style={styles.swapPts}>
                      <Text style={styles.swapPtsText}>+{swap.improvement} pts</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* ─── Ingredients ─────────────────────────────────── */}
        <Text style={styles.sectionHeader}>Ingredients</Text>
        <View style={styles.ingredientsCard}>
          {recipe.ingredients.map((ing, idx) => {
            const swap = ing.food_id ? ingredientSwaps[ing.food_id] : null;
            const kcalRounded = Math.round(ing.kcal);
            const scoreC = ing.food ? getScoreColors(ing.food.health_score) : null;
            return (
              <View key={idx}>
                <TouchableOpacity
                  style={styles.ingredientRow}
                  onPress={() => ing.food && router.push(`/food/${ing.food.id}`)}
                  disabled={!ing.food}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.ingredientName}>{ing.food?.name ?? ing.raw_text.split(',')[0]}</Text>
                    <Text style={styles.ingredientAmount}>{ing.raw_text.match(/[\d½¼¾⅓⅔]+\s*\w+/)?.[0] ?? ing.raw_text.split(' ').slice(0, 2).join(' ')}</Text>
                  </View>
                  {kcalRounded > 0 && <View style={styles.kcalPill}><Text style={styles.kcalPillText}>{kcalRounded} kcal</Text></View>}
                  {scoreC && (
                    <View style={[styles.scorePill, { backgroundColor: scoreC.bg }]}>
                      <Text style={[styles.scorePillText, { color: scoreC.text }]}>Score: {ing.food!.health_score}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {swap && (
                  <TouchableOpacity
                    style={styles.swapSuggestionRow}
                    onPress={() => router.push(`/food/${swap.candidate.id}`)}
                  >
                    <Ionicons name="shuffle" size={13} color={COLORS.primaryGreen} />
                    <Text style={styles.swapSuggestionText}>Swap suggestion: replace with {swap.name}</Text>
                    <Text style={styles.swapSuggestionPts}>+{swap.improvement} pts →</Text>
                  </TouchableOpacity>
                )}
                {idx < recipe.ingredients.length - 1 && <View style={styles.ingredientDivider} />}
              </View>
            );
          })}
        </View>

        {/* ─── Step-by-Step Instructions ────────────────────── */}
        <Text style={styles.sectionHeader}>Step-by-Step Instructions</Text>
        <View style={styles.stepsCard}>
          {recipe.steps.map((step, idx) => (
            <View key={idx} style={[styles.stepRow, idx < recipe.steps.length - 1 && styles.stepRowBorder]}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{idx + 1}</Text>
              </View>
              <Text style={styles.stepText}>{step}</Text>
            </View>
          ))}
        </View>

        {/* ─── Nutritional Balance ─────────────────────────── */}
        <View style={globalStyles.rowBetween}>
          <Text style={styles.sectionHeader}>Nutritional Balance</Text>
          <Text style={styles.dailyIntakeLabel}>% OF DAILY INTAKE ({Math.round(targetCalories)} KCAL)</Text>
        </View>

        <View style={styles.nutriCard}>
          <Text style={styles.nutriSectionHeader}>MACRONUTRIENTS</Text>
          <NutrientRow label="Calories" value={t.kcal} target={targetCalories} unit=" kcal" />
          <NutrientRow label="Protein" value={t.protein_g} target={targetMacros.protein} unit="g" />
          <NutrientRow label="Carbs" value={t.carbs_g} target={targetMacros.carbs} unit="g" />
          <NutrientRow label="Sugars" value={t.sugars_g} target={targetMacros.sugars} unit="g" />
          <NutrientRow label="Fat" value={t.fat_g} target={targetMacros.fat} unit="g" />
          <NutrientRow label="Saturated Fat" value={t.saturated_fat_g} target={targetMacros.satFat} unit="g" />
          <NutrientRow label="Fiber" value={t.fiber_g} target={targetMacros.fiber} unit="g" />
          <NutrientRow label="Salt" value={t.salt_g} target={targetMacros.salt} unit="g" />
        </View>

        <View style={styles.nutriCard}>
          <Text style={styles.nutriSectionHeader}>ESSENTIAL MICRONUTRIENTS</Text>
          <NutrientRow label="Calcium" value={t.micros.calcium_mg} target={MICRO_TARGETS.calcium_mg} unit="mg" />
          <NutrientRow label="Iron" value={t.micros.iron_mg} target={MICRO_TARGETS.iron_mg} unit="mg" />
          <NutrientRow label="Magnesium" value={t.micros.magnesium_mg} target={MICRO_TARGETS.magnesium_mg} unit="mg" />
          <NutrientRow label="Potassium" value={t.micros.potassium_mg} target={MICRO_TARGETS.potassium_mg} unit="mg" />
          <NutrientRow label="Zinc" value={t.micros.zinc_mg} target={MICRO_TARGETS.zinc_mg} unit="mg" />
          <NutrientRow label="Vitamin C" value={t.micros.vitamin_c_mg} target={MICRO_TARGETS.vitamin_c_mg} unit="mg" />
          <NutrientRow label="Vitamin D" value={t.micros.vitamin_d_ug} target={MICRO_TARGETS.vitamin_d_ug} unit="μg" />
          <NutrientRow label="Vitamin A" value={t.micros.vitamin_a_ug} target={MICRO_TARGETS.vitamin_a_ug} unit="μg" />
          <NutrientRow label="Vitamin E" value={t.micros.vitamin_e_mg} target={MICRO_TARGETS.vitamin_e_mg} unit="mg" />
          <NutrientRow label="Vitamin B1" value={t.micros.vitamin_b1_mg} target={MICRO_TARGETS.vitamin_b1_mg} unit="mg" />
          <NutrientRow label="Vitamin B2" value={t.micros.vitamin_b2_mg} target={MICRO_TARGETS.vitamin_b2_mg} unit="mg" />
          <NutrientRow label="Vitamin B6" value={t.micros.vitamin_b6_mg} target={MICRO_TARGETS.vitamin_b6_mg} unit="mg" />
          <NutrientRow label="Vitamin B12" value={t.micros.vitamin_b12_ug} target={MICRO_TARGETS.vitamin_b12_ug} unit="μg" />
          <NutrientRow label="Niacin" value={t.micros.niacin_mg} target={MICRO_TARGETS.niacin_mg} unit="mg" />
          <NutrientRow label="Folate" value={t.micros.folate_ug} target={MICRO_TARGETS.folate_ug} unit="μg" />
          <NutrientRow label="Phosphorus" value={t.micros.phosphorus_mg} target={MICRO_TARGETS.phosphorus_mg} unit="mg" />
          <NutrientRow label="Sodium" value={t.micros.sodium_mg} target={MICRO_TARGETS.sodium_mg} unit="mg" />
          <NutrientRow label="Iodine" value={t.micros.iodide_ug} target={MICRO_TARGETS.iodide_ug} unit="μg" />
        </View>

        {/* ─── Source Link ─────────────────────────────────── */}
        <TouchableOpacity style={styles.sourceLink} onPress={() => Linking.openURL(recipe.url)}>
          <Ionicons name="open-outline" size={14} color={COLORS.primaryGreen} />
          <Text style={styles.sourceLinkText}>View original recipe</Text>
        </TouchableOpacity>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  headerActionsAbsolute: {
    position: 'absolute',
    top: 10, // will be adjusted if needed, but since it's floating we rely on ScrollView padding for content
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerCategory: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.5, alignSelf: 'flex-start' },

  titleBlock: { marginTop: 12, marginBottom: 16 },
  recipeTitle: { fontSize: 24, fontWeight: '800', color: COLORS.textPrimary, lineHeight: 30, marginBottom: 8 },
  metaText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500', marginLeft: 5 },
  metaSep: { width: 12 },
  dishType: { fontSize: 12, color: COLORS.textMuted, marginTop: 6 },

  scoreCard: {
    backgroundColor: COLORS.lightGreenBg,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  scoreCardLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.6, marginBottom: 6 },
  scoreNumber: { fontSize: 44, fontWeight: '800', lineHeight: 50 },
  scoreOutOf: { fontSize: 18, color: COLORS.textMuted, fontWeight: '500', alignSelf: 'flex-end', marginBottom: 6, marginLeft: 4 },
  scoreLabelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: COLORS.white,
  },
  scoreLabelText: { fontSize: 13, fontWeight: '700' },

  swapsCard: {
    backgroundColor: COLORS.lightGreenBg,
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  swapsTitle: { fontSize: 15, fontWeight: '700', color: COLORS.primaryGreen },
  swapsSubtitle: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, maxWidth: 220 },
  activeSwapsLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500', marginBottom: 10 },
  swapRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap',
  },
  swapFrom: { fontSize: 13, color: COLORS.textPrimary, fontWeight: '600', flex: 1, minWidth: 80 },
  swapTo: { fontSize: 13, color: COLORS.primaryGreen, fontWeight: '700', flex: 1, minWidth: 80 },
  swapPts: {
    backgroundColor: COLORS.primaryGreen, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 3, marginLeft: 6,
  },
  swapPtsText: { fontSize: 11, fontWeight: '700', color: COLORS.white },

  sectionHeader: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary, marginBottom: 8, marginTop: 4 },
  dailyIntakeLabel: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.3, flex: 1, textAlign: 'right' },

  ingredientsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  ingredientName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  ingredientAmount: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  ingredientDivider: { height: 1, backgroundColor: COLORS.border },
  kcalPill: {
    backgroundColor: '#F5F5F5', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  kcalPillText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  scorePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  scorePillText: { fontSize: 12, fontWeight: '700' },
  swapSuggestionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F0FAF0', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 7, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
  },
  swapSuggestionText: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  swapSuggestionPts: { fontSize: 12, color: COLORS.primaryGreen, fontWeight: '700' },

  stepsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  stepRow: { flexDirection: 'row', paddingVertical: 12, gap: 12 },
  stepRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  stepNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.lightGreenBg, justifyContent: 'center', alignItems: 'center',
  },
  stepNumText: { fontSize: 13, fontWeight: '700', color: COLORS.primaryGreen },
  stepText: { fontSize: 14, color: COLORS.textPrimary, lineHeight: 21, flex: 1 },

  nutriCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  nutriSectionHeader: {
    fontSize: 11, fontWeight: '700', color: COLORS.primaryGreen,
    letterSpacing: 0.5, marginBottom: 14, borderBottomWidth: 1,
    borderBottomColor: COLORS.border, paddingBottom: 10,
  },
  nutrientRow: { marginBottom: 14 },
  nutrientName: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  nutrientBase: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  nutrientValue: { fontSize: 14, fontWeight: '700', color: COLORS.textPrimary },
  nutrientPct: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  barTrack: {
    height: 6, backgroundColor: '#F0F0F0', borderRadius: 3,
    marginTop: 6, overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 3 },

  sourceLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, marginBottom: 20,
  },
  sourceLinkText: { fontSize: 13, color: COLORS.primaryGreen, fontWeight: '600' },
});
