import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../styles';

interface SpotlightCardProps {
  title: string;
  score: number;
  categoryLabel: string;
  iconName: keyof typeof Ionicons.glyphMap;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  isHighlighted?: boolean;
}

export const SpotlightCard: React.FC<SpotlightCardProps> = ({
  title,
  score,
  categoryLabel,
  iconName,
  calories,
  protein,
  carbs,
  fat,
  isHighlighted,
}) => {
  return (
    <View style={[styles.card, isHighlighted && styles.highlightedCard]}>
      {/* Header */}
      <View style={styles.categoryHeader}>
        <Ionicons name={iconName} size={14} color={COLORS.primaryGreen} />
        <Text style={styles.categoryLabel}>{categoryLabel}</Text>
      </View>

      {/* Title & Score */}
      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.scoreCircle}>
          <Text style={styles.scoreText}>{score}</Text>
        </View>
      </View>

      {/* Macros Row */}
      <View style={[styles.macrosContainer, isHighlighted && styles.highlightedMacrosContainer]}>
        <View style={styles.macroBlock}>
          <Text style={styles.macroValue}>{calories.split(' ')[0]}</Text>
          <Text style={styles.macroLabel}>Calories</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.macroBlock}>
          <Text style={styles.macroValue}>{protein}</Text>
          <Text style={styles.macroLabel}>Protein</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.macroBlock}>
          <Text style={styles.macroValue}>{carbs}</Text>
          <Text style={styles.macroLabel}>Carbs</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.macroBlock}>
          <Text style={styles.macroValue}>{fat}</Text>
          <Text style={styles.macroLabel}>Fat</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 24,
    padding: 20,
    marginBottom: 6,
    // Native iOS SwiftUI shadow emulation: highly dispersed, low opacity
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  highlightedCard: {
    backgroundColor: '#EBF3EC', // COLORS.lightGreenBg equivalent, or slightly darker green
    borderColor: '#D4E5D8',
    borderWidth: 1,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryGreen,
    letterSpacing: 0.8,
    marginLeft: 6,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.textPrimary,
    flex: 1,
    paddingRight: 10,
  },
  scoreCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 4,
    borderColor: COLORS.primaryGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primaryGreen,
  },
  macrosContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: COLORS.inputBackground,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
  },
  highlightedMacrosContainer: {
    backgroundColor: COLORS.cardBackground,
  },
  macroBlock: {
    alignItems: 'center',
  },
  macroValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  macroLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  divider: {
    width: 1,
    backgroundColor: COLORS.borderDark,
    height: '100%',
  },
});
