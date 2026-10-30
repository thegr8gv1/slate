import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Text } from '../../design/Text';
import { Row } from '../../design/primitives';
import { color, radius, space } from '../../design/tokens';

/**
 * Teleprompter.
 *
 * Scrolls the side at a steady rate while recording. Driven by a timer rather
 * than a scroll animation because it must pause and resume exactly where the
 * performer left off — a running animation would jump back to a keyframe.
 *
 * Base rate is tuned to a comfortable read: ~22px of copy per second at 1×,
 * which lands close to 150 words per minute for this type size.
 */

const BASE_PX_PER_SECOND = 22;
const TICK_MS = 50;

export function Teleprompter({
  body,
  scene,
  character,
  running,
  speed = 1,
  height = 128,
}: {
  body: string;
  scene: string;
  character: string;
  running: boolean;
  speed?: number;
  height?: number;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const offset = useRef(0);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    if (!running) return;
    const maxOffset = Math.max(0, contentHeight - height + 40);

    const timer = setInterval(() => {
      offset.current = Math.min(maxOffset, offset.current + (BASE_PX_PER_SECOND * speed * TICK_MS) / 1000);
      scrollRef.current?.scrollTo({ y: offset.current, animated: false });
    }, TICK_MS);

    return () => clearInterval(timer);
  }, [running, speed, contentHeight, height]);

  // Rewinding to the top when a new take starts is the expected behaviour on
  // a real prompter; the operator resets between takes.
  useEffect(() => {
    if (running && offset.current === 0) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [running]);

  return (
    <View
      style={{
        backgroundColor: 'rgba(24, 10, 32, 0.88)',
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: color.borderStrong,
        overflow: 'hidden',
      }}
    >
      <Row justify="space-between" style={{ paddingHorizontal: space.md, paddingTop: space.sm }}>
        <Text variant="micro" tone="accent" upper>
          Scene {scene}: {character}
        </Text>
        <Text variant="micro" tone="faint" upper>
          {running ? `${speed.toFixed(1)}× scrolling` : 'Paused'}
        </Text>
      </Row>

      <ScrollView
        ref={scrollRef}
        style={{ height }}
        scrollEnabled={!running}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: space.md, paddingBottom: space.xxl }}
        onContentSizeChange={(_, h) => setContentHeight(h)}
        onScroll={(event) => {
          // Keep the manual scroll position when the operator drags by hand.
          if (!running) offset.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={64}
      >
        <Text variant="body" style={{ fontSize: 15.5, lineHeight: 24, color: color.text }}>
          {body}
        </Text>
      </ScrollView>

      {/* Reading line so the performer's eyeline stays put. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 24 + height * 0.32,
          height: 1,
          backgroundColor: 'rgba(244, 63, 94, 0.45)',
        }}
      />
    </View>
  );
}
