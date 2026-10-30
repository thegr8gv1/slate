import type { FastifyInstance } from 'fastify';
import {
  PLAN_CATALOG,
  SUPER_PITCH_TIERS,
  type MatchRecord,
  type Pitch,
  type Sector,
  type SuperPitchTierId,
  type SwipeRequest,
  type SwipeResponse,
  type UnionStatus,
} from '../contracts/index.js';
import { all, get, run } from '../db/index.js';
import {
  opportunityById,
  profileByAccount,
  profileById,
  projectById,
  projectsForOwner,
} from '../db/repo.js';
import { buildViewerContext } from '../domain/discreet.js';
import { buildOpportunityDeck, buildTalentDeck, hasReciprocalInterest } from '../domain/matching.js';
import { notify } from '../domain/notifications.js';
import { badRequest, conflict, forbidden, list, notFound, num, paymentRequired, requireAccount } from '../lib/http.js';
import { newId } from '../lib/ids.js';

export async function discoveryRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------- Production deck: swipe talent ---------------- */

  app.get('/discovery/talent', async (request) => {
    const account = requireAccount(request);
    const query = request.query as Record<string, string>;

    const projectId = query.projectId ?? projectsForOwner(account.id)[0]?.id;
    if (!projectId) throw badRequest('projectId is required');
    const project = projectById(projectId);
    if (!project) throw notFound('Project');

    const viewer = buildViewerContext(account);
    const result = buildTalentDeck(
      project,
      {
        projectId,
        sectors: list(query.sectors) as Sector[] | undefined,
        roles: list(query.roles),
        unionStatuses: list(query.unionStatuses) as UnionStatus[] | undefined,
        minRateCents: num(query.minRateCents),
        maxRateCents: num(query.maxRateCents),
        radiusMiles: num(query.radiusMiles, 50),
        ageMin: num(query.ageMin),
        ageMax: num(query.ageMax),
        minFollowers: num(query.minFollowers),
        maxFraudScore: num(query.maxFraudScore, 1),
        limit: num(query.limit, 20),
        cursor: query.cursor,
      },
      viewer,
      account.id,
    );

    return { cards: result.cards, telemetry: result.telemetry, nextCursor: result.nextCursor };
  });

  /* ---------------- Talent deck: swipe gigs ---------------------- */

  app.get('/discovery/opportunities', async (request) => {
    const account = requireAccount(request);
    const profile = profileByAccount(account.id);
    if (!profile) throw forbidden('Only talent and crew accounts have an opportunity deck');

    const query = request.query as Record<string, string>;
    const result = buildOpportunityDeck(profile, account, {
      sectors: list(query.sectors) as Sector[] | undefined,
      radiusMiles: num(query.radiusMiles),
      minRateCents: num(query.minRateCents),
      limit: num(query.limit, 20),
      cursor: query.cursor,
    });
    return { cards: result.cards, telemetry: result.telemetry, nextCursor: result.nextCursor };
  });

  /* ---------------- Swipe ---------------------------------------- */

  app.post('/discovery/swipe', async (request) => {
    const account = requireAccount(request);
    const body = request.body as SwipeRequest;
    if (!body?.subjectId || !body?.direction || !body?.subjectKind) {
      throw badRequest('subjectKind, subjectId and direction are required');
    }

    const projectId = body.projectId ?? null;

    // The unique index makes a repeat swipe a no-op rather than an error: the
    // client may retry on a flaky connection and must not double-charge a pitch.
    const existing = get<{ id: string }>(
      'SELECT id FROM swipes WHERE actor_account_id = ? AND subject_id = ? AND (project_id IS ? OR project_id = ?)',
      account.id,
      body.subjectId,
      projectId,
      projectId,
    );
    if (existing) {
      return { recorded: true, match: null, pitch: null, pitchAllowance: account.pitchAllowance } satisfies SwipeResponse;
    }

    run(
      `INSERT INTO swipes (id, actor_account_id, subject_kind, subject_id, direction, project_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId('swp'),
      account.id,
      body.subjectKind,
      body.subjectId,
      body.direction,
      projectId,
      new Date().toISOString(),
    );

    let match: MatchRecord | null = null;
    let pitch: Pitch | null = null;
    let allowance = account.pitchAllowance;

    if (body.direction === 'right' && body.subjectKind === 'talent' && projectId) {
      match = upsertMatch(projectId, body.subjectId, null, 'shortlisted');
      const profile = profileById(body.subjectId);
      if (profile && hasReciprocalInterest(profile.accountId, projectId)) {
        match = upsertMatch(projectId, body.subjectId, null, 'mutual');
        notify(profile.accountId, {
          kind: 'match',
          title: "It's a match",
          body: `${projectById(projectId)?.title ?? 'A production'} shortlisted you.`,
          deepLink: '/talent/matches',
          priority: 'high',
        });
      }
    }

    if (body.direction === 'right' && body.subjectKind === 'opportunity') {
      const opportunity = opportunityById(body.subjectId);
      const profile = profileByAccount(account.id);
      if (opportunity && profile) {
        // If the production already swiped this talent, the interest is mutual.
        const theirSwipe = get<{ id: string }>(
          `SELECT s.id FROM swipes s
            WHERE s.subject_id = ? AND s.project_id = ? AND s.direction IN ('right','up')`,
          profile.id,
          opportunity.projectId,
        );
        match = upsertMatch(
          opportunity.projectId,
          profile.id,
          opportunity.id,
          theirSwipe ? 'mutual' : 'shortlisted',
        );
      }
    }

    if (body.direction === 'up') {
      const spend = spendPitch(account.id, account.pitchAllowance, body.pitch?.superTier ?? null);
      allowance = spend.remaining;
      pitch = createPitch(account.id, body, spend.queueRank);
      if (projectId && body.subjectKind === 'talent') {
        match = upsertMatch(projectId, body.subjectId, null, 'pitched');
      }
    }

    return { recorded: true, match, pitch, pitchAllowance: allowance } satisfies SwipeResponse;
  });

  /* ---------------- Super Pitch catalogue ------------------------- */

  app.get('/discovery/super-pitch-tiers', async () => ({ tiers: SUPER_PITCH_TIERS }));

  app.get('/discovery/matches', async (request) => {
    const account = requireAccount(request);
    const projects = projectsForOwner(account.id);
    const profile = profileByAccount(account.id);

    if (projects.length > 0) {
      const ids = projects.map((p) => p.id);
      const rows = all<MatchRow>(
        `SELECT * FROM matches WHERE project_id IN (${ids.map(() => '?').join(',')})
          ORDER BY last_activity_at DESC`,
        ...ids,
      );
      return {
        matches: rows.map((row) => ({
          match: hydrateMatch(row),
          profile: profileById(row.talent_profile_id),
          project: projects.find((p) => p.id === row.project_id) ?? null,
        })),
      };
    }

    if (profile) {
      const rows = all<MatchRow>(
        'SELECT * FROM matches WHERE talent_profile_id = ? ORDER BY last_activity_at DESC',
        profile.id,
      );
      return {
        matches: rows.map((row) => ({
          match: hydrateMatch(row),
          profile,
          project: projectById(row.project_id),
        })),
      };
    }

    return { matches: [] };
  });
}

/* ------------------------------------------------------------------ */

interface MatchRow {
  id: string;
  project_id: string;
  talent_profile_id: string;
  opportunity_id: string | null;
  state: string;
  created_at: string;
  last_activity_at: string;
}

function hydrateMatch(row: MatchRow): MatchRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    talentProfileId: row.talent_profile_id,
    opportunityId: row.opportunity_id,
    state: row.state as MatchRecord['state'],
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
  };
}

function upsertMatch(
  projectId: string,
  talentProfileId: string,
  opportunityId: string | null,
  state: MatchRecord['state'],
): MatchRecord {
  const now = new Date().toISOString();
  const existing = get<MatchRow>(
    'SELECT * FROM matches WHERE project_id = ? AND talent_profile_id = ?',
    projectId,
    talentProfileId,
  );

  if (existing) {
    run('UPDATE matches SET state = ?, last_activity_at = ? WHERE id = ?', state, now, existing.id);
    return hydrateMatch({ ...existing, state, last_activity_at: now });
  }

  const record: MatchRow = {
    id: newId('mch'),
    project_id: projectId,
    talent_profile_id: talentProfileId,
    opportunity_id: opportunityId,
    state,
    created_at: now,
    last_activity_at: now,
  };
  run(
    `INSERT INTO matches (id, project_id, talent_profile_id, opportunity_id, state, created_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    record.id,
    record.project_id,
    record.talent_profile_id,
    record.opportunity_id,
    record.state,
    record.created_at,
    record.last_activity_at,
  );
  return hydrateMatch(record);
}

/**
 * Enforces the plan's monthly pitch cap. A Super Pitch always goes through —
 * it is a paid micro-transaction — but it does not consume free allowance.
 */
function spendPitch(
  accountId: string,
  allowance: number | null,
  tier: SuperPitchTierId | null,
): { remaining: number | null; queueRank: number } {
  if (tier) {
    const definition = SUPER_PITCH_TIERS.find((t) => t.id === tier);
    if (!definition) throw badRequest(`Unknown Super Pitch tier: ${tier}`);
    return { remaining: allowance, queueRank: definition.queueRank };
  }

  if (allowance === null) return { remaining: null, queueRank: 9 };
  if (allowance <= 0) {
    throw paymentRequired(
      `You have used all ${PLAN_CATALOG.free.monthlyPitchLimit} pitches on Slate Free this month. Upgrade to Pro or send a Super Pitch.`,
    );
  }
  const remaining = allowance - 1;
  run('UPDATE accounts SET pitch_allowance = ? WHERE id = ?', remaining, accountId);
  return { remaining, queueRank: 9 };
}

function createPitch(fromAccountId: string, body: SwipeRequest, queueRank: number): Pitch {
  let toAccountId: string;
  let projectId = body.projectId ?? null;

  if (body.subjectKind === 'talent') {
    const profile = profileById(body.subjectId);
    if (!profile) throw notFound('Talent profile');
    // Agency routing: a repped talent's inbound offers land with the agency.
    toAccountId = profile.routing.requireNdaBeforeContact && profile.agencyId
      ? profile.agencyId
      : profile.accountId;
  } else {
    const opportunity = opportunityById(body.subjectId);
    if (!opportunity) throw notFound('Opportunity');
    const project = projectById(opportunity.projectId);
    if (!project) throw notFound('Project');
    toAccountId = project.ownerAccountId;
    projectId = project.id;
  }

  if (toAccountId === fromAccountId) throw conflict('You cannot pitch yourself');

  const pitch: Pitch = {
    id: newId('pch'),
    fromAccountId,
    toAccountId,
    projectId,
    opportunityId: body.subjectKind === 'opportunity' ? body.subjectId : null,
    message: body.pitch?.message?.trim() || 'Instant Pitch sent from the Slate deck.',
    offerCents: body.pitch?.offerCents ?? null,
    sideScriptId: body.pitch?.sideScriptId ?? null,
    superTier: body.pitch?.superTier ?? null,
    queueRank,
    readAt: null,
    respondedAt: null,
    outcome: 'pending',
    createdAt: new Date().toISOString(),
  };

  run(
    `INSERT INTO pitches (id, from_account_id, to_account_id, project_id, opportunity_id, super_tier, queue_rank, outcome, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    pitch.id,
    pitch.fromAccountId,
    pitch.toAccountId,
    pitch.projectId,
    pitch.opportunityId,
    pitch.superTier,
    pitch.queueRank,
    pitch.outcome,
    JSON.stringify(pitch),
    pitch.createdAt,
  );

  notify(toAccountId, {
    kind: 'pitch',
    title: pitch.superTier ? 'Super Pitch — pinned to the top of your inbox' : 'New Instant Pitch',
    body: pitch.message.slice(0, 120),
    deepLink: '/talent/inbox',
    priority: pitch.superTier ? 'high' : 'normal',
  });

  return pitch;
}
