import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

import type { SwipeDirection } from '../../contracts';
import { Icon } from '../../design/Icon';
import { Text } from '../../design/Text';
import { color, elevation, radius, space } from '../../design/tokens';

/**
 * Swipe deck.
 *
 * One implementation for every platform: gesture-handler covers touch and
 * pointer input, and the same Reanimated worklets drive the transform on the UI
 * thread natively and via requestAnimationFrame on the web. Buttons call the
 * identical animation path as a drag, so a mouse user and a thumb user get the
 * same motion.
 *
 * The card stack renders at most three layers — the live card and two behind
 * it — because anything deeper is invisible and just costs a re-render on
 * every frame of a drag.
 */

const SWIPE_OUT_MS = 240;
const VELOCITY_THRESHOLD = 780;

export interface SwipeDeckHandle {
  swipe: (direction: SwipeDirection) => void;
  /** Returns the card currently on top, if any. */
  current: () => number;
}

export interface SwipeDeckProps<T> {
  items: T[];
  keyOf: (item: T, index: number) => string;
  renderCard: (item: T, index: number, isTop: boolean) => ReactNode;
  onSwipe: (item: T, direction: SwipeDirection) => void;
  onExhausted?: () => void;
  /** Disables the up gesture where an Instant Pitch is not offered. */
  allowUp?: boolean;
  empty?: ReactNode;
  height?: number;
  handleRef?: Ref<SwipeDeckHandle>;
}

