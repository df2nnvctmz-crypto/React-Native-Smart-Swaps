import React, { useState } from 'react';
import { View, StyleSheet, Text, Platform } from 'react-native';
import Slider from '@react-native-community/slider';
import { COLORS, globalStyles } from '../styles';

interface LiquidSliderProps {
  maxSliderVal: number;
  initialValue: number;
  title: string;
  unit?: string;
  onValueChangeComplete: (val: number) => void;
}

export const LiquidSlider: React.FC<LiquidSliderProps> = ({ maxSliderVal, initialValue, title, unit = '', onValueChangeComplete }) => {
  const [sliderCalories, setSliderCalories] = useState(initialValue);

  return (
    <View style={styles.sliderContainer}>
      <View style={[globalStyles.rowBetween, { marginTop: 8, marginBottom: 10 }]}>
        <Text style={styles.filterLabel}>{title.toUpperCase()}</Text>
        <Text style={styles.maxCalValue}>{sliderCalories >= maxSliderVal ? `${maxSliderVal}+ ${unit}` : `${sliderCalories} ${unit}`}</Text>
      </View>
      
      <Slider
        style={{ width: '100%', height: 40 }}
        minimumValue={0}
        maximumValue={maxSliderVal}
        value={initialValue}
        step={1}
        minimumTrackTintColor={COLORS.primaryGreen}
        maximumTrackTintColor={COLORS.border}
        thumbTintColor={Platform.OS === 'ios' ? '#FFFFFF' : COLORS.primaryGreen}
        onValueChange={(val) => setSliderCalories(val)}
        onSlidingComplete={onValueChangeComplete}
      />
      
      <View style={styles.sliderLabels}>
        <Text style={styles.sliderLabel}>0</Text>
        <Text style={styles.sliderLabel}>{Math.round(maxSliderVal / 2)}</Text>
        <Text style={styles.sliderLabel}>{maxSliderVal}+</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  sliderContainer: {
    marginVertical: 12,
  },
  filterLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    letterSpacing: 0.5,
  },
  maxCalValue: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.primaryGreen,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
    paddingHorizontal: 8,
  },
  sliderLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
});
