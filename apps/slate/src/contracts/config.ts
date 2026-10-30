/**
 * Commercial configuration: plans, fees, and the thresholds the domain
 * services enforce. Kept in the shared contract so the client can render
 * accurate pricing without a round-trip, and the server can enforce it.
 */

export const PLANS = ['free', 'pro', 'studio', 'studio_enterprise'] as const;
export type PlanId = (typeof PLANS)[number];

export interface PlanDefinition {
  id: PlanId;
  name: string;
  audience: string;
  /** Monthly price in cents. */
  priceCents: number;
  /** Null = unlimited. */
  monthlyPitchLimit: number | null;
  seats: number;
  features: readonly string[];
}

export const PLAN_CATALOG: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Slate Free',
    audience: 'Anyone',
    priceCents: 0,
    monthlyPitchLimit: 5,
    seats: 1,
    features: ['Basic profile', 'Standard discovery deck', '5 project pitches / month'],
  },
  pro: {
    id: 'pro',
    name: 'Slate Pro',
    audience: 'Talent & Crew',
    priceCents: 1499,
    monthlyPitchLimit: null,
    seats: 1,
    features: [
      'Unlimited project swipes',
      'Verified profile badge',
      'Read receipts on pitches',
      'Set-Beacon emergency alerts',
      'Who-viewed-your-card analytics',
    ],
  },
  studio: {
    id: 'studio',
    name: 'Slate Studio',
    audience: 'Producers & Brands',
    priceCents: 7900,
    monthlyPitchLimit: null,
    seats: 5,
    features: [
      'Multi-seat access (5)',
      'Bulk messaging',
      'Custom legal contracts',
      'Exportable audition decks',
      'Unlisted A-list talent access',
    ],
  },
  studio_enterprise: {
    id: 'studio_enterprise',
    name: 'Slate Studio Enterprise',
    audience: 'Studios & Agencies',
    priceCents: 29900,
    monthlyPitchLimit: null,
    seats: 40,
    features: [
      'Multi-seat access (40)',
      'Dedicated escrow lines of credit',
      'SSO / SCIM provisioning',
      'Priority Set-Beacon fanout',
      'Custom compliance exports',
    ],
  },
};

/** Marketplace take rate, expressed in basis points, tiered by booking size. */
export const COMMISSION_TIERS: readonly { upToCents: number; bps: number }[] = [
  { upToCents: 500_00, bps: 800 },
  { upToCents: 5_000_00, bps: 700 },
  { upToCents: 25_000_00, bps: 600 },
  { upToCents: Number.MAX_SAFE_INTEGER, bps: 500 },
];

export function commissionBpsFor(amountCents: number): number {
  return COMMISSION_TIERS.find((t) => amountCents <= t.upToCents)!.bps;
}

export const SUPER_PITCH_TIERS = [
  { id: 'boost', label: 'Boost', priceCents: 299, queueRank: 3, description: 'Pinned above standard pitches for 24h' },
  { id: 'priority', label: 'Priority', priceCents: 599, queueRank: 2, description: 'Top of inbox + read receipt' },
  { id: 'headline', label: 'Headline', priceCents: 999, queueRank: 1, description: 'Top of inbox, push alert, 7-day pin' },
] as const;

export type SuperPitchTierId = (typeof SUPER_PITCH_TIERS)[number]['id'];

export const VERIFICATION_FEE_CENTS = 1999;

/** Default split applied at wrap sign-off, in basis points of the gross booking. */
export const DEFAULT_SPLIT_BPS = {
  talent: 8000,
  agency: 1000,
  platform: 500,
  unionAndTax: 500,
} as const;

/** Set-Beacon operational envelope. */
export const BEACON = {
  defaultRadiusMiles: 25,
  maxRadiusMiles: 60,
  /** Emergency multiplier applied to the standing day rate. */
  defaultRateMultiplier: 1.5,
  /** How long a beacon stays claimable. */
  ttlMinutes: 180,
  /** H3-equivalent resolution used for the proximity index (~1.2km edge). */
  spatialResolution: 7,
} as const;

/** Discreet Mode gating. */
export const DISCREET = {
  /** Minimum verified escrow capacity before an A-lister is revealed. */
  defaultBudgetFloorCents: 50_000_00,
  /** Fields stripped from public projections while Discreet Mode is active. */
  tokenizedFields: ['legalName', 'phone', 'email', 'exactDayRate', 'homeAddress', 'repDirectLine'] as const,
} as const;

/** Engagement Authenticity Index thresholds. */
export const EAI = {
  /** Fraud score above which discovery is suppressed pending manual review. */
  suppressAbove: 0.35,
  /** Sigma deviation over a 48h window that trips a spike investigation. */
  spikeSigma: 4,
  auditIntervalHours: 24,
} as const;

/** Matching engine service-level targets (surfaced in the ops dashboard). */
export const SLO = {
  feedLatencyP95Ms: 45,
  feedLatencyP99Ms: 80,
  beaconFanoutMs: 2000,
  ledgerTps: 10_000,
} as const;
