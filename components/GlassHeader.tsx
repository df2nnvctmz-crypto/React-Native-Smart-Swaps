import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, globalStyles } from '../styles';

interface GlassHeaderProps {
  title: string;
  onSettingsPress?: () => void;
  scrollY?: Animated.Value | ReturnType<typeof Animated.add>;
}

// Compact iOS-style header height (matches UINavigationBar)
export const HEADER_CONTENT_HEIGHT = 52;

export const GlassHeader = ({ title, onSearchPress, onSettingsPress, scrollY }: GlassHeaderProps) => {
  const insets = useSafeAreaInsets();

  // On iOS, we use contentInset, so initial scrollY is negative. On Android, we use paddingTop, so initial scrollY is 0.
  const scrollStart = Platform.OS === 'ios' ? -(insets.top + HEADER_CONTENT_HEIGHT) : 0;

  // IMPORTANT: useNativeDriver MUST be false to animate opacity on BlurView
  const blurOpacity = scrollY
    ? scrollY.interpolate({
        inputRange: [scrollStart, scrollStart + 50],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      })
    : new Animated.Value(1);

  const borderOpacity = scrollY
    ? scrollY.interpolate({
        inputRange: [scrollStart + 40, scrollStart + 70],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      })
    : new Animated.Value(1);

  return (
    <View style={[styles.container, { paddingTop: insets.top, height: insets.top + HEADER_CONTENT_HEIGHT }]}>
      {/* Blur background animates in as user scrolls down */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: blurOpacity }]}>
        <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(247, 249, 246, 0.55)' }]} />
      </Animated.View>
      {/* Hair-line separator, only visible while scrolled */}
      <Animated.View style={[styles.borderLine, { opacity: borderOpacity }]} />
      {/* Content always visible, floats above the background */}
      <View style={styles.content}>
        <Text style={globalStyles.title}>{title}</Text>
        <View style={globalStyles.row}>

          {onSettingsPress && (
            <TouchableOpacity style={[styles.iconButton, { marginLeft: 8 }]} onPress={onSettingsPress}>
              <Ionicons name="settings-outline" size={20} color={COLORS.textPrimary} />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  borderLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0, 0, 0, 0.14)',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
});
