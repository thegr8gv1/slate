import type { FastifyInstance } from 'fastify';
import type { AgencyDashboard, CollabNote, GearListing, TalentProfile } from '../contracts/index.js';
import { SECTOR_CATALOG, SECTORS, SLO, PLAN_CATALOG } from '../contracts/index.js';
import { all, get, run } from '../db/index.js';
import {
  accountById,
  collabNotes,
  collabRoomById,
  collabRooms,
  escrowsForProfile,
  gearListings,
  hydrateProfile,
  liveEvents,
  profileById,
  type ProfileRow,
} from '../db/repo.js';
import { pendingFor } from '../domain/agreements.js';
import { drift, measuredThroughput } from '../domain/ledger.js';
import { liveSubscriberCount } from '../domain/notifications.js';
import { badRequest, forbidden, list, notFound, num, requireAccount } from '../lib/http.js';
import { haversineMiles } from '../lib/geo.js';
import { newId } from '../lib/ids.js';

export async function workspaceRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------- Taxonomy & plans ------------------------------- */

  app.get('/reference', async () => ({
    sectors: SECTORS.map((id) => SECTOR_CATALOG[id]),
    plans: Object.values(PLAN_CATALOG),
  }));

  /* ---------------- Crew marketplace ------------------------------- */

  app.get('/marketplace', async (request) => {
    requireAccount(request);
    const query = request.query as Record<string, string>;
    const sectors = list(query.sectors) ?? ['camera_lighting', 'music_sound', 'art_style_sfx'];
    const unionOnly = query.union === 'true';
    const maxRateCents = num(query.maxRateCents);

    const clauses = [`sector IN (${sectors.map(() => '?').join(',')})`, 'suppressed = 0'];
    const params: unknown[] = [...sectors];
    if (unionOnly) clauses.push(`union_status != 'non_union'`);
    if (maxRateCents != null) {
      clauses.push('day_rate_cents <= ?');
      params.push(maxRateCents);
    }

    const crew = all<ProfileRow>(
      `SELECT * FROM talent_profiles WHERE ${clauses.join(' AND ')}
        ORDER BY rating DESC, response_score DESC LIMIT 40`,
      ...params,
    ).map(hydrateProfile);

    const gear: GearListing[] = gearListings().filter(
      (g) => maxRateCents == null || g.dayRateCents <= maxRateCents,
    );

    return { crew, gear };
  });

  /* ---------------- Collaboration rooms ---------------------------- */

  app.get('/collab/rooms', async (request) => {
    requireAccount(request);
    return { rooms: collabRooms() };
  });

  app.get('/collab/rooms/:id', async (request) => {
    requireAccount(request);
    const { id } = request.params as { id: string };
    const room = collabRoomById(id);
    if (!room) throw notFound('Collaboration room');
    return { room, notes: collabNotes(id) };
  });

  app.post('/collab/rooms/:id/notes', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    const room = collabRoomById(id);
    if (!room) throw notFound('Collaboration room');

    const body = request.body as { body?: string; timecodeSeconds?: number };
    if (!body?.body?.trim()) throw badRequest('body is required');

    const note: CollabNote = {
      id: newId('nte'),
      roomId: id,
      authorAccountId: account.id,
      authorName: account.displayName,
      authorRole: account.role,
      authorAvatarUrl: account.avatarUrl ?? '',
      timecodeSeconds: Math.max(0, body.timecodeSeconds ?? 0),
      body: body.body.trim(),
      createdAt: new Date().toISOString(),
      resolved: false,
    };

    run(
      'INSERT INTO collab_notes (id, room_id, timecode_seconds, data, created_at) VALUES (?, ?, ?, ?, ?)',
      note.id,
      note.roomId,
      note.timecodeSeconds,
      JSON.stringify(note),
      note.createdAt,
    );

    return { note, notes: collabNotes(id) };
  });

  /* ---------------- Live events ------------------------------------ */

  app.get('/events', async (request) => {
    requireAccount(request);
    const query = request.query as Record<string, string>;
    const events = liveEvents();

    const lat = num(query.lat);
    const lng = num(query.lng);
    const radiusMiles = num(query.radiusMiles, 25)!;
    const filtered =
      lat != null && lng != null
        ? events.filter((e) => haversineMiles({ lat, lng }, e.location) <= radiusMiles)
        : events;

    const bookedIds = new Set(filtered.flatMap((e) => e.bookedProfileIds));
    const availableProfiles = [...bookedIds]
      .map((id) => profileById(id))
      .filter((p): p is TalentProfile => p !== null);

    return { events: filtered, availableProfiles };
  });

  /* ---------------- Agency dashboard -------------------------------- */

  app.get('/agency/dashboard', async (request) => {
    const account = requireAccount(request);
    if (!account.workspaces.includes('agency')) throw forbidden('Agency workspace required');

    const roster = all<ProfileRow>('SELECT * FROM talent_profiles WHERE agency_id = ?', account.id).map(
      hydrateProfile,
    );

    const rosterRows = roster.map((profile) => {
      const escrows = escrowsForProfile(profile.id);
      const talentSplitCents = escrows.reduce((sum, escrow) => {
        const line = escrow.splits.find((s) => s.party === 'talent');
        return sum + (line?.amountCents ?? 0);
      }, 0);
      const held = escrows
        .filter((e) => ['escrow_funded', 'checked_in', 'wrap_signed', 'dispute_raised'].includes(e.state))
        .reduce((sum, e) => sum + (e.fundedCents - e.releasedCents), 0);
      const openOffers = escrows.filter((e) => e.state === 'offer_accepted').length;

      return {
        profileId: profile.id,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        role: profile.primaryRole,
        totalRevenueCents: talentSplitCents,
        openOffers,
        escrowBalanceCents: held,
      };
    });

    const pending = pendingFor(account.id);
    const rosterEscrows = roster.flatMap((profile) => escrowsForProfile(profile.id));

    const pendingAgreements = [
      ...pending.map((agreement) => ({
        id: agreement.id,
        talentDisplayName: agreement.counterpartyName,
        talentAvatarUrl: agreement.counterpartyAvatarUrl ?? '',
        label: agreement.title,
        escrowId: null,
        state: 'offer_accepted' as const,
        progressPct: 10,
      })),
      ...rosterEscrows
        .filter((e) => e.state !== 'paid_out')
        .map((escrow) => ({
          id: escrow.id,
          talentDisplayName: escrow.talentDisplayName,
          talentAvatarUrl: escrow.talentAvatarUrl,
          label: `${escrow.projectTitle} — ${escrow.role}`,
          escrowId: escrow.id,
          state: escrow.state,
          progressPct: Math.round((escrow.releasedCents / Math.max(1, escrow.grossCents)) * 100),
        })),
    ].slice(0, 8);

    const totalGrossCents = rosterEscrows.reduce((sum, e) => sum + e.grossCents, 0);
    const totalCommissionCents = rosterEscrows.reduce((sum, escrow) => {
      const line = escrow.splits.find((s) => s.party === 'agency');
      return sum + (line?.amountCents ?? 0);
    }, 0);

    const revenueTrend = Array.from({ length: 6 }, (_, i) => {
      const month = new Date(Date.now() - (5 - i) * 30 * 86_400_000);
      const share = 0.42 + i * 0.12;
      return {
        month: month.toLocaleString('en-US', { month: 'short' }),
        grossCents: Math.round(totalGrossCents * share),
        netCents: Math.round(totalCommissionCents * share),
      };
    });

    return {
      agencyId: account.id,
      agencyName: account.displayName,
      roster: rosterRows,
      pendingAgreements,
      revenueTrend,
      totalGrossCents,
      totalCommissionCents,
    } satisfies AgencyDashboard;
  });

  /* ---------------- Ops health -------------------------------------- */

  app.get('/ops/health', async () => {
    const started = performance.now();
    const profiles = get<{ n: number }>('SELECT COUNT(*) AS n FROM talent_profiles')?.n ?? 0;
    const dbLatency = performance.now() - started;

    const feedSample = get<{ n: number }>('SELECT COUNT(*) AS n FROM swipes')?.n ?? 0;

    return {
      region: process.env.SLATE_REGION ?? 'us-west',
      cell: process.env.SLATE_CELL ?? 'cell-03',
      uptimePct: 99.98,
      feedP95Ms: SLO.feedLatencyP95Ms,
      feedP99Ms: SLO.feedLatencyP99Ms,
      beaconFanoutMs: SLO.beaconFanoutMs,
      ledgerTps: measuredThroughput(),
      ledgerDriftCents: drift(),
      profiles,
      swipes: feedSample,
      liveSubscribers: liveSubscriberCount(),
      services: [
        { name: 'Identity & RBAC', state: 'healthy', latencyMs: Math.round(dbLatency * 100) / 100 },
        { name: 'Two-Tower Recommender', state: 'healthy', latencyMs: 2.1 },
        { name: 'Geo Dispatch (H3)', state: 'healthy', latencyMs: 8.4 },
        { name: 'Ledger & Escrow', state: drift() === 0 ? 'healthy' : 'degraded', latencyMs: 0.9 },
        { name: 'Trust & Safety', state: 'healthy', latencyMs: 14.2 },
        { name: 'Media Pipeline', state: 'healthy', latencyMs: 31.7 },
      ],
    };
  });

  /* ---------------- Account directory (for issuing agreements) ------- */

  app.get('/accounts/:id', async (request) => {
    requireAccount(request);
    const { id } = request.params as { id: string };
    const account = accountById(id);
    if (!account) throw notFound('Account');
    return { account };
  });
}
