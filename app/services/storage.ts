import AsyncStorage from '@react-native-async-storage/async-storage';
import { FoodItem } from '../types';
import { ParsedReceiptItem } from '../engine/receiptParser';

export interface SwapInteraction {
  fromFoodId: string;
  toFoodId: string;
  action: 'accepted' | 'dismissed' | 'ignored';
  timestamp: string;
}

export interface ScanRecord {
  id: string;
  date: string;
  items: ParsedReceiptItem[];
  averageScore: number;
  interactions: SwapInteraction[];
}

const SCANS_KEY = '@smart_swaps_scans';
const INTERACTIONS_KEY = '@smart_swaps_interactions';

export const StorageService = {
  async saveScan(scan: Omit<ScanRecord, 'interactions'>) {
    try {
      const existing = await this.getScans();
      const newScan: ScanRecord = { ...scan, interactions: [] };
      const updated = [newScan, ...existing];
      await AsyncStorage.setItem(SCANS_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save scan', e);
    }
  },

  async getScans(): Promise<ScanRecord[]> {
    try {
      const data = await AsyncStorage.getItem(SCANS_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Failed to load scans', e);
      return [];
    }
  },

  async logSwapInteraction(interaction: Omit<SwapInteraction, 'timestamp'>) {
    try {
      const data = await AsyncStorage.getItem(INTERACTIONS_KEY);
      const existing = data ? JSON.parse(data) : [];
      existing.push({ ...interaction, timestamp: new Date().toISOString() });
      await AsyncStorage.setItem(INTERACTIONS_KEY, JSON.stringify(existing));
    } catch (e) {
      console.error('Failed to log interaction', e);
    }
  },

  async clearScans() {
    try {
      await AsyncStorage.removeItem(SCANS_KEY);
    } catch (e) {}
  }
};
