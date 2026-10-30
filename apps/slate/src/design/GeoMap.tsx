import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Rect, Stop, RadialGradient, Text as SvgText } from 'react-native-svg';
import { Text } from './Text';
import { color, radius as r, space } from './tokens';

/**
 * Map surface.
 *
 * Draws its own basemap instead of embedding Google/Apple maps. Three reasons:
 * a native map SDK behaves differently on each platform (breaking the uniform
 * design requirement), it needs per-platform API keys, and it has no web story
 * that matches the mobile styling. Everything the product actually needs from a
 * map here — relative position, a radius, and pins you can tap — is geometry.
 */

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  kind: 'talent' | 'crew' | 'event' | 'origin' | 'gear' | 'beacon' | 'gig';
  label?: string;
  pinColor?: string;
  selected?: boolean;
  onPress?: () => void;
}

export interface GeoMapProps {
  center: { lat: number; lng: number };
  /** Ground width of the viewport in miles. */
  spanMiles?: number;
  markers?: MapMarker[];
  /** Draws a translucent coverage disc, e.g. the Set-Beacon radius. */
  radiusMiles?: number;
  height?: number;
  label?: string;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * The drawing surface matches the rendered container's aspect ratio rather
 * than a fixed square. A square viewBox would either crop the basin or
 * stretch the street grid the moment the map is laid out wide, which is the
 * normal case on desktop.
 */
const BASE_SIZE = 320;

const MARKER_STYLE: Record<MapMarker['kind'], { fill: string; glyph: 'person' | 'camera' | 'star' | 'dot' | 'bolt' }> = {
  talent: { fill: color.brand, glyph: 'person' },
  crew: { fill: color.brand, glyph: 'person' },
  event: { fill: color.accent, glyph: 'camera' },
  gear: { fill: color.warning, glyph: 'camera' },
  origin: { fill: color.success, glyph: 'dot' },
  beacon: { fill: color.accent, glyph: 'bolt' },
  gig: { fill: color.accent, glyph: 'star' },
};

export function GeoMap({
  center,
  spanMiles = 14,
  markers = [],
  radiusMiles,
  height = 300,
  label,
  children,
  style,
}: GeoMapProps) {
  const [box, setBox] = useState({ width: BASE_SIZE, height });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height: measured } = event.nativeEvent.layout;
    if (width > 0 && measured > 0) setBox({ width, height: measured });
  };

  const aspect = box.width / Math.max(1, box.height);
  const VIEW_H = BASE_SIZE;
  const VIEW_W = Math.round(BASE_SIZE * aspect);

  // Degrees of latitude per mile is ~constant; longitude shrinks with latitude.
  const latPerMile = 1 / 69;
  const lngPerMile = 1 / (69 * Math.cos((center.lat * Math.PI) / 180));
  // `spanMiles` describes the horizontal ground width; latitude span follows
  // from the aspect ratio so the projection stays square on the ground.
  const spanLng = spanMiles * lngPerMile;
  const spanLat = (spanMiles / aspect) * latPerMile;

  const project = (lat: number, lng: number) => ({
    x: VIEW_W / 2 + ((lng - center.lng) / spanLng) * VIEW_W,
    // Screen y grows downward, latitude grows upward.
    y: VIEW_H / 2 - ((lat - center.lat) / spanLat) * VIEW_H,
  });

  const pixelsPerMile = VIEW_W / spanMiles;

  const roads = useMemo(
    () => buildRoads(center.lat, center.lng, VIEW_W, VIEW_H),
    [center.lat, center.lng, VIEW_W, VIEW_H],
  );

  const projected = markers
    .map((marker) => ({ marker, point: project(marker.lat, marker.lng) }))
    .filter(({ point }) => point.x > -24 && point.x < VIEW_W + 24 && point.y > -24 && point.y < VIEW_H + 24);

  return (
    <View
      onLayout={onLayout}
      style={[{ height, borderRadius: r.lg, overflow: 'hidden', backgroundColor: color.mapLand }, style]}
    >
      <Svg width="100%" height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="xMidYMid slice">
        <Defs>
          <RadialGradient id="beaconGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color.brand} stopOpacity="0.30" />
            <Stop offset="0.72" stopColor={color.brand} stopOpacity="0.12" />
            <Stop offset="1" stopColor={color.brand} stopOpacity="0.02" />
          </RadialGradient>
        </Defs>

        <Rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={color.mapLand} />

        {/* Water body — stands in for the coastline west of the basin. */}
        <Path
          d={`M-10,${VIEW_H * 0.62} C${VIEW_W * 0.12},${VIEW_H * 0.7} ${VIEW_W * 0.2},${VIEW_H * 0.92} ${VIEW_W * 0.34},${VIEW_H + 10} L-10,${VIEW_H + 10} Z`}
          fill={color.mapWater}
        />
        <Path
          d={`M${VIEW_W * 0.68},${-10} C${VIEW_W * 0.78},${VIEW_H * 0.14} ${VIEW_W * 0.9},${VIEW_H * 0.2} ${VIEW_W + 10},${VIEW_H * 0.18} L${VIEW_W + 10},-10 Z`}
          fill={color.mapPark}
        />

        {roads.minor.map((d, i) => (
          <Path key={`minor-${i}`} d={d} stroke={color.mapRoad} strokeWidth={1.1} fill="none" opacity={0.7} />
        ))}
        {roads.major.map((d, i) => (
          <Path key={`major-${i}`} d={d} stroke={color.mapRoadMajor} strokeWidth={2.6} fill="none" />
        ))}

        {radiusMiles ? (
          <G>
            <Circle
              cx={VIEW_W / 2}
              cy={VIEW_H / 2}
              r={radiusMiles * pixelsPerMile}
              fill="url(#beaconGlow)"
              stroke={color.brand}
              strokeWidth={1.6}
              strokeDasharray="6 5"
            />
          </G>
        ) : null}

        {projected.map(({ marker, point }) => (
          <MapPin key={marker.id} marker={marker} x={point.x} y={point.y} />
        ))}

        {/* The viewer's own position. */}
        <Circle cx={VIEW_W / 2} cy={VIEW_H / 2} r={7} fill={color.brand} opacity={0.28} />
        <Circle cx={VIEW_W / 2} cy={VIEW_H / 2} r={3.6} fill={color.brand} stroke="#FFFFFF" strokeWidth={1.6} />

        {label ? (
          <SvgText x={VIEW_W / 2} y={VIEW_H - 14} fill={color.textMuted} fontSize="11" textAnchor="middle">
            {label}
          </SvgText>
        ) : null}
      </Svg>

      {/* Tap targets sit above the SVG so pins stay pressable on every platform. */}
      <View style={{ position: 'absolute', inset: 0 as never }} pointerEvents="box-none">
        {projected
          .filter(({ marker }) => marker.onPress)
          .map(({ marker, point }) => (
            <Pressable
              key={`hit-${marker.id}`}
              accessibilityRole="button"
              accessibilityLabel={marker.label ?? marker.kind}
              onPress={marker.onPress}
              style={{
                position: 'absolute',
                left: `${(point.x / VIEW_W) * 100}%`,
                top: `${(point.y / VIEW_H) * 100}%`,
                width: 34,
                height: 34,
                marginLeft: -17,
                marginTop: -22,
              }}
            />
          ))}
      </View>

      {children}
    </View>
  );
}

