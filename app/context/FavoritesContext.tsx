import React, { createContext, useState, useContext } from 'react';

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

export const FavoritesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [favorites, setFavorites] = useState<FavoritesState>({
    foods: [],
    swaps: [],
    recipes: [],
  });

  const toggleFavorite = (type: FavoriteType, id: string) => {
    setFavorites(prev => {
      const typeList = prev[type + 's' as keyof FavoritesState];
      if (typeList.includes(id)) {
        // Remove
        return {
          ...prev,
          [type + 's']: typeList.filter(item => item !== id)
        };
      } else {
        // Add
        return {
          ...prev,
          [type + 's']: [...typeList, id]
        };
      }
    });
  };

  const isFavorite = (type: FavoriteType, id: string) => {
    return favorites[type + 's' as keyof FavoritesState].includes(id);
  };

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
