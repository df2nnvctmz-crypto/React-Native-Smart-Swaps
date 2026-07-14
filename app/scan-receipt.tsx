import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { COLORS, globalStyles } from '../styles';
import { parseReceipt } from './engine/receiptParser';
import { useFoods } from './useFoods';
import { useProfile } from './context/ProfileContext';

export default function ScanReceiptScreen() {
  const router = useRouter();
  const { allFoods } = useFoods();
  const { profile } = useProfile();
  const [isProcessing, setIsProcessing] = useState(false);

  // Mock OCR process since Expo Go doesn't support native ML Kit offline
  const simulateOCRAndSwaps = async (imageUri?: string) => {
    setIsProcessing(true);
    
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock extracted lines from a receipt
    const mockOcrText = [
      "1x Oat whole grain, raw",
      "Milk whole pasteurized",
      "Apple fresh",
      "Chocolate milk sweetened"
    ];

    const parsedItems = parseReceipt(mockOcrText, allFoods);
    
    let resultsText = `Found ${parsedItems.length} items:\n\n`;

    parsedItems.forEach(item => {
      resultsText += `• ${item.matchedFood?.name}\n`;
      
      // Execute Smart Swaps Engine
      if (item.matchedFood) {
        const swapId = findSmartSwap(item.matchedFood, allFoods, profile);
        if (swapId) {
          const swapFood = allFoods.find(f => f.id === swapId);
          resultsText += `   💡 Swap idea: ${swapFood?.name}\n`;
        }
      }
    });

    setIsProcessing(false);
    
    Alert.alert('Receipt Processed!', resultsText, [
      { text: 'OK' }
    ]);
  };

  const handleTakePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      simulateOCRAndSwaps(result.assets[0].uri);
    }
  };

  const handleChooseLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      simulateOCRAndSwaps(result.assets[0].uri);
    }
  };

  const handleDemoReceipt = () => {
    simulateOCRAndSwaps();
  };

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

        {/* Actions */}
        <View style={styles.actionsContainer}>
          <TouchableOpacity 
            style={[styles.actionBtn, styles.primaryBtn]} 
            activeOpacity={0.8}
            onPress={handleTakePhoto}
            disabled={isProcessing}
          >
            <Ionicons name="camera-outline" size={22} color={COLORS.white} style={styles.btnIcon} />
            <Text style={styles.primaryBtnText}>Take Photo</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, styles.secondaryBtn]} 
            activeOpacity={0.8}
            onPress={handleChooseLibrary}
            disabled={isProcessing}
          >
            <Ionicons name="image-outline" size={22} color={COLORS.textPrimary} style={styles.btnIcon} />
            <Text style={styles.secondaryBtnText}>Choose from Library</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, styles.tertiaryBtn]} 
            activeOpacity={0.8}
            onPress={handleDemoReceipt}
            disabled={isProcessing}
          >
            {isProcessing ? (
               <ActivityIndicator color={COLORS.primaryGreen} size="small" />
            ) : (
              <>
                <Ionicons name="sparkles-outline" size={22} color={COLORS.primaryGreen} style={styles.btnIcon} />
                <Text style={styles.tertiaryBtnText}>Try with Demo Receipt</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

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
          <Text style={styles.stepText}>We identify the groceries you bought</Text>
        </View>

        <View style={styles.stepRow}>
          <View style={styles.stepIconBox}>
            <Ionicons name="sparkles-outline" size={24} color={COLORS.primaryGreen} />
          </View>
          <Text style={styles.stepText}>Get a health score for your purchase</Text>
        </View>

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
  subtitle: {
    fontSize: 16,
    color: '#4A4A4A',
    lineHeight: 24,
    marginBottom: 32,
  },
  actionsContainer: {
    gap: 16,
    marginBottom: 48,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
  },
  btnIcon: {
    marginRight: 10,
  },
  primaryBtn: {
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  secondaryBtnText: {
    color: '#1A1A1A',
    fontSize: 16,
    fontWeight: '600',
  },
  tertiaryBtn: {
    backgroundColor: '#E8F5E9',
  },
  tertiaryBtnText: {
    color: '#2E7D32',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  stepIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  stepText: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: '500',
  },
});
