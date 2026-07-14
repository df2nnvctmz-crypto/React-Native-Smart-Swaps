import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../styles';

interface RecommendedCardProps {
  title: string;
  score: number;
  calories: string;
  iconName?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
}

export const RecommendedCard: React.FC<RecommendedCardProps> = ({
  title,
  score,
  calories,
  iconName = "leaf",
  onPress,
}) => {
  // Color code based on score
  const getScoreColor = (val: number) => {
    if (val >= 75) return COLORS.scoreGreen;
    if (val >= 50) return COLORS.scoreYellow;
    return COLORS.scoreRed;
  };

  const scoreColor = getScoreColor(score);

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {/* Circle Score Indicator with floating Category Icon */}
      <View style={styles.indicatorContainer}>
        <View style={[styles.scoreRing, { borderColor: scoreColor }]}>
          <Text style={[styles.scoreText, { color: scoreColor }]}>{score}</Text>
        </View>
        <View style={styles.miniBadge}>
          <Ionicons name={iconName} size={10} color={COLORS.primaryGreen} />
        </View>
      </View>

      {/* Food Title */}
      <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
        {title}
      </Text>

      {/* Calories */}
      <Text style={styles.calories} numberOfLines={1}>
        {calories}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 20,
    padding: 14,
    width: 135,
    marginRight: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 6, // space for shadow
  },
  indicatorContainer: {
    position: 'relative',
    marginBottom: 10,
  },
  scoreRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  scoreText: {
    fontSize: 16,
    fontWeight: '800',
  },
  miniBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: COLORS.lightGreenBg,
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.white,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginBottom: 2,
    width: '100%',
  },
  calories: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
});
