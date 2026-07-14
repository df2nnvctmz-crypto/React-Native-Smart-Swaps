import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform, Animated, Alert } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../styles';
import { useProfile } from '../app/context/ProfileContext';
import { getRecommendedMicros } from '../app/engine/micronutrients';

interface NutritionModalProps {
  visible: boolean;
  onClose: () => void;
}

export const NutritionModal: React.FC<NutritionModalProps> = ({ visible, onClose }) => {
  const { profile, targetCalories, targetMacros, targetMacroPercentages } = useProfile();
  const scaleValue = useRef(new Animated.Value(0.8)).current;
  const opacityValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleValue, {
          toValue: 1,
          friction: 6,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacityValue, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        })
      ]).start();
    } else {
      scaleValue.setValue(0.8);
      opacityValue.setValue(0);
    }
  }, [visible, scaleValue, opacityValue]);
  
  const micronutrients = getRecommendedMicros(profile.sex);

  const renderProgressBar = (color: string, percentage: number) => (
    <View style={styles.progressBarContainer}>
      <View style={[styles.progressBarFill, { backgroundColor: color, width: `${Math.min(percentage * 100, 100)}%` }]} />
    </View>
  );

  const ModalBackground = Platform.OS === 'ios' ? BlurView : View;
  const backgroundProps = Platform.OS === 'ios' ? { intensity: 60, tint: 'dark' as const, style: StyleSheet.absoluteFill } : { style: [StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }] };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <ModalBackground {...backgroundProps} />
        
        <Animated.View style={[styles.modalContainer, { transform: [{ scale: scaleValue }], opacity: opacityValue }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="flame" size={16} color={COLORS.primaryGreen} />
              </View>
              <View>
                <Text style={styles.title}>Daily Nutrient Guide</Text>
                <Text style={styles.subtitle}>BASED ON YOUR PROFILE</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={20} color="#666666" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Daily Budget Card */}
            <View style={styles.budgetCard}>
              <View style={styles.rowBetween}>
                <Text style={styles.budgetLabel}>Daily Budget:</Text>
                <Text style={styles.budgetValue}>{targetCalories.toLocaleString('de-DE')} kcal</Text>
              </View>
              <Text style={styles.budgetDescription}>
                Optimised for: {profile.sex}, {profile.age} yrs, {profile.weight}kg, {profile.height}cm ({profile.activityLevel}) with "{profile.dietaryPreference.join(', ')}" dietary preference.
              </Text>
            </View>

            {/* Macros Section */}
            <Text style={styles.sectionTitle}>MACRONUTRIENT SPLIT</Text>
            
            <View style={styles.macroRow}>
              <View style={styles.rowBetween}>
                <View style={globalStyles.row}>
                  <View style={[styles.dot, { backgroundColor: COLORS.primaryGreen }]} />
                  <Text style={styles.macroName}>Protein</Text>
                  <TouchableOpacity onPress={() => Alert.alert('Protein', 'Protein is essential for building and repairing tissues, including muscle. It also plays a key role in the production of enzymes and hormones.')} style={styles.infoIcon}>
                    <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.macroValue}>{targetMacros.protein}g <Text style={styles.macroPct}>({Math.round(targetMacroPercentages.protein * 100)}%)</Text></Text>
              </View>
              {renderProgressBar(COLORS.primaryGreen, targetMacroPercentages.protein)}
            </View>

            <View style={styles.macroRow}>
              <View style={styles.rowBetween}>
                <View style={globalStyles.row}>
                  <View style={[styles.dot, { backgroundColor: '#FF9500' }]} />
                  <Text style={styles.macroName}>Carbohydrates</Text>
                  <TouchableOpacity onPress={() => Alert.alert('Carbohydrates', 'Carbohydrates are your body\'s primary energy source. They fuel your brain, kidneys, heart muscles, and central nervous system.')} style={styles.infoIcon}>
                    <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.macroValue}>{targetMacros.carbs}g <Text style={styles.macroPct}>({Math.round(targetMacroPercentages.carbs * 100)}%)</Text></Text>
              </View>
              {renderProgressBar('#FF9500', targetMacroPercentages.carbs)}
            </View>

            <View style={styles.macroRow}>
              <View style={styles.rowBetween}>
                <View style={globalStyles.row}>
                  <View style={[styles.dot, { backgroundColor: '#FFCC00' }]} />
                  <Text style={styles.macroName}>Sugars</Text>
                  <TouchableOpacity onPress={() => Alert.alert('Sugars', 'Naturally occurring sugars provide quick energy. However, limiting added sugars is important for heart health and preventing energy crashes.')} style={styles.infoIcon}>
                    <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.macroValue}>{targetMacros.sugars}g <Text style={styles.macroPct}>({Math.round(targetMacroPercentages.sugars * 100)}%)</Text></Text>
              </View>
              {renderProgressBar('#FFCC00', targetMacroPercentages.sugars)}
            </View>

            <View style={styles.macroRow}>
              <View style={styles.rowBetween}>
                <View style={globalStyles.row}>
                  <View style={[styles.dot, { backgroundColor: '#FF2D55' }]} />
                  <Text style={styles.macroName}>Total Fat</Text>
                  <TouchableOpacity onPress={() => Alert.alert('Total Fat', 'Fats provide dense energy, support cell growth, and protect your organs. They also help your body absorb essential fat-soluble vitamins.')} style={styles.infoIcon}>
                    <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.macroValue}>{targetMacros.fat}g <Text style={styles.macroPct}>({Math.round(targetMacroPercentages.fat * 100)}%)</Text></Text>
              </View>
              {renderProgressBar('#FF2D55', targetMacroPercentages.fat)}
            </View>

            <View style={[styles.macroRow, styles.subMacroRow]}>
              <View style={styles.rowBetween}>
                <View style={globalStyles.row}>
                  <View style={[styles.dot, { backgroundColor: '#FF9F0A' }]} />
                  <Text style={styles.macroName}>Saturated Fat</Text>
                  <TouchableOpacity onPress={() => Alert.alert('Saturated Fat', 'While some saturated fat is fine, replacing it with unsaturated fats can help lower cholesterol levels and reduce cardiovascular risks.')} style={styles.infoIcon}>
                    <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.macroValue}>{targetMacros.satFat}g <Text style={styles.macroPct}>({Math.round(targetMacroPercentages.satFat * 100)}%)</Text></Text>
              </View>
              {renderProgressBar('#FF9F0A', targetMacroPercentages.satFat)}
            </View>

            <View style={styles.macroRow}>
              <View style={styles.rowBetween}>
                <View style={globalStyles.row}>
                  <View style={[styles.dot, { backgroundColor: '#32ADE6' }]} />
                  <Text style={styles.macroName}>Dietary Fiber</Text>
                  <TouchableOpacity onPress={() => Alert.alert('Dietary Fiber', 'Fiber aids in digestion and helps regulate blood sugar levels. It also contributes to satiety, keeping you feeling full for longer.')} style={styles.infoIcon}>
                    <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.macroValue}>{targetMacros.fiber}g</Text>
              </View>
            </View>

            <View style={[styles.macroRow, { marginBottom: 24 }]}>
              <View style={styles.rowBetween}>
                <View style={globalStyles.row}>
                  <View style={[styles.dot, { backgroundColor: '#8E8E93' }]} />
                  <Text style={styles.macroName}>Salt</Text>
                  <TouchableOpacity onPress={() => Alert.alert('Salt', 'Salt is necessary for fluid balance and nerve function. However, excess sodium can lead to high blood pressure and strain your heart.')} style={styles.infoIcon}>
                    <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.macroValue}>{targetMacros.salt}g</Text>
              </View>
            </View>

            {/* Micronutrients Section */}
            <Text style={styles.sectionTitle}>RECOMMENDED MICRONUTRIENTS</Text>
            
            {micronutrients.map((micro, index) => (
              <View key={index} style={styles.microCard}>
                <View style={styles.rowBetween}>
                  <View style={globalStyles.row}>
                    <Text style={styles.microName}>{micro.name}</Text>
                    <TouchableOpacity onPress={() => Alert.alert(micro.name, micro.description)} style={styles.infoIcon}>
                      <Ionicons name="information-circle-outline" size={16} color="#8E8E93" />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.microAmount}>{micro.amount} <Text style={styles.microUnit}>{micro.unit}</Text></Text>
                </View>
                <View style={styles.microDivider} />
              </View>
            ))}
            
            <View style={{ height: 24 }} />
          </ScrollView>

          {/* Footer Button */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.primaryButton} onPress={onClose}>
              <Text style={styles.primaryButtonText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20, // Increases padding so modal doesn't fill the screen
  },
  modalContainer: {
    width: '100%',
    maxHeight: '85%', // Prevents filling the entire screen vertically
    backgroundColor: '#FFFFFF', // Force light background for readability
    borderRadius: 24,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 20,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9', // Light green background
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A', // Force dark text
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F2F2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 20,
  },
  budgetCard: {
    backgroundColor: '#F8F9FA',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  budgetLabel: {
    fontSize: 15,
    color: '#666666',
    fontWeight: '500',
  },
  budgetValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  budgetDescription: {
    fontSize: 13,
    color: '#888888',
    lineHeight: 18,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    letterSpacing: 1,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  macroRow: {
    marginBottom: 16,
  },
  subMacroRow: {
    paddingLeft: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  infoIcon: {
    marginLeft: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  macroName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  macroValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  macroPct: {
    color: '#8E8E93',
    fontWeight: '500',
  },
  progressBarContainer: {
    height: 6,
    backgroundColor: '#F2F2F7',
    borderRadius: 3,
    marginTop: 8,
    width: '100%',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  microCard: {
    marginBottom: 16,
  },
  microName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  microAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  microUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666666',
  },
  microDesc: {
    fontSize: 12,
    color: '#888888',
    marginTop: 4,
  },
  microDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginTop: 12,
  },
  footer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    backgroundColor: '#FFFFFF',
  },
  primaryButton: {
    backgroundColor: COLORS.primaryGreen,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
