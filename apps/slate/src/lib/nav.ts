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
export const NAV: Record<Workspace, NavItem[]> = {
  talent: [
    { href: '/talent', label: 'Home', icon: 'home', primary: true, description: 'Your profile, jobs, and casting calls' },
    { href: '/talent/discover', label: 'Gigs', icon: 'compass', primary: true, description: 'Browse and apply for open roles' },
    { href: '/talent/inbox', label: 'Inbox', icon: 'inbox', primary: true, description: 'Direct messages and job offers' },
    { href: '/talent/beacons', label: 'Beacons', icon: 'zap', primary: true, description: 'Urgent same-day job alerts' },
    { href: '/talent/casting', label: 'Casting Room', icon: 'video', primary: true, description: 'Record video auditions with prompter' },
    { href: '/talent/privacy', label: 'Privacy & Routing', icon: 'lock', description: 'Private profile & agency settings' },
    { href: '/talent/portfolio', label: 'Portfolio', icon: 'grid', description: 'Photos, video reels, and credits' },
  ],
  production: [
    { href: '/production', label: 'Discover', icon: 'compass', primary: true, description: 'Browse and cast talent' },
    { href: '/production/matches', label: 'Matches', icon: 'heart', primary: true, description: 'People interested in your jobs' },
    { href: '/production/board', label: 'Board', icon: 'briefcase', primary: true, description: 'Shortlist, offers, and safe payments' },
    { href: '/production/beacon', label: 'Set-Beacon', icon: 'zap', primary: true, description: 'Instant urgent crew replacement' },
    { href: '/production/marketplace', label: 'Crew', icon: 'users', primary: true, description: 'Find crew and rent gear' },
    { href: '/production/collab', label: 'Dailies', icon: 'film', description: 'Review daily video footage' },
    { href: '/production/events', label: 'Live Events', icon: 'pin', description: 'Book events and appearances' },
  ],
  brand: [
    { href: '/brand', label: 'Audit', icon: 'shield', primary: true, description: 'Check real vs. fake followers' },
    { href: '/brand/campaigns', label: 'Campaigns', icon: 'sparkle', primary: true, description: 'Create and run creator campaigns' },
    { href: '/brand/analytics', label: 'Analytics', icon: 'chart', primary: true, description: 'Campaign results and estimated reach' },
    { href: '/production', label: 'Discover', icon: 'compass', primary: true, description: 'Browse and find creators' },
  ],
  agency: [
    { href: '/agency', label: 'Dashboard', icon: 'grid', primary: true, description: 'Client income and active jobs' },
    { href: '/agency/vault', label: 'Contracts', icon: 'file', primary: true, description: 'Signed agreements and NDAs' },
    { href: '/agency/escrow', label: 'Escrow', icon: 'dollar', primary: true, description: 'Held payments and client payouts' },
    { href: '/agency/roster', label: 'Roster', icon: 'users', primary: true, description: 'Your signed client list' },
    { href: '/agency/ledger', label: 'Ledger', icon: 'list', description: 'Complete payment records' },
  ],
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
