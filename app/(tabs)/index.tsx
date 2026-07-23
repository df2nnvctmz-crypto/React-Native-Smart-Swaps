import React, { useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Platform,
  UIManager,
  ActionSheetIOS,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, globalStyles } from '../../styles';
import { HealthPointsCard } from '../../components/HealthPointsCard';
import { SpotlightCard } from '../../components/SpotlightCard';
import { RecommendedCard } from '../../components/RecommendedCard';
import { CoverFlowCarousel } from '../../components/CoverFlowCarousel';
import { GlassHeader, LargeTitle, HEADER_CONTENT_HEIGHT } from '../../components/GlassHeader';
import { SearchModal } from '../../components/SearchModal';
import { NutritionModal } from '../../components/NutritionModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFoods } from '../useFoods';
import { useProfile, DietaryPreference } from '../context/ProfileContext';
import { useInventory } from '../context/InventoryContext';
import { StorageService, ScanRecord } from '../services/storage';
import { findBestSwaps } from '../engine/swapAlgorithm';
import { FoodItem } from '../types';

export default function TodayTab() {
  const router = useRouter();
  const [searchVisible, setSearchVisible] = useState(false);
  const [nutritionModalVisible, setNutritionModalVisible] = useState(false);
  const { profile, updateProfile, targetCalories } = useProfile();
  const { shoppingLists, scans } = useInventory();
  const currentPreference = profile.dietaryPreference[0] || 'Balanced';

  const totalPoints = scans.reduce((acc, scan) => acc + scan.averageScore, 0);
  const avgWeeklyPoints = scans.length > 0 ? Math.round(totalPoints / scans.length) : 0;

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
  const { foods, allFoods, getIconForCategory, isLoaded } = useFoods();

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

  const { spotlightItem, carouselItems, initialScrollIndex } = useMemo(() => {
    let items: FoodItem[] = [];

    if (uniquePurchasedFoods.length > 0) {
      const safeFoods = foods.length > 0 ? foods : allFoods;
      const candidatesMap = new Map<string, FoodItem>();
      for (const badFood of uniquePurchasedFoods) {
        const bestSwaps = findBestSwaps(badFood, safeFoods, 2, profile.dietaryPreference);
        for (const swap of bestSwaps) {
          if (!candidatesMap.has(swap.candidate.id)) {
             candidatesMap.set(swap.candidate.id, swap.candidate);
          }
        }
      }
      items = Array.from(candidatesMap.values());
    }

    if (items.length < 5) {
      // Fallback: fill with random healthy foods
      const healthyFoods = foods.filter(f => f.health_score >= 60 && !items.some(i => i.id === f.id));
      const shuffled = [...healthyFoods].sort(() => 0.5 - Math.random());
      items = [...items, ...shuffled.slice(0, 5 - items.length)];
    }

    // Limit to 5
    items = items.slice(0, 5);

    const spotlight = items[0] || foods[0]; // fallback
    const recommendedItems = items.slice(1);
    
    // Combine items: put spotlight in the middle of recommended items
    const centerIndex = Math.floor(recommendedItems.length / 2);
    const finalItems = spotlight 
      ? [...recommendedItems.slice(0, centerIndex), spotlight, ...recommendedItems.slice(centerIndex)] 
      : recommendedItems;
      
    return {
      spotlightItem: spotlight,
      carouselItems: finalItems,
      initialScrollIndex: spotlight ? centerIndex : 0
    };
  }, [foods, allFoods, uniquePurchasedFoods, profile.dietaryPreference]);

  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;

  if (!isLoaded) {
    return (
      <View style={[globalStyles.safeArea, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.primaryGreen} />
      </View>
    );
  }

  return (
    <View style={globalStyles.safeArea}>
      <GlassHeader 
        title="Groceries" 
        onSettingsPress={() => router.push('/settings')} 
        scrollY={scrollY}
      />
      <Animated.ScrollView
        style={globalStyles.container}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingBottom: 120,
          paddingTop: headerHeight + 8
        }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        <LargeTitle title="Groceries" scrollY={scrollY} />

        <View style={[globalStyles.rowBetween, { marginBottom: 6 }]}>
            <Text style={globalStyles.subtitle}>Smart Nutrition Guide</Text>
            {/* Calorie Badge */}
            <TouchableOpacity style={styles.kcalBadge} onPress={() => setNutritionModalVisible(true)}>
              <Ionicons name="flame" size={14} color={COLORS.primaryGreen} />
              <Text style={styles.kcalText}>{targetCalories.toLocaleString('de-DE')} kcal</Text>
            </TouchableOpacity>
          </View>

          {/* Personalise Badge */}
          <TouchableOpacity style={[styles.personaliseButton, { marginBottom: 16 }]} onPress={() => router.push('/settings')}>
            <Ionicons name="options-outline" size={14} color={COLORS.primaryGreen} />
            <Text style={styles.personaliseText}>
              Personalise • {profile.dietaryPreference.includes('Balanced') ? 'Recommended' : profile.dietaryPreference.join(', ')}
            </Text>
          </TouchableOpacity>

        {/* Card 1: Health Points */}
        <HealthPointsCard 
          percentage={avgWeeklyPoints} 
          onScanPress={() => router.push('/scan-receipt')} 
        />

        {/* Shopping Lists Section */}
        {shoppingLists.length > 0 && (
          <View style={{ marginTop: 16, marginBottom: 12 }}>
            <Text style={globalStyles.sectionTitle}>Your Shopping Lists</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 20 }}>
              {shoppingLists.map(list => {
                const previewFoods = list.items.map(i => i.matchedFood || (i as any).food).filter(Boolean).slice(0, 3);
                return (
                  <TouchableOpacity 
                    key={list.id} 
                    style={[styles.shoppingListCard, { width: 280, marginRight: 16, marginBottom: 0 }]}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/receipt/${list.id}`)}
                  >
                    <View style={globalStyles.rowBetween}>
                      <View style={globalStyles.row}>
                        <View style={styles.basketIconBox}>
                          <Ionicons name="basket" size={24} color={'#0084C9'} />
                        </View>
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text style={styles.shoppingListTitleText} numberOfLines={1}>
                            {list.recipeName || 'Shopping List'}
                          </Text>
                          <View style={[globalStyles.row, { marginTop: 4, gap: 6 }]}>
                            <Text style={styles.scanItemsCount}>{list.items.length} items</Text>
                            {previewFoods.length > 0 && (
                              <View style={styles.foodIconsRow}>
                                {previewFoods.map((f, i) => (
                                  <View key={i} style={styles.miniFoodIconBox}>
                                    <Ionicons name={getIconForCategory(f!.category)} size={10} color="#0084C9" />
                                  </View>
                                ))}
                                {list.items.length > 3 && (
                                  <Text style={styles.moreFoodsText}>+{list.items.length - 3}</Text>
                                )}
                              </View>
                            )}
                          </View>
                        </View>
                      </View>
                      <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Food carousel: Spotlight & Recommended Stack */}
        <View style={[globalStyles.rowBetween, { marginTop: 10, marginBottom: 12 }]}>
          <Text style={globalStyles.sectionTitle}>Food carousel</Text>
          {/* Balanced Badge */}
          <TouchableOpacity style={styles.balancedBadge} onPress={openDietaryPicker}>
            <Text style={styles.balancedText}>{currentPreference}</Text>
          </TouchableOpacity>
        </View>

        {/* 3D Cover Flow Carousel replacing the horizontal scroll */}
        <View style={{ marginHorizontal: -20 }}>
          <CoverFlowCarousel
            data={carouselItems}
            initialScrollIndex={initialScrollIndex}
            keyExtractor={(item) => item.id}
            renderItem={(item) => (
              <TouchableOpacity activeOpacity={0.9} onPress={() => router.push(`/food/${item.id}`)}>
                <SpotlightCard
                  title={item.name}
                  score={item.health_score}
                  categoryLabel={item.id === spotlightItem?.id ? "TODAY'S SPOTLIGHT" : "RECOMMENDED"}
                  isHighlighted={item.id === spotlightItem?.id}
                  iconName={getIconForCategory(item.category)}
                  calories={`${Math.round(item.nutrients_per_100.kcal)} kcal / 100g`}
                  protein={`${Math.round(item.nutrients_per_100.protein_g)}g`}
                  carbs={`${Math.round(item.nutrients_per_100.carbs_g)}g`}
                  fat={`${Math.round(item.nutrients_per_100.fat_g)}g`}
                />
              </TouchableOpacity>
            )}
          />
        </View>

      </Animated.ScrollView>

      <SearchModal visible={searchVisible} onClose={() => setSearchVisible(false)} />
      <NutritionModal visible={nutritionModalVisible} onClose={() => setNutritionModalVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingVertical: 12,
    marginBottom: 16,
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
    shadowRadius: 8,
    elevation: 4,
  },
  kcalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  kcalText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryGreenDark,
    marginLeft: 4,
  },
  personaliseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  personaliseText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryGreen,
    marginLeft: 6,
  },
  balancedBadge: {
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  balancedText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryGreen,
  },
  horizontalScroll: {
    paddingRight: 20,
  },
  shoppingListCard: {
    backgroundColor: '#F0FAFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D0EFFF',
  },
  basketIconBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D0EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shoppingListTitleText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#005480',
  },
  scanItemsCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  foodIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    gap: 4,
  },
  miniFoodIconBox: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#D0EFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreFoodsText: {
    fontSize: 11,
    color: '#0084C9',
    fontWeight: '700',
    marginLeft: 2,
  }
});
