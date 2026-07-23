import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { StorageService, ScanRecord } from '../services/storage';

interface InventoryContextProps {
  ownedFoodIds: Set<string>;
  shoppingLists: ScanRecord[];
  scans: ScanRecord[];
  refreshInventory: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextProps | undefined>(undefined);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [ownedFoodIds, setOwnedFoodIds] = useState<Set<string>>(new Set());
  const [shoppingLists, setShoppingLists] = useState<ScanRecord[]>([]);
  const [scans, setScans] = useState<ScanRecord[]>([]);

  const refreshInventory = useCallback(async () => {
    try {
      const scans = await StorageService.getScans();
      const newOwned = new Set<string>();
      const lists = scans.filter(s => s.isShoppingList).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      for (const scan of scans) {
        if (scan.items) {
          for (const item of scan.items) {
            if (item.matchedFood?.id) {
              newOwned.add(item.matchedFood.id);
            }
          }
        }
      }
      setOwnedFoodIds(newOwned);
      setShoppingLists(lists);
      setScans(scans);
    } catch (e) {
      console.error('Failed to load inventory', e);
    }
  }, []);

  useEffect(() => {
    refreshInventory();
  }, [refreshInventory]);

  return (
    <InventoryContext.Provider value={{ ownedFoodIds, shoppingLists, scans, refreshInventory }}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
}
