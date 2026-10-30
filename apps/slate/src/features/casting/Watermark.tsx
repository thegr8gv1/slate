import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Text } from '../../design/Text';

/**
 * Dynamic forensic watermark.
 *
 * Drawn over the viewfinder on the client, never baked into a stored asset:
 * a burned-in mark would have to be re-encoded per viewer and would still be
 * cached in one form. Rendering it live means the identifying text belongs to
 * the session that is looking at the side right now.
 *
 * It relocates on an interval so a single cropped screenshot cannot cleanly
 * remove it, and it is laid out as a tiled diagonal grid so any capture of the
 * frame carries at least one full copy of the viewer identity.
 */

const POSITIONS: { top: string; left: string }[] = [
  { top: '18%', left: '8%' },
  { top: '46%', left: '30%' },
  { top: '72%', left: '12%' },
  { top: '30%', left: '52%' },
  { top: '60%', left: '46%' },
];

export function Watermark({
  text,
  opacity = 0.16,
  rotateDeg = -22,
  intervalMs = 4000,
}: {
  text: string;
  opacity?: number;
  rotateDeg?: number;
  intervalMs?: number;
}) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setPhase((p) => (p + 1) % POSITIONS.length), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
    >
      {/* Static tiled layer — always present, low contrast. */}
      {POSITIONS.map((position, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            top: position.top as never,
            left: position.left as never,
            transform: [{ rotate: `${rotateDeg}deg` }],
            opacity: opacity * 0.6,
          }}
        >
          <Text variant="micro" style={{ color: '#FFFFFF', fontSize: 9 }} numberOfLines={1}>
            {text}
          </Text>
        </View>
      ))}

      {/* Moving high-contrast copy so a crop cannot reliably miss it. */}
      <View
        style={{
          position: 'absolute',
          top: POSITIONS[phase].top as never,
          left: POSITIONS[phase].left as never,
          transform: [{ rotate: `${rotateDeg}deg` }],
          opacity: opacity * 1.9,
        }}
      >
        <Text variant="micro" style={{ color: '#FFFFFF', fontSize: 10 }} numberOfLines={1}>
          {text}
        </Text>
      </View>
    </View>
  );
}
