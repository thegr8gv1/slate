import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { color, font, type as typeScale, type TypeVariant } from './tokens';

export interface TextProps extends RNTextProps {
  variant?: TypeVariant;
  tone?: 'default' | 'muted' | 'faint' | 'accent' | 'brand' | 'success' | 'warning' | 'danger' | 'inverse';
  align?: TextStyle['textAlign'];
  /** Uppercases and applies the tracked overline treatment. */
  upper?: boolean;
  mono?: boolean;
  weight?: TextStyle['fontWeight'];
}

const TONES: Record<NonNullable<TextProps['tone']>, string> = {
  default: color.text,
  muted: color.textMuted,
  faint: color.textFaint,
  accent: color.accent,
  brand: color.brand,
  success: color.success,
  warning: color.warning,
  danger: color.danger,
  inverse: color.textInverse,
};

/**
 * The only text primitive in the app. Screens pick a variant and a tone; they
 * never set fontSize or a raw colour, which is what keeps the type rhythm
 * identical on every platform.
 */
export function Text({
  variant = 'body',
  tone = 'default',
  align,
  upper,
  mono,
  weight,
  style,
  ...rest
}: TextProps) {
  const scale = typeScale[variant];
  return (
    <RNText
      {...rest}
      style={[
        {
          fontFamily: mono ? font.mono : scale.fontWeight === '400' ? font.body : font.medium,
          fontSize: scale.fontSize,
          lineHeight: scale.lineHeight,
          fontWeight: weight ?? scale.fontWeight,
          letterSpacing: upper ? 1.1 : scale.letterSpacing,
          color: TONES[tone],
          textAlign: align,
          textTransform: upper ? 'uppercase' : undefined,
        },
        style,
      ]}
    />
  );
}
