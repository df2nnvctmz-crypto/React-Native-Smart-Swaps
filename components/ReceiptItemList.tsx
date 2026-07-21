import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS, globalStyles } from '../styles';
import { ParsedReceiptItem } from '../app/engine/receiptParser';
import { FoodItem } from '../app/types';
import { useFoods, getIconForCategory } from '../app/useFoods';
import { useProfile } from '../app/context/ProfileContext';
import { findBestSwaps } from '../app/engine/swapAlgorithm';
import { SearchModal } from './SearchModal';
import * as Haptics from 'expo-haptics';

interface ReceiptItemListProps {
  items: ParsedReceiptItem[];
  onUpdateItem: (index: number, newFood: FoodItem) => void;
  onDeleteItem: (index: number) => void;
  isShoppingList?: boolean;
}

export const ReceiptItemList: React.FC<ReceiptItemListProps> = ({ items, onUpdateItem, onDeleteItem, isShoppingList }) => {
  const router = useRouter();
  const { allFoods, foods } = useFoods();
  const { profile } = useProfile();
  
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const safeFoods = foods.length > 0 ? foods : allFoods;

  const confident: { item: ParsedReceiptItem; originalIndex: number }[] = [];
  const potential: { item: ParsedReceiptItem; originalIndex: number }[] = [];
  const notFound: { item: ParsedReceiptItem; originalIndex: number }[] = [];

  items.forEach((item, index) => {
    const f = item.matchedFood || (item as any).food;
    // If confidence is undefined, it means it came from a recipe, so we treat it as confident.
    const confidence = item.confidence !== undefined ? item.confidence : 1.0;

    if (!f || confidence < 0.45) {
      notFound.push({ item, originalIndex: index });
    } else if (confidence > 0.72) {
      confident.push({ item, originalIndex: index });
    } else {
      potential.push({ item, originalIndex: index });
    }
  });

  const handleSelectCorrection = (food: FoodItem) => {
    if (editingIndex !== null) {
      onUpdateItem(editingIndex, food);
      setEditingIndex(null);
    }
  };

  const handleEditPress = (index: number) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    setEditingIndex(index);
  };

  const handleDeletePress = (index: number, label: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    Alert.alert(
      'Remove Item',
      `Remove "${label}" from this receipt?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => onDeleteItem(index) },
      ]
    );
  };

  const renderItemRow = ({ item, originalIndex }: { item: ParsedReceiptItem; originalIndex: number }) => {
    const f = item.matchedFood || (item as any).food;
    const confidence = item.confidence !== undefined ? item.confidence : 1.0;
    
    let swapLine = null;
    if (f) {
      const bestSwaps = findBestSwaps(f, safeFoods, 1, profile.dietaryPreference);
      if (bestSwaps.length > 0) {
        const swap = bestSwaps[0];
        const improvement = swap.candidate.health_score - f.health_score;
        if (improvement > 0) {
          swapLine = (
            <TouchableOpacity 
              style={styles.swapLineContainer}
              onPress={() => router.push(`/food/${swap.candidate.id}`)}
            >
              <Ionicons name="arrow-undo-outline" size={12} color={COLORS.primaryGreen} style={{ transform: [{ scaleX: -1 }] }} />
              <Text style={styles.swapLineText} numberOfLines={1}>
                Swap: {swap.candidate.name} <Text style={styles.swapImprovement}>(+{improvement})</Text>
              </Text>
            </TouchableOpacity>
          );
        }
      }
    }

    return (
      <View key={originalIndex} style={styles.row}>
        <View style={styles.rowTop}>
          <TouchableOpacity 
            style={styles.infoContainer}
            activeOpacity={f && (isShoppingList || confidence >= 0.45) ? 0.7 : 1}
            onPress={() => {
              if (f && (isShoppingList || confidence >= 0.45)) {
                router.push(`/food/${f.id}`);
              }
            }}
          >
              <View style={globalStyles.row}>
                {f && (isShoppingList || confidence >= 0.45) && (
                  <Ionicons 
                    name={getIconForCategory(f.category)} 
                    size={14} 
                    color={COLORS.primaryGreen} 
                    style={{ marginRight: 6 }}
                  />
                )}
                <Text style={styles.foodName} numberOfLines={1}>
                  {(f && confidence >= 0.45)
                    ? (item.source === 'off' && item.displayName ? item.displayName : f.name)
                    : item.rawText}
                </Text>
              </View>
              {item.source === 'off' && f && confidence >= 0.45 && (
                <Text style={styles.nutritionBasis} numberOfLines={1}>
                  Nutrition based on: {f.name}
                </Text>
              )}
            <Text style={styles.rawTextScan} numberOfLines={1}>Scanned: "{item.rawText}"</Text>
          </TouchableOpacity>

          <View style={styles.actionsContainer}>
            <TouchableOpacity
              activeOpacity={f && (isShoppingList || confidence >= 0.45) ? 0.7 : 1}
              onPress={() => {
                if (f && (isShoppingList || confidence >= 0.45)) {
                  router.push(`/food/${f.id}`);
                }
              }}
            >
              {f && confidence >= 0.45 ? (
                <Text style={styles.scoreText}>{f.health_score}</Text>
              ) : (
                <Text style={[styles.scoreText, { color: '#999' }]}>-</Text>
              )}
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => handleEditPress(originalIndex)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="pencil-outline" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => handleDeletePress(originalIndex, f?.name ?? item.rawText)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="trash-outline" size={16} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {swapLine}
      </View>
    );
  };

  const renderSection = (title: string, data: typeof confident) => {
    if (data.length === 0) return null;
    return (
      <View style={styles.sectionContainer}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionList}>
          {data.map(renderItemRow)}
        </View>
      </View>
    );
  };

  const usedOff = items.some(i => i.source === 'off');

  return (
    <View style={styles.container}>
      {isShoppingList ? (
        <View style={styles.sectionContainer}>
          <View style={styles.sectionList}>
            {items.map((item, index) => renderItemRow({ item, originalIndex: index }))}
          </View>
        </View>
      ) : (
        <>
          {renderSection('Confident Matches', confident)}
          {renderSection('Potential Matches', potential)}
          {renderSection('Not Found', notFound)}
        </>
      )}

      {usedOff && (
        <Text style={styles.attribution}>
          Some products identified using Open Food Facts, © contributors, ODbL.
        </Text>
      )}

      <SearchModal
        visible={editingIndex !== null}
        onClose={() => setEditingIndex(null)}
        mode="foods"
        onSelect={handleSelectCorrection}
        rawText={editingIndex !== null ? items[editingIndex].rawText : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  sectionContainer: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionList: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoContainer: {
    flex: 1,
    paddingRight: 12,
  },
  foodName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  nutritionBasis: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
  },
  rawTextScan: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  attribution: {
    fontSize: 10,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 8,
  },
  actionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scoreText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.primaryGreen,
    width: 28,
    textAlign: 'right',
  },
  editBtn: {
    padding: 4,
  },
  swapLineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.border,
  },
  swapLineText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 6,
    flex: 1,
    fontWeight: '500',
  },
  swapImprovement: {
    color: COLORS.primaryGreen,
    fontWeight: '700',
  }
});

