import { BEACON } from '../contracts/index.js';
import type {
  Account,
  DeckCard,
  FeedTelemetry,
  Opportunity,
  Project,
  Sector,
  TalentDeckQuery,
  TalentProfile,
  UnionStatus,
} from '../contracts/index.js';
import { all, get } from '../db/index.js';
import { hydrateOpportunity, hydrateProfile, type ProfileRow } from '../db/repo.js';
import { haversineMiles, planProximity } from '../lib/geo.js';
import { deserialize, encodeQuery, similarity } from './embedding.js';
import { projectProfile, type ViewerContext } from './discreet.js';

export const MODEL_VERSION = 'two-tower-v3.1+ltr-2026.04';

/* ------------------------------------------------------------------ */
/* L3 ranker                                                           */
/* ------------------------------------------------------------------ */

/**
 * Learned-to-rank stage. Feature weights below stand in for the gradient
 * boosted model; keeping them explicit means every card can explain itself,
 * which is what the "why am I seeing this" row on the deck renders.
 */
const RANKER_WEIGHTS = {
  vector: 0.34,
  proximity: 0.16,
  rateFit: 0.13,
  responsiveness: 0.11,
  authenticity: 0.1,
  trackRecord: 0.09,
  availability: 0.04,
  freshness: 0.03,
} as const;

type FeatureName = keyof typeof RANKER_WEIGHTS;

/**
 * Attribution copy.
 *
 * Each feature only earns a slot when it is genuinely distinguishing — a
 * feature that scores the same for every card explains nothing, so `floor` is
 * the bar a card must clear before the reason is worth printing.
 */
const FEATURE_COPY: Record<FeatureName, { floor: number; text: (v: number) => string }> = {
  vector: { floor: 0.72, text: (v) => (v > 0.85 ? 'Excellent match for this role' : 'Great match for this role') },
  proximity: { floor: 0.8, text: (v) => (v > 0.92 ? 'Local — lives nearby' : 'Within your travel radius') },
  rateFit: { floor: 0.95, text: () => 'Fits your budget' },
  responsiveness: { floor: 0.88, text: (v) => `Replies fast (quicker than ${Math.round(v * 100)}% of people)` },
  authenticity: { floor: 0.85, text: () => 'Real followers, no fake bots detected' },
  trackRecord: { floor: 0.78, text: () => 'Strong track record with lots of past work' },
  availability: { floor: 0.95, text: () => 'Available on your filming dates' },
  freshness: { floor: 0.7, text: () => 'Active on the app this week' },
};

interface ScoredFeatures {
  features: Record<FeatureName, number>;
  score: number;
}

function blend(features: Record<FeatureName, number>): ScoredFeatures {
  let score = 0;
  for (const key of Object.keys(RANKER_WEIGHTS) as FeatureName[]) {
    score += RANKER_WEIGHTS[key] * features[key];
  }
  return { features, score: Math.max(0, Math.min(1, score)) };
}

function explain(scored: ScoredFeatures, limit = 3): string[] {
  const eligible = (Object.keys(RANKER_WEIGHTS) as FeatureName[])
    .filter((key) => scored.features[key] >= FEATURE_COPY[key].floor)
    .map((key) => ({ key, contribution: RANKER_WEIGHTS[key] * scored.features[key] }))
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, limit)
    .map((f) => FEATURE_COPY[f.key].text(scored.features[f.key]));

  // Never render a card with no explanation at all.
  return eligible.length > 0 ? eligible : ['Matches your open filters'];
}

/* ------------------------------------------------------------------ */
/* Shared feature helpers                                              */
/* ------------------------------------------------------------------ */

function proximityScore(distanceMiles: number, radiusMiles: number): number {
  if (radiusMiles <= 0) return 1;
  return Math.max(0, 1 - distanceMiles / radiusMiles);
}

