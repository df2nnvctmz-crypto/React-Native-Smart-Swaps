import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../styles';
import { CircularScoreRing } from './CircularScoreRing';

interface HealthPointsCardProps {
  percentage: number;
  onScanPress?: () => void;
}

export const HealthPointsCard: React.FC<HealthPointsCardProps> = ({
  percentage,
  onScanPress,
}) => {
  return (
    <View style={styles.card}>
      <View style={styles.cardContent}>
        {/* Left Side: Circular Progress */}
        <View style={styles.progressContainer}>
          <CircularScoreRing percentage={percentage} size={90} strokeWidth={10} />
        </View>

        {/* Right Side: Details & Action */}
        <View style={styles.detailsContainer}>
          <Text style={styles.weekLabel}>THIS WEEK</Text>
          <Text style={styles.cardTitle}>Health Points</Text>
          <Text style={styles.cardSubtitle}>
            Scan a receipt to start earning points
          </Text>
          
          <TouchableOpacity style={styles.scanButton} onPress={onScanPress}>
            <Ionicons name="camera" size={16} color={COLORS.white} />
            <Text style={styles.scanButtonText}>Scan a receipt</Text>
          </TouchableOpacity>
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
    marginBottom: 16,
    // Native iOS SwiftUI shadow emulation: highly dispersed, low opacity
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressContainer: {
    marginRight: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsContainer: {
    flex: 1,
  },
  weekLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primaryGreen,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
    lineHeight: 16,
  },
  scanButton: {
    backgroundColor: COLORS.primaryGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  scanButtonText: {
    color: COLORS.white,
    fontWeight: '600',
    fontSize: 14,
    marginLeft: 6,
  },
});
