import React, { useRef } from 'react';
import { Animated, View, Dimensions, StyleSheet } from 'react-native';

const { width: windowWidth } = Dimensions.get('window');
const ITEM_WIDTH = windowWidth * 0.78; // Card takes up 78% of screen width
const ITEM_SPACING = (windowWidth - ITEM_WIDTH) / 2; // Centers the active item

interface CoverFlowCarouselProps<T> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
  initialScrollIndex?: number;
}

export function CoverFlowCarousel<T>({ data, renderItem, keyExtractor, initialScrollIndex = 0 }: CoverFlowCarouselProps<T>) {
  const dataLength = data.length;
  const loopedData = [...data, ...data, ...data];
  const actualInitialIndex = dataLength + initialScrollIndex;
  
  const scrollX = useRef(new Animated.Value(actualInitialIndex * ITEM_WIDTH)).current;
  const scrollViewRef = useRef<any>(null);

  const handleMomentumScrollEnd = (event: any) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const currentIndex = Math.round(offsetX / ITEM_WIDTH);

    if (currentIndex < dataLength) {
      // Jump forward to middle set
      scrollViewRef.current?.scrollTo({ x: (currentIndex + dataLength) * ITEM_WIDTH, animated: false });
    } else if (currentIndex >= dataLength * 2) {
      // Jump backward to middle set
      scrollViewRef.current?.scrollTo({ x: (currentIndex - dataLength) * ITEM_WIDTH, animated: false });
    }
  };

  return (
    <View style={styles.container}>
      <Animated.ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={ITEM_WIDTH}
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: ITEM_SPACING }}
        contentOffset={{ x: actualInitialIndex * ITEM_WIDTH, y: 0 }}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {loopedData.map((item, index) => {
          const inputRange = [
            (index - 1) * ITEM_WIDTH,
            index * ITEM_WIDTH,
            (index + 1) * ITEM_WIDTH,
          ];

          // Scale: center item is 1, side items scale down slightly
          const scale = scrollX.interpolate({
            inputRange,
            outputRange: [0.85, 1, 0.85],
            extrapolate: 'clamp',
          });

          // Opacity: side items fade out a bit
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.5, 1, 0.5],
            extrapolate: 'clamp',
          });

          // 3D Rotation (Cover Flow): 
          // Item on right (scrollX < index*ITEM_WIDTH) rotates positively
          // Item on left (scrollX > index*ITEM_WIDTH) rotates negatively
          const rotateY = scrollX.interpolate({
            inputRange,
            outputRange: ['45deg', '0deg', '-45deg'],
            extrapolate: 'clamp',
          });

          // TranslateX: pull the side items inward so they overlap behind the center item
          const translateX = scrollX.interpolate({
            inputRange,
            outputRange: [-ITEM_WIDTH * 0.15, 0, ITEM_WIDTH * 0.15],
            extrapolate: 'clamp',
          });

          return (
            <Animated.View
              key={keyExtractor ? `${keyExtractor(item, index % dataLength)}-${index}` : String(index)}
              style={{
                width: ITEM_WIDTH,
                opacity,
                transform: [
                  { perspective: 800 },
                  { translateX },
                  { rotateY },
                  { scale }
                ],
              }}
            >
              {/* Ensure standard padding doesn't interfere with math */}
              <View style={styles.itemWrapper}>
                {renderItem(item, index % dataLength)}
              </View>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 4,
  },
  itemWrapper: {
    flex: 1,
    paddingHorizontal: 8, // slight internal spacing so cards don't literally touch when active
  }
});
