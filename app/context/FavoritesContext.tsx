import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

type FavoriteType = 'food' | 'swap' | 'recipe';

export interface FavoritesState {
  foods: string[];
  swaps: string[]; // Stored as "fromId-toId"
  recipes: string[];
}

interface FavoritesContextType {
  favorites: FavoritesState;
  toggleFavorite: (type: FavoriteType, id: string) => void;
  isFavorite: (type: FavoriteType, id: string) => boolean;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

const FAVORITES_KEY = '@smart_swaps_favorites';

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [favorites, setFavorites] = useState<FavoritesState>({
    foods: [],
    swaps: [],
    recipes: [],
  });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(FAVORITES_KEY).then(data => {
      if (data) {
        try { setFavorites(JSON.parse(data)); } catch (e) {}
      }
      setIsLoaded(true);
    }).catch(() => setIsLoaded(true));
  }, []);

  const toggleFavorite = (type: FavoriteType, id: string) => {
    setFavorites(prev => {
      const typeList = prev[type + 's' as keyof FavoritesState];
      let nextState: FavoritesState;
      if (typeList.includes(id)) {
        nextState = {
          ...prev,
          [type + 's']: typeList.filter(item => item !== id)
        };
      } else {
        nextState = {
          ...prev,
          [type + 's']: [...typeList, id]
        };
      }
      AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(nextState)).catch(console.error);
      return nextState;
    });
  };

  const isFavorite = (type: FavoriteType, id: string) => {
    return favorites[type + 's' as keyof FavoritesState].includes(id);
  };

  if (!isLoaded) return null;

  return (
    <FavoritesContext.Provider value={{ favorites, toggleFavorite, isFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
};

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};
