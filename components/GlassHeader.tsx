import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView } from 'expo-symbols';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import MaskedView from '@react-native-masked-view/masked-view';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../styles';

type ScrollAnim = Animated.Value | ReturnType<typeof Animated.add>;

// A genuine native progressive blur. `BlurView` is a real UIVisualEffectView (systemChrome
// material — exactly what the iOS Settings nav bar uses); `MaskedView` then masks it with a
// native vertical LinearGradient whose alpha is fully opaque over the bar and ramps to zero in
// a short band below it. Because the mask is native alpha, the blur itself feathers out with
// no hard edge and no banding — content becomes progressively visible toward the bottom.
const FADE_EXTENSION = 24; // px band below the bar over which the blur feathers to nothing

const NavBlur = ({ headerHeight }: { headerHeight: number }) => {
  const total = headerHeight + FADE_EXTENSION;
  const solidStop = headerHeight / total; // fully-opaque up to the bar's bottom, then fade
  return (
    <MaskedView
      style={{ position: 'absolute', top: 0, left: 0, right: 0, height: total }}
      maskElement={
        <LinearGradient
          style={StyleSheet.absoluteFill}
          colors={['#000', '#000', 'transparent']}
          locations={[0, solidStop, 1]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      }
    >
      <BlurView intensity={100} tint="systemChromeMaterialLight" style={StyleSheet.absoluteFill} />
    </MaskedView>
  );
};

interface GlassHeaderProps {
  title: string;
  onSettingsPress?: () => void;
  scrollY?: ScrollAnim;
  leftAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
}

// Compact iOS nav bar height (UINavigationBar's collapsed/non-large-title height)
export const HEADER_CONTENT_HEIGHT = 44;

// A circular glass bar button that mirrors the native iOS 26 liquid-glass back button —
// a floating glass capsule with the icon centered inside. Falls back to a white circle with
// a soft shadow on OS versions / platforms without liquid glass.
export const GlassCircleButton = ({
  children,
  onPress,
}: {
  children: React.ReactNode;
  onPress?: () => void;
}) => {
  const glass = isLiquidGlassAvailable();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.6} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
      {glass ? (
        <GlassView style={styles.glassCircle} glassEffectStyle="regular" isInteractive>
          {children}
        </GlassView>
      ) : (
        <View style={[styles.glassCircle, styles.glassCircleFallback]}>{children}</View>
      )}
    </TouchableOpacity>
  );
};

// Shared timing. Content now rests at scroll offset 0 (large title lives in the scroll body
// beneath a paddingTop the height of the bar), so every interpolation starts at 0 — no more
// contentInset/contentOffset mismatch that left scrollY stuck reading as "fully scrolled".
function useCollapseAnim(scrollY?: ScrollAnim) {
  const largeTitleOpacity = scrollY
    ? scrollY.interpolate({
        inputRange: [0, 26],
        outputRange: [1, 0],
        extrapolate: 'clamp',
      })
    : new Animated.Value(1);

  const largeTitleTranslateY = scrollY
    ? scrollY.interpolate({
        inputRange: [0, 26],
        outputRange: [0, -8],
        extrapolate: 'clamp',
      })
    : new Animated.Value(0);

  // IMPORTANT: useNativeDriver MUST be false to animate opacity on BlurView
  const blurOpacity = scrollY
    ? scrollY.interpolate({
        inputRange: [0, 38],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      })
    : new Animated.Value(1);

  const smallTitleOpacity = scrollY
    ? scrollY.interpolate({
        inputRange: [14, 34],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      })
    : new Animated.Value(1);

  const smallTitleTranslateY = scrollY
    ? scrollY.interpolate({
        inputRange: [14, 34],
        outputRange: [6, 0],
        extrapolate: 'clamp',
      })
    : new Animated.Value(0);

  return {
    largeTitleOpacity,
    largeTitleTranslateY,
    blurOpacity,
    smallTitleOpacity,
    smallTitleTranslateY,
  };
}

export const GlassHeader = ({ title, onSettingsPress, scrollY, leftAccessory, rightAccessory }: GlassHeaderProps) => {
  const insets = useSafeAreaInsets();
  const headerHeight = insets.top + HEADER_CONTENT_HEIGHT;
  const { blurOpacity, smallTitleOpacity, smallTitleTranslateY } = useCollapseAnim(scrollY);

  return (
    <View style={[styles.container, { paddingTop: insets.top, height: headerHeight }]}>
      {/* Native material blur, feathered to clear by a native gradient mask. Extends below the
          bar (must not be clipped) and fades in only once you actually scroll. */}
      <Animated.View pointerEvents="none" style={[styles.blurLayer, { opacity: blurOpacity }]}>
        <NavBlur headerHeight={headerHeight} />
      </Animated.View>
      {/* Content always visible, floats above the background */}
      <View style={styles.content}>
        {/* Collapsed title: centered, cross-fades in as the large title fades out */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.smallTitleWrap,
            { opacity: smallTitleOpacity, transform: [{ translateY: smallTitleTranslateY }] },
          ]}
        >
          <Text style={styles.smallTitleText} numberOfLines={1}>{title}</Text>
        </Animated.View>

        <View style={styles.leftSlot}>
          {leftAccessory}
        </View>

        <View style={styles.rightSlot}>
          {rightAccessory}
          {!rightAccessory && onSettingsPress && (
            <GlassCircleButton onPress={onSettingsPress}>
              <SymbolView
                name="gearshape"
                size={22}
                tintColor={COLORS.textPrimary}
                fallback={<Ionicons name="settings-outline" size={23} color={COLORS.textPrimary} />}
              />
            </GlassCircleButton>
          )}
        </View>
      </View>
    </View>
  );
};

// Renders the big bold iOS-style "large title". Place it as the FIRST item inside the
// screen's scrollable content and pass the same `scrollY` used by <GlassHeader> so it fades
// and slides out as you scroll — UINavigationBar cross-fading the large title into the
// compact one, rather than relying on the bar covering it.
export const LargeTitle = ({ title, scrollY }: { title: string; scrollY?: ScrollAnim }) => {
  const { largeTitleOpacity, largeTitleTranslateY } = useCollapseAnim(scrollY);
  return (
    <Animated.Text
      style={[
        largeTitleStyles.text,
        { opacity: largeTitleOpacity, transform: [{ translateY: largeTitleTranslateY }] },
      ]}
    >
      {title}
    </Animated.Text>
  );
};

const largeTitleStyles = StyleSheet.create({
  text: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.textPrimary,
    letterSpacing: 0.37,
    marginBottom: 4,
  },
});

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
  },
  blurLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  leftSlot: {
    flexDirection: 'row',
  },
  smallTitleWrap: {
    position: 'absolute',
    left: 60,
    right: 60,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  smallTitleText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  rightSlot: {
    flexDirection: 'row',
  },
  glassCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  glassCircleFallback: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
});
