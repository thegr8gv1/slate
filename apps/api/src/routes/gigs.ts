import type { FastifyInstance } from 'fastify';
import type { LocalGig } from '../contracts/index.js';
import { all, get, run } from '../db/index.js';
import { badRequest, notFound, requireAccount } from '../lib/http.js';
import { newId } from '../lib/ids.js';

interface RawGigRow {
  id: string;
  poster_id: string;
  poster_name: string;
  poster_avatar: string;
  poster_rating: number;
  poster_gigs_count: number;
  title: string;
  category: string;
  category_label: string;
  pay_cents: number;
  duration_hours: number;
  address: string;
  neighborhood: string;
  distance_miles: number;
  walk_minutes: number;
  starts_at: string;
  time_range: string;
  spots_total: number;
  spots_filled: number;
  no_experience_needed: number;
  urgent: number;
  description: string;
  tasks_json: string;
  what_to_wear: string;
  lat: number;
  lng: number;
  created_at: string;
}

function hydrateGig(row: RawGigRow, hasApplied = false): LocalGig {
  let tasks: string[] = [];
  try {
    tasks = JSON.parse(row.tasks_json);
  } catch {
    tasks = [];
  }

  return {
    id: row.id,
    posterId: row.poster_id,
    posterName: row.poster_name,
    posterAvatar: row.poster_avatar,
    posterRating: row.poster_rating,
    posterGigsCount: row.poster_gigs_count,
    title: row.title,
    category: row.category as LocalGig['category'],
    categoryLabel: row.category_label,
    payCents: row.pay_cents,
    durationHours: row.duration_hours,
    address: row.address,
    neighborhood: row.neighborhood,
    distanceMiles: row.distance_miles,
    walkMinutes: row.walk_minutes,
    startsAt: row.starts_at,
    timeRange: row.time_range,
    spotsTotal: row.spots_total,
    spotsFilled: row.spots_filled,
    noExperienceNeeded: row.no_experience_needed === 1,
    urgent: row.urgent === 1,
    description: row.description,
    tasks,
    whatToWear: row.what_to_wear,
    lat: row.lat,
    lng: row.lng,
    hasApplied,
  };
}

