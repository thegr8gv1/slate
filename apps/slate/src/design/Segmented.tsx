import { Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { color, radius, space } from './tokens';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  badge?: string | number;
}

/**
 * Tab strip used for the in-screen switches (HOME / MY PORTFOLIO / CASTING
 * CALLS). Underline treatment rather than a pill group, so it reads as
 * navigation inside a screen and not as a filter control.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
  scrollable,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  style?: StyleProp<ViewStyle>;
  scrollable?: boolean;
}) {
  const content = (
    <View
      style={{
        flexDirection: 'row',
        gap: space.xl,
        borderBottomWidth: 1,
        borderBottomColor: color.border,
      }}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={{
              paddingBottom: space.sm,
              borderBottomWidth: 2,
              borderBottomColor: active ? color.accent : 'transparent',
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.xs,
            }}
          >
            <Text variant="label" tone={active ? 'default' : 'faint'} upper>
              {option.label}
            </Text>
            {option.badge !== undefined && option.badge !== 0 ? (
              <View
                style={{
                  minWidth: 17,
                  paddingHorizontal: 4,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: active ? color.accent : color.surfaceHot,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text variant="micro" style={{ color: active ? '#FFF' : color.textMuted, fontSize: 9 }}>
                  {option.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );

  if (!scrollable) return <View style={style}>{content}</View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={style}>
      {content}
    </ScrollView>
  );
}

/**
 * Compact chip group for filters. Multi-select by default because filters are
 * almost always additive (three sectors, two union statuses).
 */
export function ChipGroup<T extends string>({
  options,
  selected,
  onToggle,
  single,
  style,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  single?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }, style]}>
      {options.map((option) => {
        const active = selected.includes(option.value);
        return (
          <Pressable
            key={option.value}
            accessibilityRole={single ? 'radio' : 'checkbox'}
            accessibilityState={{ checked: active }}
            onPress={() => onToggle(option.value)}
            style={{
              paddingHorizontal: space.md,
              paddingVertical: 6,
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: active ? color.accentBorder : color.border,
              backgroundColor: active ? color.accentSoft : color.surfaceAlt,
            }}
          >
            <Text variant="caption" tone={active ? 'accent' : 'muted'}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
