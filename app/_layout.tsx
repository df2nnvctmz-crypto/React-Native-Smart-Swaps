import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ProfileProvider } from './context/ProfileContext';
import { FavoritesProvider } from './context/FavoritesContext';

export default function RootLayout() {
  return (
    <ProfileProvider>
      <FavoritesProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="profile" options={{ presentation: 'modal' }} />
          <Stack.Screen name="food/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="recipe/[id]" options={{ presentation: 'modal' }} />
        </Stack>
      </FavoritesProvider>
    </ProfileProvider>
  );
}
