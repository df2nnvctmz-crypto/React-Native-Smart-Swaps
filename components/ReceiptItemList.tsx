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

  // Sort items: Verified (confidence > 0.6) first, then Possible (<= 0.6 and > 0.3), then Not found (<= 0.3)
  const sortedItems = [...items].map((item, originalIndex) => ({ item, originalIndex })).sort((a, b) => {
    const getSortValue = (it: ParsedReceiptItem) => {
      if (!it.matchedFood || it.confidence < 0.45) return 0; // Not found
      if (it.confidence > 0.72) return 2; // High confidence / Verified
      return 1; // Possible match
    };
    return getSortValue(b.item) - getSortValue(a.item);
  });

  const renderConfidenceIndicator = (confidence: number, hasMatchedFood: boolean) => {
    if (!hasMatchedFood || confidence < 0.45) {
      return (
        <View style={[styles.confidenceTag, { backgroundColor: '#F0F0F0' }]}>
          <View style={[styles.confidenceDot, { backgroundColor: '#999' }]} />
          <Text style={[styles.confidenceText, { color: '#666' }]}>Not found</Text>
        </View>
      );
    }
    if (confidence > 0.72) {
      return (
        <View style={[styles.confidenceTag, { backgroundColor: '#E8F5E9' }]}>
          <View style={[styles.confidenceDot, { backgroundColor: COLORS.primaryGreen }]} />
          <Text style={[styles.confidenceText, { color: COLORS.primaryGreenDark }]}>Verified</Text>
        </View>
      );
    }
    return (
      <View style={[styles.confidenceTag, { backgroundColor: '#FFF8E1' }]}>
        <View style={[styles.confidenceDot, { backgroundColor: '#F5A623' }]} />
        <Text style={[styles.confidenceText, { color: '#D48806' }]}>Possible match</Text>
      </View>
    );
  };

  const handleSelectCorrection = (food: FoodItem) => {
    if (editingIndex !== null) {
      onUpdateItem(editingIndex, food);
      setEditingIndex(null);
    }
  };

  return (
    <View style={styles.container}>
      {sortedItems.map(({ item, originalIndex }) => {
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
                  <Ionicons name="arrow-undo-outline" size={14} color={COLORS.primaryGreen} style={{ transform: [{ scaleX: -1 }] }} />
                  <Text style={styles.swapLineText} numberOfLines={1}>
                    Swap: {swap.candidate.name} <Text style={styles.swapImprovement}>(+{improvement} pt)</Text>
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
                <Text style={styles.foodName} numberOfLines={2}>
                  {item.matchedFood ? item.matchedFood.name : item.rawText}
                </Text>
                {renderConfidenceIndicator(item.confidence, !!item.matchedFood)}
                <Text style={styles.rawTextScan}>Scanned as: "{item.rawText}"</Text>
              </View>

              <View style={styles.actionsContainer}>
                {item.matchedFood ? (
                  <Text style={styles.scoreText}>{item.matchedFood.health_score}</Text>
                ) : (
                  <Text style={[styles.scoreText, { color: '#999' }]}>-</Text>
                )}
                
                <TouchableOpacity 
                  style={styles.editBtn} 
                  onPress={() => setEditingIndex(originalIndex)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="pencil-outline" size={18} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </View>

            {swapLine}
          </View>
        );
      })}

      <SearchModal 
        visible={editingIndex !== null}
        onClose={() => setEditingIndex(null)}
        mode="foods"
        onSelect={handleSelectCorrection}
        rawText={editingIndex !== null ? sortedItems.find(x => x.originalIndex === editingIndex)?.item.rawText : undefined}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
  },
  row: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  infoContainer: {
    flex: 1,
    paddingRight: 12,
  },
  foodName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  confidenceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 4,
  },
  confidenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  rawTextScan: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  actionsContainer: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 50,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primaryGreen,
  },
  editBtn: {
    padding: 4,
  },
  swapLineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  swapLineText: {
    fontSize: 13,
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
