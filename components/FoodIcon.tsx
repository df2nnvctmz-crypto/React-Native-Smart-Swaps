import React from 'react';
import { SvgXml } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { FoodItem } from '../app/types';
import { getCachedIconLibrary, getIconForCategory } from '../app/useFoods';
import { COLORS } from '../styles';

interface FoodIconProps {
  food: Pick<FoodItem, 'icon_key' | 'category'>;
  size?: number;
  color?: string; // only used for the Ionicons fallback path
}

// Renders the food's bundled OpenMoji SVG (embedded on-device in smartswaps.db, no network).
// Falls back to the generic category glyph if a food has no icon_key or the SVG failed to load.
export const FoodIcon: React.FC<FoodIconProps> = ({ food, size = 20, color = COLORS.textSecondary }) => {
  const svg = food.icon_key ? getCachedIconLibrary()[food.icon_key] : undefined;

  if (svg) {
    return <SvgXml xml={svg} width={size} height={size} />;
  }

  return <Ionicons name={getIconForCategory(food.category)} size={size} color={color} />;
};
