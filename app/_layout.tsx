import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ProfileProvider } from './context/ProfileContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { SettingsProvider } from './context/SettingsContext';
import { InventoryProvider } from './context/InventoryContext';

export default function RootLayout() {
  return (
    <ProfileProvider>
      <FavoritesProvider>
        <SettingsProvider>
          <InventoryProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
              <Stack.Screen name="food/[id]" options={{ presentation: 'modal' }} />
              <Stack.Screen name="recipe/[id]" options={{ presentation: 'modal' }} />
            </Stack>
          </InventoryProvider>
        </SettingsProvider>
      </FavoritesProvider>
    </ProfileProvider>
  );
}
