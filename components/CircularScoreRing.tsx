import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { COLORS } from '../styles';

interface CircularScoreRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}

export const CircularScoreRing: React.FC<CircularScoreRingProps> = ({ 
  percentage, 
  size = 40, 
  strokeWidth = 4 
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  
  // Cap percentage at 100 and floor at 0
  const safePercentage = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (safePercentage / 100) * circumference;
  
  const getColor = (pct: number) => {
    if (pct >= 70) return COLORS.scoreGreen;
    if (pct >= 40) return COLORS.scoreYellow;
    return COLORS.scoreRed;
  };

  const getLightColor = (pct: number) => {
    if (pct >= 70) return COLORS.scoreGreenLight;
    if (pct >= 40) return COLORS.scoreYellowLight;
    return COLORS.scoreRedLight;
  };

  const color = getColor(safePercentage);
  const bgColor = getLightColor(safePercentage);

  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {/* Background Ring */}
        <Circle
          stroke={bgColor}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress Ring */}
        <Circle
          stroke={color}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          originX={size / 2}
          originY={size / 2}
          rotation="-90"
        />
      </Svg>
      <Text style={[styles.text, { fontSize: size * 0.35, color }]}>
        {Math.round(safePercentage)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  text: {
    fontWeight: '700',
  }
});