function MapPin({ marker, x, y }: { marker: MapMarker; x: number; y: number }) {
  const style = MARKER_STYLE[marker.kind];
  const size = marker.selected ? 15 : 12;

  return (
    <G>
      {marker.selected ? <Circle cx={x} cy={y} r={size + 8} fill={style.fill} opacity={0.2} /> : null}
      <Path
        d={`M${x},${y + size * 1.15} C${x - size * 0.95},${y + size * 0.2} ${x - size},${y - size * 0.55} ${x},${y - size} C${x + size},${y - size * 0.55} ${x + size * 0.95},${y + size * 0.2} ${x},${y + size * 1.15} Z`}
        fill={style.fill}
        stroke={marker.selected ? '#FFFFFF' : 'rgba(14,6,18,0.5)'}
        strokeWidth={marker.selected ? 1.8 : 1}
      />
      {style.glyph === 'person' ? (
        <G>
          <Circle cx={x} cy={y - size * 0.28} r={size * 0.24} fill="#FFFFFF" />
          <Path
            d={`M${x - size * 0.38},${y + size * 0.26} a${size * 0.38},${size * 0.32} 0 0 1 ${size * 0.76},0 Z`}
            fill="#FFFFFF"
          />
        </G>
      ) : null}
      {style.glyph === 'camera' ? (
        <G>
          <Rect
            x={x - size * 0.42}
            y={y - size * 0.4}
            width={size * 0.84}
            height={size * 0.62}
            rx={size * 0.14}
            fill="#FFFFFF"
          />
          <Circle cx={x} cy={y - size * 0.09} r={size * 0.19} fill={style.fill} />
        </G>
      ) : null}
      {style.glyph === 'bolt' ? (
        <Path
          d={`M${x + size * 0.22},${y - size * 0.52} L${x - size * 0.3},${y + size * 0.06} L${x + size * 0.02},${y + size * 0.06} L${x - size * 0.14},${y + size * 0.6} L${x + size * 0.34},${y - size * 0.06} L${x + size * 0.03},${y - size * 0.06} Z`}
          fill="#FFFFFF"
        />
      ) : null}
      {style.glyph === 'dot' ? <Circle cx={x} cy={y - size * 0.12} r={size * 0.26} fill="#FFFFFF" /> : null}
    </G>
  );
}

