import { DISCREET } from '../contracts/index.js';
import type { Account, TalentProfile } from '../contracts/index.js';
import { get } from '../db/index.js';
import { tokenizeField } from '../lib/crypto.js';

/**
 * Attribute-based access control for Discreet Mode.
 *
 * The stored record is always complete; what leaves the service is a
 * *projection*. A viewer earns the unmasked projection only by clearing three
 * independent gates: a signed NDA, verified escrow capacity above the talent's
 * floor, and (optionally) tier-1 studio status. Anything short of that gets
 * tokenized placeholders — never the real values with a UI flag, which would
 * leak the moment someone read the network response.
 */

export interface ViewerContext {
  accountId: string;
  role: string;
  /** Proven, currently-funded escrow capacity in cents. */
  escrowCapacityCents: number;
  tier1Studio: boolean;
  /** Profile ids this viewer has an executed NDA against. */
  ndaProfileIds: Set<string>;
}

export function buildViewerContext(account: Account): ViewerContext {
  const funded = get<{ total: number | null }>(
    `SELECT SUM(funded_cents) AS total FROM escrows
      WHERE payer_account_id = ? AND state NOT IN ('cancelled', 'refunded')`,
    account.id,
  );
  const credit = get<{ total: number | null }>(
    `SELECT SUM(budget_cents) AS total FROM projects WHERE owner_account_id = ?`,
    account.id,
  );

  const ndaRows = get<{ ids: string | null }>(
    `SELECT group_concat(counterparty_account_id) AS ids FROM agreements
      WHERE issuer_account_id = ? AND kind = 'nda' AND state = 'executed'`,
    account.id,
  );
  const ndaAccountIds = (ndaRows?.ids ?? '').split(',').filter(Boolean);

  const profileIds = new Set<string>();
  for (const accountId of ndaAccountIds) {
    const row = get<{ id: string }>('SELECT id FROM talent_profiles WHERE account_id = ?', accountId);
    if (row) profileIds.add(row.id);
  }

  return {
    accountId: account.id,
    role: account.role,
    escrowCapacityCents: Math.max(funded?.total ?? 0, credit?.total ?? 0),
    tier1Studio: account.plan === 'studio_enterprise',
    ndaProfileIds: profileIds,
  };
}

export interface RevealDecision {
  revealed: boolean;
  failedGates: ('nda' | 'budget' | 'tier1')[];
}

export function evaluateReveal(profile: TalentProfile, viewer: ViewerContext): RevealDecision {
  if (!profile.discreet.enabled) return { revealed: true, failedGates: [] };
  if (profile.accountId === viewer.accountId) return { revealed: true, failedGates: [] };

  const failed: RevealDecision['failedGates'] = [];
  if (!viewer.ndaProfileIds.has(profile.id)) failed.push('nda');
  const floor = profile.discreet.budgetFloorCents || DISCREET.defaultBudgetFloorCents;
  if (viewer.escrowCapacityCents < floor) failed.push('budget');
  if (profile.discreet.requireTier1Studio && !viewer.tier1Studio) failed.push('tier1');

  return { revealed: failed.length === 0, failedGates: failed };
}

/**
 * Strips every field listed in `DISCREET.tokenizedFields` and swaps the identity
 * surface for the talent's own public mask.
 */
export function maskProfile(profile: TalentProfile): TalentProfile {
  return {
    ...profile,
    displayName: profile.discreet.publicMask || 'Verified A-List Talent',
    legalName: null,
    headline: profile.discreet.publicMask || profile.headline,
    dayRateCents: null,
    dayRateBand: bandFor(profile.dayRateCents),
    age: null,
    avatarUrl: profile.avatarUrl,
    reelUrl: null,
    audioSampleUrl: null,
    portfolio: [],
    credits: profile.credits.slice(0, 1).map((c) => ({
      ...c,
      id: tokenizeField(profile.id, `credit:${c.id}`),
      title: c.network ? `${c.kind === 'tv' ? 'Network series' : 'Studio feature'} (title withheld)` : 'Title withheld',
      network: null,
    })),
    socials: profile.socials.map((s) => ({
      ...s,
      handle: tokenizeField(profile.id, `handle:${s.platform}`),
      followers: roundToBand(s.followers),
      verifiedReach: roundToBand(s.verifiedReach),
      totalReach: roundToBand(s.totalReach),
      topClipUrl: null,
      audienceTopGeos: [],
      audienceAgeBands: [],
    })),
    routing: {
      ...profile.routing,
      commercial: profile.routing.commercial,
      film: profile.routing.film,
      musical: profile.routing.musical,
      theatrical: profile.routing.theatrical,
    },
    location: {
      ...profile.location,
      label: profile.location.region,
      // Coarsen to the region centroid; the exact cell would re-identify.
      lat: Math.round(profile.location.lat * 4) / 4,
      lng: Math.round(profile.location.lng * 4) / 4,
    },
    masked: true,
  };
}

export function projectProfile(profile: TalentProfile, viewer: ViewerContext): TalentProfile {
  return evaluateReveal(profile, viewer).revealed ? { ...profile, masked: false } : maskProfile(profile);
}

function bandFor(cents: number | null): string {
  if (cents == null) return 'Undisclosed';
  const dollars = cents / 100;
  if (dollars >= 25000) return '$25K+/day';
  if (dollars >= 10000) return '$10K–25K/day';
  if (dollars >= 5000) return '$5K–10K/day';
  if (dollars >= 2000) return '$2K–5K/day';
  if (dollars >= 1000) return '$1K–2K/day';
  if (dollars >= 500) return '$500–1K/day';
  return 'Under $500/day';
}

export function publicBand(cents: number | null): string {
  return bandFor(cents);
}

function roundToBand(n: number): number {
  if (n >= 1_000_000) return Math.round(n / 500_000) * 500_000;
  if (n >= 100_000) return Math.round(n / 50_000) * 50_000;
  return Math.round(n / 5_000) * 5_000;
}
