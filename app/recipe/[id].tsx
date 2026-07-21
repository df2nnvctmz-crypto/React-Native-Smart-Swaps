import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Platform, Linking, Switch, LayoutAnimation, UIManager
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, globalStyles } from '../../styles';
import { useRecipes, scaleNutrients, emptyNutrients, addNutrients, divideNutrients } from '../useRecipes';
import { useFoods } from '../useFoods';
import { findBestRecipeSwap } from '../engine/recipeSwapAlgorithm';
import { FoodNutrients, Recipe, RecipeIngredient, FoodItem } from '../types';
import { StorageService } from '../services/storage';
import { useInventory } from '../context/InventoryContext';
import { useProfile } from '../context/ProfileContext';
import { SelectShoppingListModal } from '../../components/SelectShoppingListModal';
import { NutrientRow } from '../../components/NutrientRow';

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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function getSiteName(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    const knownSites: Record<string, string> = {
      'bbc.co.uk': 'BBC Good Food',
      'bbcgoodfood.com': 'BBC Good Food',
      'allrecipes.com': 'Allrecipes',
      'food.com': 'Food.com',
      'epicurious.com': 'Epicurious',
      'foodnetwork.com': 'Food Network',
      'bonappetit.com': 'Bon Appétit',
      'seriouseats.com': 'Serious Eats',
      'delish.com': 'Delish',
      'simplyrecipes.com': 'Simply Recipes',
      'tasty.co': 'Tasty',
      'recipetineats.com': 'RecipeTin Eats',
      'jamieoliver.com': 'Jamie Oliver',
      'nigella.com': 'Nigella',
      'hellofresh.com': 'Hello Fresh',
      'chefkoch.de': 'Chefkoch',
    };
    if (knownSites[hostname]) return knownSites[hostname];
    // Capitalise first segment nicely: "tasty.co" → "Tasty"
    return hostname.split('.')[0].charAt(0).toUpperCase() + hostname.split('.')[0].slice(1);
  } catch {
    return 'Original Recipe';
  }
}

