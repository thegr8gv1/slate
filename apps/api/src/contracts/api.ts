import type {
  Account,
  Agreement,
  AppNotification,
  Beacon,
  BeaconCandidate,
  Campaign,
  CollabNote,
  CollabRoom,
  DeckCard,
  EscrowAgreement,
  GearListing,
  LedgerBalance,
  LedgerEntry,
  LiveEvent,
  MatchRecord,
  Opportunity,
  Pitch,
  Project,
  SelfTape,
  SideScript,
  SwipeDirection,
  TalentAnalytics,
  TalentProfile,
  AgencyDashboard,
  Workspace,
} from './domain';
import type { Sector, UnionStatus } from './taxonomy';
import type { SuperPitchTierId } from './config';

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

/** Attached to every deck response so the client can render real SLO telemetry. */
export interface FeedTelemetry {
  candidatesRetrieved: number;
  candidatesAfterHardFilter: number;
  vectorSearchMs: number;
  rerankMs: number;
  totalMs: number;
  cellsScanned: number;
  modelVersion: string;
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  account: Account;
  expiresAt: string;
}

export interface SwitchWorkspaceRequest {
  workspace: Workspace;
}

/* ------------------------------------------------------------------ */
/* Discovery                                                           */
/* ------------------------------------------------------------------ */

export interface TalentDeckQuery {
  projectId: string;
  sectors?: Sector[];
  roles?: string[];
  unionStatuses?: UnionStatus[];
  minRateCents?: number;
  maxRateCents?: number;
  radiusMiles?: number;
  ageMin?: number;
  ageMax?: number;
  minFollowers?: number;
  maxFraudScore?: number;
  limit?: number;
  cursor?: string;
}

export interface TalentDeckResponse {
  cards: DeckCard<TalentProfile>[];
  telemetry: FeedTelemetry;
  nextCursor: string | null;
}

export interface OpportunityDeckQuery {
  sectors?: Sector[];
  radiusMiles?: number;
  minRateCents?: number;
  limit?: number;
  cursor?: string;
}

export interface OpportunityDeckResponse {
  cards: DeckCard<Opportunity>[];
  telemetry: FeedTelemetry;
  nextCursor: string | null;
}

export interface SwipeRequest {
  subjectKind: 'talent' | 'opportunity';
  subjectId: string;
  direction: SwipeDirection;
  projectId?: string | null;
  /** Present when direction is 'up' (Instant Pitch). */
  pitch?: {
    message: string;
    offerCents?: number | null;
    sideScriptId?: string | null;
    superTier?: SuperPitchTierId | null;
  };
}

export interface SwipeResponse {
  recorded: true;
  match: MatchRecord | null;
  pitch: Pitch | null;
  /** Remaining pitches on the current plan; null when unlimited. */
  pitchAllowance: number | null;
}

/* ------------------------------------------------------------------ */
/* Projects                                                            */
/* ------------------------------------------------------------------ */

export interface ProjectBoardResponse {
  project: Project;
  shortlist: {
    match: MatchRecord;
    profile: TalentProfile;
  }[];
  opportunities: Opportunity[];
  escrows: EscrowAgreement[];
}

export interface CreateBeaconRequest {
  projectId: string;
  role: string;
  sector: Sector;
  notes?: string;
  radiusMiles?: number;
  callTime: string;
  baseRateCents: number;
  rateMultiplier?: number;
  origin?: { lat: number; lng: number; label: string };
}

export interface BeaconDispatchResponse {
  beacon: Beacon;
  candidates: BeaconCandidate[];
  /** Fanout report matching the SLO dashboard. */
  dispatch: {
    devicesTargeted: number;
    cellsQueried: number;
    fanoutMs: number;
    withinSlo: boolean;
  };
}

export interface ClaimBeaconRequest {
  profileId: string;
}

export interface ClaimBeaconResponse {
  claimed: boolean;
  beacon: Beacon;
  /** Populated for the winner. */
  agreementId: string | null;
  reason?: 'already_claimed' | 'expired' | 'out_of_range' | 'not_eligible';
}

/* ------------------------------------------------------------------ */
/* Escrow & ledger                                                     */
/* ------------------------------------------------------------------ */

export interface CreateEscrowRequest {
  projectId: string;
  talentProfileId: string;
  role: string;
  rateCents: number;
  rateUnit: 'day' | 'week' | 'flat' | 'episode';
  days?: number;
  agreementId?: string | null;
}