export async function gigRoutes(app: FastifyInstance): Promise<void> {
  /**
   * List all neighborhood gigs, with optional category or urgent filters.
   */
  app.get('/gigs', async (request) => {
    let accountId: string | null = null;
    try {
      const account = requireAccount(request);
      accountId = account.id;
    } catch {
      // Optional auth for browsing
    }

    const query = request.query as { category?: string; urgent?: string };
    let sql = 'SELECT * FROM local_gigs WHERE 1=1';
    const params: unknown[] = [];

    if (query.category && query.category !== 'all') {
      sql += ' AND category = ?';
      params.push(query.category);
    }
    if (query.urgent === 'true') {
      sql += ' AND urgent = 1';
    }

    sql += ' ORDER BY urgent DESC, distance_miles ASC';

    const rows = all<RawGigRow>(sql, ...params);

    // Check applied statuses if authenticated
    let appliedIds = new Set<string>();
    if (accountId) {
      const appRows = all<{ gig_id: string }>(
        'SELECT gig_id FROM gig_applications WHERE account_id = ?',
        accountId
      );
      appliedIds = new Set(appRows.map((r) => r.gig_id));
    }

    return {
      gigs: rows.map((r) => hydrateGig(r, appliedIds.has(r.id))),
      total: rows.length,
    };
  });

  /**
   * Get single gig detail.
   */
  app.get('/gigs/:id', async (request) => {
    const { id } = request.params as { id: string };
    const row = get<RawGigRow>('SELECT * FROM local_gigs WHERE id = ?', id);
    if (!row) throw notFound('Gig not found');

    let hasApplied = false;
    try {
      const account = requireAccount(request);
      const appRow = get(
        'SELECT id FROM gig_applications WHERE gig_id = ? AND account_id = ?',
        id,
        account.id
      );
      hasApplied = !!appRow;
    } catch {
      // Guest
    }

    return hydrateGig(row, hasApplied);
  });

  /**
   * Instant Handshake Apply to a gig.
   */
  app.post('/gigs/:id/apply', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };

    const gig = get<RawGigRow>('SELECT * FROM local_gigs WHERE id = ?', id);
    if (!gig) throw notFound('Gig not found');

    const existing = get(
      'SELECT id FROM gig_applications WHERE gig_id = ? AND account_id = ?',
      id,
      account.id
    );
    if (existing) {
      return { ok: true, message: 'You are already confirmed for this gig!', gig: hydrateGig(gig, true) };
    }

    if (gig.spots_filled >= gig.spots_total) {
      throw badRequest('All spots for this gig have been filled!');
    }

    const appId = newId('app');
    run(
      'INSERT INTO gig_applications (id, gig_id, account_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      appId,
      id,
      account.id,
      'confirmed',
      new Date().toISOString()
    );

    run('UPDATE local_gigs SET spots_filled = spots_filled + 1 WHERE id = ?', id);

    // Create pending escrow in user's wallet
    const walletId = newId('w');
    run(
      'INSERT INTO wallet_items (id, account_id, title, category, amount_cents, date_str, type, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      walletId,
      account.id,
      gig.title,
      gig.category_label,
      gig.pay_cents,
      'Today',
      'gig_payout',
      'held_escrow',
      'Held in Secure Handshake Escrow • Releases immediately after completion',
      new Date().toISOString()
    );

    // Automatically create direct chat between worker and gig poster
    const chatId = `chat_${account.id}_${gig.poster_id}`;
    const existingChat = get('SELECT id FROM peer_chats WHERE id = ?', chatId);
    if (!existingChat) {
      run(
        `INSERT INTO peer_chats (
          id, account_id, peer_id, peer_name, peer_avatar, peer_role,
          last_message, last_message_time, unread_count, is_advice_call, advice_topic, advice_price_cents, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?)`,
        chatId,
        account.id,
        gig.poster_id,
        gig.poster_name,
        gig.poster_avatar,
        'Gig Poster',
        `Confirmed spot for ${gig.title}! See you at ${gig.address}.`,
        'Just now',
        0,
        new Date().toISOString()
      );
    }

    const updated = get<RawGigRow>('SELECT * FROM local_gigs WHERE id = ?', id)!;
    return {
      ok: true,
      message: 'Spot confirmed! Pay is locked in Handshake Escrow.',
      gig: hydrateGig(updated, true),
    };
  });

  /**
   * My Gigs (gigs the current user has applied to or booked).
   */
  app.get('/gigs/my-gigs', async (request) => {
    const account = requireAccount(request);
    const rows = all<RawGigRow>(
      `SELECT g.* FROM local_gigs g
       INNER JOIN gig_applications a ON g.id = a.gig_id
       WHERE a.account_id = ?
       ORDER BY g.starts_at ASC`,
      account.id
    );

    return {
      gigs: rows.map((r) => hydrateGig(r, true)),
      total: rows.length,
    };
  });

  /**
   * Post a new peer-to-peer gig.
   */
  app.post('/gigs', async (request) => {
    const account = requireAccount(request);
    const body = request.body as Partial<LocalGig>;

    if (!body.title || !body.payCents || !body.address) {
      throw badRequest('Title, pay amount, and address are required');
    }

    const gigId = newId('gig');
    const category = body.category ?? 'film_extra';
    const categoryLabel = body.categoryLabel ?? 'Local Gig';

    run(
      `INSERT INTO local_gigs (
        id, poster_id, poster_name, poster_avatar, poster_rating, poster_gigs_count,
        title, category, category_label, pay_cents, duration_hours, address, neighborhood,
        distance_miles, walk_minutes, starts_at, time_range, spots_total, spots_filled,
        no_experience_needed, urgent, description, tasks_json, what_to_wear, lat, lng, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      gigId,
      account.id,
      account.displayName,
      account.avatarUrl ?? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      5.0,
      1,
      body.title,
      category,
      categoryLabel,
      body.payCents,
      body.durationHours ?? 2.0,
      body.address,
      body.neighborhood ?? 'My Neighborhood',
      body.distanceMiles ?? 0.3,
      body.walkMinutes ?? 6,
      body.startsAt ?? 'Today',
      body.timeRange ?? 'TBD',
      body.spotsTotal ?? 5,
      0,
      body.noExperienceNeeded ? 1 : 1,
      body.urgent ? 1 : 0,
      body.description ?? 'Local gig looking for friendly neighborhood help.',
      JSON.stringify(body.tasks ?? ['Show up on time', 'Have fun and follow simple instructions']),
      body.whatToWear ?? 'Comfortable casual clothes',
      body.lat ?? 34.0782,
      body.lng ?? -118.2606,
      new Date().toISOString()
    );

    const created = get<RawGigRow>('SELECT * FROM local_gigs WHERE id = ?', gigId)!;
    return { ok: true, gig: hydrateGig(created, false) };
  });
}
