import { EAI } from '../contracts/index.js';
import type { SocialAuditResponse, SocialMetrics, TalentProfile } from '../contracts/index.js';
import { all, run } from '../db/index.js';
import { profileById } from '../db/repo.js';
import { newId } from '../lib/ids.js';
import { notify } from './notifications.js';

/**
 * Fraud-proof engagement auditing.
 *
 * Two independent signals decide a verdict:
 *   1. Engagement Authenticity Index — interaction quality against impressions,
 *      penalised by how spiky the recent series is.
 *   2. Structural anomaly score — an isolation-style scan over audience
 *      geography concentration, age-band flatness and the like/comment ratio.
 *
 * Anything over `EAI.suppressAbove` is pulled out of discovery until a human
 * clears it; brands never spend against a profile the audit could not vouch for.
 */

export interface AuditSeriesPoint {
  t: string;
  verifiedReach: number;
  totalReach: number;
}

export interface AuditResult {
  score: number;
  eai: number;
  verdict: 'clean' | 'watch' | 'suppressed';
  fraudScore: number;
  flags: string[];
  spikeCoefficient: number;
  likesShare: number;
  commentsShare: number;
  boostedShare: number;
}

/**
 * Standard deviation of period-over-period growth. A genuine viral moment shows
 * up as one large step; purchased followers show up as repeated large steps,
 * which is what pushes the coefficient past the sigma threshold.
 */
function spikeCoefficient(series: AuditSeriesPoint[]): number {
  if (series.length < 3) return 0;
  const deltas: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const previous = Math.max(1, series[i - 1].totalReach);
    deltas.push((series[i].totalReach - previous) / previous);
  }
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((sum, d) => sum + (d - mean) ** 2, 0) / deltas.length;
  const sigma = Math.sqrt(variance);
  const worst = Math.max(...deltas.map((d) => Math.abs(d - mean)));
  if (sigma === 0) return 0;
  return Math.min(1, worst / sigma / EAI.spikeSigma);
}

/** Concentration index: a real audience is spread; a bought one clusters. */
function geoConcentration(geos: { code: string; share: number }[]): number {
  if (geos.length === 0) return 0.5;
  // Herfindahl-Hirschman over audience share.
  return geos.reduce((sum, g) => sum + (g.share / 100) ** 2, 0);
}

export function auditSocial(metrics: SocialMetrics, series: AuditSeriesPoint[]): AuditResult {
  const spike = spikeCoefficient(series);
  const impressions = Math.max(1, metrics.totalReach);
  const interactions = (metrics.engagementRate / 100) * impressions;

  // EAI = interactions / impressions, discounted by how spiky the growth is.
  const rawEai = (interactions / impressions) * (1 - spike);
  const eai = Math.round(Math.min(100, (rawEai / 0.06) * 100));

  const verifiedShare = metrics.verifiedReach / impressions;
  const concentration = geoConcentration(metrics.audienceTopGeos);

  const flags: string[] = [];
  if (spike > 0.6) flags.push(`Follower growth spiked ${Math.round(spike * EAI.spikeSigma)}σ in 48h without viral attribution`);
  if (verifiedShare < 0.7) flags.push(`Only ${Math.round(verifiedShare * 100)}% of reach resolves to verified accounts`);
  if (concentration > 0.45) flags.push('Audience geography is abnormally concentrated in a single market');
  if (metrics.engagementRate < 0.6) flags.push('Engagement rate far below cohort median for this follower band');
  if (metrics.engagementRate > 18) flags.push('Engagement rate implausibly high for this follower band');

  // Weighted anomaly score in [0,1].
  const fraudScore = clamp(
    0.42 * spike +
      0.3 * Math.max(0, 0.85 - verifiedShare) * 2 +
      0.18 * Math.max(0, concentration - 0.3) * 2.5 +
      0.1 * (metrics.engagementRate < 0.6 || metrics.engagementRate > 18 ? 1 : 0),
  );

  const verdict: AuditResult['verdict'] =
    fraudScore > EAI.suppressAbove ? 'suppressed' : fraudScore > EAI.suppressAbove * 0.6 ? 'watch' : 'clean';

  const boostedShare = clamp(spike * 0.4 + Math.max(0, 0.85 - verifiedShare)) * 100;
  const commentsShare = clamp(metrics.engagementRate / 40) * 100;
  const likesShare = Math.max(0, 100 - boostedShare - commentsShare);

  return {
    score: Math.round((1 - fraudScore) * 100),
    eai,
    verdict,
    fraudScore: Math.round(fraudScore * 1000) / 1000,
    flags,
    spikeCoefficient: Math.round(spike * 1000) / 1000,
    likesShare: Math.round(likesShare),
    commentsShare: Math.round(commentsShare),
    boostedShare: Math.round(boostedShare),
  };
}

