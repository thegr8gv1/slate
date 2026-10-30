import type { FastifyInstance } from 'fastify';
import type {
  Campaign,
  CampaignDraftRequest,
  TalentAnalytics,
  TimeSeriesPoint,
} from '../contracts/index.js';
import { EAI, commissionBpsFor } from '../contracts/index.js';
import { all, get, run } from '../db/index.js';
import { campaignById, campaignsForBrand, hydrateProfile, profileById, type ProfileRow } from '../db/repo.js';
import { runAudit } from '../domain/trust.js';
import { badRequest, forbidden, notFound, requireAccount } from '../lib/http.js';
import { newId } from '../lib/ids.js';

export async function brandRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------- Campaigns ------------------------------------- */

  app.get('/campaigns', async (request) => {
    const account = requireAccount(request);
    return { campaigns: campaignsForBrand(account.id) };
  });

  app.get('/campaigns/:id', async (request) => {
    requireAccount(request);
    const { id } = request.params as { id: string };
    const campaign = campaignById(id);
    if (!campaign) throw notFound('Campaign');
    return estimate(campaign);
  });

  app.post('/campaigns', async (request) => {
    const account = requireAccount(request);
    if (!account.workspaces.includes('brand')) throw forbidden('Campaigns need the brand workspace');
    const body = (request.body ?? {}) as CampaignDraftRequest;

    const campaign: Campaign = {
      id: newId('cmp'),
      brandAccountId: account.id,
      name: body.name ?? 'Untitled campaign',
      objective: body.objective ?? 'awareness',
      audience: {
        geos: body.audience?.geos ?? ['US'],
        ageBands: body.audience?.ageBands ?? ['18-24', '25-34'],
        interests: body.audience?.interests ?? [],
      },
      budgetCents: body.budgetCents ?? 50_000_00,
      cpmTargetCents: 1_200,
      selectedProfileIds: body.selectedProfileIds ?? [],
      estimatedReach: 0,
      predictedRoi: 0,
      state: 'draft',
      step: body.step ?? 1,
      createdAt: new Date().toISOString(),
    };

    persistCampaign(campaign);
    return estimate(campaign);
  });

  app.patch('/campaigns/:id', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    const campaign = campaignById(id);
    if (!campaign) throw notFound('Campaign');
    if (campaign.brandAccountId !== account.id) throw forbidden('Not your campaign');

    const body = (request.body ?? {}) as CampaignDraftRequest;
    const updated: Campaign = {
      ...campaign,
      name: body.name ?? campaign.name,
      objective: body.objective ?? campaign.objective,
      audience: { ...campaign.audience, ...(body.audience ?? {}) },
      budgetCents: body.budgetCents ?? campaign.budgetCents,
      selectedProfileIds: body.selectedProfileIds ?? campaign.selectedProfileIds,
      step: body.step ?? campaign.step,
    };
    persistCampaign(updated);
    return estimate(updated);
  });

  app.post('/campaigns/:id/launch', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    const campaign = campaignById(id);
    if (!campaign) throw notFound('Campaign');
    if (campaign.brandAccountId !== account.id) throw forbidden('Not your campaign');
    if (campaign.selectedProfileIds.length === 0) {
      throw badRequest('Select at least one creator before launching');
    }

    // Re-audit at launch: a creator can degrade between selection and spend.
    const rejected: string[] = [];
    for (const profileId of campaign.selectedProfileIds) {
      const audit = runAudit(profileId);
      if (audit.verdict === 'suppressed') rejected.push(audit.displayName);
    }
    if (rejected.length > 0) {
      throw badRequest(
        `Engagement audit blocked launch for: ${rejected.join(', ')}. Remove them or request manual review.`,
        { rejected },
      );
    }

    const launched: Campaign = { ...campaign, state: 'live' };
    persistCampaign(launched);
    return estimate(launched);
  });

  /* ---------------- Analytics -------------------------------------- */

  app.get('/analytics', async (request) => {
    requireAccount(request);
    const query = request.query as Record<string, string>;
    const limit = Number(query.limit ?? 8);

    const rows = all<ProfileRow>(
      `SELECT * FROM talent_profiles
        WHERE suppressed = 0
        ORDER BY (followers * (1 - fraud_score)) DESC
        LIMIT ?`,
      limit,
    );

    const leaderboard = rows.map((row) => analyticsFor(hydrateProfile(row)));
    const cohortSeries = blendSeries(leaderboard.map((entry) => entry.series));

    return {
      leaderboard,
      cohortSeries,
      heatmap: leaderboard[0]?.heatmap ?? [],
    };
  });

  app.get('/analytics/audit/:profileId', async (request) => {
    requireAccount(request);
    const { profileId } = request.params as { profileId: string };
    return runAudit(profileId);
  });
}

