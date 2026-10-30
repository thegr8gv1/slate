import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient as SvgGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { Text } from './Text';
import { Row } from './primitives';
import { color, radius, space } from './tokens';

/**
 * Charts.
 *
 * Everything is inline SVG so a chart renders byte-identically on iOS, Android
 * and the web with no charting dependency and no canvas fallbacks. Each chart
 * takes plain numbers and does its own scaling, so screens never pre-format.
 */

/* ------------------------------------------------------------------ */
/* Path helpers                                                        */
/* ------------------------------------------------------------------ */

interface Scale {
  x: (index: number) => number;
  y: (value: number) => number;
}

function makeScale(count: number, min: number, max: number, width: number, height: number, pad: number): Scale {
  const span = max - min || 1;
  return {
    x: (index) => pad + (index / Math.max(1, count - 1)) * (width - pad * 2),
    y: (value) => height - pad - ((value - min) / span) * (height - pad * 2),
  };
}

/** Catmull-Rom to cubic Bezier — smooth without overshooting the data. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length < 3) {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/* ------------------------------------------------------------------ */
/* Line / area chart                                                   */
/* ------------------------------------------------------------------ */

export interface Series {
  label: string;
  values: number[];
  color: string;
  /** Fills the area under the line with a fading gradient. */
  fill?: boolean;
  dashed?: boolean;
}

export function LineChart({
  series,
  labels,
  height = 150,
  width = 320,
  yTicks = 4,
  showAxis = true,
  style,
}: {
  series: Series[];
  labels?: string[];
  height?: number;
  width?: number;
  yTicks?: number;
  showAxis?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const pad = showAxis ? 26 : 6;
  const flat = series.flatMap((s) => s.values);
  const max = Math.max(1, ...flat);
  const min = Math.min(0, ...flat);
  const count = Math.max(...series.map((s) => s.values.length), 1);
  const scale = makeScale(count, min, max, width, height, pad);

  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => min + ((max - min) / yTicks) * i);
  const formatTick = makeTickFormatter(max);

  return (
    <View style={style}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          {series.map((s, i) => (
            <SvgGradient key={`grad-${i}`} id={`fill-${i}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={s.color} stopOpacity="0.34" />
              <Stop offset="1" stopColor={s.color} stopOpacity="0" />
            </SvgGradient>
          ))}
        </Defs>

        {showAxis
          ? ticks.map((tick, i) => (
              <G key={`tick-${i}`}>
                <Line
                  x1={pad}
                  y1={scale.y(tick)}
                  x2={width - pad / 2}
                  y2={scale.y(tick)}
                  stroke={color.border}
                  strokeWidth={1}
                  strokeDasharray={i === 0 ? undefined : '3 5'}
                />
                <SvgText
                  x={pad - 6}
                  y={scale.y(tick) + 3.5}
                  fill={color.textFaint}
                  fontSize="9"
                  textAnchor="end"
                >
                  {formatTick(tick)}
                </SvgText>
              </G>
            ))
          : null}

        {series.map((s, i) => {
          const points = s.values.map((v, index) => ({ x: scale.x(index), y: scale.y(v) }));
          const d = smoothPath(points);
          const area = `${d} L${points[points.length - 1]?.x ?? 0},${height - pad} L${points[0]?.x ?? 0},${height - pad} Z`;
          return (
            <G key={`series-${i}`}>
              {s.fill ? <Path d={area} fill={`url(#fill-${i})`} /> : null}
              <Path
                d={d}
                stroke={s.color}
                strokeWidth={2.2}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? '5 4' : undefined}
              />
              {points.length > 0 ? (
                <Circle
                  cx={points[points.length - 1].x}
                  cy={points[points.length - 1].y}
                  r={3.4}
                  fill={s.color}
                  stroke={color.bg}
                  strokeWidth={2}
                />
              ) : null}
            </G>
          );
        })}

        {showAxis && labels
          ? labels.map((label, i) =>
              i % Math.ceil(labels.length / 5) === 0 ? (
                <SvgText
                  key={`label-${i}`}
                  x={scale.x(i)}
                  y={height - 6}
                  fill={color.textFaint}
                  fontSize="9"
                  textAnchor="middle"
                >
                  {label}
                </SvgText>
              ) : null,
            )
          : null}
      </Svg>

      {series.length > 1 ? (
        <Row gap={space.lg} wrap style={{ marginTop: space.sm }}>
          {series.map((s) => (
            <Row key={s.label} gap={space.xs}>
              <View style={{ width: 14, height: 3, borderRadius: 2, backgroundColor: s.color }} />
              <Text variant="micro" tone="faint">
                {s.label}
              </Text>
            </Row>
          ))}
        </Row>
      ) : null}
    </View>
  );
}

