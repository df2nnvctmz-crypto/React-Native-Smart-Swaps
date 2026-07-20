import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  Animated,
  ActionSheetIOS,
  Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../../styles';
import { useFoods } from '../useFoods';
import { findBestSwapsPersonalized, SwapResult, isLiquid, isRawIngredient } from '../engine/swapAlgorithm';
import { recordSwapAccepted, recordSwapRejected } from '../engine/personalSwapPreferences';
import { logSwapDecision } from '../engine/swapTrainingLog';
import { useRouter, useFocusEffect } from 'expo-router';
import { useProfile, DietaryPreference } from '../context/ProfileContext';
import { SearchModal } from '../../components/SearchModal';
import { GlassHeader, HEADER_CONTENT_HEIGHT } from '../../components/GlassHeader';
import { CircularScoreRing } from '../../components/CircularScoreRing';
import { CoverFlowCarousel } from '../../components/CoverFlowCarousel';
import { useFavorites } from '../context/FavoritesContext';
import { FoodItem } from '../types';
import { StorageService, ScanRecord } from '../services/storage';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SwapsTab() {
  const [highlightExpanded, setHighlightExpanded] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const [scans, setScans] = useState<ScanRecord[]>([]);
  const router = useRouter();
  const { profile, updateProfile } = useProfile();
  const currentPreference = profile.dietaryPreference[0] || 'Balanced';

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;
      StorageService.getScans().then(fetched => {
        if (isActive) setScans(fetched);
      });
      return () => { isActive = false; };
    }, [])
  );

  const openDietaryPicker = () => {
    const options: DietaryPreference[] = ['Balanced', 'High Protein', 'Low Carb', 'Vegetarian', 'Vegan'];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', ...options],
          cancelButtonIndex: 0,
          title: 'Dietary Preference',
        },
        (buttonIndex) => {
          if (buttonIndex !== 0) {
            updateProfile({ dietaryPreference: [options[buttonIndex - 1]] });
          }
        }
      );
    } else {
      Alert.alert('Dietary Preference', '', [
        ...options.map(opt => ({
          text: opt,
          onPress: () => updateProfile({ dietaryPreference: [opt] }),
        })),
        { text: 'Cancel', style: 'cancel' }
      ], { cancelable: true });
    }
  };

  const { foods, allFoods } = useFoods();

  const uniquePurchasedFoods = useMemo(() => {
    const foodMap = new Map<string, FoodItem>();
    for (const scan of scans) {
      for (const item of scan.items) {
        if (item.matchedFood) {
          foodMap.set(item.matchedFood.id, item.matchedFood);
        }
      }
    }
    return Array.from(foodMap.values());
  }, [scans]);

  const LEADERBOARD_SIZE = 5;
  const [swapPoolsByFood, setSwapPoolsByFood] = useState<Record<string, { badFood: FoodItem; results: SwapResult[] }>>({});
  const [swapsLoading, setSwapsLoading] = useState(false);
  const [dismissedSwapIds, setDismissedSwapIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let isActive = true;

    async function computePools() {
      if (uniquePurchasedFoods.length === 0) {
        if (isActive) setSwapPoolsByFood({});
        return;
      }

      setSwapsLoading(true);
      const safeFoods = foods.length > 0 ? foods : allFoods;
      const pools: Record<string, { badFood: FoodItem; results: SwapResult[] }> = {};

      for (const badFood of uniquePurchasedFoods) {
        // Fetch a deeper pool per food than we'll ever show at once, so dismissing
        // this food's current pick reveals its next-nearest alternative instead of
        // just losing it a slot in the leaderboard below.
        const results = await findBestSwapsPersonalized(badFood, safeFoods, 6, profile.dietaryPreference);
        pools[badFood.id] = { badFood, results };
      }

      if (isActive) {
        setSwapPoolsByFood(pools);
        setSwapsLoading(false);
      }
    }

    computePools();
    return () => { isActive = false; };
  }, [uniquePurchasedFoods, foods, profile.dietaryPreference, allFoods]);

  // Each food contributes its current best NOT-yet-dismissed candidate to the
  // leaderboard. Dismissing that candidate just excludes it from the `.find()` below,
  // so the food's next-best alternative naturally takes its place next render.
  const visibleTopSwapObjects = useMemo(() => {
    const picks: any[] = [];
    for (const { badFood, results } of Object.values(swapPoolsByFood)) {
      const pick = results.find(r => {
        const swapId = `${badFood.id}-${r.candidate.id}`;
        return !dismissedSwapIds.has(swapId) && r.candidate.health_score - badFood.health_score > 0;
      });
      if (pick) {
        picks.push({
          id: `${badFood.id}-${pick.candidate.id}`,
          from: badFood,
          to: pick.candidate,
          improvement: pick.candidate.health_score - badFood.health_score,
          details: `Smart Swap Match (${Math.round(pick.score)} logic points)`,
        });
      }
    }
    picks.sort((a, b) => b.improvement - a.improvement);
    return picks.slice(0, LEADERBOARD_SIZE);
  }, [swapPoolsByFood, dismissedSwapIds]);

  const handleAcceptSwap = (item: any) => {
    recordSwapAccepted(item.to.swiss_category, item.to.id);
    logSwapDecision(item.from, item.to, true, isLiquid(item.from) !== isLiquid(item.to) ? 1 : 0, isRawIngredient(item.from) !== isRawIngredient(item.to) ? 1 : 0);
    router.push(`/food/${item.to.id}`);
  };

  const handleRejectSwap = (item: any) => {
    recordSwapRejected(item.to.swiss_category, item.to.id);
    logSwapDecision(item.from, item.to, false, isLiquid(item.from) !== isLiquid(item.to) ? 1 : 0, isRawIngredient(item.from) !== isRawIngredient(item.to) ? 1 : 0);
    setDismissedSwapIds(prev => new Set(prev).add(item.id));
  };

  const { favorites, toggleFavorite, isFavorite } = useFavorites();

  const favoritedSwapsList = useMemo(() => {
    return favorites.swaps.map(swapId => {
      const [fromId, toId] = swapId.split('-');
      const fromFood = allFoods.find(f => f.id === fromId);
      const toFood = allFoods.find(f => f.id === toId);
      if (!fromFood || !toFood) return null;
      return { 
        id: swapId, 
        from: fromFood, 
        to: toFood, 
        improvement: toFood.health_score - fromFood.health_score,
        details: 'Saved Swap'
      };
    }).filter(Boolean) as { id: string, from: FoodItem, to: FoodItem, improvement: number, details: string }[];
  }, [favorites.swaps, allFoods]);

  const toggleItem = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedItem(expandedItem === id ? null : id);
  };

  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;
  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;

  const renderSwapCard = (item: any, isCarousel: boolean = false, trackable: boolean = false) => {
    const isExpanded = expandedItem === item.id;
    const isFav = isFavorite('swap', item.id);

    return (
      <View key={item.id} style={[globalStyles.card, { marginBottom: 12 }, isCarousel && { width: '100%', marginBottom: 8 }]}>
        <View style={[globalStyles.rowBetween, { alignItems: 'center' }]}>
           <TouchableOpacity style={styles.swapCol} onPress={() => router.push(`/food/${item.from.id}`)}>
              <CircularScoreRing percentage={item.from.health_score} size={44} strokeWidth={4} />
              <View style={styles.swapTextContainerLeft}>
                 <Text style={styles.foodListName} numberOfLines={2}>{item.from.name}</Text>
                 <Text style={styles.foodListKcal}>{Math.round(item.from.nutrients_per_100.kcal)} kcal</Text>
              </View>
           </TouchableOpacity>

           <TouchableOpacity
             style={styles.arrowCircle}
             onPress={() => toggleItem(item.id)}
           >
             <Ionicons name="arrow-forward" size={16} color={COLORS.primaryGreen} />
           </TouchableOpacity>

           <TouchableOpacity style={styles.swapColRight} onPress={() => trackable ? handleAcceptSwap(item) : router.push(`/food/${item.to.id}`)}>
              <View style={styles.swapTextContainerRight}>
                 <Text style={[styles.foodListName, { textAlign: 'right' }]} numberOfLines={2}>{item.to.name}</Text>
                 <Text style={[styles.foodListKcal, { textAlign: 'right' }]}>{Math.round(item.to.nutrients_per_100.kcal)} kcal</Text>
              </View>
              <CircularScoreRing percentage={item.to.health_score} size={44} strokeWidth={4} />
           </TouchableOpacity>
        </View>

        <View style={styles.cardDivider} />

        <View style={globalStyles.rowBetween}>
          <Text style={styles.swapDetailsText}>{item.details}</Text>
          <View style={globalStyles.row}>
            {trackable && (
              <TouchableOpacity style={styles.smallHeartButton} onPress={() => handleRejectSwap(item)}>
                <Ionicons name="close-circle-outline" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.smallHeartButton} onPress={() => toggleFavorite('swap', item.id)}>
              <Ionicons name={isFav ? "heart" : "heart-outline"} size={18} color={isFav ? "#FF3B30" : COLORS.textMuted} />
            </TouchableOpacity>
            <View style={styles.percentBadge}>
              <Text style={styles.percentBadgeText}>+{item.improvement} pt</Text>
            </View>
            <TouchableOpacity onPress={() => toggleItem(item.id)} style={{ marginLeft: 8 }}>
              <Ionicons
                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.statRow}>
              <Text style={styles.statName}>Score difference</Text>
              <Text style={[styles.statValue, { color: COLORS.scoreRed }]}>{item.from.health_score} pt</Text>
              <Text style={[styles.statValue, { color: COLORS.scoreGreen }]}>{item.to.health_score} pt</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statName}>Energy (100g)</Text>
              <Text style={styles.statValue}>{Math.round(item.from.nutrients_per_100.kcal)} kcal</Text>
              <Text style={[styles.statValue, { color: COLORS.scoreGreen }]}>{Math.round(item.to.nutrients_per_100.kcal)} kcal</Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={globalStyles.safeArea}>
      <GlassHeader title="Swaps" onSearchPress={() => setSearchVisible(true)} scrollY={scrollY} />
      <Animated.ScrollView
        style={globalStyles.container}
        contentInset={{ 
          top: Platform.OS === 'ios' ? headerHeight : 0,
          bottom: Platform.OS === 'ios' ? 100 : 0
        }}
        contentOffset={{ 
          x: 0, 
          y: Platform.OS === 'ios' ? -headerHeight : 0 
        }}
        contentContainerStyle={{ 
          paddingHorizontal: 20, 
          paddingBottom: Platform.OS === 'android' ? 100 : 0, 
          paddingTop: Platform.OS === 'android' ? headerHeight + 12 : 12 
        }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {scans.length === 0 ? (
          <View style={[globalStyles.card, { padding: 40, alignItems: 'center', marginTop: 20, marginBottom: 32 }]}>
            <Ionicons name="receipt-outline" size={48} color={COLORS.border} />
            <Text style={{ marginTop: 16, fontSize: 18, fontWeight: '700', color: COLORS.textPrimary }}>
              No scan history yet
            </Text>
            <Text style={{ marginTop: 8, color: COLORS.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 22, marginBottom: 24 }}>
              Scan your first receipt to see personalized swaps here.
            </Text>
            <TouchableOpacity 
              style={{ backgroundColor: COLORS.primaryGreen, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 }}
              onPress={() => router.push('/scan-receipt')}
            >
              <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 16 }}>Scan Receipt</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[globalStyles.subtitle, { marginBottom: 16, marginTop: 4 }]}>Smart Swaps for You</Text>
            <View style={{ marginBottom: 24, marginHorizontal: -20 }}>
              {visibleTopSwapObjects.length > 0 ? (
                <CoverFlowCarousel
                  data={visibleTopSwapObjects}
                  keyExtractor={(item) => item.id}
                  renderItem={(item) => renderSwapCard(item, true, true)}
                />
              ) : (
                <View style={{ padding: 40, alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, marginHorizontal: 20 }}>
                  <Text style={{ color: COLORS.textMuted, textAlign: 'center', lineHeight: 22 }}>
                    {swapsLoading
                      ? 'Finding your smart swaps...'
                      : "You already have the best options for your recent purchases - nothing better to swap in right now!"}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Section: Favorized Swaps */}
        <View style={[globalStyles.rowBetween, { marginTop: 12, marginBottom: 12 }]}>
          <Text style={styles.recommendedTitle}>Favorized Swaps</Text>
          <View style={globalStyles.row}>
            {/* Filter Badge */}
            <TouchableOpacity style={styles.filterBadge} onPress={openDietaryPicker}>
              <Ionicons name="leaf-outline" size={12} color={COLORS.primaryGreen} style={{ marginRight: 4 }} />
              <Text style={styles.filterText}>{currentPreference}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Favorized Swaps List */}
        <View style={styles.swapsList}>
          {favoritedSwapsList.length === 0 ? (
            <View style={{ padding: 40, alignItems: 'center' }}>
              <Ionicons name="heart-outline" size={40} color={COLORS.border} />
              <Text style={{ marginTop: 12, color: COLORS.textMuted, fontWeight: '500', textAlign: 'center', lineHeight: 22 }}>
                You haven't favorized any swaps yet. Tap the heart on a swap to save it here!
              </Text>
            </View>
          ) : (
            favoritedSwapsList.map((item) => renderSwapCard(item, false, false))
          )}
        </View>
      </Animated.ScrollView>

      <SearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} mode="swaps" />
    </View>
  );
}

const styles = StyleSheet.create({
  swapCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  swapColRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  swapTextContainerLeft: {
    marginLeft: 10,
    flex: 1,
  },
  swapTextContainerRight: {
    marginRight: 10,
    flex: 1,
    alignItems: 'flex-end',
  },
  foodListName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    lineHeight: 18,
    marginBottom: 4,
  },
  foodListKcal: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: COLORS.primaryGreen,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  swapDetailsText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    flex: 1,
    paddingRight: 8,
  },
  smallHeartButton: {
    padding: 4,
    marginRight: 6,
  },
  percentBadge: {
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  percentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryGreen,
  },
  expandedContent: {
    marginTop: 12,
    backgroundColor: '#F5F7F5',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFEA',
  },
  statName: {
    flex: 1.5,
    fontSize: 12,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  statValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right',
    color: COLORS.textPrimary,
  },
  recommendedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  filterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  filterText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryGreen,
  },
  swapsList: {
    marginTop: 4,
  },
});

