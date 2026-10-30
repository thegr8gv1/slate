import type { FastifyInstance } from 'fastify';
import type {
  AgencyRouting,
  DiscreetSettings,
  Opportunity,
  SelfTape,
  TalentHomeResponse,
} from '../contracts/index.js';
import { all, get, run } from '../db/index.js';
import {
  escrowsForProfile,
  hydrateOpportunity,
  notificationsForAccount,
  pitchesForInbox,
  profileByAccount,
  profileById,
  projectById,
  sideScriptById,
  takesForSide,
} from '../db/repo.js';
import { buildViewerContext, projectProfile } from '../domain/discreet.js';
import { encodeTalent, serialize } from '../domain/embedding.js';
import { markRead, subscribe } from '../domain/notifications.js';
import { runAudit } from '../domain/trust.js';
import { badRequest, forbidden, notFound, requireAccount } from '../lib/http.js';
import { newId } from '../lib/ids.js';

export async function talentRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------- Home ------------------------------------------ */

  app.get('/talent/home', async (request) => {
    const account = requireAccount(request);
    const profile = profileByAccount(account.id);
    if (!profile) throw forbidden('This account has no talent profile');

    const escrows = escrowsForProfile(profile.id);
    const castingCalls = all<OppRow>(
      `SELECT o.* FROM opportunities o
        WHERE o.sector = ?
          AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.actor_account_id = ? AND s.subject_id = o.id)
        ORDER BY o.sponsored DESC, o.created_at DESC
        LIMIT 12`,
      profile.sector,
      account.id,
    ).map(hydrateOpportunity);

    return {
      profile,
      activeGigs: escrows.map((escrow) => ({
        escrowId: escrow.id,
        projectTitle: escrow.projectTitle,
        role: escrow.role,
        state: escrow.state,
        nextMilestone:
          escrow.milestones.find((m) => !m.signedOffAt)?.label ?? 'Complete',
        amountCents: escrow.grossCents,
      })),
      castingCalls,
      inbox: pitchesForInbox(account.id),
      notifications: notificationsForAccount(account.id, 20),
    } satisfies TalentHomeResponse;
  });

  /* ---------------- Public profile -------------------------------- */

  app.get('/talent/:id', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    const profile = profileById(id);
    if (!profile) throw notFound('Talent profile');

    const viewer = buildViewerContext(account);
    return { profile: projectProfile(profile, viewer) };
  });

  /* ---------------- Privacy & agency routing ---------------------- */

  app.patch('/talent/privacy', async (request) => {
    const account = requireAccount(request);
    const profile = profileByAccount(account.id);
    if (!profile) throw forbidden('This account has no talent profile');

    const body = request.body as {
      discreet?: Partial<DiscreetSettings>;
      routing?: Partial<AgencyRouting>;
      travelRadiusMiles?: number;
      availableFrom?: string | null;
    };

    const updated = {
      ...profile,
      discreet: { ...profile.discreet, ...(body.discreet ?? {}) },
      routing: { ...profile.routing, ...(body.routing ?? {}) },
      travelRadiusMiles: body.travelRadiusMiles ?? profile.travelRadiusMiles,
      availableFrom: body.availableFrom === undefined ? profile.availableFrom : body.availableFrom,
    };

    // The embedding depends on profile content, so it is re-encoded on every
    // write — a stale vector would silently mis-rank the card.
    const embedding = serialize(
      encodeTalent({
        sector: updated.sector,
        unionStatus: updated.unionStatus,
        dayRateCents: updated.dayRateCents ?? 0,
        followers: updated.socials[0]?.followers ?? 0,
        engagementRate: updated.socials[0]?.engagementRate ?? 0,
        eai: updated.socials[0]?.eai ?? 70,
        fraudScore: updated.socials[0]?.fraudScore ?? 0.05,
        rating: updated.rating,
        bookingsCompleted: updated.bookingsCompleted,
        responseScore: updated.responseScore,
        creditCount: updated.credits.length,
        primaryRole: updated.primaryRole,
        specialties: updated.specialties,
      }),
    );

    run(
      `UPDATE talent_profiles
          SET discreet_enabled = ?, budget_floor_cents = ?, embedding = ?, data = ?
        WHERE id = ?`,
      updated.discreet.enabled ? 1 : 0,
      updated.discreet.budgetFloorCents,
      embedding,
      JSON.stringify(updated),
      profile.id,
    );

    return { profile: updated };
  });

  /* ---------------- Casting room ---------------------------------- */

  app.get('/casting/sides/:id', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    const side = sideScriptById(id);
    if (!side) throw notFound('Side');
    const project = projectById(side.projectId);
    if (!project) throw notFound('Project');
    const profile = profileByAccount(account.id);

    return {
      side,
      project,
      takes: profile ? takesForSide(id, profile.id) : takesForSide(id),
      // The watermark is composed here but drawn on-device: a server-baked
      // burn-in would have to be re-encoded per viewer and could be stripped
      // from the cached file.
      watermark: {
        text: `${account.displayName} · ${account.id.slice(-8)} · ${request.ip} · ${new Date().toISOString()}`,
        opacity: side.confidential ? 0.16 : 0.08,
        rotateDeg: -22,
        intervalMs: 4000,
      },
    };
  });

  app.post('/casting/takes', async (request) => {
    const account = requireAccount(request);
    const profile = profileByAccount(account.id);
    if (!profile) throw forbidden('Only talent accounts can submit takes');

    const body = request.body as { sideScriptId?: string; durationSeconds?: number; note?: string };
    if (!body?.sideScriptId) throw badRequest('sideScriptId is required');
    const side = sideScriptById(body.sideScriptId);
    if (!side) throw notFound('Side');

    const previous = get<{ n: number }>(
      'SELECT COUNT(*) AS n FROM self_tapes WHERE side_script_id = ? AND talent_profile_id = ?',
      side.id,
      profile.id,
    );

    const take: SelfTape = {
      id: newId('tap'),
      sideScriptId: side.id,
      projectId: side.projectId,
      talentProfileId: profile.id,
      takeNumber: (previous?.n ?? 0) + 1,
      durationSeconds: Math.max(1, Math.round(body.durationSeconds ?? 0)),
      status: 'submitted',
      note: body.note ?? '',
      reviewerRating: null,
      submittedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    run(
      `INSERT INTO self_tapes (id, side_script_id, project_id, talent_profile_id, take_number, status, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      take.id,
      take.sideScriptId,
      take.projectId,
      take.talentProfileId,
      take.takeNumber,
      take.status,
      JSON.stringify(take),
      take.createdAt,
    );

    return { take, takes: takesForSide(side.id, profile.id) };
  });

  /* ---------------- Audit ----------------------------------------- */

  app.get('/talent/:id/audit', async (request) => {
    requireAccount(request);
    const { id } = request.params as { id: string };
    return runAudit(id);
  });

  /* ---------------- Notifications --------------------------------- */

  app.get('/notifications', async (request) => {
    const account = requireAccount(request);
    return { notifications: notificationsForAccount(account.id, 60) };
  });

  app.post('/notifications/:id/read', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    markRead(account.id, id);
    return { ok: true };
  });

  /**
   * Server-sent events. Chosen over WebSockets for the notification lane
   * because it is one-way, survives proxies, and reconnects on its own — the
   * chat/SFU lanes are the ones that actually need a socket.
   */
  app.get('/notifications/stream', async (request, reply) => {
    const account = requireAccount(request);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    reply.raw.write(`event: ready\ndata: ${JSON.stringify({ accountId: account.id })}\n\n`);

    const unsubscribe = subscribe(account.id, (notification) => {
      reply.raw.write(`event: notification\ndata: ${JSON.stringify(notification)}\n\n`);
    });

    const heartbeat = setInterval(() => reply.raw.write(': keep-alive\n\n'), 25_000);
    request.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });

    // Never resolve: the reply stays open for the life of the connection.
    await new Promise<void>(() => {});
  });
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

export type { Opportunity };
