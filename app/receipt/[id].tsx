import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, TextInput, LayoutAnimation, UIManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS, globalStyles } from '../../styles';
import { StorageService, ScanRecord } from '../services/storage';
import { OverrideStore } from '../services/overrideStore';
import { ReceiptItemList } from '../../components/ReceiptItemList';
import { FoodItem } from '../types';
import { useInventory } from '../context/InventoryContext';
import { SearchModal } from '../../components/SearchModal';
import { NutrientRow } from '../../components/NutrientRow';
import { useProfile } from '../context/ProfileContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const MICRO_TARGETS = {
  calcium_mg: 1000, iron_mg: 14, magnesium_mg: 375, potassium_mg: 2000,
  zinc_mg: 10, vitamin_c_mg: 80, vitamin_d_ug: 5, vitamin_a_ug: 800,
  vitamin_e_mg: 12, vitamin_b1_mg: 1.1, vitamin_b2_mg: 1.4, vitamin_b6_mg: 1.4,
  vitamin_b12_ug: 2.5, niacin_mg: 16, folate_ug: 200, phosphorus_mg: 700,
  sodium_mg: 2000, iodide_ug: 150,
};

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { refreshInventory } = useInventory();
  const { profile, targetCalories } = useProfile();
  
  const [scan, setScan] = useState<ScanRecord | null>(null);
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [macrosExpanded, setMacrosExpanded] = useState(false);
  const [microsExpanded, setMicrosExpanded] = useState(false);
  
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState('');

  useEffect(() => {
    StorageService.getScans().then(scans => {
      const found = scans.find(s => s.id === id);
      if (found) {
        setScan(found);
        setEditTitleText(found.recipeName || 'Shopping List');
      }
    });
  }, [id]);

  const saveScanUpdates = async (updatedScan: ScanRecord) => {
    setScan(updatedScan);
    await StorageService.updateScan(updatedScan.id, updatedScan);
    await refreshInventory();
  };

  const handleUpdateItem = async (index: number, newFood: FoodItem) => {
    if (!scan) return;
    const newItems = [...scan.items];
    const correctedItem = newItems[index];
    newItems[index] = { ...correctedItem, matchedFood: newFood, confidence: 1.0 };
    OverrideStore.set(correctedItem.rawText, newFood.id);
    await recalculateAndUpdate(newItems);
  };

  const handleDeleteItem = async (index: number) => {
    if (!scan) return;
    const newItems = scan.items.filter((_, i) => i !== index);
    await recalculateAndUpdate(newItems);
  };

  const handleAddItem = async (food: FoodItem) => {
    if (!scan) return;
    const newItem = {
      id: Math.random().toString(36).substring(2, 15),
      rawText: food.name,
      matchedFood: food,
      confidence: 1.0,
      source: 'local',
      quantity: 100,
      unit: 'g'
    } as any;
    const newItems = [...scan.items, newItem];
    await recalculateAndUpdate(newItems);
    setSearchModalVisible(false);
  };

  const recalculateAndUpdate = async (newItems: any[]) => {
    if (!scan) return;
    let totalScore = 0;
    let matchedCount = 0;
    for (const item of newItems) {
      if (item.matchedFood || item.food) {
        const f = item.matchedFood || item.food;
        totalScore += f.health_score;
        matchedCount++;
      }
    }
    const averageScore = matchedCount > 0 ? Math.round(totalScore / matchedCount) : 0;
    const updatedScan = { ...scan, items: newItems, averageScore };
    await saveScanUpdates(updatedScan);
  };

  const handleDeleteList = async () => {
    if (!scan) return;
    await StorageService.deleteScan(scan.id);
    await refreshInventory();
    router.back();
  };

  const handleTitleSave = async () => {
    setIsEditingTitle(false);
    if (scan && editTitleText.trim() !== scan.recipeName) {
      const updatedScan = { ...scan, recipeName: editTitleText.trim() };
      await saveScanUpdates(updatedScan);
    }
  };

  const totals = useMemo(() => {
    if (!scan) return null;
    let kcal = 0, protein = 0, carbs = 0, sugars = 0, fat = 0, satFat = 0, fiber = 0, salt = 0;
    const micros: Record<string, number> = {};

    scan.items.forEach(item => {
      const f = item.matchedFood || (item as any).food;
      if (f) {
        const factor = (item.quantity || 100) / 100;
        kcal += f.nutrients_per_100.energy_kcal * factor;
        protein += f.nutrients_per_100.protein_g * factor;
        carbs += f.nutrients_per_100.carbohydrates_g * factor;
        sugars += f.nutrients_per_100.sugars_g * factor;
        fat += f.nutrients_per_100.fat_g * factor;
        satFat += f.nutrients_per_100.saturated_fat_g * factor;
        fiber += f.nutrients_per_100.fiber_g * factor;
        salt += f.nutrients_per_100.salt_g * factor;
        
        Object.entries(f.nutrients_per_100).forEach(([k, v]) => {
          if (k.endsWith('_mg') || k.endsWith('_ug')) {
            micros[k] = (micros[k] || 0) + ((v as number) * factor);
          }
        });
      }
    });

    return { kcal, protein_g: protein, carbs_g: carbs, sugars_g: sugars, fat_g: fat, saturated_fat_g: satFat, fiber_g: fiber, salt_g: salt, micros };
  }, [scan]);

  if (!scan) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const formattedDate = new Date(scan.date).toLocaleDateString('en-US', { 
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' 
  });

  const targetMacros = {
    protein: targetCalories * 0.2 / 4,
    carbs: targetCalories * 0.5 / 4,
    sugars: targetCalories * 0.1 / 4,
    fat: targetCalories * 0.3 / 9,
    satFat: targetCalories * 0.1 / 9,
    fiber: 30,
    salt: 6,
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={28} color={COLORS.textPrimary} />
        </TouchableOpacity>
        {scan.isShoppingList && isEditingTitle ? (
          <TextInput
            style={styles.headerTitleEdit}
            value={editTitleText}
            onChangeText={setEditTitleText}
            onBlur={handleTitleSave}
            onSubmitEditing={handleTitleSave}
            autoFocus
            returnKeyType="done"
          />
        ) : (
          <TouchableOpacity 
            style={globalStyles.row}
            onPress={() => { if (scan.isShoppingList) setIsEditingTitle(true) }}
            disabled={!scan.isShoppingList}
          >
            <Text style={styles.headerTitle}>{scan.isShoppingList ? (scan.recipeName || 'Shopping List') : 'Receipt Details'}</Text>
            {scan.isShoppingList && (
              <Ionicons name="pencil" size={16} color={COLORS.textMuted} style={{ marginLeft: 8 }} />
            )}
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[
          styles.summaryCard, 
          scan.isShoppingList && { backgroundColor: '#F0F8FF', borderColor: '#B3E0FF' }
        ]}>
          <Text style={styles.dateText}>{formattedDate}</Text>
          <View style={styles.scoreRow}>
            <Text style={styles.summaryLabel}>Overall Health Score</Text>
            <Text style={styles.summaryScore}>{scan.averageScore} / 100</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Items ({scan.items.length})</Text>
        <ReceiptItemList items={scan.items} onUpdateItem={handleUpdateItem} onDeleteItem={handleDeleteItem} isShoppingList={scan.isShoppingList} />

        {scan.isShoppingList && (
          <TouchableOpacity style={styles.addItemBtn} onPress={() => setSearchModalVisible(true)}>
            <Ionicons name="add-circle-outline" size={20} color={COLORS.primaryGreen} />
            <Text style={styles.addItemText}>Add Item via Search</Text>
          </TouchableOpacity>
        )}

        {scan.isShoppingList && totals && (
          <View style={{ marginTop: 24 }}>
            <Text style={styles.sectionTitle}>List Nutrition</Text>
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
                <NutrientRow label="Calories"       value={totals.kcal}             target={targetCalories}       unit=" kcal" isLowerBetter={true} />
                <NutrientRow label="Protein"        value={totals.protein_g}        target={targetMacros.protein}  unit="g"     isLowerBetter={false} />
                <NutrientRow label="Carbs"          value={totals.carbs_g}          target={targetMacros.carbs}    unit="g"     isLowerBetter={true} />
                <NutrientRow label="Sugars"         value={totals.sugars_g}         target={targetMacros.sugars}   unit="g"     isLowerBetter={true} />
                <NutrientRow label="Fat"            value={totals.fat_g}            target={targetMacros.fat}      unit="g"     isLowerBetter={true} />
                <NutrientRow label="Saturated Fat"  value={totals.saturated_fat_g}  target={targetMacros.satFat}   unit="g"     isLowerBetter={true} />
                <NutrientRow label="Fiber"          value={totals.fiber_g}          target={targetMacros.fiber}    unit="g"     isLowerBetter={false} />
                <NutrientRow label="Salt"           value={totals.salt_g}           target={targetMacros.salt}     unit="g"     isLowerBetter={true} />
              </View>
            )}

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
              <NutrientRow label="Calcium"     value={totals.micros.calcium_mg || 0}     target={MICRO_TARGETS.calcium_mg}     unit="mg" isLowerBetter={false} />
              <NutrientRow label="Iron"        value={totals.micros.iron_mg || 0}        target={MICRO_TARGETS.iron_mg}        unit="mg" isLowerBetter={false} />
              <NutrientRow label="Magnesium"   value={totals.micros.magnesium_mg || 0}   target={MICRO_TARGETS.magnesium_mg}   unit="mg" isLowerBetter={false} />
              <NutrientRow label="Potassium"   value={totals.micros.potassium_mg || 0}   target={MICRO_TARGETS.potassium_mg}   unit="mg" isLowerBetter={false} />
              <NutrientRow label="Zinc"        value={totals.micros.zinc_mg || 0}        target={MICRO_TARGETS.zinc_mg}        unit="mg" isLowerBetter={false} />
              <NutrientRow label="Vitamin C"   value={totals.micros.vitamin_c_mg || 0}   target={MICRO_TARGETS.vitamin_c_mg}   unit="mg" isLowerBetter={false} />
              <NutrientRow label="Vitamin D"   value={totals.micros.vitamin_d_ug || 0}   target={MICRO_TARGETS.vitamin_d_ug}   unit="μg" isLowerBetter={false} />
              <NutrientRow label="Vitamin A"   value={totals.micros.vitamin_a_ug || 0}   target={MICRO_TARGETS.vitamin_a_ug}   unit="μg" isLowerBetter={false} />
              <NutrientRow label="Vitamin E"   value={totals.micros.vitamin_e_mg || 0}   target={MICRO_TARGETS.vitamin_e_mg}   unit="mg" isLowerBetter={false} />
              <NutrientRow label="Vitamin B1"  value={totals.micros.vitamin_b1_mg || 0}  target={MICRO_TARGETS.vitamin_b1_mg}  unit="mg" isLowerBetter={false} />
              <NutrientRow label="Vitamin B2"  value={totals.micros.vitamin_b2_mg || 0}  target={MICRO_TARGETS.vitamin_b2_mg}  unit="mg" isLowerBetter={false} />
              <NutrientRow label="Vitamin B6"  value={totals.micros.vitamin_b6_mg || 0}  target={MICRO_TARGETS.vitamin_b6_mg}  unit="mg" isLowerBetter={false} />
              <NutrientRow label="Vitamin B12" value={totals.micros.vitamin_b12_ug || 0} target={MICRO_TARGETS.vitamin_b12_ug} unit="μg" isLowerBetter={false} />
              <NutrientRow label="Niacin"      value={totals.micros.niacin_mg || 0}      target={MICRO_TARGETS.niacin_mg}      unit="mg" isLowerBetter={false} />
              <NutrientRow label="Folate"      value={totals.micros.folate_ug || 0}      target={MICRO_TARGETS.folate_ug}      unit="μg" isLowerBetter={false} />
              <NutrientRow label="Phosphorus"  value={totals.micros.phosphorus_mg || 0}  target={MICRO_TARGETS.phosphorus_mg}  unit="mg" isLowerBetter={false} />
              <NutrientRow label="Sodium"      value={totals.micros.sodium_mg || 0}      target={MICRO_TARGETS.sodium_mg}      unit="mg" isLowerBetter={true} />
              <NutrientRow label="Iodine"      value={totals.micros.iodide_ug || 0}      target={MICRO_TARGETS.iodide_ug}      unit="μg" isLowerBetter={false} />
            </View>
            )}
          </View>
        )}

        {scan.isShoppingList && (
          <TouchableOpacity style={styles.deleteListBtn} onPress={handleDeleteList}>
            <Ionicons name="trash-outline" size={18} color="#FF3B30" />
            <Text style={styles.deleteListText}>Delete Shopping List</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <SearchModal
        visible={searchModalVisible}
        onClose={() => setSearchModalVisible(false)}
        mode="foods"
        onSelect={handleAddItem}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAF9',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  headerTitleEdit: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryGreen,
    paddingVertical: 4,
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  summaryScore: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primaryGreen,
  },
  deleteListBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 40,
    backgroundColor: '#FFF0F0',
    paddingVertical: 14,
    borderRadius: 12,
  },
  deleteListText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  addItemBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    backgroundColor: COLORS.lightGreenBg,
    paddingVertical: 14,
    borderRadius: 12,
  },
  addItemText: {
    color: COLORS.primaryGreen,
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
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
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  microsToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: COLORS.lightGreenBg,
    borderRadius: 12,
    marginBottom: 16,
  },
  microsToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primaryGreen,
    marginLeft: 8,
  },
});
