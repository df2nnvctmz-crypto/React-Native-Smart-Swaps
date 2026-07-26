import { useRef, useState, useEffect } from 'react';
import { Animated } from 'react-native';

// Drives the "Added to list!" button state: a spring pop on add, then an automatic
// revert (with the same pop) back to the idle label after `revertDelayMs`.
export function useAddedToListAnimation(revertDelayMs = 2000) {
  const [isAdded, setIsAdded] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the revert timer if the screen unmounts mid-countdown.
  useEffect(() => () => { if (revertTimer.current) clearTimeout(revertTimer.current); }, []);

  const pop = () => {
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.06, friction: 4, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start();
  };

  const markAdded = () => {
    setIsAdded(true);
    pop();
    if (revertTimer.current) clearTimeout(revertTimer.current);
    revertTimer.current = setTimeout(() => {
      setIsAdded(false);
      pop();
    }, revertDelayMs);
  };

  return { isAdded, scale, markAdded };
}
