import React, { useState, useRef, useMemo } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, globalStyles } from '../../styles';
import { HealthPointsCard } from '../../components/HealthPointsCard';
import { SpotlightCard } from '../../components/SpotlightCard';
import { RecommendedCard } from '../../components/RecommendedCard';
import { CoverFlowCarousel } from '../../components/CoverFlowCarousel';
import { GlassHeader, HEADER_CONTENT_HEIGHT } from '../../components/GlassHeader';
import { SearchModal } from '../../components/SearchModal';
import { NutritionModal } from '../../components/NutritionModal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFoods } from '../useFoods';
import { useProfile, DietaryPreference } from '../context/ProfileContext';

export default function TodayTab() {
  const router = useRouter();
  const [searchVisible, setSearchVisible] = useState(false);
  const [nutritionModalVisible, setNutritionModalVisible] = useState(false);
  const { profile, updateProfile, targetCalories } = useProfile();
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
  const { foods, getIconForCategory } = useFoods();

  const { spotlightItem, carouselItems, initialScrollIndex } = useMemo(() => {
    // Simple random shuffle for the moment, strictly for healthy foods
    const healthyFoods = foods.filter(f => f.health_score >= 60);
    const shuffledFoods = [...healthyFoods].sort(() => 0.5 - Math.random());
    const spotlight = shuffledFoods[0] || foods[0]; // fallback
    const recommendedItems = shuffledFoods.slice(1, 5);
    
    // Combine items: put spotlight in the middle of recommended items so you can swipe both left and right
    const centerIndex = Math.floor(recommendedItems.length / 2);
    const items = spotlight 
      ? [...recommendedItems.slice(0, centerIndex), spotlight, ...recommendedItems.slice(centerIndex)] 
      : recommendedItems;
      
    return {
      spotlightItem: spotlight,
      carouselItems: items,
      initialScrollIndex: spotlight ? centerIndex : 0
    };
  }, [foods]);

  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;

  return (
    <View style={globalStyles.safeArea}>
      <GlassHeader 
        title="Groceries" 
        onSearchPress={() => setSearchVisible(true)} 
        onProfilePress={() => router.push('/profile')} 
        scrollY={scrollY}
      />
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
          paddingTop: Platform.OS === 'android' ? headerHeight : 0 
        }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        <View style={[globalStyles.rowBetween, { marginBottom: 6 }]}>
            <Text style={globalStyles.subtitle}>Smart Nutrition Guide</Text>
            {/* Calorie Badge */}
            <TouchableOpacity style={styles.kcalBadge} onPress={() => setNutritionModalVisible(true)}>
              <Ionicons name="flame" size={14} color={COLORS.primaryGreen} />
              <Text style={styles.kcalText}>{targetCalories.toLocaleString('de-DE')} kcal</Text>
            </TouchableOpacity>
          </View>

          {/* Personalise Badge */}
          <TouchableOpacity style={[styles.personaliseButton, { marginBottom: 16 }]} onPress={() => router.push('/profile')}>
            <Ionicons name="options-outline" size={14} color={COLORS.primaryGreen} />
            <Text style={styles.personaliseText}>
              Personalise • {profile.dietaryPreference.includes('Balanced') ? 'Recommended' : profile.dietaryPreference.join(', ')}
            </Text>
          </TouchableOpacity>

        {/* Card 1: Health Points */}
        <HealthPointsCard 
          percentage={0} 
          onScanPress={() => router.replace('/bills')} 
        />

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
});
