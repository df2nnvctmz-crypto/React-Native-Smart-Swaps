import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * App-behavior feature flags. Deliberately separate from ProfileContext (which holds
 * nutrition/health-goal state used for calorie calculations) - these are toggles about how
 * the app behaves, not about who the user is.
 */
export interface SettingsState {
  /**
   * When true, receipt scanning may call the OpenFoodFacts API on demand for branded
   * products the offline BLS matcher can't place (see app/engine/resolveProduct.ts).
   * Defaults to false: the OFF category-bridge is known to sometimes pick a confidently
   * wrong same-category neighbour (e.g. Coca-Cola -> tonic water) and has not yet been
   * tuned against a labelled eval set. Until then, scanning stays fully offline unless
   * the user opts in.
   */
  offLookupEnabled: boolean;
}

interface SettingsContextType {
  settings: SettingsState;
  updateSettings: (updates: Partial<SettingsState>) => void;
}

const defaultSettings: SettingsState = {
  offLookupEnabled: false,
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_KEY = '@smart_swaps_settings';

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then(data => {
      if (data) {
        try { setSettings(prev => ({ ...prev, ...JSON.parse(data) })); } catch (e) {}
      }
      setIsLoaded(true);
    }).catch(() => setIsLoaded(true));
  }, []);

  const updateSettings = (updates: Partial<SettingsState>) => {
    setSettings(prev => {
      const next = { ...prev, ...updates };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next)).catch(console.error);
      return next;
    });
  };

  if (!isLoaded) return null;

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
