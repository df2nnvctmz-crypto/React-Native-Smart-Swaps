import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, globalStyles } from '../styles';

function pct(val: number, target: number) {
  if (target === 0) return 0;
  return Math.min(100, Math.round((val / target) * 100));
}

function fmt(val: number, dec = 1) {
  return val % 1 !== 0 ? val.toFixed(dec) : String(Math.round(val));
}

export function nutriBarColor(pctVal: number, isLowerBetter: boolean): string {
  if (isLowerBetter) {
    if (pctVal <= 40) return COLORS.scoreGreen;
    if (pctVal <= 70) return '#F59E0B'; // amber
    return COLORS.scoreRed;
  } else {
    if (pctVal >= 65) return COLORS.scoreGreen;
    if (pctVal >= 35) return '#F59E0B'; // amber
    return COLORS.scoreRed;
  }
}

export function NutrientRow({
  label, value, target, unit, isLowerBetter,
}: {
  label: string; value: number; target: number; unit: string; isLowerBetter: boolean;
}) {
  const pctVal = pct(value, target);
  const barColor = nutriBarColor(pctVal, isLowerBetter);
  return (
    <View style={styles.nutrientRow}>
      <View style={globalStyles.rowBetween}>
        <View>
          <Text style={styles.nutrientName}>{label}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.nutrientValue}>{fmt(value)} {unit}</Text>
          <Text style={[styles.nutrientPct, { color: barColor }]}>{pctVal}% of target</Text>
        </View>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pctVal}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nutrientRow: {
    marginBottom: 12,
  },
  nutrientName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  nutrientValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  nutrientPct: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  barTrack: {
    height: 6,
    backgroundColor: COLORS.border,
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
