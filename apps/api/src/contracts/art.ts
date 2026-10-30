/**
 * Slate: The Local Art & Opportunity Platform
 * Peer-to-peer, local-first creative collaboration for everyone.
 * Making movies, music, theater, and art together without gatekeeping or agencies.
 */

export const ART_CATEGORIES = [
  'film_video',
  'music_sound',
  'stage_theater',
  'creative_events',
] as const;

export type ArtCategory = (typeof ART_CATEGORIES)[number];

export const ART_CATEGORY_META: Record<
  ArtCategory,
  { label: string; shortLabel: string; pinColor: string; icon: string; tagline: string }
> = {
  film_video: {
    label: 'Movies, Video & Short Films',
    shortLabel: 'Film & Video',
    pinColor: '#F43F5E', // Rose
    icon: 'film',
    tagline: 'Shadow camera, hold boom mic, set styling, background extra',
  },
  music_sound: {
    label: 'Music & Sound Collaborations',
    shortLabel: 'Music & Sound',
    pinColor: '#C084FC', // Purple
    icon: 'zap',
    tagline: 'Group jams, beat sessions, lyric circles, foley & audio setup',
  },
  stage_theater: {
    label: 'Stage, Theater & Performance',
    shortLabel: 'Stage & Theater',
    pinColor: '#38BDF8', // Sky Blue
    icon: 'users',
    tagline: 'Play actors, audience crowd fillers, backstage hand, modeling',
  },
  creative_events: {
    label: 'Creative Events & Art Showups',
    shortLabel: 'Art Showups',
    pinColor: '#34D399', // Emerald
    icon: 'sparkle',
    tagline: 'Gallery openings, backyard theater, photo walks, pack the room',
  },
};

export interface ArtOpportunity {
  id: string;
  creatorId: string;
  creatorName: string;
  creatorAvatar: string;
  creatorRole: string;
  title: string;
  category: ArtCategory;
  categoryLabel: string;
  activityType: 'collaboration' | 'learning_shadow' | 'crowd_support' | 'jam_session' | 'volunteer_help';
  activityBadge: string;
  address: string;
  neighborhood: string;
  distanceMiles: number;
  walkMinutes: number;
  timeRange: string;
  dateLabel: string;
  spotsTotal: number;
  spotsJoined: number;
  noExperienceNeeded: boolean;
  projectStory: string;
  whatYouWillDo: string[];
  whatYouWillLearn: string[];
  perks: string[]; // e.g. "Screen credit", "Free snacks & tea", "Good vibes", "Network with artists"
  whatToBring: string;
  lat: number;
  lng: number;
  hasJoined?: boolean;
}

export interface LearnAndHelpProfile {
  id: string;
  accountId: string;
  displayName: string;
  neighborhood: string;
  bio: string;
  avatarUrl: string;
  introMediaUrl?: string; // 15-second audio or video intro
  introMediaPrompt?: string; // e.g. "Why I love movies and what I want to learn"
  wantToTry: string[]; // ["Camera Shadowing", "Hold Boom Mic", "Acting Extra", "Beat Making"]
  whereICanHelp: string[]; // ["Move Gear", "Pack Crowd", "Set Assistant", "Quiet on Set", "Behind the Scenes Photos"]
  badges: string[]; // ["Ready to Learn 🌱", "Community Supporter 🤝", "First-Time Artist ✨", "Reliable Neighbor ⭐"]
  favoriteInspirations: string[]; // ["Wong Kar-wai", "Indie folk", "DIY Theatre", "Street Photography"]
  collaborationsCount: number;
  communityRating: number;
}

export interface SkillShareMentor {
  id: string;
  name: string;
  role: string;
  avatar: string;
  neighborhood: string;
  willingToTeach: string;
  suggestedPrompt: string; // e.g. "Ask: Can I shadow your film set this Saturday?"
  isFree: boolean;
  tagline: string;
  responseSpeed: string;
}

export interface CommunityChat {
  id: string;
  peerId: string;
  peerName: string;
  peerAvatar: string;
  peerRole: string;
  projectTitle?: string;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  isSkillShare?: boolean;
}

export interface CommunityChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  isMine: boolean;
}
