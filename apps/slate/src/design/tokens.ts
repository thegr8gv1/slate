import { Platform } from 'react-native';

/**
 * SLATE design tokens.
 *
 * One file, three platforms. Every colour, radius, and type step the app
 * renders comes from here — nothing downstream hard-codes a hex value — which
 * is what keeps iOS, Android, and the web build visually identical.
 *
 * The palette is dark-first by product decision, not by theme preference: the
 * app is used on set at night, in edit bays, and in colour suites, where a
 * light UI is genuinely unusable.
 */

export const color = {
  /** Page ground — deep ethereal midnight plum. */
  bg: '#0E0612',
  /** Raised regions: headers, nav bars, sheets. */
  bgElev: '#1A0A22',
  /** Frosted rose glass cards. */
  surface: 'rgba(38, 16, 48, 0.68)',
  /** Nested cards and inputs. */
  surfaceAlt: 'rgba(56, 24, 70, 0.60)',
  /** Pressed / hovered surface. */
  surfaceHot: 'rgba(84, 34, 102, 0.72)',
  border: 'rgba(244, 114, 182, 0.18)',
  borderStrong: 'rgba(251, 113, 133, 0.38)',
  scrim: 'rgba(12, 4, 16, 0.82)',

  text: '#FFF1F2',
  textMuted: '#E5B8C8',
  textFaint: '#A16E83',
  textInverse: '#0E0612',

  /** Primary action — ethereal vibrant rose on every CTA in the product. */
  accent: '#F43F5E',
  accentPressed: '#E11D48',
  accentSoft: 'rgba(244, 63, 94, 0.16)',
  accentBorder: 'rgba(244, 63, 94, 0.45)',

  /** Brand rose — wordmark, Super Pitch, informational chips. */
  brand: '#FB7185',
  brandSoft: 'rgba(251, 113, 133, 0.16)',

  success: '#34D399',
  successSoft: 'rgba(52, 211, 153, 0.16)',
  warning: '#FBBF24',
  warningSoft: 'rgba(251, 191, 36, 0.16)',
  danger: '#FB7185',
  dangerSoft: 'rgba(251, 113, 133, 0.16)',

  /** Data-visualisation ramp; ordered for categorical series. */
  series: ['#FB7185', '#F43F5E', '#C084FC', '#38BDF8', '#34D399', '#FBBF24'] as const,

  /** Map surfaces. */
  mapLand: '#1C0D26',
  mapWater: '#13081C',
  mapPark: '#1A332B',
  mapRoad: '#2E163D',
  mapRoadMajor: '#4A225F',
} as const;

export const space = {
  xxs: 4,
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
} as const;

export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

/**
 * Type scale. `fontFamily` resolves per platform so the app reads native
 * without shipping a webfont — the visual weight and rhythm stay identical.
 */
const systemFont = Platform.select({
  ios: 'System',
  android: 'sans-serif',
  default:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
});

const systemFontMedium = Platform.select({
  ios: 'System',
  android: 'sans-serif-medium',
  default:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
});

export const font = {
  body: systemFont,
  medium: systemFontMedium,
  mono: Platform.select({
    ios: 'Menlo',
    android: 'monospace',
    default: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  }),
} as const;

export type TypeVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subheading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'micro'
  | 'overline'
  | 'numeric';

export const type: Record<
  TypeVariant,
  { fontSize: number; lineHeight: number; fontWeight: '400' | '500' | '600' | '700' | '800'; letterSpacing: number }
> = {
  display: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.4 },
  title: { fontSize: 21, lineHeight: 27, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 17, lineHeight: 23, fontWeight: '700', letterSpacing: -0.15 },
  subheading: { fontSize: 15, lineHeight: 21, fontWeight: '600', letterSpacing: -0.1 },
  body: { fontSize: 14.5, lineHeight: 21, fontWeight: '400', letterSpacing: 0 },
  bodyStrong: { fontSize: 14.5, lineHeight: 21, fontWeight: '600', letterSpacing: 0 },
  label: { fontSize: 12.5, lineHeight: 17, fontWeight: '600', letterSpacing: 0.1 },
  caption: { fontSize: 11.5, lineHeight: 16, fontWeight: '500', letterSpacing: 0.1 },
  micro: { fontSize: 10, lineHeight: 13, fontWeight: '600', letterSpacing: 0.2 },
  overline: { fontSize: 11, lineHeight: 15, fontWeight: '700', letterSpacing: 1.1 },
  numeric: { fontSize: 22, lineHeight: 26, fontWeight: '800', letterSpacing: -0.5 },
};

/**
 * Elevation. React Native and the web disagree about shadows, so each level
 * emits the right primitive for its platform rather than approximating one
 * with the other.
 */
export function elevation(level: 0 | 1 | 2 | 3) {
  if (level === 0) return {};
  const spec = {
    1: { radius: 14, y: 4, opacity: 0.35, android: 4 },
    2: { radius: 24, y: 10, opacity: 0.45, android: 8 },
    3: { radius: 40, y: 18, opacity: 0.55, android: 16 },
  }[level];

  return Platform.select({
    web: {
      boxShadow: `inset 0 1px 1px 0 rgba(255, 255, 255, 0.12), 0 ${spec.y}px ${spec.radius}px rgba(12, 3, 18, ${spec.opacity})`,
    },
    android: { elevation: spec.android },
    default: {
      shadowColor: '#120418',
      shadowOffset: { width: 0, height: spec.y },
      shadowRadius: spec.radius,
      shadowOpacity: spec.opacity,
    },
  }) as object;
}

/** Breakpoints. Below `md` the shell uses bottom tabs; at and above, a rail. */
export const breakpoint = {
  sm: 480,
  md: 900,
  lg: 1280,
  xl: 1600,
} as const;

/** Maximum content width so the web build does not sprawl on a 32" display. */
export const layout = {
  maxContent: 1180,
  railWidth: 244,
  railCollapsed: 76,
  headerHeight: 58,
  tabBarHeight: 62,
  /** Phone-frame width used by the deck and other single-column surfaces. */
  columnWidth: 460,
} as const;

export const duration = {
  fast: 140,
  base: 220,
  slow: 380,
} as const;
