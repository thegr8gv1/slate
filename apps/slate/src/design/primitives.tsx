import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from './Text';
import { color, elevation, radius, space } from './tokens';

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export function Row({
  gap = space.sm,
  align = 'center',
  justify = 'flex-start',
  wrap,
  style,
  children,
}: {
  gap?: number;
  align?: ViewStyle['alignItems'];
  justify?: ViewStyle['justifyContent'];
  wrap?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: align,
          justifyContent: justify,
          gap,
          flexWrap: wrap ? 'wrap' : 'nowrap',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Stack({
  gap = space.md,
  style,
  children,
}: {
  gap?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  return <View style={[{ gap }, style]}>{children}</View>;
}

export function Spacer({ size = space.lg }: { size?: number }) {
  return <View style={{ height: size }} />;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: color.border }, style]} />;
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

export interface CardProps {
  children: ReactNode;
  /** `alt` nests inside another card; `flat` drops the border. */
  variant?: 'default' | 'alt' | 'flat' | 'outline';
  padding?: number;
  level?: 0 | 1 | 2 | 3;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, variant = 'default', padding = space.lg, level = 1, style }: CardProps) {
  const background =
    variant === 'alt'
      ? Platform.OS === 'android'
        ? '#281134'
        : color.surfaceAlt
      : variant === 'outline'
        ? 'transparent'
        : Platform.OS === 'android'
          ? '#1D0A26'
          : color.surface;
  return (
    <View
      style={[
        {
          backgroundColor: background,
          borderRadius: radius.lg,
          padding,
          borderWidth: variant === 'flat' ? 0 : StyleSheet.hairlineWidth * 2,
          borderColor: color.border,
          ...(Platform.OS === 'web' && variant !== 'outline'
            ? ({
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              } as object)
            : {}),
        },
        elevation(variant === 'flat' || variant === 'outline' ? 0 : level),
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Section header — the "- VFX COLLAB" treatment                       */
/* ------------------------------------------------------------------ */

export function SectionTitle({
  title,
  accent,
  action,
  style,
}: {
  title: string;
  /** Rendered in orange after the grey lead-in, e.g. CASTING ROOM: SILVERLINE. */
  accent?: string;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Row justify="space-between" style={style}>
      <Row gap={space.xs}>
        <Text variant="overline" tone="faint">
          —
        </Text>
        <Text variant="overline" tone="muted" upper>
          {title}
        </Text>
        {accent ? (
          <Text variant="overline" tone="accent" upper>
            {accent}
          </Text>
        ) : null}
      </Row>
      {action}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

export interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'brand';
  size?: 'sm' | 'md' | 'lg';
  icon?: ReactNode;
  trailing?: ReactNode;
  loading?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  icon,
  trailing,
  loading,
  full,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const height = size === 'sm' ? 34 : size === 'lg' ? 52 : 42;
  const paddingHorizontal = size === 'sm' ? space.md : size === 'lg' ? space.xxl : space.lg;

  const palette = {
    primary: { bg: color.accent, pressed: color.accentPressed, text: '#FFFFFF', border: color.accentBorder },
    brand: { bg: color.brand, pressed: '#E11D48', text: '#FFFFFF', border: 'transparent' },
    success: { bg: color.success, pressed: '#059669', text: '#022C22', border: 'transparent' },
    danger: { bg: color.danger, pressed: '#BE185D', text: '#FFFFFF', border: 'transparent' },
    secondary: { bg: color.surfaceAlt, pressed: color.surfaceHot, text: color.text, border: color.border },
    ghost: { bg: 'transparent', pressed: color.surfaceAlt, text: color.textMuted, border: 'transparent' },
  }[variant];

  return (
    <Pressable
      {...rest}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      android_ripple={
        disabled || loading
          ? undefined
          : {
              color:
                variant === 'primary' || variant === 'brand' || variant === 'danger'
                  ? 'rgba(255, 255, 255, 0.22)'
                  : 'rgba(244, 63, 94, 0.2)',
            }
      }
      style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
        {
          height,
          paddingHorizontal,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: space.sm,
          alignSelf: full ? 'stretch' : 'flex-start',
          backgroundColor: pressed || hovered ? palette.pressed : palette.bg,
          borderWidth: palette.border === 'transparent' ? 0 : StyleSheet.hairlineWidth * 2,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : 1,
        },
        style as ViewStyle,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={palette.text} /> : icon}
      <Text
        variant={size === 'sm' ? 'label' : 'subheading'}
        upper={variant === 'primary' || variant === 'danger'}
        style={{ color: palette.text }}
      >
        {label}
      </Text>
      {trailing}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

const AVATAR_RAMPS: readonly [string, string][] = [
  ['#F43F5E', '#BE185D'],
  ['#FB7185', '#E11D48'],
  ['#E879F9', '#9333EA'],
  ['#F472B6', '#DB2777'],
  ['#FB923C', '#E11D48'],
  ['#A855F7', '#EC4899'],
];

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function rampFor(seed: string): [string, string] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_RAMPS[h % AVATAR_RAMPS.length];
}

/**
 * Avatar with a deterministic gradient underlay.
 *
 * The gradient and initials render immediately and stay put if the remote
 * photo is slow, blocked, or the device is offline — so a list of 40 cards
 * never shows a grid of grey holes.
 */
export function Avatar({
  name,
  uri,
  size = 44,
  ring,
  badge,
  square,
}: {
  name: string;
  uri?: string | null;
  size?: number;
  ring?: string;
  badge?: ReactNode;
  square?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const ramp = useMemo(() => rampFor(name || 'slate'), [name]);
  const corner = square ? radius.md : size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: corner,
          overflow: 'hidden',
          borderWidth: ring ? 2 : 0,
          borderColor: ring ?? 'transparent',
          backgroundColor: color.surfaceAlt,
        }}
      >
        <LinearGradient
          colors={ramp}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <Text style={{ fontSize: size * 0.36, fontWeight: '700', color: 'rgba(255,255,255,0.92)' }}>
            {initialsOf(name)}
          </Text>
        </View>
        {uri && !failed ? (
          <Image
            source={{ uri }}
            onError={() => setFailed(true)}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            accessibilityLabel={name}
          />
        ) : null}
      </View>
      {badge ? <View style={{ position: 'absolute', right: -2, bottom: -2 }}>{badge}</View> : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Photo — same offline-safe treatment for wide imagery                */
/* ------------------------------------------------------------------ */

export function Photo({
  uri,
  seed,
  height,
  width,
  rounded = radius.md,
  children,
  style,
}: {
  uri?: string | null;
  seed: string;
  height?: number;
  width?: number;
  rounded?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);
  const ramp = useMemo(() => rampFor(seed), [seed]);

  return (
    <View
      style={[
        { height, width, borderRadius: rounded, overflow: 'hidden', backgroundColor: color.surfaceAlt },
        style,
      ]}
    >
      <LinearGradient
        colors={[ramp[0], ramp[1]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(14, 6, 18, 0.55)' }]} />
      {uri && !failed ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Pill / Badge                                                        */
/* ------------------------------------------------------------------ */

export type PillTone = 'neutral' | 'accent' | 'brand' | 'success' | 'warning' | 'danger' | 'outline';

const PILL_TONES: Record<PillTone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: color.surfaceAlt, fg: color.textMuted, border: color.border },
  accent: { bg: color.accentSoft, fg: color.accent, border: color.accentBorder },
  brand: { bg: color.brandSoft, fg: color.brand, border: 'rgba(251, 113, 133, 0.32)' },
  success: { bg: color.successSoft, fg: color.success, border: 'rgba(52, 211, 153, 0.32)' },
  warning: { bg: color.warningSoft, fg: color.warning, border: 'rgba(251, 191, 36, 0.32)' },
  danger: { bg: color.dangerSoft, fg: color.danger, border: 'rgba(251, 113, 133, 0.32)' },
  outline: { bg: 'transparent', fg: color.textMuted, border: color.border },
};

export function Pill({
  label,
  tone = 'neutral',
  icon,
  size = 'md',
  style,
}: {
  label: string;
  tone?: PillTone;
  icon?: ReactNode;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}) {
  const palette = PILL_TONES[tone];
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: space.xxs,
          paddingHorizontal: size === 'sm' ? space.sm : space.md,
          paddingVertical: size === 'sm' ? 2 : 4,
          borderRadius: radius.pill,
          backgroundColor: palette.bg,
          borderWidth: palette.border === 'transparent' ? 0 : StyleSheet.hairlineWidth * 2,
          borderColor: palette.border,
        },
        style,
      ]}
    >
      {icon}
      <Text variant={size === 'sm' ? 'micro' : 'caption'} style={{ color: palette.fg }} upper={size === 'sm'}>
        {label}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  sub,
  tone = 'default',
  align = 'flex-start',
  style,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'success' | 'accent' | 'danger' | 'muted';
  align?: ViewStyle['alignItems'];
  style?: StyleProp<ViewStyle>;
}) {
  const valueTone = tone === 'default' ? 'default' : tone === 'muted' ? 'muted' : tone;
  return (
    <View style={[{ alignItems: align, gap: 2 }, style]}>
      <Text variant="micro" tone="faint" upper>
        {label}
      </Text>
      <Text variant="numeric" tone={valueTone}>
        {value}
      </Text>
      {sub ? (
        <Text variant="caption" tone="faint">
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Toggle                                                              */
/* ------------------------------------------------------------------ */

export function Toggle({
  value,
  onChange,
  disabled,
  label,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={{
        width: 50,
        height: 28,
        borderRadius: radius.pill,
        backgroundColor: value ? color.success : color.surfaceHot,
        padding: 3,
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: '#FFFFFF',
          transform: [{ translateX: value ? 22 : 0 }],
        }}
      />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ */
/* Empty & loading states                                              */
/* ------------------------------------------------------------------ */

export function EmptyState({
  title,
  body,
  action,
  icon,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card variant="outline" padding={space.xxl} style={{ alignItems: 'center', gap: space.sm }}>
      {icon}
      <Text variant="heading" align="center">
        {title}
      </Text>
      {body ? (
        <Text variant="body" tone="muted" align="center" style={{ maxWidth: 340 }}>
          {body}
        </Text>
      ) : null}
      {action}
    </Card>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={{ padding: space.xxxl, alignItems: 'center', gap: space.md }}>
      <ActivityIndicator color={color.accent} />
      <Text variant="caption" tone="faint" upper>
        {label}
      </Text>
    </View>
  );
}

export function ErrorNote({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card variant="alt" style={{ borderColor: color.dangerSoft, gap: space.md }}>
      <Row gap={space.sm} align="flex-start">
        <View
          style={{
            width: 6,
            alignSelf: 'stretch',
            borderRadius: 3,
            backgroundColor: color.danger,
          }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" tone="danger" upper>
            Request failed
          </Text>
          <Text variant="body" tone="muted">
            {message}
          </Text>
        </View>
      </Row>
      {onRetry ? <Button label="Try again" variant="secondary" size="sm" onPress={onRetry} /> : null}
    </Card>
  );
}
