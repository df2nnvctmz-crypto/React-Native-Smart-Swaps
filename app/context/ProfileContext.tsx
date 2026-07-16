import React, { createContext, useState, useContext, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Sex = 'Male' | 'Female';
export type ActivityLevel = 'Sedentary' | 'Lightly Active' | 'Moderately Active' | 'Very Active' | 'Extra Active';
export type WeightGoal = '-0.5 kg' | '-0.25 kg' | 'stay' | '+0.25 kg' | '+0.5 kg';
export type DietaryPreference = 'Balanced' | 'High Protein' | 'Low Carb' | 'Vegetarian' | 'Vegan';

export interface ProfileState {
  sex: Sex;
  age: number;
  weight: number;
  height: number;
  activityLevel: ActivityLevel;
  weightGoal: WeightGoal;
  dietaryPreference: DietaryPreference[];
}

interface ProfileContextType {
  profile: ProfileState;
  updateProfile: (updates: Partial<ProfileState>) => void;
  targetCalories: number;
  targetMacros: {
    protein: number;
    carbs: number;
    fat: number;
    sugars: number;
    satFat: number;
    fiber: number;
    salt: number;
  };
  targetMacroPercentages: {
    protein: number;
    carbs: number;
    fat: number;
    sugars: number;
    satFat: number;
  };
}

const defaultProfile: ProfileState = {
  sex: 'Female',
  age: 23,
  weight: 50,
  height: 170,
  activityLevel: 'Lightly Active',
  weightGoal: 'stay',
  dietaryPreference: ['Balanced']
};

const ProfileContext = createContext<ProfileContextType | undefined>(undefined);

const PROFILE_KEY = '@smart_swaps_profile';

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profile, setProfile] = useState<ProfileState>(defaultProfile);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(PROFILE_KEY).then(data => {
      if (data) {
        try { setProfile(JSON.parse(data)); } catch (e) {}
      }
      setIsLoaded(true);
    }).catch(() => setIsLoaded(true));
  }, []);

  const updateProfile = (updates: Partial<ProfileState>) => {
    setProfile(prev => {
      const next = { ...prev, ...updates };
      AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(next)).catch(console.error);
      return next;
    });
  };

  const { targetCalories, targetMacros, targetMacroPercentages } = useMemo(() => {
    // 1. Calculate BMR (Mifflin-St Jeor)
    let bmr = (10 * profile.weight) + (6.25 * profile.height) - (5 * profile.age);
    bmr += profile.sex === 'Male' ? 5 : -161;

    // 2. Activity Multiplier
    const activityMultipliers: Record<ActivityLevel, number> = {
      'Sedentary': 1.2,
      'Lightly Active': 1.375,
      'Moderately Active': 1.55,
      'Very Active': 1.725,
      'Extra Active': 1.9,
    };
    const tdee = bmr * activityMultipliers[profile.activityLevel];

    // 3. Weight Goal Offset
    const goalOffsets: Record<WeightGoal, number> = {
      '-0.5 kg': -500,
      '-0.25 kg': -250,
      'stay': 0,
      '+0.25 kg': 250,
      '+0.5 kg': 500,
    };
    
    const finalCalories = Math.round(tdee + goalOffsets[profile.weightGoal]);

    // 4. Macro Calculation
    let proteinPct = 0.25;
    let carbsPct = 0.45;
    let fatPct = 0.30;

    const prefs = profile.dietaryPreference;

    // Apply strict macro changes if chosen
    if (prefs.includes('High Protein')) {
      proteinPct = 0.35;
      carbsPct = 0.35;
      fatPct = 0.30;
    } else if (prefs.includes('Low Carb')) {
      proteinPct = 0.30;
      carbsPct = 0.20;
      fatPct = 0.50;
    } else if (prefs.includes('Vegetarian') || prefs.includes('Vegan')) {
      proteinPct = 0.20;
      carbsPct = 0.50;
      fatPct = 0.30;
    }

    // Protein = 4 kcal/g, Carbs = 4 kcal/g, Fat = 9 kcal/g
    const macros = {
      protein: Math.round((finalCalories * proteinPct) / 4),
      carbs: Math.round((finalCalories * carbsPct) / 4),
      fat: Math.round((finalCalories * fatPct) / 9),
      sugars: Math.round(finalCalories * 0.1 / 4), // 10% of total calories limit
      satFat: Math.round(finalCalories * 0.1 / 9), // 10% of total calories limit
      fiber: Math.round(finalCalories / 1000 * 14),  // 14g per 1000 kcal
      salt: 6,    // Static recommended limit (6g)
    };

    return { 
      targetCalories: finalCalories, 
      targetMacros: macros,
      targetMacroPercentages: {
        protein: proteinPct,
        carbs: carbsPct,
        fat: fatPct,
        sugars: 0.1,
        satFat: 0.1
      }
    };
  }, [profile]);

  if (!isLoaded) return null;

  return (
    <ProfileContext.Provider value={{ profile, updateProfile, targetCalories, targetMacros, targetMacroPercentages }}>
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
};
