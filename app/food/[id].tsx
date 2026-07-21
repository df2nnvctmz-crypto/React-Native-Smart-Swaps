import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, LayoutAnimation, UIManager } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, globalStyles } from '../../styles';
import { useFoods } from '../useFoods';
import { findBestSwapsPersonalized, SwapResult, isLiquid, isRawIngredient } from '../engine/swapAlgorithm';
import { recordSwapAccepted, recordSwapRejected } from '../engine/personalSwapPreferences';
import { logSwapDecision } from '../engine/swapTrainingLog';
import { useProfile } from '../context/ProfileContext';
import { useFavorites } from '../context/FavoritesContext';
import { useInventory } from '../context/InventoryContext';
import { StorageService } from '../services/storage';
import { SelectShoppingListModal } from '../../components/SelectShoppingListModal';

const MICRONUTRIENT_DV: Record<string, number> = {
  'Vitamin A': 900,
  'Vitamin C': 90,
  'Vitamin D': 20,
  'Vitamin E': 15,
  'Vitamin K': 120,
  'Thiamin': 1.2,
  'Riboflavin': 1.3,
  'Niacin': 16,
  'Vitamin B6': 1.7,
  'Folate': 400,
  'Vitamin B12': 2.4,
  'Biotin': 30,
  'Pantothenic Acid': 5,
  'Calcium': 1300,
  'Iron': 18,
  'Phosphorus': 1250,
  'Iodine': 150,
  'Magnesium': 420,
  'Zinc': 11,
  'Selenium': 55,
  'Copper': 0.9,
  'Manganese': 2.3,
  'Chromium': 35,
  'Molybdenum': 45,
  'Chloride': 2300,
  'Potassium': 4700,
  'Sodium': 2300,
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function FoodDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { foods, allFoods, getIconForCategory } = useFoods();
  const { profile, targetMacros } = useProfile();
  const { isFavorite, toggleFavorite } = useFavorites();
  const { shoppingLists, refreshInventory } = useInventory();

  const food = useMemo(() => allFoods.find(f => f.id === id) || allFoods[0], [id, allFoods]);

  const SWAP_DISPLAY_COUNT = 2;
  const [swapPool, setSwapPool] = useState<SwapResult[]>([]);
  const [swapsLoaded, setSwapsLoaded] = useState(false);
  const [dismissedSwapIds, setDismissedSwapIds] = useState<Set<string>>(new Set());
  const [shoppingListModalVisible, setShoppingListModalVisible] = useState(false);
  const [macrosExpanded, setMacrosExpanded] = useState(false);
  const [microsExpanded, setMicrosExpanded] = useState(false);

  useEffect(() => {
    if (!food) return;
    let isActive = true;
    setSwapsLoaded(false);
    setDismissedSwapIds(new Set());
    // Fetch a deeper pool than we display so dismissing a suggestion can reveal the
    // next-nearest alternative instead of just shrinking the list.
    findBestSwapsPersonalized(food, foods, 8, profile.dietaryPreference).then(swaps => {
      if (isActive) {
        setSwapPool(swaps);
        setSwapsLoaded(true);
      }
    });
    return () => { isActive = false; };
  }, [food, foods, profile.dietaryPreference]);

  const visibleSwaps = useMemo(
    () => swapPool.filter(swap => !dismissedSwapIds.has(swap.candidate.id)).slice(0, SWAP_DISPLAY_COUNT),
    [swapPool, dismissedSwapIds]
  );

  const handleAddToList = async (listId: string | null, newListName?: string) => {
    if (!food) return;

    const qty = 100;
    const newItem = {
      id: Math.random().toString(36).substring(2, 15),
      rawText: food.name,
      matchedFood: food,
      confidence: 1.0,
      source: 'local',
      quantity: qty,
      unit: 'g'
    } as any;

    if (listId) {
      const existingList = shoppingLists.find(l => l.id === listId);
      if (existingList) {
        const updatedItems = [...existingList.items, newItem];
        const validFoods = updatedItems.map(i => i.matchedFood || (i as any).food).filter(Boolean);
        const avgScore = validFoods.length > 0 
          ? Math.round(validFoods.reduce((sum, f) => sum + f!.health_score, 0) / validFoods.length) 
          : 50;
        
        const updatedScan = { ...existingList, items: updatedItems, averageScore: avgScore };
        await StorageService.updateScan(listId, updatedScan);
      }
    } else {
      const record = {
        id: Math.random().toString(36).substring(2, 15),
        date: new Date().toISOString(),
        items: [newItem],
        averageScore: food.health_score,
        isShoppingList: true,
        recipeName: newListName || 'Custom List'
      };
      await StorageService.saveScan(record);
    }

    await refreshInventory();
    setShoppingListModalVisible(false);
  };

  if (!food) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Loading food details...</Text>
      </View>
    );
  }

  const handleAcceptSwap = (swap: SwapResult) => {
    recordSwapAccepted(swap.candidate.swiss_category, swap.candidate.id);
    logSwapDecision(food, swap.candidate, true, isLiquid(food) !== isLiquid(swap.candidate) ? 1 : 0, isRawIngredient(food) !== isRawIngredient(swap.candidate) ? 1 : 0);
    router.replace(`/food/${swap.candidate.id}`);
  };

  const handleRejectSwap = (swap: SwapResult) => {
    recordSwapRejected(swap.candidate.swiss_category, swap.candidate.id);
    logSwapDecision(food, swap.candidate, false, isLiquid(food) !== isLiquid(swap.candidate) ? 1 : 0, isRawIngredient(food) !== isRawIngredient(swap.candidate) ? 1 : 0);
    setDismissedSwapIds(prev => new Set(prev).add(swap.candidate.id));
  };

  // Color code based on score
  const getScoreColor = (val: number) => {
    if (val >= 75) return COLORS.scoreGreen;
    if (val >= 50) return '#F5A623'; // Yellow/Orange for mid
    return COLORS.scoreRed;
  };

  const scoreColor = getScoreColor(food.health_score);

  const nutrients = food.nutrients_per_100;

  const renderNutritionBar = (label: string, value: number, unit: string, dv: number, color: string) => {
    const percent = Math.round((value / dv) * 100) || 0;
    return (
      <View style={styles.macroRow} key={label}>
        <View style={globalStyles.rowBetween}>
          <Text style={styles.macroLabel}>{label}</Text>
          <View style={globalStyles.row}>
            <Text style={styles.macroValue}>{value}{unit}</Text>
            <Text style={styles.macroPercent}>{percent}%</Text>
          </View>
        </View>
        <View style={styles.barBackground}>
          <View style={[styles.barFill, { width: `${Math.min(percent, 100)}%`, backgroundColor: color }]} />
        </View>
      </View>
    );
  };

  const formatMicroName = (key: string) => {
    let name = key.replace(/_(mg|ug)$/i, '');
    name = name.replace(/_/g, ' ');
    if (name.toLowerCase() === 'betacarotene') return 'Beta-Carotene';
    return name.replace(/\b\w/g, c => c.toUpperCase());
  };

  const formatMicroUnit = (key: string) => {
    if (key.endsWith('_ug')) return 'µg';
    if (key.endsWith('_mg')) return 'mg';
    return '';
  };

  const renderVitaminRow = (label: string, value: number, unit: string) => {
    const dv = MICRONUTRIENT_DV[label];
    const percent = dv ? Math.round((value / dv) * 100) : null;
    return (
      <View style={[globalStyles.rowBetween, styles.vitaminRow]} key={label}>
        <Text style={styles.vitaminLabel}>{label}</Text>
        <View style={globalStyles.row}>
          <Text style={styles.vitaminValue}>{value}{unit}</Text>
          <Text style={styles.vitaminPercent}>{percent !== null ? `${percent}%` : 'N/A'}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Floating Header Actions */}
      <View style={styles.headerActionsAbsolute}>
        <TouchableOpacity style={styles.iconButton} onPress={() => router.back()}>
          <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.iconButton} onPress={() => toggleFavorite('food', food.id)}>
          <Ionicons 
            name={isFavorite('food', food.id) ? "heart" : "heart-outline"} 
            size={20} 
            color={isFavorite('food', food.id) ? "#FF3B30" : COLORS.scoreRed} 
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Information Area */}
        <View style={styles.topSection}>
          <View style={styles.badge}>
            <Ionicons name={getIconForCategory(food.category)} size={12} color={COLORS.primaryGreen} style={{ marginRight: 4 }} />
            <Text style={styles.badgeText}>{food.category.toUpperCase()}</Text>
          </View>

          <View style={globalStyles.rowBetween}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={styles.title}>{food.name}</Text>
              <Text style={styles.per100}>per 100g</Text>
              <Text style={styles.kcalText}>{Math.round(nutrients.kcal)} <Text style={styles.kcalMuted}>kcal / 100g</Text></Text>
            </View>
            
            {/* Score Ring */}
            <View style={[styles.scoreRing, { borderColor: scoreColor }]}>
              <Text style={[styles.scoreText, { color: scoreColor }]}>{food.health_score}</Text>
            </View>
          </View>
          
          <TouchableOpacity style={styles.addToListBtnFull} onPress={() => setShoppingListModalVisible(true)}>
            <Ionicons name="basket-outline" size={18} color={COLORS.white} />
            <Text style={styles.addToListBtnFullText}>Add to Shopping List</Text>
          </TouchableOpacity>
        </View>

        {/* Smarter Swaps */}
        {swapsLoaded && visibleSwaps.length === 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Smarter Swaps</Text>
            <View style={styles.bestOptionCard}>
              <Ionicons name="trophy-outline" size={22} color={COLORS.primaryGreen} />
              <Text style={styles.bestOptionText}>You already have the best option in this category!</Text>
            </View>
          </View>
        )}

        {visibleSwaps.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Smarter Swaps</Text>
            {visibleSwaps.map((swap, index) => (
              <TouchableOpacity
                key={index}
                style={styles.swapCard}
                onPress={() => handleAcceptSwap(swap)}
                activeOpacity={0.8}
              >
                <View style={styles.swapIconContainer}>
                  <Ionicons name="leaf-outline" size={24} color={COLORS.primaryGreen} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.recommendedBadge}>RECOMMENDED</Text>
                  <Text style={styles.swapName}>{swap.candidate.name}</Text>
                  <Text style={styles.swapCategory}>{swap.candidate.category}</Text>
                </View>
                <View style={styles.swapScorePill}>
                  <Text style={styles.swapScoreText}>{swap.candidate.health_score} / 100</Text>
                </View>
                <TouchableOpacity
                  style={styles.swapDismissButton}
                  onPress={(e) => { e.stopPropagation(); handleRejectSwap(swap); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={16} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Macronutrients */}
        <View style={styles.section}>
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
          <View style={styles.card}>
            <View style={[globalStyles.rowBetween, { marginBottom: 16 }]}>
              <Text style={styles.per100Muted}>Per 100g (% of Daily Value)</Text>
              <View style={styles.sourceBadge}>
                <Text style={styles.sourceText}>Source: BLS 4.0</Text>
              </View>
            </View>

            {renderNutritionBar('Protein', nutrients.protein_g, 'g', targetMacros.protein, COLORS.primaryGreen)}
            {renderNutritionBar('Carbohydrates', nutrients.carbs_g, 'g', targetMacros.carbs, COLORS.primaryGreen)}
            {renderNutritionBar('Sugars', nutrients.sugars_g, 'g', targetMacros.sugars, COLORS.primaryGreen)}
            {renderNutritionBar('Total Fat', nutrients.fat_g, 'g', targetMacros.fat, COLORS.primaryGreen)}
            {renderNutritionBar('Saturated Fat', nutrients.saturated_fat_g, 'g', targetMacros.satFat, COLORS.primaryGreen)}
            {renderNutritionBar('Fiber', nutrients.fiber_g, 'g', targetMacros.fiber, COLORS.primaryGreen)}
            {renderNutritionBar('Salt', nutrients.salt_g, 'g', targetMacros.salt, COLORS.primaryGreen)}
          </View>
          )}
        </View>

        {/* Vitamins & Minerals */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.microsToggleBtn, { marginBottom: 14 }]}
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
          <View style={styles.card}>
            <Text style={styles.cardSectionTitle}>Vitamins & Minerals (per 100g)</Text>
            {Object.entries(nutrients.micros).map(([key, value]) => {
              if (value === undefined || value === null || value === 0) return null;
              return renderVitaminRow(formatMicroName(key), value as number, formatMicroUnit(key));
            })}
          </View>
          )}
        </View>

      </ScrollView>

      <SelectShoppingListModal 
        visible={shoppingListModalVisible}
        onClose={() => setShoppingListModalVisible(false)}
        onSelect={handleAddToList}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
    color: COLORS.primaryGreenDark,
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F9F7', // Slightly off-white background matching the screenshot
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  headerActionsAbsolute: {
    position: 'absolute',
    top: 10,
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
  topSection: {
    marginBottom: 32,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primaryGreen,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.textPrimary,
    lineHeight: 38,
    marginBottom: 8,
  },
  per100: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  kcalText: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primaryGreen,
  },
  kcalMuted: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  scoreRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 28,
    fontWeight: '800',
  },
  addToListBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primaryGreen,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 16,
  },
  addToListBtnFullText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 15,
    marginLeft: 8,
  },
  section: {
    marginTop: 32,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  swapCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  swapIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#F5F7F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recommendedBadge: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primaryGreen,
    marginBottom: 4,
  },
  swapName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  swapCategory: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  swapScorePill: {
    backgroundColor: '#F5F7F5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  swapScoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryGreen,
  },
  swapDismissButton: {
    marginLeft: 10,
    padding: 4,
  },
  bestOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightGreenBg,
    borderRadius: 20,
    padding: 16,
    gap: 10,
  },
  bestOptionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryGreen,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 12,
    elevation: 2,
  },
  per100Muted: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  sourceBadge: {
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sourceText: {
    fontSize: 10,
    color: COLORS.primaryGreen,
    fontWeight: '600',
  },
  macroRow: {
    marginBottom: 16,
  },
  macroLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  macroValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginRight: 12,
  },
  macroPercent: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primaryGreen,
    width: 40,
    textAlign: 'right',
  },
  barBackground: {
    height: 4,
    backgroundColor: '#F0F0F0',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 20,
  },
  vitaminRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  vitaminLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  vitaminValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginRight: 16,
  },
  vitaminPercent: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primaryGreen,
    width: 32,
    textAlign: 'right',
  },
});
