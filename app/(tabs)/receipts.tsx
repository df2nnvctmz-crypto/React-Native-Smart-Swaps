import React, { useRef, useState, useCallback, useMemo } from 'react';
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
import * as Haptics from 'expo-haptics';

export default function ReceiptsTab() {
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

  const getWeekKey = (dateString: string) => {
    const d = new Date(dateString);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const startOfWeek = new Date(d.setDate(diff));
    startOfWeek.setHours(0,0,0,0);
    return startOfWeek.getTime();
  };

  const shoppingLists = useMemo(() => {
    return scans.filter(s => s.isShoppingList).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [scans]);

  const groupedScans = useMemo(() => {
    const groups: Record<string, ScanRecord[]> = {};
    for (const scan of scans) {
      if (scan.isShoppingList) continue; // skip shopping lists for history
      const wk = getWeekKey(scan.date);
      if (!groups[wk]) groups[wk] = [];
      groups[wk].push(scan);
    }
    const sortedKeys = Object.keys(groups).sort((a, b) => Number(b) - Number(a));
    return sortedKeys.map(k => {
      const s = groups[k];
      const avg = s.reduce((acc, sc) => acc + sc.averageScore, 0) / s.length;
      return {
        timestamp: Number(k),
        scans: s.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        averageScore: Math.round(avg),
      };
    });
  }, [scans]);

  const handleScanPress = (id: string) => {
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    router.push(`/receipt/${id}`);
  };

  return (
    <View style={globalStyles.safeArea}>
      <GlassHeader title="Receipts" scrollY={scrollY} />
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

        <TouchableOpacity 
          style={styles.bigScanBtn} 
          activeOpacity={0.8}
          onPress={() => router.push('/scan-receipt')}
        >
          <Ionicons name="camera" size={20} color={COLORS.white} />
          <Text style={styles.bigScanBtnText}>Scan New Receipt</Text>
        </TouchableOpacity>

        {shoppingLists.length > 0 && (
          <View style={styles.shoppingListSection}>
            <Text style={styles.sectionTitle}>Current Shopping Lists</Text>
            {shoppingLists.map(list => (
              <TouchableOpacity 
                key={list.id} 
                style={styles.shoppingListCard}
                activeOpacity={0.7}
                onPress={() => handleScanPress(list.id)}
              >
                <View style={globalStyles.rowBetween}>
                  <View style={globalStyles.row}>
                    <View style={styles.basketIconBox}>
                      <Ionicons name="basket" size={20} color={'#0084C9'} />
                    </View>
                    <View style={{ marginLeft: 12 }}>
                      <Text style={styles.shoppingListTitleText} numberOfLines={1}>
                        Shopping List
                      </Text>
                      <Text style={styles.shoppingListRecipeName} numberOfLines={1}>
                        {list.recipeName || 'Custom List'}
                      </Text>
                      <Text style={styles.scanItemsCount}>{list.items.length} items</Text>
                    </View>
                  </View>
                  <View style={{ marginLeft: 'auto' }}>
                    <CircularScoreRing percentage={list.averageScore} size={44} strokeWidth={4} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {groupedScans.length > 0 ? (
          <View style={styles.historyContainer}>
            {groupedScans.map((group) => {
              const weekStartDate = new Date(group.timestamp);
              const weekEndDate = new Date(group.timestamp + 6 * 24 * 60 * 60 * 1000);
              
              const startFormat = weekStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              const endFormat = weekEndDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

              return (
                <View key={group.timestamp} style={styles.weekGroup}>
                  <View style={styles.weekHeaderRow}>
                    <Text style={styles.weekTitle}>Week of {startFormat} - {endFormat}</Text>
                    <View style={styles.weeklyScorePill}>
                      <Text style={styles.weeklyScoreText}>Avg: {group.averageScore}</Text>
                    </View>
                  </View>

                  {group.scans.map((scan) => (
                    <TouchableOpacity 
                      key={scan.id} 
                      style={styles.scanCard}
                      activeOpacity={0.7}
                      onPress={() => handleScanPress(scan.id)}
                    >
                      <View style={globalStyles.rowBetween}>
                        <View style={globalStyles.row}>
                          <View style={styles.receiptIconSmall}>
                            <Ionicons name="receipt" size={16} color={COLORS.primaryGreen} />
                          </View>
                          <View style={{ marginLeft: 12 }}>
                            <Text style={styles.scanDate}>
                              {new Date(scan.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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
                </View>
              );
            })}
            
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
  historyContainer: {
    paddingBottom: 24,
  },
  weekGroup: {
    marginBottom: 20,
  },
  weekHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  weekTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  weeklyScorePill: {
    backgroundColor: COLORS.lightGreenBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  weeklyScoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primaryGreenDark,
  },
  scanCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
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
  shoppingListSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  shoppingListCard: {
    backgroundColor: '#F0FAFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#BFE7FF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  basketIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#D9F2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  shoppingListTitleText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#006599',
    textTransform: 'uppercase',
  },
  shoppingListRecipeName: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textPrimary,
    marginTop: 2,
    maxWidth: 200,
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