/* ------------------------------------------------------------------ */

function persistCampaign(campaign: Campaign): void {
  const exists = get<{ id: string }>('SELECT id FROM campaigns WHERE id = ?', campaign.id);
  if (exists) {
    run(
      'UPDATE campaigns SET state = ?, step = ?, data = ? WHERE id = ?',
      campaign.state,
      campaign.step,
      JSON.stringify(campaign),
      campaign.id,
    );
  } else {
    run(
      'INSERT INTO campaigns (id, brand_account_id, state, step, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      campaign.id,
      campaign.brandAccountId,
      campaign.state,
      campaign.step,
      JSON.stringify(campaign),
      campaign.createdAt,
    );
  }
}

/**
 * Reach and ROI projection.
 *
 * Reach counts *verified* impressions only, then de-duplicates for audience
 * overlap — stacking raw follower counts is exactly how campaigns end up paying
 * three creators for the same eyeballs.
 *
 * Return is modelled as earned media value, which is what brands actually
 * benchmark creator spend against:
 *
 *   engagements = verified reach x engagement rate x deliverables
 *   earned value = engagements x EMV per engagement
 *   ROI%        = earned value / allocated spend x 100
 *
 * Spend is allocated by share of verified reach rather than split evenly, so
 * two creators with the same engagement rate score the same ROI regardless of
 * audience size — otherwise the model just rewards whoever is biggest.
 */

/** Deliverables per creator in a standard flight. */
const DELIVERABLES_PER_CREATOR = 3;

/**
 * Earned media value per authenticated engagement, in cents. Category-dependent
 * in reality (beauty and fashion sit high, commodity retail low); this is a
 * single blended figure the brand tier would normally configure.
 */
const EMV_PER_ENGAGEMENT_CENTS = 28;

