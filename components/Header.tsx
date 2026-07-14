import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../styles';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showSearchProfile?: boolean;
  showKcalBadge?: boolean;
  kcalValue?: string;
  badgeText?: string; // e.g. "Personalise • Recommended" or "SMART RECIPE ENGINE ACTIVE"
  badgeIcon?: keyof typeof Ionicons.glyphMap; // e.g. "options-outline" or "sparkles"
  showBack?: boolean;
  onBackPress?: () => void;
  showSearchIconOnly?: boolean;
  onSearchPress?: () => void;
  onProfilePress?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title,
  subtitle,
  showSearchProfile = false,
  showKcalBadge = false,
  kcalValue,
  badgeText,
  badgeIcon,
  showBack = false,
  onBackPress,
  showSearchIconOnly = false,
  onSearchPress,
  onProfilePress,
}) => {
  return (
    <View style={styles.container}>
      {/* Top row with Title and Icons */}
      <View style={globalStyles.rowBetween}>
        <View style={styles.titleContainer}>
          {showBack && (
            <TouchableOpacity onPress={onBackPress} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
            </TouchableOpacity>
          )}
          <Text style={globalStyles.title}>{title}</Text>
        </View>

        {/* Right side items */}
        {showSearchProfile && (
          <View style={globalStyles.row}>
            <TouchableOpacity style={styles.iconButton} onPress={onSearchPress}>
              <Ionicons name="search-outline" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.iconButton, { marginLeft: 8 }]} onPress={onProfilePress}>
              <Ionicons name="person-outline" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          </View>
        )}

        {showSearchIconOnly && (
          <TouchableOpacity style={styles.iconButton} onPress={onSearchPress}>
            <Ionicons name="search-outline" size={20} color={COLORS.textPrimary} />
          </TouchableOpacity>
        )}

        {showKcalBadge && kcalValue && (
          <View style={styles.kcalBadge}>
            <Ionicons name="flame" size={14} color={COLORS.primaryGreen} />
            <Text style={styles.kcalText}>{kcalValue}</Text>
          </View>
        )}
      </View>

      {/* Subtitle */}
      {subtitle && <Text style={globalStyles.subtitle}>{subtitle}</Text>}

      {/* Action/Info Badges below title */}
      {badgeText && (
        <View style={styles.badgeWrapper}>
          <View style={styles.badge}>
            {badgeIcon && (
              <Ionicons
                name={badgeIcon}
                size={14}
                color={COLORS.primaryGreen}
                style={{ marginRight: 4 }}
              />
            )}
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: {
    marginRight: 12,
    padding: 4,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.white,
  },
  kcalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  kcalText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primaryGreenDark,
    marginLeft: 4,
  },
  badgeWrapper: {
    marginTop: 12,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.borderDark,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primaryGreen,
  },
});
