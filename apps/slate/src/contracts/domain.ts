import type { Sector, UnionStatus } from './taxonomy';
import type { PlanId, SuperPitchTierId } from './config';

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export const ACCOUNT_ROLES = ['talent', 'crew', 'production', 'brand', 'agency', 'admin'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

/** The four product surfaces. Several roles can reach the same surface. */
export const WORKSPACES = ['talent', 'production', 'brand', 'agency'] as const;
export type Workspace = (typeof WORKSPACES)[number];

export interface Account {
  id: string;
  email: string;
  displayName: string;
  role: AccountRole;
  workspaces: Workspace[];
  plan: PlanId;
  avatarUrl: string | null;
  createdAt: string;
  /** Remaining pitches this billing period; null when the plan is unlimited. */
  pitchAllowance: number | null;
}

export interface Session {
  token: string;
  account: Account;
  expiresAt: string;
}

/* ------------------------------------------------------------------ */
/* Geography                                                           */
/* ------------------------------------------------------------------ */

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface GeoPlace extends GeoPoint {
  label: string;
  /** Hierarchical spatial cell id at BEACON.spatialResolution. */
  cell: string;
  region: string;
}

/* ------------------------------------------------------------------ */
/* Talent                                                              */
/* ------------------------------------------------------------------ */

export type VerificationBadge =
  | 'identity'
  | 'union'
  | 'gear_insurance'
  | 'background_check'
  | 'agency_repped';

export interface SocialMetrics {
  platform: 'instagram' | 'tiktok' | 'youtube';
  handle: string;
  followers: number;
  /** Percentage, 0-100. */
  engagementRate: number;
  verifiedReach: number;
  totalReach: number;
  /** 0-1; higher means more likely inauthentic. */
  fraudScore: number;
  /** 0-100 Engagement Authenticity Index. */
  eai: number;
  lastSyncedAt: string;
  topClipUrl: string | null;
  audienceTopGeos: { code: string; share: number }[];
  audienceAgeBands: { band: string; share: number }[];
}

export interface Credit {
  id: string;
  title: string;
  role: string;
  year: number;
  kind: 'film' | 'tv' | 'commercial' | 'theatre' | 'music' | 'campaign';
  network: string | null;
}

export interface AgencyRouting {
  /** Booking category maps to the agency/manager that receives the inquiry. */
  commercial: string | null;
  film: string | null;
  musical: string | null;
  theatrical: string | null;
  requireNdaBeforeContact: boolean;
  redactMetricsUntilNda: boolean;
}

export interface DiscreetSettings {
  enabled: boolean;
  /** Escrow capacity a counterparty must prove before reveal. */
  budgetFloorCents: number;
  /** Obfuscated headline shown while discreet, e.g. Emmy-Nominated Lead, F, 30-35. */
  publicMask: string;
  requireTier1Studio: boolean;
}

export interface TalentProfile {
  id: string;
  accountId: string;
  displayName: string;
  /** Null while Discreet Mode is masking the record. */
  legalName: string | null;
  headline: string;
  sector: Sector;
  primaryRole: string;
  specialties: string[];
  age: number | null;
  pronouns: string;
  unionStatus: UnionStatus;
  /** Cents. Null when masked by Discreet Mode. */
  dayRateCents: number | null;
  dayRateBand: string;
  location: GeoPlace;
  travelRadiusMiles: number;
  avatarUrl: string;
  reelUrl: string | null;
  reelPosterUrl: string | null;
  audioSampleUrl: string | null;
  portfolio: string[];
  credits: Credit[];
  socials: SocialMetrics[];
  badges: VerificationBadge[];
  discreet: DiscreetSettings;
  routing: AgencyRouting;
  agencyId: string | null;
  /** Server-side quality signal, 0-100. */
  responseScore: number;
  rating: number;
  bookingsCompleted: number;
  availableFrom: string | null;
  /** True when the viewer is only seeing a tokenized projection. */
  masked: boolean;
}

/* ------------------------------------------------------------------ */
/* Projects & opportunities                                            */
/* ------------------------------------------------------------------ */

export type ProjectStatus =
  | 'development'
  | 'casting'
  | 'pre_production'
  | 'shooting'
  | 'post'
  | 'wrapped';

export interface Project {
  id: string;
  ownerAccountId: string;
  title: string;
  productionCompany: string;
  kind: 'feature' | 'series' | 'commercial' | 'short' | 'campaign' | 'tour' | 'theatre';
  status: ProjectStatus;
  synopsis: string;
  location: GeoPlace;
  shootStart: string;
  shootEnd: string;
  budgetCents: number;
  unionStatus: UnionStatus;
  coverUrl: string;
  createdAt: string;
}

export interface OpportunityFilters {
  sectors: Sector[];
  roles: string[];
  unionStatuses: UnionStatus[];
  minRateCents: number;
  maxRateCents: number;
  radiusMiles: number;
  ageMin: number | null;
  ageMax: number | null;
  requireBadges: VerificationBadge[];
  minFollowers: number | null;
  maxFraudScore: number;
}

/** A castable slot on a project - what a talent swipes on. */
export interface Opportunity {
  id: string;
  projectId: string;
  project: Pick<
    Project,
    'title' | 'productionCompany' | 'kind' | 'coverUrl' | 'location' | 'unionStatus'
  >;
  role: string;
  sector: Sector;
  roleDescription: string;
  rateCents: number;
  rateUnit: 'day' | 'week' | 'flat' | 'episode';
  shootDates: string;
  slots: number;
  slotsFilled: number;
  sponsored: boolean;
  sideScriptId: string | null;
  createdAt: string;
  /** 0-1 relevance for the requesting talent. */
  score?: number;
}

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

export type SwipeDirection = 'left' | 'right' | 'up';

export interface SwipeEvent {
  id: string;
  actorAccountId: string;
  /** talent = a production swiped talent; opportunity = talent swiped gigs. */
  subjectKind: 'talent' | 'opportunity';
  subjectId: string;
  direction: SwipeDirection;
  projectId: string | null;
  createdAt: string;
}

export interface DeckCard<T> {
  subject: T;
  /** Composite L3 ranker score, 0-1. */
  score: number;
  /** Human-readable ranker attribution, strongest signal first. */
  reasons: string[];
  distanceMiles: number;
}

export interface MatchRecord {
  id: string;
  projectId: string;
  talentProfileId: string;
  opportunityId: string | null;
  state: 'shortlisted' | 'mutual' | 'pitched' | 'offer_sent' | 'booked' | 'declined';
  createdAt: string;
  lastActivityAt: string;
}

/* ------------------------------------------------------------------ */
/* Pitches                                                             */
/* ------------------------------------------------------------------ */

export interface Pitch {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  projectId: string | null;
  opportunityId: string | null;
  message: string;
  offerCents: number | null;
  sideScriptId: string | null;
  superTier: SuperPitchTierId | null;
  queueRank: number;
  readAt: string | null;
  respondedAt: string | null;
  outcome: 'pending' | 'accepted' | 'declined' | 'expired';
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Set-Beacon                                                          */
/* ------------------------------------------------------------------ */

export type BeaconState = 'broadcasting' | 'claimed' | 'expired' | 'cancelled';

export interface Beacon {
  id: string;
  projectId: string;
  issuedByAccountId: string;
  role: string;
  sector: Sector;
  notes: string;
  origin: GeoPlace;
  radiusMiles: number;
  callTime: string;
  baseRateCents: number;
  rateMultiplier: number;
  payoutCents: number;
  state: BeaconState;
  claimedByProfileId: string | null;
  claimedAt: string | null;
  expiresAt: string;
  createdAt: string;
  /** Fanout telemetry. */
  devicesTargeted: number;
  fanoutMs: number;
  cellsQueried: number;
}

export interface BeaconCandidate {
  profileId: string;
  displayName: string;
  avatarUrl: string;
  role: string;
  rating: number;
  distanceMiles: number;
  respondsInMinutes: number;
}

/* ------------------------------------------------------------------ */
/* Contracts & escrow                                                  */
/* ------------------------------------------------------------------ */

export type AgreementKind =
  | 'nda'
  | 'sag_aftra'
  | 'equity'
  | 'work_for_hire'
  | 'brand_campaign'
  | 'audition_release';

export type AgreementState = 'draft' | 'awaiting_signature' | 'countersigned' | 'executed' | 'void';

export interface AgreementSignature {
  accountId: string;
  displayName: string;
  signedAt: string;
  /** Deterministic digest over agreementId + accountId + body + signedAt. */
  digest: string;
  ip: string;
}

export interface Agreement {
  id: string;
  kind: AgreementKind;
  title: string;
  projectId: string | null;
  counterpartyAccountId: string;
  counterpartyName: string;
  counterpartyAvatarUrl: string | null;
  issuerAccountId: string;
  issuerName: string;
  body: string;
  state: AgreementState;
  signatures: AgreementSignature[];
  createdAt: string;
  executedAt: string | null;
}

export type EscrowState =
  | 'offer_accepted'
  | 'escrow_funded'
  | 'checked_in'
  | 'dispute_raised'
  | 'wrap_signed'
  | 'paid_out'
  | 'refunded'
  | 'cancelled';

export interface EscrowMilestone {
  id: string;
  label: string;
  kind: 'deposit' | 'check_in' | 'wrap' | 'deliverable' | 'post_approval' | 'final_payout';
  dueAt: string;
  releaseBps: number;
  signedOffBy: string | null;
  signedOffAt: string | null;
}

export interface SplitLine {
  party: 'talent' | 'agency' | 'platform' | 'union_tax';
  accountId: string | null;
  label: string;
  bps: number;
  amountCents: number;
}

export interface EscrowAgreement {
  id: string;
  projectId: string;
  projectTitle: string;
  agreementId: string | null;
  talentProfileId: string;
  talentDisplayName: string;
  talentAvatarUrl: string;
  payerAccountId: string;
  role: string;
  rateCents: number;
  rateUnit: 'day' | 'week' | 'flat' | 'episode';
  grossCents: number;
  fundedCents: number;
  releasedCents: number;
  state: EscrowState;
  milestones: EscrowMilestone[];
  splits: SplitLine[];
  disputeOpenedAt: string | null;
  disputeDeadlineAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Append-only double-entry line. Debits and credits always net to zero. */
export interface LedgerEntry {
  id: string;
  /** Monotonic per-ledger sequence - the append-only guarantee. */
  seq: number;
  escrowId: string | null;
  transferId: string;
  debitAccount: string;
  creditAccount: string;
  amountCents: number;
  currency: 'USD';
  reason: string;
  createdAt: string;
}

export interface LedgerBalance {
  account: string;
  label: string;
  balanceCents: number;
}

/* ------------------------------------------------------------------ */
/* Self-tape casting room                                              */
/* ------------------------------------------------------------------ */

export interface SideScript {
  id: string;
  projectId: string;
  title: string;
  sceneNumber: string;
  character: string;
  body: string;
  /** Watermark policy applied on the client while the side is displayed. */
  watermark: 'viewer_id' | 'viewer_id_ip' | 'none';
  confidential: boolean;
  createdAt: string;
}

export interface SelfTape {
  id: string;
  sideScriptId: string;
  projectId: string;
  talentProfileId: string;
  takeNumber: number;
  durationSeconds: number;
  status: 'recording' | 'processing' | 'submitted' | 'reviewed';
  note: string;
  reviewerRating: number | null;
  submittedAt: string | null;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Brand campaigns                                                     */
/* ------------------------------------------------------------------ */

export interface Campaign {
  id: string;
  brandAccountId: string;
  name: string;
  objective: 'awareness' | 'conversion' | 'launch' | 'ugc_library';
  audience: {
    geos: string[];
    ageBands: string[];
    interests: string[];
  };
  budgetCents: number;
  cpmTargetCents: number;
  selectedProfileIds: string[];
  estimatedReach: number;
  predictedRoi: number;
  state: 'draft' | 'live' | 'completed' | 'paused';
  step: 1 | 2 | 3 | 4;
  createdAt: string;
}

/* ------------------------------------------------------------------ */
/* Collaboration (dailies / VFX / post)                                */
/* ------------------------------------------------------------------ */

export interface CollabRoom {
  id: string;
  projectId: string;
  projectTitle: string;
  name: string;
  department: 'vfx' | 'post' | 'sound' | 'color';
  cutUrl: string;
  posterUrl: string;
  durationSeconds: number;
  status: 'in_progress' | 'approved' | 'blocked';
  thumbnails: string[];
  supervisor: {
    displayName: string;
    role: string;
    avatarUrl: string;
  };
}

export interface CollabNote {
  id: string;
  roomId: string;
  authorAccountId: string;
  authorName: string;
  authorRole: string;
  authorAvatarUrl: string;
  timecodeSeconds: number;
  body: string;
  createdAt: string;
  resolved: boolean;
}

/* ------------------------------------------------------------------ */
/* Gear marketplace                                                    */
/* ------------------------------------------------------------------ */

export interface GearListing {
  id: string;
  ownerProfileId: string;
  name: string;
  category: 'camera' | 'lens' | 'lighting' | 'audio' | 'grip' | 'drone';
  dayRateCents: number;
  rating: number;
  insured: boolean;
  imageUrl: string;
  location: GeoPlace;
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

export interface LiveEvent {
  id: string;
  name: string;
  venue: string;
  kind: 'performance' | 'appearance' | 'shoot' | 'premiere' | 'panel';
  startsAt: string;
  location: GeoPlace;
  capacity: number;
  bookedProfileIds: string[];
  organizerAccountId: string;
}

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

export type NotificationKind =
  | 'beacon'
  | 'pitch'
  | 'match'
  | 'escrow'
  | 'agreement'
  | 'audit'
  | 'selftape'
  | 'system';

export interface AppNotification {
  id: string;
  accountId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
  priority: 'normal' | 'high' | 'critical';
}

/* ------------------------------------------------------------------ */
/* Analytics                                                           */
/* ------------------------------------------------------------------ */

export interface TimeSeriesPoint {
  t: string;
  engagement: number;
  conversion: number;
}

export interface TalentAnalytics {
  profileId: string;
  displayName: string;
  avatarUrl: string;
  role: string;
  predictiveRoiScore: number;
  roiDeltaPct: number;
  series: TimeSeriesPoint[];
  heatmap: { code: string; label: string; intensity: number }[];
  cardViews: number;
  pitchAcceptRate: number;
  medianResponseMinutes: number;
}

export interface AgencyRosterRow {
  profileId: string;
  displayName: string;
  avatarUrl: string;
  role: string;
  totalRevenueCents: number;
  openOffers: number;
  escrowBalanceCents: number;
}

export interface AgencyPendingRow {
  id: string;
  talentDisplayName: string;
  talentAvatarUrl: string;
  label: string;
  escrowId: string | null;
  state: EscrowState;
  progressPct: number;
}

export interface AgencyDashboard {
  agencyId: string;
  agencyName: string;
  roster: AgencyRosterRow[];
  pendingAgreements: AgencyPendingRow[];
  revenueTrend: { month: string; grossCents: number; netCents: number }[];
  totalGrossCents: number;
  totalCommissionCents: number;
}
