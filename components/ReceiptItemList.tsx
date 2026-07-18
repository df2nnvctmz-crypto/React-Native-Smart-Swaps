import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { COLORS } from '../styles';
import { ParsedReceiptItem } from '../app/engine/receiptParser';
import { FoodItem } from '../app/types';
import { useFoods } from '../app/useFoods';
import { useProfile } from '../app/context/ProfileContext';
import { findBestSwaps } from '../app/engine/swapAlgorithm';
import { SearchModal } from './SearchModal';
import * as Haptics from 'expo-haptics';

interface ReceiptItemListProps {
  items: ParsedReceiptItem[];
  onUpdateItem: (index: number, newFood: FoodItem) => void;
}

export const ReceiptItemList: React.FC<ReceiptItemListProps> = ({ items, onUpdateItem }) => {
  const router = useRouter();
  const { allFoods, foods } = useFoods();
  const { profile } = useProfile();
  
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const safeFoods = foods.length > 0 ? foods : allFoods;

  const confident: { item: ParsedReceiptItem; originalIndex: number }[] = [];
  const potential: { item: ParsedReceiptItem; originalIndex: number }[] = [];
  const notFound: { item: ParsedReceiptItem; originalIndex: number }[] = [];

  items.forEach((item, index) => {
    if (!item.matchedFood || item.confidence < 0.45) {
      notFound.push({ item, originalIndex: index });
    } else if (item.confidence > 0.72) {
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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingIndex(index);
  };

  const renderItemRow = ({ item, originalIndex }: { item: ParsedReceiptItem; originalIndex: number }) => {
    let swapLine = null;
    if (item.matchedFood) {
      const bestSwaps = findBestSwaps(item.matchedFood, safeFoods, 1, profile.dietaryPreference);
      if (bestSwaps.length > 0) {
        const swap = bestSwaps[0];
        const improvement = swap.candidate.health_score - item.matchedFood.health_score;
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
          <View style={styles.infoContainer}>
            <Text style={styles.foodName} numberOfLines={1}>
              {(item.matchedFood && item.confidence >= 0.45) ? item.matchedFood.name : item.rawText}
            </Text>
            <Text style={styles.rawTextScan} numberOfLines={1}>Scanned: "{item.rawText}"</Text>
          </View>

          <View style={styles.actionsContainer}>
            {item.matchedFood && item.confidence >= 0.45 ? (
              <Text style={styles.scoreText}>{item.matchedFood.health_score}</Text>
            ) : (
              <Text style={[styles.scoreText, { color: '#999' }]}>-</Text>
            )}
            
            <TouchableOpacity 
              style={styles.editBtn} 
              onPress={() => handleEditPress(originalIndex)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="pencil-outline" size={16} color={COLORS.textMuted} />
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

  return (
    <View style={styles.container}>
      {renderSection('Confident Matches', confident)}
      {renderSection('Potential Matches', potential)}
      {renderSection('Not Found', notFound)}

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
  rawTextScan: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
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