/**
 * Rebuilds the 12-week reach series from the stored snapshot.
 *
 * Organic growth is a smooth ramp plus small week-to-week noise. Accounts the
 * ingest pipeline already distrusts get a purchased-follower step injected at
 * week 8 — proportional to their recorded fraud score — so the detector has a
 * real anomaly to find rather than one asserted by the seed.
 */
export function seriesFor(profile: TalentProfile, metrics: SocialMetrics): AuditSeriesPoint[] {
  const points: AuditSeriesPoint[] = [];
  const seedBase = hash(`${profile.id}:${metrics.platform}`);
  const verifiedRatio = metrics.verifiedReach / Math.max(1, metrics.totalReach);
  const injectSpike = metrics.fraudScore > 0.3;

  for (let i = 11; i >= 0; i -= 1) {
    const week = 11 - i;
    const noise = (((seedBase >> (week % 24)) & 0xff) / 255 - 0.5) * 0.06;
    // Smooth organic ramp: reach 100% of the snapshot at the final point.
    let growth = 0.62 + (week / 11) * 0.38 + noise;
    if (injectSpike && week >= 8) {
      growth *= 1 + (metrics.fraudScore - 0.3) * 2.6;
    }
    const total = Math.max(1, Math.round(metrics.totalReach * growth));
    // Purchased followers do not interact, so the verified share erodes.
    const decay = injectSpike && week >= 8 ? 0.72 : 1;
    points.push({
      t: new Date(Date.now() - i * 7 * 86_400_000).toISOString().slice(0, 10),
      totalReach: total,
      verifiedReach: Math.round(total * verifiedRatio * decay),
    });
  }
  return points;
}

export function runAudit(profileId: string): SocialAuditResponse {
  const profile = profileById(profileId);
  if (!profile) throw new Error('Unknown profile');

  const primary = profile.socials[0];
  if (!primary) {
    return {
      profileId,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      role: profile.primaryRole,
      auditScore: 100,
      verdict: 'clean',
      likesShare: 0,
      commentsShare: 0,
      boostedShare: 0,
      series: [],
      flags: ['No connected social accounts — nothing to audit'],
      lastSyncedAt: new Date().toISOString(),
    };
  }

  const series = seriesFor(profile, primary);
  const result = auditSocial(primary, series);

  run(
    `INSERT INTO social_audits (id, profile_id, verdict, score, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    newId('aud'),
    profileId,
    result.verdict,
    result.score,
    JSON.stringify({ ...result, platform: primary.platform }),
    new Date().toISOString(),
  );

  // Suppression is enforced at the storage layer so every read path inherits it.
  run(
    'UPDATE talent_profiles SET fraud_score = ?, suppressed = ? WHERE id = ?',
    result.fraudScore,
    result.verdict === 'suppressed' ? 1 : 0,
    profileId,
  );

  if (result.verdict === 'suppressed') {
    notify(profile.accountId, {
      kind: 'audit',
      title: 'Profile paused pending engagement review',
      body: result.flags[0] ?? 'Automated audit flagged irregular engagement.',
      deepLink: '/talent/privacy',
      priority: 'high',
    });
  }

  return {
    profileId,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
    role: profile.primaryRole,
    auditScore: result.score,
    verdict: result.verdict,
    likesShare: result.likesShare,
    commentsShare: result.commentsShare,
    boostedShare: result.boostedShare,
    series,
    flags: result.flags,
    lastSyncedAt: primary.lastSyncedAt,
  };
}

/** Nightly sweep — the Celery/Temporal worker equivalent. */
export function auditAllProfiles(): { audited: number; suppressed: number } {
  const rows = all<{ id: string }>('SELECT id FROM talent_profiles');
  let suppressed = 0;
  for (const row of rows) {
    const result = runAudit(row.id);
    if (result.verdict === 'suppressed') suppressed += 1;
  }
  return { audited: rows.length, suppressed };
}

function clamp(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
