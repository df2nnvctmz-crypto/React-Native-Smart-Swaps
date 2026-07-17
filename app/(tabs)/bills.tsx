import React, { useRef, useState, useCallback } from 'react';
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
import { useRouter, useFocusEffect } from 'expo-router';
import { StorageService, ScanRecord } from '../services/storage';
import { CircularScoreRing } from '../../components/CircularScoreRing';

export default function BillsTab() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollY = useRef(new Animated.Value(0)).current;
  const [scans, setScans] = useState<ScanRecord[]>([]);

  useFocusEffect(
    useCallback(() => {
      StorageService.getScans().then(setScans);
    }, [])
  );

  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;

  const totalPoints = scans.reduce((acc, scan) => acc + scan.averageScore, 0);
  const avgWeeklyPoints = scans.length > 0 ? Math.round(totalPoints / scans.length) : 0;

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
        <Text style={[globalStyles.subtitle, { marginBottom: 24, marginTop: 4 }]}>Track your receipts and health points</Text>

        <View style={globalStyles.card}>
          <View style={styles.progressContainer}>
            <CircularScoreRing percentage={avgWeeklyPoints} size={140} strokeWidth={14} />
            <Text style={[styles.progressLabel, { marginTop: 12 }]}>Average scan health score</Text>
          </View>
        </View>

        <TouchableOpacity 
          style={styles.bigScanBtn} 
          activeOpacity={0.8}
          onPress={() => router.push('/scan-receipt')}
        >
          <Ionicons name="camera" size={20} color={COLORS.white} />
          <Text style={styles.bigScanBtnText}>Scan New Receipt</Text>
        </TouchableOpacity>

        <Text style={styles.sectionLabel}>RECENT BILLS</Text>

        {scans.length > 0 ? (
          <View style={styles.historyContainer}>
            {scans.map((scan) => (
              <TouchableOpacity 
                key={scan.id} 
                style={styles.scanCard}
                activeOpacity={0.7}
                onPress={() => router.push(`/receipt/${scan.id}`)}
              >
                <View style={globalStyles.rowBetween}>
                  <View style={globalStyles.row}>
                    <View style={styles.receiptIconSmall}>
                      <Ionicons name="receipt" size={16} color={COLORS.primaryGreen} />
                    </View>
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.scanDate}>
                        {new Date(scan.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </Text>
                      <Text style={styles.scanItemsCount}>{scan.items.length} items matched</Text>
                    </View>
                  </View>
                  <View style={{ marginLeft: 'auto' }}>
                    <CircularScoreRing percentage={scan.averageScore} size={44} strokeWidth={4} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
            
            <TouchableOpacity onPress={() => {
              StorageService.clearScans().then(() => setScans([]));
            }}>
              <Text style={{ textAlign: 'center', color: COLORS.textMuted, marginTop: 16 }}>Clear History</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={globalStyles.card}>
            <View style={styles.emptyContainer}>
              <View style={styles.receiptIconWrapper}>
                <Ionicons name="receipt-outline" size={24} color={COLORS.primaryGreen} />
              </View>
              <Text style={styles.emptyTitle}>No history yet</Text>
              <Text style={styles.emptySubtitle}>
                Scan your first grocery receipt to get a health rating.
              </Text>
            </View>
          </View>
        )}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  progressContainer: {
    alignItems: 'center',
    paddingVertical: 10,
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
  historyContainer: {
    paddingBottom: 24,
  },
  scanCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  receiptIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.lightGreenBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanDate: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  scanItemsCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
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