export interface EscrowActionRequest {
  action: 'fund' | 'check_in' | 'sign_milestone' | 'raise_dispute' | 'resolve_dispute' | 'release';
  milestoneId?: string;
  note?: string;
  /** Only for resolve_dispute. */
  resolution?: 'release_to_talent' | 'refund_payer' | 'split';
}

export interface EscrowResponse {
  escrow: EscrowAgreement;
  ledger: LedgerEntry[];
  balances: LedgerBalance[];
}

export interface LedgerResponse {
  entries: LedgerEntry[];
  balances: LedgerBalance[];
  /** Sum of every debit minus every credit; must always be exactly 0. */
  driftCents: number;
  throughputTps: number;
}

/* ------------------------------------------------------------------ */
/* Agreements                                                          */
/* ------------------------------------------------------------------ */

export interface SignAgreementRequest {
  agreementId: string;
}

export interface SignAgreementResponse {
  agreement: Agreement;
  /** Unlocked talent records if this NDA gated a Discreet Mode profile. */
  unlockedProfileIds: string[];
}

/* ------------------------------------------------------------------ */
/* Social sync & audit                                                 */
/* ------------------------------------------------------------------ */

export interface SocialAuditResponse {
  profileId: string;
  displayName: string;
  avatarUrl: string;
  role: string;
  auditScore: number;
  verdict: 'clean' | 'watch' | 'suppressed';
  likesShare: number;
  commentsShare: number;
  boostedShare: number;
  series: { t: string; verifiedReach: number; totalReach: number }[];
  flags: string[];
  lastSyncedAt: string;
}

/* ------------------------------------------------------------------ */
/* Self-tape                                                           */
/* ------------------------------------------------------------------ */

export interface CastingRoomResponse {
  side: SideScript;
  project: Project;
  takes: SelfTape[];
  /** Rendered client-side over the video; never baked server-side. */
  watermark: {
    text: string;
    opacity: number;
    rotateDeg: number;
    intervalMs: number;
  };
}

export interface SubmitTakeRequest {
  sideScriptId: string;
  durationSeconds: number;
  note?: string;
}

/* ------------------------------------------------------------------ */
/* Campaigns                                                           */
/* ------------------------------------------------------------------ */

export interface CampaignDraftRequest {
  name?: string;
  objective?: Campaign['objective'];
  audience?: Partial<Campaign['audience']>;
  budgetCents?: number;
  selectedProfileIds?: string[];
  step?: 1 | 2 | 3 | 4;
}

export interface CampaignEstimateResponse {
  campaign: Campaign;
  estimatedReach: number;
  /** Earned media value divided by spend, as a percentage. */
  predictedRoi: number;
  cpmCents: number;
  /** Budget in dollars, for display alongside the cents-denominated fields. */
  spend: number;
  /** Projected earned media value in cents — the numerator behind predictedRoi. */
  earnedValueCents: number;
  breakdown: {
    profileId: string;
    displayName: string;
    avatarUrl: string;
    role: string;
    verifiedReach: number;
    fraudScore: number;
    projectedRoiPct: number;
    included: boolean;
  }[];
}

/* ------------------------------------------------------------------ */
/* Collaboration, marketplace, events                                  */
/* ------------------------------------------------------------------ */

export interface CollabRoomResponse {
  room: CollabRoom;
  notes: CollabNote[];
}

export interface MarketplaceResponse {
  crew: TalentProfile[];
  gear: GearListing[];
}

export interface EventsResponse {
  events: LiveEvent[];
  availableProfiles: TalentProfile[];
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                          */
/* ------------------------------------------------------------------ */

export interface TalentHomeResponse {
  profile: TalentProfile;
  activeGigs: {
    escrowId: string;
    projectTitle: string;
    role: string;
    state: string;
    nextMilestone: string;
    amountCents: number;
  }[];
  castingCalls: Opportunity[];
  inbox: Pitch[];
  notifications: AppNotification[];
}

export interface AnalyticsResponse {
  leaderboard: TalentAnalytics[];
  cohortSeries: { t: string; engagement: number; conversion: number }[];
  heatmap: { code: string; label: string; intensity: number }[];
}

export type AgencyDashboardResponse = AgencyDashboard;

export interface OpsHealthResponse {
  region: string;
  cell: string;
  uptimePct: number;
  feedP95Ms: number;
  feedP99Ms: number;
  beaconFanoutMs: number;
  ledgerTps: number;
  ledgerDriftCents: number;
  services: { name: string; state: 'healthy' | 'degraded' | 'down'; latencyMs: number }[];
}