export function SwipeDeck<T>({
  items,
  keyOf,
  renderCard,
  onSwipe,
  onExhausted,
  allowUp = true,
  empty,
  height,
  handleRef,
}: SwipeDeckProps<T>) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const settling = useSharedValue(0);

  const indexRef = useRef(index);
  indexRef.current = index;

  // A new result set (filters changed, deck refetched) restarts the stack.
  useEffect(() => {
    setIndex(0);
    translateX.value = 0;
    translateY.value = 0;
  }, [items, translateX, translateY]);

  useEffect(() => {
    if (items.length > 0 && index >= items.length) onExhausted?.();
  }, [index, items.length, onExhausted]);

  const commit = useCallback(
    (direction: SwipeDirection) => {
      const item = items[indexRef.current];
      if (!item) return;
      onSwipe(item, direction);
      setIndex((i) => i + 1);
      translateX.value = 0;
      translateY.value = 0;
      settling.value = 0;
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(
          direction === 'up' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
        );
      }
    },
    [items, onSwipe, translateX, translateY, settling],
  );

  const flingOut = useCallback(
    (direction: SwipeDirection) => {
      if (indexRef.current >= items.length) return;
      settling.value = 1;
      const offX = direction === 'left' ? -windowWidth * 1.3 : direction === 'right' ? windowWidth * 1.3 : 0;
      const offY = direction === 'up' ? -windowHeight * 1.1 : 0;
      translateX.value = withTiming(offX, { duration: SWIPE_OUT_MS });
      translateY.value = withTiming(offY, { duration: SWIPE_OUT_MS }, (finished) => {
        if (finished) runOnJS(commit)(direction);
      });
    },
    [items.length, windowWidth, windowHeight, translateX, translateY, settling, commit],
  );

  useImperativeHandle(handleRef, () => ({ swipe: flingOut, current: () => indexRef.current }), [flingOut]);

  const threshold = Math.min(windowWidth, 480) * 0.28;

  const pan = Gesture.Pan()
    .enabled(index < items.length)
    .onUpdate((event) => {
      if (settling.value === 1) return;
      translateX.value = event.translationX;
      translateY.value = allowUp ? event.translationY : Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (settling.value === 1) return;
      const goingUp =
        allowUp &&
        event.translationY < -threshold &&
        Math.abs(event.translationY) > Math.abs(event.translationX);

      if (goingUp || event.velocityY < -VELOCITY_THRESHOLD * 1.2) {
        if (allowUp) {
          runOnJS(flingOut)('up');
          return;
        }
      }
      if (event.translationX > threshold || event.velocityX > VELOCITY_THRESHOLD) {
        runOnJS(flingOut)('right');
        return;
      }
      if (event.translationX < -threshold || event.velocityX < -VELOCITY_THRESHOLD) {
        runOnJS(flingOut)('left');
        return;
      }
      translateX.value = withSpring(0, { damping: 18, stiffness: 190 });
      translateY.value = withSpring(0, { damping: 18, stiffness: 190 });
    });

  const topStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${interpolate(translateX.value, [-320, 0, 320], [-11, 0, 11])}deg` },
    ],
  }));

  const passStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [-threshold, -20, 0], [1, 0, 0], 'clamp'),
  }));
  const shortlistStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateX.value, [0, 20, threshold], [0, 0, 1], 'clamp'),
  }));
  const pitchStyle = useAnimatedStyle(() => ({
    opacity: interpolate(translateY.value, [-threshold, -20, 0], [1, 0, 0], 'clamp'),
  }));

  const secondStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(translateX.value) / threshold);
    return {
      transform: [{ scale: 0.955 + progress * 0.045 }, { translateY: 10 - progress * 10 }],
      opacity: 0.72 + progress * 0.28,
    };
  });

  if (index >= items.length) {
    return <View style={{ height, justifyContent: 'center' }}>{empty}</View>;
  }

  const visible = items.slice(index, index + 3);

  return (
    <View style={{ height, justifyContent: 'center' }}>
      {/* Behind cards, furthest first so the top card paints last. */}
      {visible
        .map((item, offset) => ({ item, offset }))
        .reverse()
        .map(({ item, offset }) => {
          const key = keyOf(item, index + offset);
          if (offset === 0) {
            return (
              <GestureDetector gesture={pan} key={key}>
                <Animated.View style={[{ position: 'absolute', left: 0, right: 0 }, topStyle, elevation(3)]}>
                  {renderCard(item, index, true)}
                  <Stamp label="PASS" tone={color.danger} position="right" style={passStyle} />
                  <Stamp label="LIKE" tone={color.success} position="left" style={shortlistStyle} />
                  <Stamp label="OFFER" tone={color.brand} position="center" style={pitchStyle} />
                </Animated.View>
              </GestureDetector>
            );
          }
          return (
            <Animated.View
              key={key}
              pointerEvents="none"
              style={[
                { position: 'absolute', left: 0, right: 0 },
                offset === 1
                  ? secondStyle
                  : { transform: [{ scale: 0.915 }, { translateY: 20 }], opacity: 0.45 },
              ]}
            >
              {renderCard(item, index + offset, false)}
            </Animated.View>
          );
        })}
    </View>
  );
}

/** Drag-direction stamp overlaid on the live card. */
function Stamp({
  label,
  tone,
  position,
  style,
}: {
  label: string;
  tone: string;
  position: 'left' | 'right' | 'center';
  style: object;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: position === 'center' ? undefined : 28,
          bottom: position === 'center' ? 96 : undefined,
          left: position === 'left' ? 24 : position === 'center' ? 0 : undefined,
          right: position === 'right' ? 24 : position === 'center' ? 0 : undefined,
          alignItems: 'center',
        },
        style,
      ]}
    >
      <View
        style={{
          borderWidth: 3,
          borderColor: tone,
          borderRadius: radius.md,
          paddingHorizontal: space.md,
          paddingVertical: space.xs,
          backgroundColor: 'rgba(14, 6, 18, 0.65)',
          transform: [{ rotate: position === 'left' ? '-12deg' : position === 'right' ? '12deg' : '0deg' }],
        }}
      >
        <Text variant="heading" upper style={{ color: tone, letterSpacing: 2 }}>
          {label}
        </Text>
      </View>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* Deck controls (Dating app style action dock)                        */
/* ------------------------------------------------------------------ */

export function DeckControls({
  onPass,
  onLike,
  onPitch,
  onRewind,
  pitchLabel = 'Direct Offer',
  disabled,
}: {
  onPass: () => void;
  onLike: () => void;
  onPitch?: () => void;
  onRewind?: () => void;
  pitchLabel?: string;
  disabled?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', width: '100%', paddingVertical: space.sm }}>
      <View
        style={{
          flexDirection: 'row',
          gap: onRewind ? space.md : space.xxl,
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
        }}
      >
        {/* Rewind / Undo Button (Amber Glass) */}
        {onRewind ? (
          <DatingButton
            onPress={onRewind}
            disabled={disabled}
            label="Rewind"
            size={46}
            borderColor="rgba(245, 158, 11, 0.45)"
            backgroundColor="rgba(245, 158, 11, 0.14)"
            hoverBg="rgba(245, 158, 11, 0.26)"
            glowColor="rgba(245, 158, 11, 0.35)"
            icon={<Icon name="undo" size={20} color="#FBBF24" strokeWidth={2.6} />}
          />
        ) : null}

        {/* Pass Button (Rose Crimson) */}
        <DatingButton
          onPress={onPass}
          disabled={disabled}
          label="Pass"
          size={58}
          borderColor="rgba(244, 63, 94, 0.55)"
          backgroundColor="rgba(244, 63, 94, 0.16)"
          hoverBg="rgba(244, 63, 94, 0.28)"
          glowColor="rgba(244, 63, 94, 0.4)"
          icon={<Icon name="close" size={26} color="#FB7185" strokeWidth={2.8} />}
        />

        {/* Super Offer / Direct Pitch Button (Violet Electric) */}
        {onPitch ? (
          <DatingButton
            onPress={onPitch}
            disabled={disabled}
            label={pitchLabel}
            size={52}
            borderColor="rgba(192, 132, 252, 0.55)"
            backgroundColor="rgba(192, 132, 252, 0.18)"
            hoverBg="rgba(192, 132, 252, 0.3)"
            glowColor="rgba(192, 132, 252, 0.45)"
            icon={<Icon name="zap" size={24} color="#C084FC" strokeWidth={2.6} />}
          />
        ) : null}

        {/* Like / Shortlist Button (Emerald Radiant) */}
        <DatingButton
          onPress={onLike}
          disabled={disabled}
          label="Shortlist"
          size={66}
          borderColor="rgba(52, 211, 153, 0.6)"
          backgroundColor="rgba(52, 211, 153, 0.18)"
          hoverBg="rgba(52, 211, 153, 0.32)"
          glowColor="rgba(52, 211, 153, 0.45)"
          icon={<Icon name="heart" size={30} color="#34D399" strokeWidth={2.6} />}
        />
      </View>
    </View>
  );
}

function DatingButton({
  onPress,
  icon,
  borderColor,
  backgroundColor,
  hoverBg,
  glowColor,
  label,
  size,
  disabled,
}: {
  onPress: () => void;
  icon: ReactNode;
  borderColor: string;
  backgroundColor: string;
  hoverBg: string;
  glowColor?: string;
  label: string;
  size: number;
  disabled?: boolean;
}) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onPress}
        style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 1.5,
          borderColor,
          backgroundColor: hovered ? hoverBg : backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.35 : 1,
          transform: [{ scale: pressed ? 0.91 : hovered ? 1.08 : 1 }],
          shadowColor: glowColor ?? '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.35,
          shadowRadius: 10,
          elevation: 6,
          cursor: disabled ? 'auto' : 'pointer',
          ...(Platform.OS === 'web'
            ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as object)
            : {}),
        })}
      >
        {icon}
      </Pressable>
      <Text variant="micro" tone="faint" upper style={{ fontSize: 10, letterSpacing: 0.8 }}>
        {label}
      </Text>
    </View>
  );
}
