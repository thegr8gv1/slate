import { useWindowDimensions } from 'react-native';
import { breakpoint, layout } from '../../design/tokens';

export interface Responsive {
  width: number;
  height: number;
  /** Phone-sized: bottom tab bar, single column. */
  compact: boolean;
  /** Tablet / small laptop: rail collapses to icons. */
  medium: boolean;
  /** Desktop: full rail plus multi-column content. */
  expanded: boolean;
  /** Columns a card grid should use at this width. */
  columns: number;
  contentWidth: number;
  gutter: number;
}

/**
 * One breakpoint source for every screen.
 *
 * Screens ask for `columns` and `compact` rather than measuring themselves, so
 * a phone, a tablet and a browser window all reflow through the same rules
 * instead of three independently drifting layouts.
 */
export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();

  const compact = width < breakpoint.md;
  const expanded = width >= breakpoint.lg;
  const medium = !compact && !expanded;

  const railWidth = compact ? 0 : expanded ? layout.railWidth : layout.railCollapsed;
  const gutter = compact ? 16 : 24;
  const available = width - railWidth - gutter * 2;
  const contentWidth = Math.min(layout.maxContent, Math.max(280, available));

  const columns = compact ? 1 : contentWidth > 980 ? 3 : contentWidth > 640 ? 2 : 1;

  return { width, height, compact, medium, expanded, columns, contentWidth, gutter };
}
