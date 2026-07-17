import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { COLORS } from '../../styles';
import { StorageService, ScanRecord } from '../services/storage';
import { ReceiptItemList } from '../../components/ReceiptItemList';
import { FoodItem } from '../types';

export default function ReceiptDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [scan, setScan] = useState<ScanRecord | null>(null);

  useEffect(() => {
    StorageService.getScans().then(scans => {
      const found = scans.find(s => s.id === id);
      if (found) {
        setScan(found);
      }
    });
  }, [id]);

  const handleUpdateItem = async (index: number, newFood: FoodItem) => {
    if (!scan) return;
    
    const newItems = [...scan.items];
    newItems[index] = { ...newItems[index], matchedFood: newFood, confidence: 1.0 };
    
    let totalScore = 0;
    let matchedCount = 0;
    for (const item of newItems) {
      if (item.matchedFood) {
        totalScore += item.matchedFood.health_score;
        matchedCount++;
      }
    }
    const averageScore = matchedCount > 0 ? Math.round(totalScore / matchedCount) : 0;

    const updatedScan = { ...scan, items: newItems, averageScore };
    setScan(updatedScan);
    await StorageService.updateScan(scan.id, updatedScan);
  };

  if (!scan) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const formattedDate = new Date(scan.date).toLocaleDateString('en-US', { 
    weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' 
  });

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={28} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Receipt Details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          <Text style={styles.dateText}>{formattedDate}</Text>
          <View style={styles.scoreRow}>
            <Text style={styles.summaryLabel}>Overall Health Score</Text>
            <Text style={styles.summaryScore}>{scan.averageScore} / 100</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Items ({scan.items.length})</Text>
        <ReceiptItemList items={scan.items} onUpdateItem={handleUpdateItem} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAF9',
  },
  scrollContent: {
    padding: 24,
    paddingTop: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  backButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  summaryCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 16,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textPrimary,
  },
  summaryScore: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primaryGreen,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
});
