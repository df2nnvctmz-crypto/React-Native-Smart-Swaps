import React, { useState, useMemo, useRef } from 'react';
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
import { findBestSwaps } from '../engine/swapAlgorithm';
import { useRouter } from 'expo-router';
import { useProfile, DietaryPreference } from '../context/ProfileContext';
import { SearchModal } from '../../components/SearchModal';
import { GlassHeader, HEADER_CONTENT_HEIGHT } from '../../components/GlassHeader';
import { SwapComparisonCard } from '../../components/SwapComparisonCard';
import { CoverFlowCarousel } from '../../components/CoverFlowCarousel';
import { useFavorites } from '../context/FavoritesContext';
import { FoodItem } from '../types';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function SwapsTab() {
  const [highlightExpanded, setHighlightExpanded] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [searchVisible, setSearchVisible] = useState(false);
  const router = useRouter();
  const { profile, updateProfile } = useProfile();
  const currentPreference = profile.dietaryPreference[0] || 'Balanced';

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

  const { topSwapObjects } = useMemo(() => {
    const badFood = allFoods.find(f => f.health_score < 40 && f.name.toLowerCase().includes('cola')) || 
                    allFoods.find(f => f.health_score < 40 && f.category.toLowerCase().includes('sweet')) || 
                    allFoods.find(f => f.health_score < 40) || 
                    allFoods[0];

    const safeFoods = foods.length > 0 ? foods : allFoods;
    const bestSwaps = findBestSwaps(badFood, safeFoods, 3, profile.dietaryPreference);
    
    const topSwapObjects = bestSwaps.map((swap, index) => ({
      id: `${badFood.id}-${swap.candidate.id}`,
      from: badFood,
      to: swap.candidate,
      improvement: swap.candidate.health_score - badFood.health_score,
      details: `Smart Swap Match (${Math.round(swap.score)} logic points)`,
    }));

    return { topSwapObjects };
  }, [foods, profile.dietaryPreference, allFoods]);

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
        {/* Subtitle */}
        <Text style={[globalStyles.subtitle, { marginBottom: 24, marginTop: 4 }]}>Swipe to see top recommendations</Text>
        
        {/* Top Carousel */}
        <View style={{ marginHorizontal: -20, marginBottom: 24 }}>
          <CoverFlowCarousel
            data={topSwapObjects}
            keyExtractor={(item) => item.id}
            renderItem={(item) => (
              <SwapComparisonCard 
                fromFood={item.from} 
                toFood={item.to} 
                improvement={item.improvement}
                onPressFrom={() => router.push(`/food/${item.from.id}`)}
                onPressTo={() => router.push(`/food/${item.to.id}`)}
              />
            )}
          />
        </View>

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
            favoritedSwapsList.map((item) => {
              const isExpanded = expandedItem === item.id;
              const isFav = isFavorite('swap', item.id);
              return (
                <View key={item.id} style={globalStyles.card}>
                  {/* Main comparison grid */}
                  <View style={styles.swapVisualContainer}>
                    {/* From Col */}
                    <TouchableOpacity style={styles.swapListCol} onPress={() => router.push(`/food/${item.from.id}`)} activeOpacity={0.7}>
                      <Text style={styles.scoreTextFrom}>{item.from.health_score}</Text>
                      <Text style={styles.foodListName} numberOfLines={3}>{item.from.name}</Text>
                      <Text style={styles.foodListKcal}>{Math.round(item.from.nutrients_per_100.kcal)} kcal / 100g</Text>
                    </TouchableOpacity>

                    {/* Arrow Middle */}
                    <View style={styles.arrowContainer}>
                      <TouchableOpacity
                        style={styles.arrowCircle}
                        onPress={() => toggleItem(item.id)}
                      >
                        <Ionicons name="arrow-forward" size={16} color={COLORS.primaryGreen} />
                      </TouchableOpacity>
                    </View>

                    {/* To Col */}
                    <TouchableOpacity style={[styles.swapListCol, { alignItems: 'flex-end' }]} onPress={() => router.push(`/food/${item.to.id}`)} activeOpacity={0.7}>
                      <Text style={styles.scoreTextTo}>{item.to.health_score}</Text>
                      <Text style={[styles.foodListName, { textAlign: 'right' }]} numberOfLines={3}>{item.to.name}</Text>
                      <Text style={styles.foodListKcal}>{Math.round(item.to.nutrients_per_100.kcal)} kcal / 100g</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Card Divider */}
                  <View style={styles.cardDivider} />

                  {/* Footer bar */}
                  <View style={globalStyles.rowBetween}>
                    <Text style={styles.swapDetailsText}>{item.details}</Text>
                    <View style={globalStyles.row}>
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

                  {/* Expanded item details */}
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
            })
          )}
        </View>
      </Animated.ScrollView>

      <SearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} mode="swaps" />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 10,
    marginBottom: 12,
  },
  featuredBadge: {
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  featuredBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primaryGreen,
  },
  improvementBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  improvementText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryGreen,
    marginLeft: 4,
  },
  swapVisualContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  swapItemCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  swapItemName: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
    height: 44,
  },
  fromScorePill: {
    backgroundColor: COLORS.scoreYellowLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
  },
  fromScoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.scoreYellow,
  },
  toScorePill: {
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8,
    alignSelf: 'flex-end',
  },
  toScoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryGreen,
  },
  swapItemKcal: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  arrowContainer: {
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: -16,
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
  },
  cardDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 16,
  },
  toggleText: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '500',
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
  heartButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginRight: 8,
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
  swapListCol: {
    flex: 1.2,
  },
  scoreTextFrom: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.scoreYellow,
    marginBottom: 6,
  },
  scoreTextTo: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.primaryGreen,
    textAlign: 'right',
    marginBottom: 6,
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
});