/**
 * Procedural street grid.
 *
 * Seeded from the map centre so the same location always draws the same
 * streets — a basemap that reshuffled on every render would read as noise.
 */
function buildRoads(
  lat: number,
  lng: number,
  VIEW_W: number,
  VIEW_H: number,
): { major: string[]; minor: string[] } {
  let h = Math.imul(Math.round(lat * 1000) ^ Math.round(lng * 1000), 0x01000193) >>> 0;
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0;
    return h / 0xffffffff;
  };

  const major: string[] = [];
  const minor: string[] = [];

  // Two arterial diagonals with a slight bend.
  for (let i = 0; i < 3; i += 1) {
    const y = VIEW_H * (0.2 + i * 0.3 + next() * 0.06);
    const bend = (next() - 0.5) * 60;
    major.push(`M-10,${y} Q${VIEW_W / 2},${y + bend} ${VIEW_W + 10},${y + bend * 0.4}`);
  }
  const arterials = Math.max(3, Math.round((VIEW_W / VIEW_H) * 3));
  for (let i = 0; i < arterials; i += 1) {
    const x = VIEW_W * ((0.14 + i * (0.72 / arterials)) + next() * 0.05);
    const bend = (next() - 0.5) * 50;
    major.push(`M${x},-10 Q${x + bend},${VIEW_H / 2} ${x + bend * 0.4},${VIEW_H + 10}`);
  }

  // Minor grid between the arterials, denser on wider canvases.
  const columns = Math.max(11, Math.round((VIEW_W / VIEW_H) * 11));
  for (let i = 0; i < 11; i += 1) {
    const y = (VIEW_H / 12) * (i + 1) + (next() - 0.5) * 6;
    minor.push(`M-10,${y} L${VIEW_W + 10},${y + (next() - 0.5) * 14}`);
  }
  for (let i = 0; i < columns; i += 1) {
    const x = (VIEW_W / (columns + 1)) * (i + 1) + (next() - 0.5) * 6;
    minor.push(`M${x},-10 L${x + (next() - 0.5) * 14},${VIEW_H + 10}`);
  }

  return { major, minor };
}

/** Floating callout used over the map for a selected pin. */
export function MapCallout({
  title,
  rows,
  actions,
  style,
}: {
  title: string;
  rows: { label: string; value: string }[];
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          backgroundColor: color.bgElev,
          borderRadius: r.md,
          borderWidth: 1,
          borderColor: color.border,
          padding: space.md,
          gap: space.sm,
          minWidth: 190,
        },
        style,
      ]}
    >
      <Text variant="label" tone="accent" upper>
        {title}
      </Text>
      {rows.map((row) => (
        <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: space.md }}>
          <Text variant="caption" tone="faint" upper>
            {row.label}
          </Text>
          <Text variant="caption" tone="default" weight="700">
            {row.value}
          </Text>
        </View>
      ))}
      {actions}
    </View>
  );
}
