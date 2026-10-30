import type { FastifyInstance } from 'fastify';
import type { CreateBeaconRequest, MatchRecord, Sector, TalentProfile } from '../contracts/index.js';
import { all } from '../db/index.js';
import {
  activeBeacons,
  beaconById,
  beaconsForProject,
  escrowsForProject,
  opportunitiesForProject,
  profileByAccount,
  profileById,
  projectById,
  projectsForOwner,
  sideScriptsForProject,
} from '../db/repo.js';
import { claimBeacon, dispatchBeacon, expireStaleBeacons } from '../domain/beacon.js';
import { buildViewerContext, projectProfile } from '../domain/discreet.js';
import { badRequest, forbidden, notFound, num, requireAccount } from '../lib/http.js';

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/projects', async (request) => {
    const account = requireAccount(request);
    return { projects: projectsForOwner(account.id) };
  });

  app.get('/projects/:id', async (request) => {
    const { id } = request.params as { id: string };
    const project = projectById(id);
    if (!project) throw notFound('Project');
    return {
      project,
      opportunities: opportunitiesForProject(id),
      sides: sideScriptsForProject(id),
    };
  });

  /** Everything the production project board renders in one round-trip. */
  app.get('/projects/:id/board', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    const project = projectById(id);
    if (!project) throw notFound('Project');

    const viewer = buildViewerContext(account);
    const rows = all<MatchRow>(
      'SELECT * FROM matches WHERE project_id = ? ORDER BY last_activity_at DESC',
      id,
    );

    const shortlist = rows
      .map((row) => {
        const profile = profileById(row.talent_profile_id);
        if (!profile) return null;
        return { match: hydrateMatch(row), profile: projectProfile(profile, viewer) };
      })
      .filter((entry): entry is { match: MatchRecord; profile: TalentProfile } => entry !== null);

    return {
      project,
      shortlist,
      opportunities: opportunitiesForProject(id),
      escrows: escrowsForProject(id),
      beacons: beaconsForProject(id),
      sides: sideScriptsForProject(id),
    };
  });

  /* ---------------- Set-Beacon ----------------------------------- */

  app.get('/beacons', async (request) => {
    requireAccount(request);
    expireStaleBeacons();
    return { beacons: activeBeacons() };
  });

  app.get('/beacons/:id', async (request) => {
    requireAccount(request);
    const { id } = request.params as { id: string };
    const beacon = beaconById(id);
    if (!beacon) throw notFound('Beacon');
    const claimant = beacon.claimedByProfileId ? profileById(beacon.claimedByProfileId) : null;
    return { beacon, claimant };
  });

  app.post('/beacons', async (request) => {
    const account = requireAccount(request);
    const body = request.body as CreateBeaconRequest;
    if (!body?.projectId || !body?.role || !body?.sector || !body?.callTime) {
      throw badRequest('projectId, role, sector and callTime are required');
    }
    const project = projectById(body.projectId);
    if (!project) throw notFound('Project');
    if (project.ownerAccountId !== account.id) {
      throw forbidden('Only the project owner can raise a beacon');
    }

    const report = dispatchBeacon({
      projectId: body.projectId,
      issuedByAccountId: account.id,
      role: body.role,
      sector: body.sector as Sector,
      notes: body.notes,
      radiusMiles: num(body.radiusMiles),
      callTime: body.callTime,
      baseRateCents: body.baseRateCents,
      rateMultiplier: num(body.rateMultiplier),
      origin: body.origin,
    });

    return {
      beacon: report.beacon,
      candidates: report.candidates,
      dispatch: {
        devicesTargeted: report.devicesTargeted,
        cellsQueried: report.cellsQueried,
        fanoutMs: report.fanoutMs,
        withinSlo: report.withinSlo,
      },
    };
  });

  app.post('/beacons/:id/claim', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { profileId?: string };

    const profile = body.profileId ? profileById(body.profileId) : profileByAccount(account.id);
    if (!profile) throw notFound('Talent profile');
    // A beacon may only be claimed for your own profile — an agency cannot
    // silently commit a client to a same-day call.
    if (profile.accountId !== account.id) {
      throw forbidden('You can only claim a beacon for your own profile');
    }

    const result = claimBeacon(id, profile.id);
    return {
      claimed: result.claimed,
      beacon: result.beacon,
      agreementId: null,
      reason: result.reason,
    };
  });
}

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
