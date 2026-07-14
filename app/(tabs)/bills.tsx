import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, globalStyles } from '../../styles';
import { GlassHeader, HEADER_CONTENT_HEIGHT } from '../../components/GlassHeader';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function BillsTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollY = useRef(new Animated.Value(0)).current;

  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;

  return (
    <View style={globalStyles.safeArea}>
      <GlassHeader title="Bills" scrollY={scrollY} />
      <Animated.ScrollView
        style={globalStyles.container}
        contentInset={{ 
          top: Platform.OS === 'ios' ? headerHeight : 0,
          bottom: Platform.OS === 'ios' ? 100 : 0
        }}
        contentOffset={{ 
          x: 0, 
          y: Platform.OS === 'ios' ? -headerHeight : 0 
        }}
        contentContainerStyle={{ 
          paddingHorizontal: 20, 
          paddingBottom: Platform.OS === 'android' ? 100 : 0, 
          paddingTop: Platform.OS === 'android' ? headerHeight + 12 : 12 
        }}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
      >
        {/* Subtitle */}
        <Text style={[globalStyles.subtitle, { marginBottom: 24, marginTop: 4 }]}>Track your receipts and health points</Text>

        {/* Progress Card */}
        <View style={globalStyles.card}>
          <View style={styles.progressContainer}>
            {/* 0% Progress Circle */}
            <View style={styles.progressCircle}>
              <Text style={styles.progressValue}>0%</Text>
            </View>
            <Text style={styles.progressLabel}>This week's health points</Text>
          </View>
        </View>

        {/* Big CTA Scan Receipt Button */}
        <TouchableOpacity 
          style={styles.bigScanBtn} 
          activeOpacity={0.8}
          onPress={() => router.push('/scan-receipt')}
        >
          <Ionicons name="camera" size={20} color={COLORS.white} />
          <Text style={styles.bigScanBtnText}>Scan Receipt</Text>
        </TouchableOpacity>

        {/* Section: Recent Bills */}
        <Text style={styles.sectionLabel}>RECENT BILLS</Text>

        {/* Empty History Card */}
        <View style={globalStyles.card}>
          <View style={styles.emptyContainer}>
            {/* Green receipt icon background */}
            <View style={styles.receiptIconWrapper}>
              <Ionicons name="receipt-outline" size={24} color={COLORS.primaryGreen} />
            </View>

            <Text style={styles.emptyTitle}>No history yet</Text>

            <Text style={styles.emptySubtitle}>
              Scan your first grocery receipt to get a health rating.
            </Text>
          </View>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingVertical: 12,
    marginBottom: 16,
  },
  progressContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  progressCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 14,
    borderColor: '#ECEFF1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressValue: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.primaryGreenDark,
  },
  progressLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  bigScanBtn: {
    backgroundColor: COLORS.primaryGreen,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: COLORS.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 24,
  },
  bigScanBtnText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
    marginLeft: 8,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    marginBottom: 12,
    letterSpacing: 0.8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  receiptIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.lightGreenBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 20,
  },
});