function rateFitScore(candidateCents: number, targetCents: number): number {
  if (targetCents <= 0) return 0.6;
  const ratio = candidateCents / targetCents;
  if (ratio <= 1) return 1;
  return Math.max(0, 1 - (ratio - 1) * 1.4);
}

function freshnessScore(iso: string | null | undefined): number {
  if (!iso) return 0.4;
  const days = (Date.now() - Date.parse(iso)) / 86_400_000;
  if (Number.isNaN(days)) return 0.4;
  return Math.max(0, Math.min(1, 1 - days / 45));
}

function availabilityScore(profile: TalentProfile, shootStart: string | undefined): number {
  if (!profile.availableFrom) return 0.7;
  if (!shootStart) return 0.7;
  return Date.parse(profile.availableFrom) <= Date.parse(shootStart) ? 1 : 0.25;
}

/* ------------------------------------------------------------------ */
/* Production deck: rank talent for a project                          */
/* ------------------------------------------------------------------ */

export interface TalentDeckResult {
  cards: DeckCard<TalentProfile>[];
  telemetry: FeedTelemetry;
  nextCursor: string | null;
}

export function buildTalentDeck(
  project: Project,
  query: TalentDeckQuery,
  viewer: ViewerContext,
  actorAccountId: string,
): TalentDeckResult {
  const started = performance.now();

  const radiusMiles = query.radiusMiles ?? 50;
  const plan = planProximity(project.location, radiusMiles, BEACON.spatialResolution);

  /* ---- L1: hard filters, executed in SQL ---- */
  const clauses: string[] = ['p.suppressed = 0'];
  const params: unknown[] = [];

  if (plan.strategy === 'cells') {
    clauses.push(`p.cell IN (${plan.cells.map(() => '?').join(',')})`);
    params.push(...plan.cells);
  } else {
    clauses.push('p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?');
    params.push(plan.bbox.minLat, plan.bbox.maxLat, plan.bbox.minLng, plan.bbox.maxLng);
  }

  const sectors = query.sectors ?? [];
  if (sectors.length > 0) {
    clauses.push(`p.sector IN (${sectors.map(() => '?').join(',')})`);
    params.push(...sectors);
  }

  const unions = query.unionStatuses ?? [];
  if (unions.length > 0) {
    clauses.push(`p.union_status IN (${unions.map(() => '?').join(',')})`);
    params.push(...unions);
  }

  if (query.roles && query.roles.length > 0) {
    clauses.push(`p.primary_role IN (${query.roles.map(() => '?').join(',')})`);
    params.push(...query.roles);
  }

  if (query.minRateCents != null) {
    clauses.push('p.day_rate_cents >= ?');
    params.push(query.minRateCents);
  }
  if (query.maxRateCents != null) {
    clauses.push('p.day_rate_cents <= ?');
    params.push(query.maxRateCents);
  }
  if (query.ageMin != null) {
    clauses.push('(p.age IS NULL OR p.age >= ?)');
    params.push(query.ageMin);
  }
  if (query.ageMax != null) {
    clauses.push('(p.age IS NULL OR p.age <= ?)');
    params.push(query.ageMax);
  }
  if (query.minFollowers != null) {
    clauses.push('p.followers >= ?');
    params.push(query.minFollowers);
  }
  clauses.push('p.fraud_score <= ?');
  params.push(query.maxFraudScore ?? 1);

  // Never re-deal a card this account already swiped on for this project.
  clauses.push(
    `NOT EXISTS (SELECT 1 FROM swipes s
        WHERE s.actor_account_id = ? AND s.subject_id = p.id AND s.project_id = ?)`,
  );
  params.push(actorAccountId, project.id);

  // A production must never see its own roster row in the deck.
  clauses.push('p.account_id != ?');
  params.push(actorAccountId);

  const l1Started = performance.now();
  const rows = all<ProfileRow>(
    `SELECT p.* FROM talent_profiles p WHERE ${clauses.join(' AND ')} LIMIT 500`,
    ...params,
  );
  const l1Ms = performance.now() - l1Started;

  /* ---- L2: vector scoring ---- */
  const vectorStarted = performance.now();
  const targetRate = query.maxRateCents ?? Math.round(project.budgetCents / 40);
  const queryVector = encodeQuery({
    sectors: sectors as Sector[],
    unionStatuses: (unions.length ? unions : [project.unionStatus]) as UnionStatus[],
    targetRateCents: targetRate,
    minFollowers: query.minFollowers ?? 0,
    wantsAuthenticity: (query.maxFraudScore ?? 1) < 0.5,
    roles: query.roles ?? [],
    keywords: [project.kind, project.title, project.synopsis].filter(Boolean),
  });

  const retrieved = rows.map((row) => ({
    row,
    vector: similarity(queryVector, deserialize(row.embedding)),
  }));
  const vectorMs = performance.now() - vectorStarted;

  /* ---- L3: rerank with real-time features ---- */
  const rerankStarted = performance.now();
  const scored = retrieved
    .map(({ row, vector }) => {
      const profile = hydrateProfile(row);
      const distanceMiles = haversineMiles(project.location, profile.location);
      if (distanceMiles > radiusMiles + profile.travelRadiusMiles) return null;

      const bestSocial = profile.socials[0];
      const result = blend({
        // Cosine lands in [-1,1]; shift into [0,1] so weights stay interpretable.
        vector: (vector + 1) / 2,
        proximity: proximityScore(distanceMiles, radiusMiles + profile.travelRadiusMiles),
        rateFit: rateFitScore(profile.dayRateCents ?? 0, targetRate),
        responsiveness: profile.responseScore / 100,
        authenticity: bestSocial ? bestSocial.eai / 100 : 0.6,
        trackRecord: Math.min(1, (profile.rating / 5) * 0.6 + (profile.credits.length / 20) * 0.4),
        availability: availabilityScore(profile, project.shootStart),
        freshness: freshnessScore(profile.availableFrom),
      });

      return {
        subject: projectProfile(profile, viewer),
        score: result.score,
        reasons: explain(result),
        distanceMiles: Math.round(distanceMiles * 10) / 10,
      };
    })
    .filter((c): c is DeckCard<TalentProfile> => c !== null)
    .sort((a, b) => b.score - a.score);
  const rerankMs = performance.now() - rerankStarted;

  const limit = Math.min(query.limit ?? 20, 50);
  const offset = query.cursor ? Number(query.cursor) || 0 : 0;
  const page = scored.slice(offset, offset + limit);

  return {
    cards: page,
    nextCursor: offset + limit < scored.length ? String(offset + limit) : null,
    telemetry: {
      candidatesRetrieved: rows.length,
      candidatesAfterHardFilter: scored.length,
      vectorSearchMs: round(vectorMs + l1Ms),
      rerankMs: round(rerankMs),
      totalMs: round(performance.now() - started),
      cellsScanned: plan.strategy === 'cells' ? plan.cells.length : plan.cellsConsidered,
      modelVersion: MODEL_VERSION,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Talent deck: rank opportunities for a talent                        */
/* ------------------------------------------------------------------ */

export interface OpportunityDeckResult {
  cards: DeckCard<Opportunity>[];
  telemetry: FeedTelemetry;
  nextCursor: string | null;
}

interface OppRow {
  id: string;
  project_id: string;
  role: string;
  sector: string;
  rate_cents: number;
  sponsored: number;
  side_script_id: string | null;
  embedding: string;
  data: string;
  created_at: string;
}

export function buildOpportunityDeck(
  profile: TalentProfile,
  account: Account,
  query: { sectors?: Sector[]; radiusMiles?: number; minRateCents?: number; limit?: number; cursor?: string },
): OpportunityDeckResult {
  const started = performance.now();
  const radiusMiles = query.radiusMiles ?? profile.travelRadiusMiles + 40;

  const clauses: string[] = ['1 = 1'];
  const params: unknown[] = [];

  const sectors = query.sectors?.length ? query.sectors : [profile.sector];
  clauses.push(`o.sector IN (${sectors.map(() => '?').join(',')})`);
  params.push(...sectors);

  if (query.minRateCents != null) {
    clauses.push('o.rate_cents >= ?');
    params.push(query.minRateCents);
  }

  clauses.push(
    `NOT EXISTS (SELECT 1 FROM swipes s WHERE s.actor_account_id = ? AND s.subject_id = o.id)`,
  );
  params.push(account.id);

  const rows = all<OppRow>(
    `SELECT o.* FROM opportunities o
      JOIN projects pr ON pr.id = o.project_id
      WHERE ${clauses.join(' AND ')}
      LIMIT 500`,
    ...params,
  );

  const vectorStarted = performance.now();
  const talentVector = encodeQuery({
    sectors: [profile.sector],
    unionStatuses: [profile.unionStatus],
    targetRateCents: profile.dayRateCents ?? 0,
    minFollowers: 0,
    wantsAuthenticity: false,
    roles: [profile.primaryRole],
    keywords: profile.specialties,
  });
  const vectorMs = performance.now() - vectorStarted;

  const rerankStarted = performance.now();
  const cards = rows
    .map((row): DeckCard<Opportunity> | null => {
      const opportunity = hydrateOpportunity(row);
      const distanceMiles = haversineMiles(profile.location, opportunity.project.location);
      if (distanceMiles > radiusMiles) return null;
      if (opportunity.slotsFilled >= opportunity.slots) return null;

      const vector = similarity(talentVector, deserialize(row.embedding));
      // Talent care about pay first, proximity second — invert rateFit so a
      // higher-paying gig scores better rather than worse.
      const payLift = Math.min(1, opportunity.rateCents / Math.max(1, profile.dayRateCents ?? 1));
      const result = blend({
        vector: (vector + 1) / 2,
        proximity: proximityScore(distanceMiles, radiusMiles),
        rateFit: Math.min(1, payLift),
        responsiveness: 0.7,
        authenticity: opportunity.project.unionStatus === profile.unionStatus ? 1 : 0.55,
        trackRecord: opportunity.sponsored ? 0.9 : 0.6,
        availability: 0.8,
        freshness: freshnessScore(opportunity.createdAt),
      });

      return {
        subject: { ...opportunity, score: result.score },
        score: opportunity.sponsored ? Math.min(1, result.score + 0.12) : result.score,
        reasons: explain(result),
        distanceMiles: Math.round(distanceMiles * 10) / 10,
      };
    })
    .filter((c): c is DeckCard<Opportunity> => c !== null)
    .sort((a, b) => b.score - a.score);
  const rerankMs = performance.now() - rerankStarted;

  const limit = Math.min(query.limit ?? 20, 50);
  const offset = query.cursor ? Number(query.cursor) || 0 : 0;

  return {
    cards: cards.slice(offset, offset + limit),
    nextCursor: offset + limit < cards.length ? String(offset + limit) : null,
    telemetry: {
      candidatesRetrieved: rows.length,
      candidatesAfterHardFilter: cards.length,
      vectorSearchMs: round(vectorMs),
      rerankMs: round(rerankMs),
      totalMs: round(performance.now() - started),
      cellsScanned: 1,
      modelVersion: MODEL_VERSION,
    },
  };
}

/* ------------------------------------------------------------------ */

/** Mutual-interest check: has the talent already swiped right on this project? */
export function hasReciprocalInterest(profileAccountId: string, projectId: string): boolean {
  const row = get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM swipes s
      JOIN opportunities o ON o.id = s.subject_id
      WHERE s.actor_account_id = ? AND o.project_id = ? AND s.direction IN ('right', 'up')`,
    profileAccountId,
    projectId,
  );
  return (row?.n ?? 0) > 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
