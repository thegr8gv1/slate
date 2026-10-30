import type { Workspace } from '../contracts';
import type { IconName } from '../design/Icon';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Primary items appear in the mobile tab bar; the rest live in the menu. */
  primary?: boolean;
  description?: string;
}

/**
 * Navigation map.
 *
 * The same list drives the mobile tab bar, the desktop rail, and the menu
 * sheet — three presentations of one structure, which is why a destination can
 * never exist on one platform and not another.
 */
const CORE_ART_NAV: NavItem[] = [
  { href: '/map', label: 'Art Map', icon: 'compass', primary: true, description: 'Explore neighborhood cinema, music, stage & art' },
  { href: '/my-circles', label: 'My Circles', icon: 'heart', primary: true, description: 'Creative collaborations you have joined' },
  { href: '/skill-share', label: 'Skill-Share', icon: 'inbox', primary: true, description: 'Peer chats and ask-a-creator mentorship' },
  { href: '/profile', label: 'Who I Am', icon: 'user', primary: true, description: 'Your Ready to Learn & Help Out profile' },
];

export const NAV: Record<Workspace, NavItem[]> = {
  talent: CORE_ART_NAV,
  production: CORE_ART_NAV,
  brand: CORE_ART_NAV,
  agency: CORE_ART_NAV,
};

export const WORKSPACE_LABELS: Record<Workspace, string> = {
  talent: 'Talent & Crew',
  production: 'Production',
  brand: 'Brand',
  agency: 'Agency',
};

export const WORKSPACE_ICONS: Record<Workspace, IconName> = {
  talent: 'user',
  production: 'film',
  brand: 'sparkle',
  agency: 'briefcase',
};

/** Longest matching href wins, so /talent/discover does not light up /talent. */
export function activeHref(items: NavItem[], pathname: string): string | null {
  const matches = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.href ?? null;
}

/**
 * The workspace a route belongs to.
 *
 * Navigation is allowed to cross workspaces (an agency link from a production
 * board, a brand jumping into the discovery deck), so the shell keys its rail
 * off the route rather than off the last workspace the user picked — otherwise
 * you land on /agency and the sidebar still lists production destinations.
 */
export function workspaceForPath(pathname: string): Workspace | null {
  if (pathname.startsWith('/talent')) return 'talent';
  if (pathname.startsWith('/production')) return 'production';
  if (pathname.startsWith('/brand')) return 'brand';
  if (pathname.startsWith('/agency')) return 'agency';
  return null;
}
