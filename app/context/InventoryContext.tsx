import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { StorageService } from '../services/storage';

interface InventoryContextProps {
  ownedFoodIds: Set<string>;
  refreshInventory: () => Promise<void>;
}

const InventoryContext = createContext<InventoryContextProps | undefined>(undefined);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [ownedFoodIds, setOwnedFoodIds] = useState<Set<string>>(new Set());

  const refreshInventory = useCallback(async () => {
    try {
      const scans = await StorageService.getScans();
      const newOwned = new Set<string>();
      for (const scan of scans) {
        // We can include shopping lists in our inventory, or just rely on real receipts.
        // For now, let's include anything in a scan that matched a food.
        if (scan.items) {
          for (const item of scan.items) {
            if (item.food?.id) {
              newOwned.add(item.food.id);
            }
          }
        }
      }
      setOwnedFoodIds(newOwned);
    } catch (e) {
      console.error('Failed to load inventory', e);
    }
  }, []);

  useEffect(() => {
    refreshInventory();
  }, [refreshInventory]);

  return (
    <InventoryContext.Provider value={{ ownedFoodIds, refreshInventory }}>
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
