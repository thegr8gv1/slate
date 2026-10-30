import Svg, { Circle, Path, Polyline, Rect, Line, Polygon } from 'react-native-svg';
import { color } from './tokens';

/**
 * Icon set.
 *
 * Hand-drawn stroke paths on a 24-unit grid rather than an icon font: fonts
 * need per-platform asset loading and render at different optical weights on
 * iOS, Android and the web. Vectors are identical everywhere and inherit the
 * stroke colour from the caller.
 */

export type IconName =
  | 'menu'
  | 'search'
  | 'bell'
  | 'home'
  | 'compass'
  | 'inbox'
  | 'user'
  | 'users'
  | 'film'
  | 'camera'
  | 'video'
  | 'pin'
  | 'zap'
  | 'dollar'
  | 'shield'
  | 'chart'
  | 'check'
  | 'checkCircle'
  | 'close'
  | 'undo'
  | 'heart'
  | 'arrowUp'
  | 'arrowRight'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'play'
  | 'pause'
  | 'record'
  | 'rewind'
  | 'forward'
  | 'settings'
  | 'lock'
  | 'eyeOff'
  | 'file'
  | 'briefcase'
  | 'star'
  | 'plus'
  | 'filter'
  | 'send'
  | 'edit'
  | 'list'
  | 'globe'
  | 'clock'
  | 'calendar'
  | 'trending'
  | 'alert'
  | 'logout'
  | 'grid'
  | 'sliders'
  | 'mic'
  | 'expand'
  | 'volume'
  | 'sparkle';

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color: stroke = color.textMuted, strokeWidth = 1.9 }: IconProps) {
  const common = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {render(name, common, stroke)}
    </Svg>
  );
}

type Common = {
  stroke: string;
  strokeWidth: number;
  strokeLinecap: 'round';
  strokeLinejoin: 'round';
  /** Widened because solid glyphs (play, star, record) override it per shape. */
  fill: string;
};