function estimate(campaign: Campaign) {
  const rows = campaign.selectedProfileIds.map((profileId) => {
    const profile = profileById(profileId);
    if (!profile) {
      return {
        profileId,
        displayName: 'Unknown creator',
        avatarUrl: '',
        role: '',
        verifiedReach: 0,
        fraudScore: 1,
        engagementRate: 0,
        included: false,
      };
    }
    const social = profile.socials[0];
    return {
      profileId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      role: profile.primaryRole,
      verifiedReach: social?.verifiedReach ?? 0,
      fraudScore: social?.fraudScore ?? 0,
      engagementRate: social?.engagementRate ?? 0,
      included: (social?.fraudScore ?? 0) <= EAI.suppressAbove,
    };
  });

  const included = rows.filter((r) => r.included);
  const rawReach = included.reduce((sum, r) => sum + r.verifiedReach, 0);

  // Overlap grows with roster size; 6% per additional creator, capped at 35%.
  const overlap = Math.min(0.35, Math.max(0, included.length - 1) * 0.06);
  const estimatedReach = Math.round(rawReach * (1 - overlap));

  const breakdown = rows.map((row) => {
    // Share of spend follows share of verified reach.
    const share = rawReach > 0 && row.included ? row.verifiedReach / rawReach : 0;
    const allocationCents = campaign.budgetCents * share;
    const engagements = row.verifiedReach * (row.engagementRate / 100) * DELIVERABLES_PER_CREATOR;
    const earnedValueCents = engagements * EMV_PER_ENGAGEMENT_CENTS;
    const projectedRoiPct =
      allocationCents > 0 ? Math.round((earnedValueCents / allocationCents) * 100) : 0;

    return {
      profileId: row.profileId,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      role: row.role,
      verifiedReach: row.verifiedReach,
      fraudScore: row.fraudScore,
      projectedRoiPct,
      included: row.included,
    };
  });

  const totalEarnedValueCents = included.reduce(
    (sum, r) =>
      sum + r.verifiedReach * (r.engagementRate / 100) * DELIVERABLES_PER_CREATOR * EMV_PER_ENGAGEMENT_CENTS,
    0,
  );

  // The platform fee is real spend that produces no media, so it comes off the
  // top before the return is reported.
  const platformDrag = commissionBpsFor(campaign.budgetCents) / 10_000;
  const effectiveSpendCents = campaign.budgetCents * (1 + platformDrag);
  const predictedRoi =
    effectiveSpendCents > 0
      ? Math.round((totalEarnedValueCents / effectiveSpendCents) * 1000) / 10
      : 0;

  const cpmCents = estimatedReach > 0 ? Math.round((campaign.budgetCents / estimatedReach) * 1000) : 0;

  return {
    campaign: { ...campaign, estimatedReach, predictedRoi },
    estimatedReach,
    predictedRoi,
    cpmCents,
    spend: campaign.budgetCents / 100,
    earnedValueCents: Math.round(totalEarnedValueCents),
    breakdown,
  };
}

function analyticsFor(profile: ReturnType<typeof hydrateProfile>): TalentAnalytics {
  const social = profile.socials[0];
  const base = social ? social.engagementRate * 12 : 30;
  const series: TimeSeriesPoint[] = Array.from({ length: 12 }, (_, i) => {
    const drift = Math.sin((i / 11) * Math.PI * 1.2) * 12;
    const ramp = (i / 11) * 34;
    return {
      t: new Date(Date.now() - (11 - i) * 30 * 86_400_000).toISOString().slice(0, 7),
      engagement: Math.round(Math.max(4, base + ramp + drift)),
      conversion: Math.round(Math.max(2, base * 0.62 + ramp * 0.72 + drift * 0.5)),
    };
  });

  const geos = social?.audienceTopGeos ?? [];
  const roiScore = Math.round(
    Math.min(
      99,
      (social ? social.eai * 0.55 : 40) +
        profile.rating * 6 +
        Math.min(20, profile.bookingsCompleted / 3) +
        (1 - (social?.fraudScore ?? 0.1)) * 12,
    ),
  );

  return {
    profileId: profile.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    role: profile.primaryRole,
    predictiveRoiScore: roiScore,
    roiDeltaPct: Math.round((series[11].conversion / Math.max(1, series[0].conversion) - 1) * 100),
    series,
    heatmap: geos.map((g) => ({
      code: g.code,
      label: g.code,
      intensity: Math.round(g.share),
    })),
    cardViews: Math.round((social?.followers ?? 5000) / 40 + profile.bookingsCompleted * 18),
    pitchAcceptRate: Math.round(profile.responseScore * 0.62),
    medianResponseMinutes: Math.max(4, Math.round((100 - profile.responseScore) * 2.4)),
  };
}

function blendSeries(all: TimeSeriesPoint[][]): TimeSeriesPoint[] {
  if (all.length === 0) return [];
  return all[0].map((_, index) => {
    const engagement = all.reduce((sum, s) => sum + (s[index]?.engagement ?? 0), 0) / all.length;
    const conversion = all.reduce((sum, s) => sum + (s[index]?.conversion ?? 0), 0) / all.length;
    return {
      t: all[0][index].t,
      engagement: Math.round(engagement),
      conversion: Math.round(conversion),
    };
  });
}
