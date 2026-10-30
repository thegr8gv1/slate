/**
 * Simple, beginner-friendly local gig marketplace contracts.
 * Peer-to-peer neighborhood film, event, crowd, and assistant work.
 */

export const GIG_CATEGORIES = [
  'film_extra',
  'event_crowd',
  'shop_promo',
  'helper',
  'music_crowd',
] as const;

export type GigCategory = (typeof GIG_CATEGORIES)[number];

export const GIG_CATEGORY_META: Record<
  GigCategory,
  { label: string; shortLabel: string; pinColor: string; icon: string }
> = {
  film_extra: {
    label: 'Film & Video Extra',
    shortLabel: 'Extras',
    pinColor: '#F43F5E', // Rose / Red
    icon: 'film',
  },
  event_crowd: {
    label: 'Event Crowd & Attendees',
    shortLabel: 'Crowds',
    pinColor: '#C084FC', // Purple
    icon: 'users',
  },
  shop_promo: {
    label: 'Shop Opening & Local Posts',
    shortLabel: 'Shop Promo',
    pinColor: '#34D399', // Emerald / Green
    icon: 'sparkle',
  },
  helper: {
    label: 'Gear & Production Helper',
    shortLabel: 'Helpers',
    pinColor: '#38BDF8', // Sky / Blue
    icon: 'briefcase',
  },
  music_crowd: {
    label: 'Concert & Music Video Crowd',
    shortLabel: 'Music Crowd',
    pinColor: '#FBBF24', // Amber
    icon: 'zap',
  },
};

export interface LocalGig {
  id: string;
  posterId: string;
  posterName: string;
  posterAvatar: string;
  posterRating: number;
  posterGigsCount: number;
  title: string;
  category: GigCategory;
  categoryLabel: string;
  payCents: number;
  durationHours: number;
  address: string;
  neighborhood: string;
  distanceMiles: number;
  walkMinutes: number;
  startsAt: string;
  timeRange: string;
  spotsTotal: number;
  spotsFilled: number;
  noExperienceNeeded: boolean;
  urgent: boolean;
  description: string;
  tasks: string[];
  whatToWear: string;
  lat: number;
  lng: number;
  hasApplied?: boolean;
}

export interface BeginnerProfile {
  id: string;
  accountId: string;
  displayName: string;
  neighborhood: string;
  bio: string;
  avatarUrl: string;
  videoIntroUrl?: string;
  skills: string[];
  badges: string[];
  instagramHandle?: string;
  tiktokHandle?: string;
  gigsCompleted: number;
  totalEarningsCents: number;
  rating: number;
}

export interface WalletTransactionItem {
  id: string;
  title: string;
  category: string;
  amountCents: number;
  date: string;
  type: 'gig_payout' | 'advice_fee' | 'cashout';
  status: 'available' | 'held_escrow' | 'paid_out';
  note?: string;
}

export interface WalletSummary {
  availableBalanceCents: number;
  escrowPendingCents: number;
  lifetimeEarningsCents: number;
  transactions: WalletTransactionItem[];
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isMine: boolean;
}

export interface PeerChat {
  id: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  peerRole: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isAdviceCall?: boolean;
  adviceTopic?: string;
  advicePriceCents?: number;
}

export interface AdviceCreator {
  id: string;
  name: string;
  role: string;
  avatar: string;
  neighborhood: string;
  topic: string;
  priceCents: number; // e.g. 500 = $5
  responseMinutes: number;
  rating: number;
  reviewsCount: number;
}
