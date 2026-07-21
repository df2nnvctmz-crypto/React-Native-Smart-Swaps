import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SearchScreen } from '../../SearchScreen';

export default function SearchTab() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <SearchScreen mode="foods" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
});