/**
 * We use dynamic targets from useProfile, but still need standard micro targets
 */

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, targetCalories, targetMacros } = useProfile();
  const { recipes } = useRecipes();
  const { allFoods } = useFoods();
  const { refreshInventory, ownedFoodIds } = useInventory();

  const [swapsEnabled, setSwapsEnabled] = useState(false);
  const [swapsExpanded, setSwapsExpanded] = useState(false);
  const [ingredientsExpanded, setIngredientsExpanded] = useState(true);
  const [stepsExpanded, setStepsExpanded] = useState(true);
  const [microsExpanded, setMicrosExpanded] = useState(false);
  const [macrosExpanded, setMacrosExpanded] = useState(false);
  const [shoppingListModalVisible, setShoppingListModalVisible] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  const recipe = recipes.find(r => r.id === id);
  const [shoppingServings, setShoppingServings] = useState(recipe?.serves || 1);

  // For each ingredient with a food, try to find best swap
  const ingredientSwaps: Record<string, { name: string; improvement: number; swapId: string; candidate: FoodItem } | null> = useMemo(() => {
    if (!recipe) return {};
    const swaps: Record<string, any> = {};
    recipe.ingredients.forEach(ing => {
      if (!ing.food || ing.food.health_score >= 70) {
        swaps[ing.food_id ?? ''] = null;
        return;
      }
      const recipeSwap = findBestRecipeSwap(ing.food, allFoods, profile.dietaryPreference);
      if (recipeSwap) {
        swaps[ing.food_id ?? ''] = {
          name: recipeSwap.candidate.name,
          improvement: recipeSwap.candidate.health_score - ing.food.health_score,
          swapId: `${ing.food.id}-${recipeSwap.candidate.id}`,
          candidate: recipeSwap.candidate,
        };
      } else {
        swaps[ing.food_id ?? ''] = null;
      }
    });
    return swaps;
  }, [recipe, profile.dietaryPreference]);

  const { activeTotals, activeHealthScore } = useMemo(() => {
    if (!recipe) return { activeTotals: emptyNutrients(), activeHealthScore: 50 };
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

  const generateShoppingList = async (listId: string | null, newListName?: string) => {
    if (!recipe) return;
    const scaleFactor = shoppingServings / (recipe.serves || 1);
    
    // We filter out ingredients the user already owns
    const missingIngredients = recipe.ingredients.filter(ing => !ing.food_id || !ownedFoodIds.has(ing.food_id));
    if (missingIngredients.length === 0) {
      alert("You already have all the ingredients!");
      return;
    }

    const items = missingIngredients.map(ing => {
      const swap = ing.food_id ? ingredientSwaps[ing.food_id] : null;
      const displayFood = swapsEnabled && swap ? swap.candidate : ing.food;
      const qty = ing.grams ? ing.grams * scaleFactor : undefined;
      return {
        id: displayFood ? displayFood.id : Math.random().toString(36).substring(2, 15),
        rawText: ing.raw_text,
        matchedFood: displayFood,
        confidence: 1.0,
        source: 'local',
        quantity: qty,
        unit: qty ? 'g' : undefined
      } as any;
    });

    if (listId) {
      // Append to existing
      const scans = await StorageService.getScans();
      const existingList = scans.find((l: any) => l.id === listId);
      if (existingList) {
        const updatedItems = [...existingList.items, ...items];
        const validFoods = updatedItems.map(i => i.matchedFood || (i as any).food).filter(Boolean) as FoodItem[];
        const avgScore = validFoods.length > 0 
          ? Math.round(validFoods.reduce((sum, f) => sum + f.health_score, 0) / validFoods.length) 
          : 50;
        
        const updatedScan = { ...existingList, items: updatedItems, averageScore: avgScore };
        await StorageService.updateScan(listId, updatedScan);
      }
    } else {
      const validFoods = items.map(i => i.matchedFood).filter(Boolean) as FoodItem[];
      const avgScore = validFoods.length > 0
        ? Math.round(validFoods.reduce((sum, f) => sum + f.health_score, 0) / validFoods.length)
        : 50;

      const record = {
        id: Math.random().toString(36).substring(2, 15),
        date: new Date().toISOString(),
        items: items,
        averageScore: avgScore,
        isShoppingList: true,
        recipeName: newListName || recipe.name
      };

      await StorageService.saveScan(record);
    }

    await refreshInventory();
    setShoppingListModalVisible(false);
    router.push('/receipts');
  };

  if (!recipe) {
    return (
      <View style={[globalStyles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: COLORS.textMuted }}>Recipe not found or loading...</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: COLORS.primaryGreen, fontWeight: '600' }}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

          {/* ─── Source Link (top, transparent) ────────────── */}
          <TouchableOpacity style={styles.sourceLinkTop} onPress={() => Linking.openURL(recipe.url)}>
            <Ionicons name="open-outline" size={13} color={COLORS.primaryGreen} />
            <Text style={styles.sourceLinkTopText}>Recipe from <Text style={{ fontWeight: '700' }}>{getSiteName(recipe.url)}</Text></Text>
          </TouchableOpacity>
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
        <TouchableOpacity
          style={styles.swapsCard}
          activeOpacity={0.85}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSwapsExpanded(v => !v);
          }}
        >
          <View style={globalStyles.rowBetween}>
            <View style={globalStyles.row}>
              <Ionicons name="sparkles" size={18} color={COLORS.primaryGreen} style={{ marginRight: 8 }} />
              <View>
                <Text style={styles.swapsTitle}>Smart Swaps</Text>
                <Text style={styles.swapsSubtitle}>
                  {activeSwaps.length > 0 ? `${activeSwaps.length} swap${activeSwaps.length !== 1 ? 's' : ''} available` : 'Tap to explore substitutions'}
                </Text>
              </View>
            </View>
            <View style={globalStyles.row}>
              {activeSwaps.length > 0 && (
                <Switch
                  value={swapsEnabled}
                  onValueChange={(v) => { setSwapsEnabled(v); }}
                  trackColor={{ false: COLORS.border, true: COLORS.primaryGreen }}
                  thumbColor={COLORS.white}
                  ios_backgroundColor={COLORS.border}
                  onStartShouldSetResponder={() => true}
                />
              )}
              <Ionicons
                name={swapsExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.textMuted}
                style={{ marginLeft: 10 }}
              />
            </View>
          </View>

          {swapsExpanded && activeSwaps.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <Text style={styles.activeSwapsLabel}>Active Swaps in this recipe:</Text>
              {recipe.ingredients.map((ing, ingIdx) => {
                if (!ing.food_id || !ingredientSwaps[ing.food_id]) return null;
                const swap = ingredientSwaps[ing.food_id]!;
                return (
                  <View key={`swap-${ingIdx}`} style={styles.swapRow}>
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

          {swapsExpanded && activeSwaps.length === 0 && (
            <View style={{ marginTop: 12 }}>
              <Text style={{ fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic' }}>All ingredients are already high-scoring — no swaps needed!</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* ─── Shopping List Controls ──────────────────────── */}
        <View style={styles.shoppingListCard}>
          <Text style={styles.shoppingListTitle}>Build a Shopping List</Text>
          <Text style={styles.shoppingListSubtitle}>Add missing ingredients to your shopping list</Text>
          <View style={[globalStyles.rowBetween, { marginTop: 12 }]}>
            <View style={styles.servingsControl}>
              <TouchableOpacity onPress={() => setShoppingServings(Math.max(1, shoppingServings - 1))} style={styles.servingBtn}>
                <Ionicons name="remove" size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.servingNumber}>{shoppingServings}</Text>
              <TouchableOpacity onPress={() => setShoppingServings(shoppingServings + 1)} style={styles.servingBtn}>
                <Ionicons name="add" size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <Text style={{ marginLeft: 8, fontSize: 13, color: COLORS.textMuted }}>servings</Text>
            </View>
            <TouchableOpacity style={styles.addToListBtn} onPress={() => setShoppingListModalVisible(true)}>
              <Ionicons name="basket-outline" size={16} color={COLORS.white} />
              <Text style={styles.addToListText}>Add to List</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ─── Ingredients ─────────────────────────────────── */}
        <TouchableOpacity
          style={styles.sectionToggleRow}
          activeOpacity={0.7}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setIngredientsExpanded(v => !v);
          }}
        >
          <Text style={styles.sectionHeader}>Ingredients ({recipe.ingredients.length})</Text>
          <Ionicons name={ingredientsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        {ingredientsExpanded && (
        <View style={styles.ingredientsCard}>
          {recipe.ingredients.map((ing, idx) => {
            const swap = ing.food_id ? ingredientSwaps[ing.food_id] : null;
            const isSwappedIn = swapsEnabled && !!swap;
            const displayFood = isSwappedIn ? swap!.candidate : ing.food;
            const kcalRounded = Math.round(
              isSwappedIn ? scaleNutrients(swap!.candidate.nutrients_per_100, ing.grams).kcal : ing.kcal
            );
            const scoreC = displayFood ? getScoreColors(displayFood.health_score) : null;
            return (
              <View key={idx}>
                <TouchableOpacity
                  style={styles.ingredientRow}
                  onPress={() => displayFood && router.push(`/food/${displayFood.id}`)}
                  disabled={!displayFood}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <View style={globalStyles.row}>
                      {isSwappedIn && <Ionicons name="swap-horizontal" size={13} color={COLORS.primaryGreen} style={{ marginRight: 4 }} />}
                      <Text style={styles.ingredientName}>{displayFood?.name ?? ing.raw_text.split(',')[0]}</Text>
                    </View>
                    <Text style={styles.ingredientAmount}>{ing.raw_text.match(/[\d½¼¾⅓⅔]+\s*\w+/)?.[0] ?? ing.raw_text.split(' ').slice(0, 2).join(' ')}</Text>
                  </View>
                  {kcalRounded > 0 && <View style={styles.kcalPill}><Text style={styles.kcalPillText}>{kcalRounded} kcal</Text></View>}
                  {scoreC && (
                    <View style={[styles.scorePill, { backgroundColor: scoreC.bg }]}>
                      <Text style={[styles.scorePillText, { color: scoreC.text }]}>Score: {displayFood!.health_score}</Text>
                    </View>
                  )}
                </TouchableOpacity>
                {swap && !swapsEnabled && (
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
        )}

        {/* ─── Step-by-Step Instructions ────────────────────── */}
        <TouchableOpacity
          style={styles.sectionToggleRow}
          activeOpacity={0.7}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setStepsExpanded(v => !v);
          }}
        >
          <Text style={styles.sectionHeader}>Instructions ({recipe.steps.length} steps)</Text>
          <Ionicons name={stepsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.textMuted} />
        </TouchableOpacity>

        {stepsExpanded && (
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
        )}

        {/* ─── Nutritional Balance ─────────────────────────── */}
        <View style={[globalStyles.rowBetween, { marginTop: 8 }]}>
          <Text style={[styles.sectionHeader, { marginBottom: 0 }]}>Nutrition</Text>
          <Text style={styles.dailyIntakeLabel}>% OF DAILY INTAKE ({Math.round(targetCalories)} KCAL)</Text>
        </View>

        <TouchableOpacity
          style={[styles.microsToggleBtn, { marginBottom: 14 }]}
          activeOpacity={0.7}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setMacrosExpanded(v => !v);
          }}
        >
          <Ionicons name="pie-chart-outline" size={15} color={COLORS.primaryGreen} />
          <Text style={styles.microsToggleText}>
            {macrosExpanded ? 'Hide Macronutrients' : 'Show Macronutrients'}
          </Text>
          <Ionicons name={macrosExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={COLORS.primaryGreen} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {macrosExpanded && (
        <View style={styles.nutriCard}>
          <Text style={styles.nutriSectionHeader}>MACRONUTRIENTS</Text>
          <NutrientRow label="Calories"       value={t.kcal}             target={targetCalories}       unit=" kcal" isLowerBetter={true} />
          <NutrientRow label="Protein"        value={t.protein_g}        target={targetMacros.protein}  unit="g"     isLowerBetter={false} />
          <NutrientRow label="Carbs"          value={t.carbs_g}          target={targetMacros.carbs}    unit="g"     isLowerBetter={true} />
          <NutrientRow label="Sugars"         value={t.sugars_g}         target={targetMacros.sugars}   unit="g"     isLowerBetter={true} />
          <NutrientRow label="Fat"            value={t.fat_g}            target={targetMacros.fat}      unit="g"     isLowerBetter={true} />
          <NutrientRow label="Saturated Fat"  value={t.saturated_fat_g}  target={targetMacros.satFat}   unit="g"     isLowerBetter={true} />
          <NutrientRow label="Fiber"          value={t.fiber_g}          target={targetMacros.fiber}    unit="g"     isLowerBetter={false} />
          <NutrientRow label="Salt"           value={t.salt_g}           target={targetMacros.salt}     unit="g"     isLowerBetter={true} />
        </View>
        )}

        {/* ─── Micronutrients (collapsible) ────────────────── */}
        <TouchableOpacity
          style={styles.microsToggleBtn}
          activeOpacity={0.7}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setMicrosExpanded(v => !v);
          }}
        >
          <Ionicons name="flask-outline" size={15} color={COLORS.primaryGreen} />
          <Text style={styles.microsToggleText}>
            {microsExpanded ? 'Hide Micronutrients' : 'Show Micronutrients'}
          </Text>
          <Ionicons name={microsExpanded ? 'chevron-up' : 'chevron-down'} size={15} color={COLORS.primaryGreen} style={{ marginLeft: 'auto' }} />
        </TouchableOpacity>

        {microsExpanded && (
        <View style={styles.nutriCard}>
          <Text style={styles.nutriSectionHeader}>ESSENTIAL MICRONUTRIENTS</Text>
          <NutrientRow label="Calcium"     value={t.micros.calcium_mg}     target={MICRO_TARGETS.calcium_mg}     unit="mg" isLowerBetter={false} />
          <NutrientRow label="Iron"        value={t.micros.iron_mg}        target={MICRO_TARGETS.iron_mg}        unit="mg" isLowerBetter={false} />
          <NutrientRow label="Magnesium"   value={t.micros.magnesium_mg}   target={MICRO_TARGETS.magnesium_mg}   unit="mg" isLowerBetter={false} />
          <NutrientRow label="Potassium"   value={t.micros.potassium_mg}   target={MICRO_TARGETS.potassium_mg}   unit="mg" isLowerBetter={false} />
          <NutrientRow label="Zinc"        value={t.micros.zinc_mg}        target={MICRO_TARGETS.zinc_mg}        unit="mg" isLowerBetter={false} />
          <NutrientRow label="Vitamin C"   value={t.micros.vitamin_c_mg}   target={MICRO_TARGETS.vitamin_c_mg}   unit="mg" isLowerBetter={false} />
          <NutrientRow label="Vitamin D"   value={t.micros.vitamin_d_ug}   target={MICRO_TARGETS.vitamin_d_ug}   unit="μg" isLowerBetter={false} />
          <NutrientRow label="Vitamin A"   value={t.micros.vitamin_a_ug}   target={MICRO_TARGETS.vitamin_a_ug}   unit="μg" isLowerBetter={false} />
          <NutrientRow label="Vitamin E"   value={t.micros.vitamin_e_mg}   target={MICRO_TARGETS.vitamin_e_mg}   unit="mg" isLowerBetter={false} />
          <NutrientRow label="Vitamin B1"  value={t.micros.vitamin_b1_mg}  target={MICRO_TARGETS.vitamin_b1_mg}  unit="mg" isLowerBetter={false} />
          <NutrientRow label="Vitamin B2"  value={t.micros.vitamin_b2_mg}  target={MICRO_TARGETS.vitamin_b2_mg}  unit="mg" isLowerBetter={false} />
          <NutrientRow label="Vitamin B6"  value={t.micros.vitamin_b6_mg}  target={MICRO_TARGETS.vitamin_b6_mg}  unit="mg" isLowerBetter={false} />
          <NutrientRow label="Vitamin B12" value={t.micros.vitamin_b12_ug} target={MICRO_TARGETS.vitamin_b12_ug} unit="μg" isLowerBetter={false} />
          <NutrientRow label="Niacin"      value={t.micros.niacin_mg}      target={MICRO_TARGETS.niacin_mg}      unit="mg" isLowerBetter={false} />
          <NutrientRow label="Folate"      value={t.micros.folate_ug}      target={MICRO_TARGETS.folate_ug}      unit="μg" isLowerBetter={false} />
          <NutrientRow label="Phosphorus"  value={t.micros.phosphorus_mg}  target={MICRO_TARGETS.phosphorus_mg}  unit="mg" isLowerBetter={false} />
          <NutrientRow label="Sodium"      value={t.micros.sodium_mg}      target={MICRO_TARGETS.sodium_mg}      unit="mg" isLowerBetter={true} />
          <NutrientRow label="Iodine"      value={t.micros.iodide_ug}      target={MICRO_TARGETS.iodide_ug}      unit="μg" isLowerBetter={false} />
        </View>
        )}

        {/* ─── Source Link (removed from bottom — now at top) ── */}
      </Animated.ScrollView>
      <SelectShoppingListModal
        visible={shoppingListModalVisible}
        onClose={() => setShoppingListModalVisible(false)}
        onSelect={generateShoppingList}
      />
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
  sourceLinkTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  sourceLinkTopText: {
    fontSize: 12,
    color: COLORS.primaryGreen,
  },

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
  sectionToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 8,
    paddingVertical: 2,
  },
  dailyIntakeLabel: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted, letterSpacing: 0.3, flex: 1, textAlign: 'right' },
  microsToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.lightGreenBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  microsToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryGreen,
  },

  shoppingListCard: {
    backgroundColor: '#F0FAFF', // Light blue to distinguish
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#BFE7FF',
  },
  shoppingListTitle: { fontSize: 15, fontWeight: '700', color: '#006599' },
  shoppingListSubtitle: { fontSize: 12, color: '#0084C9', marginTop: 2 },
  servingsControl: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#BFE7FF',
  },
  servingBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#F0FAFF',
    justifyContent: 'center', alignItems: 'center'
  },
  servingNumber: { fontSize: 14, fontWeight: '700', marginHorizontal: 12 },
  addToListBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0084C9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addToListText: { color: COLORS.white, fontWeight: '700', fontSize: 13, marginLeft: 6 },

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
});