/**
 * Axis labels share one unit and one precision across the whole scale, chosen
 * from the largest tick. Formatting each tick independently produces axes like
 * "0, 425K, 851K, 1M, 2M", where the top two look rounder than the rest and the
 * spacing reads as non-linear.
 */
function makeTickFormatter(max: number): (value: number) => string {
  const magnitude = Math.abs(max);
  if (magnitude >= 1_000_000) {
    const digits = magnitude < 10_000_000 ? 1 : 0;
    return (value) => `${(value / 1_000_000).toFixed(digits)}M`;
  }
  if (magnitude >= 1000) {
    const digits = magnitude < 10_000 ? 1 : 0;
    return (value) => `${(value / 1000).toFixed(digits)}K`;
  }
  return (value) => String(Math.round(value));
}

/* ------------------------------------------------------------------ */
/* Sparkline                                                           */
/* ------------------------------------------------------------------ */

export function Sparkline({
  values,
  stroke = color.accent,
  width = 92,
  height = 30,
  fill = true,
}: {
  values: number[];
  stroke?: string;
  width?: number;
  height?: number;
  fill?: boolean;
}) {
  const max = Math.max(1, ...values);
  const min = Math.min(...values, 0);
  const scale = makeScale(values.length, min, max, width, height, 3);
  const points = values.map((v, i) => ({ x: scale.x(i), y: scale.y(v) }));
  const d = smoothPath(points);

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Defs>
        <SvgGradient id="spark" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={stroke} stopOpacity="0.3" />
          <Stop offset="1" stopColor={stroke} stopOpacity="0" />
        </SvgGradient>
      </Defs>
      {fill && points.length > 1 ? (
        <Path
          d={`${d} L${points[points.length - 1].x},${height} L${points[0].x},${height} Z`}
          fill="url(#spark)"
        />
      ) : null}
      <Path d={d} stroke={stroke} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Gauge — the engagement meter / ROI score dial                       */
/* ------------------------------------------------------------------ */

export function Gauge({
  value,
  max = 100,
  size = 84,
  label,
  thickness = 8,
}: {
  value: number;
  max?: number;
  size?: number;
  label?: string;
  thickness?: number;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2 + 4;
  // 220 degrees of sweep, opening downward like a physical VU meter.
  const startAngle = 160;
  const sweep = 220;

  const arc = (fromPct: number, toPct: number) => {
    const a0 = ((startAngle + sweep * fromPct) * Math.PI) / 180;
    const a1 = ((startAngle + sweep * toPct) * Math.PI) / 180;
    const x0 = cx + r * Math.cos(a0);
    const y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = sweep * (toPct - fromPct) > 180 ? 1 : 0;
    return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`;
  };

  const bands: { from: number; to: number; color: string }[] = [
    { from: 0, to: 0.34, color: color.danger },
    { from: 0.34, to: 0.68, color: color.warning },
    { from: 0.68, to: 1, color: color.success },
  ];

  const needleAngle = ((startAngle + sweep * pct) * Math.PI) / 180;

  return (
    <View style={{ width: size, height: size * 0.78, alignItems: 'center' }}>
      <Svg width={size} height={size * 0.86} viewBox={`0 0 ${size} ${size * 0.86}`}>
        {bands.map((band, i) => (
          <Path
            key={i}
            d={arc(band.from, band.to)}
            stroke={band.color}
            strokeWidth={thickness}
            strokeLinecap="round"
            fill="none"
            opacity={0.9}
          />
        ))}
        <Line
          x1={cx}
          y1={cy}
          x2={cx + (r - 4) * Math.cos(needleAngle)}
          y2={cy + (r - 4) * Math.sin(needleAngle)}
          stroke={color.text}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <Circle cx={cx} cy={cy} r={3.4} fill={color.text} />
      </Svg>
      {label ? (
        <Text variant="micro" tone="faint" upper>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Bars                                                               */
/* ------------------------------------------------------------------ */

export function BarChart({
  data,
  height = 120,
  width = 300,
  barColor = color.brand,
}: {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  width?: number;
  barColor?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const pad = 20;
  const slot = (width - pad * 2) / Math.max(1, data.length);
  const barWidth = Math.min(26, slot * 0.6);

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {data.map((d, i) => {
        const h = ((height - pad * 2) * d.value) / max;
        const x = pad + slot * i + (slot - barWidth) / 2;
        return (
          <G key={d.label}>
            <Rect
              x={x}
              y={height - pad - h}
              width={barWidth}
              height={Math.max(2, h)}
              rx={4}
              fill={d.color ?? barColor}
            />
            <SvgText
              x={x + barWidth / 2}
              y={height - 6}
              fill={color.textFaint}
              fontSize="9"
              textAnchor="middle"
            >
              {d.label}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Stacked share bar — likes / comments / boosted                      */
/* ------------------------------------------------------------------ */

export function ShareBar({
  segments,
  height = 10,
}: {
  segments: { label: string; value: number; color: string }[];
  height?: number;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', height, borderRadius: height / 2, overflow: 'hidden' }}>
        {segments.map((s) => (
          <View key={s.label} style={{ flex: s.value / total, backgroundColor: s.color }} />
        ))}
      </View>
      <Row gap={space.lg} wrap>
        {segments.map((s) => (
          <Row key={s.label} gap={space.xxs}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }} />
            <Text variant="micro" tone="faint">
              {s.label} {Math.round((s.value / total) * 100)}%
            </Text>
          </Row>
        ))}
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Escrow milestone track                                              */
/* ------------------------------------------------------------------ */

export interface TrackStep {
  label: string;
  sub?: string;
  state: 'done' | 'current' | 'todo';
}

export function MilestoneTrack({ steps }: { steps: TrackStep[] }) {
  const lastDone = steps.map((s) => s.state).lastIndexOf('done');
  const currentIndex = steps.findIndex((s) => s.state === 'current');
  const progressIndex = currentIndex >= 0 ? currentIndex : lastDone;
  const progress = steps.length > 1 ? Math.max(0, progressIndex) / (steps.length - 1) : 0;

  return (
    <View style={{ gap: space.sm }}>
      <View style={{ height: 6, justifyContent: 'center' }}>
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 4,
            borderRadius: 2,
            backgroundColor: color.surfaceHot,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: 0,
            width: `${progress * 100}%`,
            height: 4,
            borderRadius: 2,
            backgroundColor: color.success,
          }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {steps.map((step, i) => (
            <View
              key={`${step.label}-${i}`}
              style={{
                width: step.state === 'current' ? 12 : 9,
                height: step.state === 'current' ? 12 : 9,
                borderRadius: 6,
                backgroundColor:
                  step.state === 'todo' ? color.surfaceHot : step.state === 'current' ? color.success : color.success,
                borderWidth: step.state === 'current' ? 3 : 0,
                borderColor: color.bg,
              }}
            />
          ))}
        </View>
      </View>
      <Row justify="space-between" align="flex-start">
        {steps.map((step, i) => (
          <View
            key={`${step.label}-label-${i}`}
            style={{
              flex: 1,
              alignItems: i === 0 ? 'flex-start' : i === steps.length - 1 ? 'flex-end' : 'center',
            }}
          >
            <Text
              variant="micro"
              tone={step.state === 'todo' ? 'faint' : step.state === 'current' ? 'success' : 'muted'}
              upper
              align={i === 0 ? 'left' : i === steps.length - 1 ? 'right' : 'center'}
            >
              {step.label}
            </Text>
            {step.sub ? (
              <Text variant="micro" tone="faint" align="center">
                {step.sub}
              </Text>
            ) : null}
          </View>
        ))}
      </Row>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Heat map — audience geography                                       */
/* ------------------------------------------------------------------ */

/**
 * Simplified world landmass outlines. Enough to read as a globe at dashboard
 * size without shipping a topojson bundle to a mobile client.
 */
const LANDMASSES = [
  'M18,34 L44,22 L74,26 L88,44 L74,70 L52,86 L34,72 L22,54 Z',
  'M76,92 L96,84 L112,98 L104,138 L88,150 L78,128 Z',
  'M132,26 L188,18 L208,32 L196,54 L166,60 L140,50 Z',
  'M138,58 L176,56 L186,80 L172,118 L152,124 L140,92 Z',
  'M210,30 L268,20 L292,44 L282,70 L242,78 L214,58 Z',
  'M258,84 L286,80 L296,102 L278,116 L260,104 Z',
];

export function HeatMap({
  points,
  width = 300,
  height = 160,
}: {
  points: { code: string; intensity: number }[];
  width?: number;
  height?: number;
}) {
  const byCode = useMemo(() => {
    const map = new Map(points.map((p) => [p.code, p.intensity]));
    return map;
  }, [points]);

  // Approximate centroids on the simplified projection above.
  const HOTSPOTS: Record<string, [number, number]> = {
    US: [58, 48],
    CA: [56, 30],
    MX: [66, 66],
    BR: [96, 112],
    UK: [148, 40],
    DE: [166, 44],
    FR: [154, 52],
    ES: [146, 58],
    IN: [232, 66],
    CN: [258, 46],
    JP: [284, 46],
    AU: [276, 100],
    ZA: [176, 118],
    NG: [160, 84],
  };

  const maxIntensity = Math.max(1, ...points.map((p) => p.intensity));

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      <Rect x="0" y="0" width={width} height={height} rx={radius.md} fill={color.mapWater} />
      {LANDMASSES.map((d, i) => (
        <Path key={i} d={d} fill={color.mapLand} stroke={color.border} strokeWidth={0.8} />
      ))}
      {Object.entries(HOTSPOTS).map(([code, [x, y]]) => {
        const intensity = byCode.get(code);
        if (!intensity) return null;
        const t = intensity / maxIntensity;
        const r = 5 + t * 13;
        const hot = t > 0.66 ? color.danger : t > 0.33 ? color.warning : color.success;
        return (
          <G key={code}>
            <Circle cx={x} cy={y} r={r} fill={hot} opacity={0.28} />
            <Circle cx={x} cy={y} r={r * 0.45} fill={hot} opacity={0.85} />
            <SvgText x={x} y={y - r - 3} fill={color.textMuted} fontSize="8" textAnchor="middle">
              {code}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Audio waveform — self-tape and dailies scrubber                     */
/* ------------------------------------------------------------------ */

export function Waveform({
  seed,
  width = 300,
  height = 34,
  progress = 0,
  bars = 64,
  tint = color.accent,
}: {
  seed: string;
  width?: number;
  height?: number;
  progress?: number;
  bars?: number;
  tint?: string;
}) {
  const heights = useMemo(() => {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i += 1) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return Array.from({ length: bars }, (_, i) => {
      h = Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0;
      const base = (h % 100) / 100;
      // Envelope so the clip has a natural attack and decay.
      const envelope = Math.sin((i / bars) * Math.PI) * 0.6 + 0.4;
      return Math.max(0.12, base * envelope);
    });
  }, [seed, bars]);

  const barWidth = width / bars;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
      {heights.map((h, i) => {
        const barHeight = h * height;
        const played = i / bars <= progress;
        return (
          <Rect
            key={i}
            x={i * barWidth + barWidth * 0.15}
            y={(height - barHeight) / 2}
            width={barWidth * 0.7}
            height={barHeight}
            rx={barWidth * 0.35}
            fill={played ? tint : color.surfaceHot}
          />
        );
      })}
    </Svg>
  );
}
