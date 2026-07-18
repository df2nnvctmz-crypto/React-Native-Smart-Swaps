import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import TextRecognition from '../modules/native-ocr';
import { COLORS, globalStyles } from '../styles';
import { parseReceipt, parseReceiptLine, ParsedReceiptItem } from './engine/receiptParser';
import { useFoods } from './useFoods';
import { useProfile } from './context/ProfileContext';
import { findBestSwaps } from './engine/swapAlgorithm';
import { StorageService } from './services/storage';
import { ReceiptItemList } from '../components/ReceiptItemList';
import { FoodItem } from './types';

export default function ScanReceiptScreen() {
  const router = useRouter();
  const { allFoods, foods, foodIndexData } = useFoods();
  const { profile } = useProfile();
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<ParsedReceiptItem[] | null>(null);
  const [swaps, setSwaps] = useState<any[]>([]);
  const [progressStatus, setProgressStatus] = useState<'idle'|'reading'|'matching'|'calculating'|'done'>('idle');
  const [progressStats, setProgressStats] = useState({ current: 0, total: 0 });
  const [currentScanId, setCurrentScanId] = useState<string | null>(null);
  const [currentScanDate, setCurrentScanDate] = useState<string | null>(null);

  const processImage = async (imageUri: string) => {
    setIsProcessing(true);
    setResults(null);
    setSwaps([]);
    setProgressStatus('reading');
    
    try {
      const recognitionResult = await TextRecognition.recognize(imageUri);
      const lines = recognitionResult.blocks.flatMap(b => b.lines.map(l => l.text));
      
      setProgressStatus('matching');
      setProgressStats({ current: 0, total: lines.length });
      
      const parsedItems: ParsedReceiptItem[] = [];
      const CHUNK_SIZE = 4;
      
      for (let i = 0; i < lines.length; i += CHUNK_SIZE) {
        const chunk = lines.slice(i, i + CHUNK_SIZE);
        for (const line of chunk) {
          const parsed = parseReceiptLine(line, allFoods, foodIndexData);
          if (parsed) {
            parsedItems.push(parsed);
          }
        }
        
        setProgressStats({ current: Math.min(i + CHUNK_SIZE, lines.length), total: lines.length });
        
        // Yield thread
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      setProgressStatus('calculating');
      setResults(parsedItems);

      const generatedSwaps = [];
      const safeFoods = foods.length > 0 ? foods : allFoods;
      
      let totalScore = 0;
      let matchedCount = 0;

      for (const item of parsedItems) {
        if (item.matchedFood && item.confidence >= 0.45) {
          totalScore += item.matchedFood.health_score;
          matchedCount++;

          if (item.confidence > 0.72) {
            const bestSwaps = findBestSwaps(item.matchedFood, safeFoods, 1, profile.dietaryPreference);
            if (bestSwaps.length > 0) {
              generatedSwaps.push({
                from: item.matchedFood,
                to: bestSwaps[0].candidate,
                improvement: bestSwaps[0].candidate.health_score - item.matchedFood.health_score
              });
            }
          }
        }
        if (matchedCount % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      setSwaps(generatedSwaps);

      const scanId = Math.random().toString(36).substring(7);
      const scanDate = new Date().toISOString();
      setCurrentScanId(scanId);
      setCurrentScanDate(scanDate);

      await StorageService.saveScan({
        id: scanId,
        date: scanDate,
        items: parsedItems,
        averageScore: matchedCount > 0 ? Math.round(totalScore / matchedCount) : 0
      });

      setProgressStatus('done');
      await new Promise(resolve => setTimeout(resolve, 500));
      setProgressStatus('idle');

    } catch (e) {
      console.error(e);
      Alert.alert('OCR Error', 'Failed to process receipt. Make sure you are running a custom dev client.');
      setProgressStatus('idle');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets[0].uri) {
      processImage(result.assets[0].uri);
    }
  };

  const handleChooseLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (!result.canceled && result.assets && result.assets[0].uri) {
      processImage(result.assets[0].uri);
    }
  };

  const handleUpdateItem = async (index: number, newFood: FoodItem) => {
    if (!results || !currentScanId || !currentScanDate) return;
    
    const newResults = [...results];
    newResults[index] = { ...newResults[index], matchedFood: newFood, confidence: 1.0 };
    setResults(newResults);

    let totalScore = 0;
    let matchedCount = 0;
    for (const item of newResults) {
      if (item.matchedFood) {
        totalScore += item.matchedFood.health_score;
        matchedCount++;
      }
    }
    const averageScore = matchedCount > 0 ? Math.round(totalScore / matchedCount) : 0;

    await StorageService.updateScan(currentScanId, {
      id: currentScanId,
      date: currentScanDate,
      items: newResults,
      averageScore,
      interactions: []
    });
  };

  if (results) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => setResults(null)}>
            <Ionicons name="close" size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Results</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.subtitle}>
            We found {results.length} items on your receipt.
          </Text>

          <ReceiptItemList items={results} onUpdateItem={handleUpdateItem} />
          
          <TouchableOpacity style={globalStyles.primaryButton} onPress={() => router.push('/receipts')}>
            <Text style={globalStyles.primaryButtonText}>View in Recent Receipts</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name={Platform.OS === 'ios' ? 'chevron-back' : 'arrow-back'} size={28} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan Receipt</Text>
        </View>

        <Text style={styles.subtitle}>
          Take a picture of your grocery bill to check the health score of your purchases.
        </Text>

        {/* Actions or Progress */}
        {isProcessing ? (
          <View style={styles.progressContainer}>
            {progressStatus === 'reading' && (
              <View style={styles.progressRow}>
                <ActivityIndicator color={COLORS.primaryGreen} />
                <Text style={styles.progressText}>Reading receipt text...</Text>
              </View>
            )}
            
            {progressStatus === 'matching' && (
              <View style={styles.progressBlock}>
                <Text style={styles.progressText}>Matching items ({progressStats.current} of {progressStats.total})...</Text>
                <View style={styles.progressBarBg}>
                  <View 
                    style={[styles.progressBarFill, { width: `${Math.round((progressStats.current / Math.max(1, progressStats.total)) * 100)}%` }]} 
                  />
                </View>
              </View>
            )}
            
            {progressStatus === 'calculating' && (
              <View style={styles.progressRow}>
                <ActivityIndicator color={COLORS.primaryGreen} />
                <Text style={styles.progressText}>Calculating smart swaps...</Text>
              </View>
            )}
            
            {progressStatus === 'done' && (
              <View style={styles.progressRow}>
                <Ionicons name="checkmark-circle" size={24} color={COLORS.primaryGreen} />
                <Text style={[styles.progressText, { color: COLORS.primaryGreen }]}>Done!</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.actionsContainer}>
            <TouchableOpacity 
              style={[globalStyles.primaryButton, { height: 56 }]} 
              activeOpacity={0.8}
              onPress={handleTakePhoto}
            >
              <Ionicons name="camera-outline" size={22} color={COLORS.white} style={styles.btnIcon} />
              <Text style={globalStyles.primaryButtonText}>Take Photo</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[globalStyles.secondaryButton, { height: 56 }]} 
              activeOpacity={0.8}
              onPress={handleChooseLibrary}
            >
              <Ionicons name="image-outline" size={22} color={COLORS.textPrimary} style={styles.btnIcon} />
              <Text style={globalStyles.secondaryButtonText}>Choose from Library</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* How it works */}
        <Text style={styles.sectionTitle}>How it works</Text>
        
        <View style={styles.stepRow}>
          <View style={styles.stepIconBox}>
            <Ionicons name="camera-outline" size={24} color={COLORS.primaryGreen} />
          </View>
          <Text style={styles.stepText}>Take a clear picture of your receipt</Text>
        </View>

        <View style={styles.stepRow}>
          <View style={styles.stepIconBox}>
            <Ionicons name="search-outline" size={24} color={COLORS.primaryGreen} />
          </View>
          <Text style={styles.stepText}>We identify the groceries you bought using on-device AI</Text>
        </View>

        <View style={styles.stepRow}>
          <View style={styles.stepIconBox}>
            <Ionicons name="sparkles-outline" size={24} color={COLORS.primaryGreen} />
          </View>
          <Text style={styles.stepText}>Get smart swaps based on your diet</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    backgroundColor: COLORS.white,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
    ...Platform.select({
      ios: {
        shadowColor: COLORS.shadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      default: { boxShadow: '0px 2px 8px rgba(15, 29, 17, 0.05)' }
    }),
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  subtitle: {
    fontSize: 16,
    color: COLORS.textSecondary,
    lineHeight: 24,
    marginBottom: 32,
  },
  actionsContainer: {
    gap: 16,
    marginBottom: 48,
  },
  btnIcon: {
    marginRight: 10,
  },
  sectionTitle: globalStyles.sectionTitle,
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  stepIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: COLORS.lightGreenBg,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  stepText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  progressContainer: {
    ...globalStyles.card,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
    marginBottom: 48,
    padding: 24,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBlock: {
    width: '100%',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginLeft: 12,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: COLORS.lightGreenBg,
    borderRadius: 4,
    marginTop: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primaryGreen,
    borderRadius: 4,
  },
});