function render(name: IconName, c: Common, stroke: string) {
  switch (name) {
    case 'menu':
      return (
        <>
          <Line x1="3" y1="7" x2="21" y2="7" {...c} />
          <Line x1="3" y1="12" x2="21" y2="12" {...c} />
          <Line x1="3" y1="17" x2="15" y2="17" {...c} />
        </>
      );
    case 'search':
      return (
        <>
          <Circle cx="11" cy="11" r="7" {...c} />
          <Line x1="16.5" y1="16.5" x2="21" y2="21" {...c} />
        </>
      );
    case 'bell':
      return (
        <>
          <Path d="M18 8a6 6 0 1 0-12 0c0 6-2 7-2 7h16s-2-1-2-7Z" {...c} />
          <Path d="M10.3 20a2 2 0 0 0 3.4 0" {...c} />
        </>
      );
    case 'home':
      return (
        <>
          <Path d="M3 10.5 12 3l9 7.5" {...c} />
          <Path d="M5.5 9.5V20a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5" {...c} />
        </>
      );
    case 'compass':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Polygon points="15.5,8.5 13.5,13.5 8.5,15.5 10.5,10.5" {...c} />
        </>
      );
    case 'inbox':
      return (
        <>
          <Path d="M3 13h5l1.5 3h5L16 13h5" {...c} />
          <Path d="M5.5 4h13l2.5 9v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6Z" {...c} />
        </>
      );
    case 'user':
      return (
        <>
          <Circle cx="12" cy="8" r="4" {...c} />
          <Path d="M4.5 20c0-3.6 3.4-6 7.5-6s7.5 2.4 7.5 6" {...c} />
        </>
      );
    case 'users':
      return (
        <>
          <Circle cx="9" cy="8" r="3.5" {...c} />
          <Path d="M2.5 20c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5" {...c} />
          <Path d="M17 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c2.1.7 3.5 2.5 3.5 5.2" {...c} />
        </>
      );
    case 'film':
      return (
        <>
          <Rect x="3" y="4" width="18" height="16" rx="2" {...c} />
          <Line x1="8" y1="4" x2="8" y2="20" {...c} />
          <Line x1="16" y1="4" x2="16" y2="20" {...c} />
          <Line x1="3" y1="12" x2="21" y2="12" {...c} />
        </>
      );
    case 'camera':
      return (
        <>
          <Path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" {...c} />
          <Circle cx="12" cy="13.5" r="3.5" {...c} />
        </>
      );
    case 'video':
      return (
        <>
          <Rect x="2.5" y="6" width="13" height="12" rx="2" {...c} />
          <Path d="M15.5 10.5 21.5 7v10l-6-3.5Z" {...c} />
        </>
      );
    case 'pin':
      return (
        <>
          <Path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" {...c} />
          <Circle cx="12" cy="10" r="2.6" {...c} />
        </>
      );
    case 'zap':
      return <Polygon points="13,2 4,14 11,14 10,22 20,9 13,9" {...c} />;
    case 'dollar':
      return (
        <>
          <Line x1="12" y1="2.5" x2="12" y2="21.5" {...c} />
          <Path d="M16.5 6.5H10a3.25 3.25 0 0 0 0 6.5h4a3.25 3.25 0 0 1 0 6.5H7" {...c} />
        </>
      );
    case 'shield':
      return (
        <>
          <Path d="M12 2.5 20 6v6c0 5-3.4 8.4-8 9.5-4.6-1.1-8-4.5-8-9.5V6Z" {...c} />
          <Polyline points="8.8,12 11,14.2 15.4,9.8" {...c} />
        </>
      );
    case 'chart':
      return (
        <>
          <Line x1="3.5" y1="20.5" x2="20.5" y2="20.5" {...c} />
          <Rect x="5.5" y="12" width="3.4" height="6" rx="1" {...c} />
          <Rect x="10.3" y="7" width="3.4" height="11" rx="1" {...c} />
          <Rect x="15.1" y="10" width="3.4" height="8" rx="1" {...c} />
        </>
      );
    case 'check':
      return <Polyline points="4.5,12.5 9.5,17.5 19.5,6.5" {...c} />;
    case 'checkCircle':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Polyline points="8,12.2 10.9,15 16.2,9.2" {...c} />
        </>
      );
    case 'close':
      return (
        <>
          <Line x1="6" y1="6" x2="18" y2="18" {...c} />
          <Line x1="18" y1="6" x2="6" y2="18" {...c} />
        </>
      );
    case 'undo':
      return (
        <>
          <Path d="M3.5 10h11a5.5 5.5 0 0 1 5.5 5.5v1" {...c} />
          <Polyline points="7.5,6 3.5,10 7.5,14" {...c} />
        </>
      );
    case 'heart':
      return (
        <Path
          d="M12 20.5s-7.5-4.6-7.5-9.9A4.6 4.6 0 0 1 12 7.6a4.6 4.6 0 0 1 7.5 3c0 5.3-7.5 9.9-7.5 9.9Z"
          {...c}
        />
      );
    case 'arrowUp':
      return (
        <>
          <Line x1="12" y1="20" x2="12" y2="4.5" {...c} />
          <Polyline points="5.5,11 12,4.5 18.5,11" {...c} />
        </>
      );
    case 'arrowRight':
      return (
        <>
          <Line x1="4" y1="12" x2="19.5" y2="12" {...c} />
          <Polyline points="13,5.5 19.5,12 13,18.5" {...c} />
        </>
      );
    case 'chevronLeft':
      return <Polyline points="15,5 8,12 15,19" {...c} />;
    case 'chevronRight':
      return <Polyline points="9,5 16,12 9,19" {...c} />;
    case 'chevronDown':
      return <Polyline points="5,9 12,16 19,9" {...c} />;
    case 'play':
      return <Polygon points="7,4.5 20,12 7,19.5" {...c} fill={stroke} />;
    case 'pause':
      return (
        <>
          <Rect x="7" y="5" width="3.4" height="14" rx="1.2" {...c} fill={stroke} />
          <Rect x="13.6" y="5" width="3.4" height="14" rx="1.2" {...c} fill={stroke} />
        </>
      );
    case 'record':
      return <Circle cx="12" cy="12" r="7" {...c} fill={stroke} />;
    case 'rewind':
      return (
        <>
          <Polygon points="11,12 20,6.5 20,17.5" {...c} fill={stroke} />
          <Polygon points="3.5,12 11,6.5 11,17.5" {...c} fill={stroke} />
        </>
      );
    case 'forward':
      return (
        <>
          <Polygon points="13,12 4,6.5 4,17.5" {...c} fill={stroke} />
          <Polygon points="20.5,12 13,6.5 13,17.5" {...c} fill={stroke} />
        </>
      );
    case 'settings':
      return (
        <>
          <Circle cx="12" cy="12" r="3.2" {...c} />
          <Path
            d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"
            {...c}
          />
        </>
      );
    case 'lock':
      return (
        <>
          <Rect x="4.5" y="10.5" width="15" height="10" rx="2" {...c} />
          <Path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" {...c} />
        </>
      );
    case 'eyeOff':
      return (
        <>
          <Path d="M9.9 5.2A9.6 9.6 0 0 1 12 5c6 0 9.5 7 9.5 7a15 15 0 0 1-2.9 3.8" {...c} />
          <Path d="M6.4 6.6A15.6 15.6 0 0 0 2.5 12S6 19 12 19a9.4 9.4 0 0 0 4.1-.9" {...c} />
          <Line x1="3.5" y1="3.5" x2="20.5" y2="20.5" {...c} />
        </>
      );
    case 'file':
      return (
        <>
          <Path d="M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5Z" {...c} />
          <Polyline points="13.8,3 13.8,7.8 18.5,7.8" {...c} />
          <Line x1="8.8" y1="13" x2="15.2" y2="13" {...c} />
          <Line x1="8.8" y1="16.5" x2="13" y2="16.5" {...c} />
        </>
      );
    case 'briefcase':
      return (
        <>
          <Rect x="2.8" y="7.5" width="18.4" height="12" rx="2" {...c} />
          <Path d="M8.6 7.5V5.8A1.8 1.8 0 0 1 10.4 4h3.2a1.8 1.8 0 0 1 1.8 1.8v1.7" {...c} />
          <Line x1="2.8" y1="12.5" x2="21.2" y2="12.5" {...c} />
        </>
      );
    case 'star':
      return (
        <Polygon
          points="12,3.5 14.6,9 20.5,9.8 16.2,14 17.3,20 12,17.1 6.7,20 7.8,14 3.5,9.8 9.4,9"
          {...c}
          fill={stroke}
        />
      );
    case 'plus':
      return (
        <>
          <Line x1="12" y1="5" x2="12" y2="19" {...c} />
          <Line x1="5" y1="12" x2="19" y2="12" {...c} />
        </>
      );
    case 'filter':
      return <Polygon points="3.5,5 20.5,5 14,12.5 14,19 10,20.5 10,12.5" {...c} />;
    case 'send':
      return (
        <>
          <Polygon points="21,3 10.5,13.5 21,3" {...c} />
          <Path d="M21 3 3.5 9.8l7 3.7 3.7 7L21 3Z" {...c} />
        </>
      );
    case 'edit':
      return (
        <>
          <Path d="M12 4.5H5.5A1.5 1.5 0 0 0 4 6v12.5A1.5 1.5 0 0 0 5.5 20H18a1.5 1.5 0 0 0 1.5-1.5V12" {...c} />
          <Path d="M17.5 3.2 20.8 6.5 12.8 14.5H9.5v-3.3Z" {...c} />
        </>
      );
    case 'list':
      return (
        <>
          <Line x1="8.5" y1="6.5" x2="20.5" y2="6.5" {...c} />
          <Line x1="8.5" y1="12" x2="20.5" y2="12" {...c} />
          <Line x1="8.5" y1="17.5" x2="20.5" y2="17.5" {...c} />
          <Circle cx="4.6" cy="6.5" r="1.3" {...c} fill={stroke} />
          <Circle cx="4.6" cy="12" r="1.3" {...c} fill={stroke} />
          <Circle cx="4.6" cy="17.5" r="1.3" {...c} fill={stroke} />
        </>
      );
    case 'globe':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Line x1="3" y1="12" x2="21" y2="12" {...c} />
          <Path d="M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3Z" {...c} />
        </>
      );
    case 'clock':
      return (
        <>
          <Circle cx="12" cy="12" r="9" {...c} />
          <Polyline points="12,6.8 12,12.3 16,14.5" {...c} />
        </>
      );
    case 'calendar':
      return (
        <>
          <Rect x="3.5" y="5" width="17" height="16" rx="2" {...c} />
          <Line x1="3.5" y1="10" x2="20.5" y2="10" {...c} />
          <Line x1="8" y1="3" x2="8" y2="6.5" {...c} />
          <Line x1="16" y1="3" x2="16" y2="6.5" {...c} />
        </>
      );
    case 'trending':
      return (
        <>
          <Polyline points="3.5,16.5 9.5,10.5 13.5,14.5 20.5,7" {...c} />
          <Polyline points="15.5,7 20.5,7 20.5,12" {...c} />
        </>
      );
    case 'alert':
      return (
        <>
          <Path d="M12 4 21 19.5H3Z" {...c} />
          <Line x1="12" y1="10" x2="12" y2="14.5" {...c} />
          <Circle cx="12" cy="17" r="0.9" {...c} fill={stroke} />
        </>
      );
    case 'logout':
      return (
        <>
          <Path d="M14 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h8" {...c} />
          <Polyline points="15.5,8 19.5,12 15.5,16" {...c} />
          <Line x1="19.5" y1="12" x2="9.5" y2="12" {...c} />
        </>
      );
    case 'grid':
      return (
        <>
          <Rect x="3.5" y="3.5" width="7" height="7" rx="1.6" {...c} />
          <Rect x="13.5" y="3.5" width="7" height="7" rx="1.6" {...c} />
          <Rect x="3.5" y="13.5" width="7" height="7" rx="1.6" {...c} />
          <Rect x="13.5" y="13.5" width="7" height="7" rx="1.6" {...c} />
        </>
      );
    case 'sliders':
      return (
        <>
          <Line x1="4" y1="7" x2="20" y2="7" {...c} />
          <Line x1="4" y1="12.5" x2="20" y2="12.5" {...c} />
          <Line x1="4" y1="18" x2="20" y2="18" {...c} />
          <Circle cx="9" cy="7" r="2.3" {...c} fill={color.bg} />
          <Circle cx="15.5" cy="12.5" r="2.3" {...c} fill={color.bg} />
          <Circle cx="7.5" cy="18" r="2.3" {...c} fill={color.bg} />
        </>
      );
    case 'mic':
      return (
        <>
          <Rect x="9" y="2.8" width="6" height="11.4" rx="3" {...c} />
          <Path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" {...c} />
          <Line x1="12" y1="18" x2="12" y2="21.2" {...c} />
        </>
      );
    case 'expand':
      return (
        <>
          <Polyline points="9,3.5 3.5,3.5 3.5,9" {...c} />
          <Polyline points="15,3.5 20.5,3.5 20.5,9" {...c} />
          <Polyline points="15,20.5 20.5,20.5 20.5,15" {...c} />
          <Polyline points="9,20.5 3.5,20.5 3.5,15" {...c} />
        </>
      );
    case 'volume':
      return (
        <>
          <Polygon points="4,9.5 8,9.5 12.5,5.5 12.5,18.5 8,14.5 4,14.5" {...c} />
          <Path d="M16 9.2a4 4 0 0 1 0 5.6M18.5 6.5a7.5 7.5 0 0 1 0 11" {...c} />
        </>
      );
    case 'sparkle':
      return (
        <>
          <Path d="M12 3.5 13.6 9 19 10.5 13.6 12 12 17.5 10.4 12 5 10.5 10.4 9Z" {...c} />
          <Path d="M18 16.5 18.8 19 21 19.8 18.8 20.6 18 23 17.2 20.6 15 19.8 17.2 19Z" {...c} />
        </>
      );
    default:
      return <Circle cx="12" cy="12" r="8" {...c} />;
  }
}

/** The SLATE wordmark lightning bolt — used in the header and the app icon. */
export function SlateMark({ size = 22, tint = color.brand }: { size?: number; tint?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M15.6 2.2 6.4 12.9h4.9l-2.9 8.9 9.2-10.7h-4.9Z"
        fill={tint}
        stroke={tint}
        strokeWidth={1.4}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
