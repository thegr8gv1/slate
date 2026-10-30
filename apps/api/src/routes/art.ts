import type { FastifyInstance } from 'fastify';
import type { ArtOpportunity, SkillShareMentor } from '../contracts/index.js';
import { all, get, run } from '../db/index.js';
import { badRequest, notFound, requireAccount } from '../lib/http.js';
import { newId } from '../lib/ids.js';

interface RawArtRow {
  id: string;
  creator_id: string;
  creator_name: string;
  creator_avatar: string;
  creator_role: string;
  title: string;
  category: string;
  category_label: string;
  activity_type: string;
  activity_badge: string;
  address: string;
  neighborhood: string;
  distance_miles: number;
  walk_minutes: number;
  time_range: string;
  date_label: string;
  spots_total: number;
  spots_joined: number;
  no_experience_needed: number;
  project_story: string;
  what_you_will_do_json: string;
  what_you_will_learn_json: string;
  perks_json: string;
  what_to_bring: string;
  lat: number;
  lng: number;
  created_at: string;
}

function hydrateArt(row: RawArtRow, hasJoined = false): ArtOpportunity {
  let whatYouWillDo: string[] = [];
  let whatYouWillLearn: string[] = [];
  let perks: string[] = [];

  try { whatYouWillDo = JSON.parse(row.what_you_will_do_json); } catch { whatYouWillDo = []; }
  try { whatYouWillLearn = JSON.parse(row.what_you_will_learn_json); } catch { whatYouWillLearn = []; }
  try { perks = JSON.parse(row.perks_json); } catch { perks = []; }

  return {
    id: row.id,
    creatorId: row.creator_id,
    creatorName: row.creator_name,
    creatorAvatar: row.creator_avatar,
    creatorRole: row.creator_role,
    title: row.title,
    category: row.category as ArtOpportunity['category'],
    categoryLabel: row.category_label,
    activityType: row.activity_type as ArtOpportunity['activityType'],
    activityBadge: row.activity_badge,
    address: row.address,
    neighborhood: row.neighborhood,
    distanceMiles: row.distance_miles,
    walkMinutes: row.walk_minutes,
    timeRange: row.time_range,
    dateLabel: row.date_label,
    spotsTotal: row.spots_total,
    spotsJoined: row.spots_joined,
    noExperienceNeeded: row.no_experience_needed === 1,
    projectStory: row.project_story,
    whatYouWillDo,
    whatYouWillLearn,
    perks,
    whatToBring: row.what_to_bring,
    lat: row.lat,
    lng: row.lng,
    hasJoined,
  };
}

const MENTORS: SkillShareMentor[] = [
  {
    id: 'mentor_marcus',
    name: 'Marcus Diallo',
    role: 'Camera Operator & Lighting Tech',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    neighborhood: 'Silver Lake',
    willingToTeach: 'Camera lenses, gimbal balance, and film set etiquette for beginners',
    suggestedPrompt: 'Can I shadow your camera setup this weekend?',
    isFree: true,
    tagline: 'Always happy to show curious neighbors how lights and cameras work on set.',
    responseSpeed: 'Usually replies in a few hours',
  },
  {
    id: 'mentor_chloe',
    name: 'Chloe Vance',
    role: 'DIY Theater & Visual Storyteller',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    neighborhood: 'Arts District',
    willingToTeach: 'Backstage theater coordination, prop staging, and phone video editing',
    suggestedPrompt: 'How do I get involved with local community theater?',
    isFree: true,
    tagline: 'Passionate about bringing everyday people into live stage art!',
    responseSpeed: 'Replies within 30 mins',
  },
  {
    id: 'mentor_elena',
    name: 'Elena Rostova',
    role: 'Songwriter & Acoustic Musician',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    neighborhood: 'Echo Park',
    willingToTeach: 'Acoustic guitar chords, lyric writing circles, and group jamming',
    suggestedPrompt: 'I only know 3 chords, can I still join the acoustic jam?',
    isFree: true,
    tagline: 'Music is for sharing, not gatekeeping. Come jam with us in the park!',
    responseSpeed: 'Replies same day',
  },
  {
    id: 'mentor_leo',
    name: 'Leo Alvarez',
    role: 'Indie Film Director',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    neighborhood: 'Silver Lake',
    willingToTeach: 'Directing actors, writing short scripts, and how background extras help scenes',
    suggestedPrompt: 'How do I prepare for my first time on a short film set?',
    isFree: true,
    tagline: 'Looking for enthusiastic collaborators who want to learn by doing.',
    responseSpeed: 'Replies within 1 hour',
  },
];

export async function artRoutes(app: FastifyInstance): Promise<void> {
  /**
   * List all neighborhood artistic opportunities.
   */
  app.get('/art/opportunities', async (request) => {
    let accountId: string | null = null;
    try {
      const account = requireAccount(request);
      accountId = account.id;
    } catch {
      // Browsing guest
    }

    const query = request.query as { category?: string; activityType?: string };
    let sql = 'SELECT * FROM art_opportunities WHERE 1=1';
    const params: unknown[] = [];

    if (query.category && query.category !== 'all') {
      sql += ' AND category = ?';
      params.push(query.category);
    }
    if (query.activityType && query.activityType !== 'all') {
      sql += ' AND activity_type = ?';
      params.push(query.activityType);
    }

    sql += ' ORDER BY distance_miles ASC';

    const rows = all<RawArtRow>(sql, ...params);

    let joinedIds = new Set<string>();
    if (accountId) {
      const collabs = all<{ opportunity_id: string }>(
        'SELECT opportunity_id FROM art_collaborations WHERE account_id = ?',
        accountId
      );
      joinedIds = new Set(collabs.map((c) => c.opportunity_id));
    }

    return {
      opportunities: rows.map((r) => hydrateArt(r, joinedIds.has(r.id))),
      total: rows.length,
    };
  });

  /**
   * Get single art opportunity details.
   */
  app.get('/art/opportunities/:id', async (request) => {
    const { id } = request.params as { id: string };
    const row = get<RawArtRow>('SELECT * FROM art_opportunities WHERE id = ?', id);
    if (!row) throw notFound('Opportunity not found');

    let hasJoined = false;
    try {
      const account = requireAccount(request);
      const collab = get(
        'SELECT id FROM art_collaborations WHERE opportunity_id = ? AND account_id = ?',
        id,
        account.id
      );
      hasJoined = !!collab;
    } catch {
      // Guest
    }

    return hydrateArt(row, hasJoined);
  });

  /**
   * Join an artistic opportunity / collaboration.
   */
  app.post('/art/opportunities/:id/join', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };

    const opp = get<RawArtRow>('SELECT * FROM art_opportunities WHERE id = ?', id);
    if (!opp) throw notFound('Opportunity not found');

    const existing = get(
      'SELECT id FROM art_collaborations WHERE opportunity_id = ? AND account_id = ?',
      id,
      account.id
    );
    if (existing) {
      return { ok: true, message: 'You have already joined this creative project!', opportunity: hydrateArt(opp, true) };
    }

    if (opp.spots_joined >= opp.spots_total) {
      throw badRequest('All spots for this collaboration have been filled!');
    }

    const collabId = newId('collab');
    run(
      'INSERT INTO art_collaborations (id, opportunity_id, account_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      collabId,
      id,
      account.id,
      'joined',
      new Date().toISOString()
    );

    run('UPDATE art_opportunities SET spots_joined = spots_joined + 1 WHERE id = ?', id);

    // Open direct collaborative chat with the creator
    const chatId = `chat_art_${account.id}_${opp.creator_id}`;
    const existingChat = get('SELECT id FROM peer_chats WHERE id = ?', chatId);
    if (!existingChat) {
      run(
        `INSERT INTO peer_chats (
          id, account_id, peer_id, peer_name, peer_avatar, peer_role,
          last_message, last_message_time, unread_count, is_advice_call, advice_topic, advice_price_cents, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, NULL, ?)`,
        chatId,
        account.id,
        opp.creator_id,
        opp.creator_name,
        opp.creator_avatar,
        opp.creator_role,
        `Welcome to ${opp.title}! We are excited to make art together at ${opp.address}.`,
        'Just now',
        opp.title,
        new Date().toISOString()
      );
    }

    const updated = get<RawArtRow>('SELECT * FROM art_opportunities WHERE id = ?', id)!;
    return {
      ok: true,
      message: 'You are in! The creative crew has been notified.',
      opportunity: hydrateArt(updated, true),
    };
  });

  /**
   * My Collaborations.
   */
  app.get('/art/my-collaborations', async (request) => {
    const account = requireAccount(request);
    const rows = all<RawArtRow>(
      `SELECT o.* FROM art_opportunities o
       INNER JOIN art_collaborations c ON o.id = c.opportunity_id
       WHERE c.account_id = ?
       ORDER BY o.created_at DESC`,
      account.id
    );

    return {
      opportunities: rows.map((r) => hydrateArt(r, true)),
      total: rows.length,
    };
  });

  /**
   * Create an open art invitation / project call.
   */
  app.post('/art/opportunities', async (request) => {
    const account = requireAccount(request);
    const body = request.body as Partial<ArtOpportunity>;

    if (!body.title || !body.address || !body.category) {
      throw badRequest('Title, category, and address are required');
    }

    const oppId = newId('art');
    const category = body.category;
    const categoryLabel = body.categoryLabel ?? 'Artistic Collaboration';

    run(
      `INSERT INTO art_opportunities (
        id, creator_id, creator_name, creator_avatar, creator_role, title,
        category, category_label, activity_type, activity_badge, address, neighborhood,
        distance_miles, walk_minutes, time_range, date_label, spots_total, spots_joined,
        no_experience_needed, project_story, what_you_will_do_json, what_you_will_learn_json,
        perks_json, what_to_bring, lat, lng, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      oppId,
      account.id,
      account.displayName,
      account.avatarUrl ?? 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      'Local Creator',
      body.title,
      category,
      categoryLabel,
      body.activityType ?? 'collaboration',
      body.activityBadge ?? 'Make Art ✨',
      body.address,
      body.neighborhood ?? 'Neighborhood',
      body.distanceMiles ?? 0.3,
      body.walkMinutes ?? 5,
      body.timeRange ?? 'TBD',
      body.dateLabel ?? 'Upcoming',
      body.spotsTotal ?? 5,
      0,
      body.noExperienceNeeded !== false ? 1 : 1,
      body.projectStory ?? 'Looking for neighbors to collaborate and create together!',
      JSON.stringify(body.whatYouWillDo ?? ['Show up with good energy and collaborate']),
      JSON.stringify(body.whatYouWillLearn ?? ['Practical creative skills and collaboration']),
      JSON.stringify(body.perks ?? ['Screen credit or shoutout', 'New friends']),
      body.whatToBring ?? 'Comfortable clothes and a positive attitude',
      body.lat ?? 34.0782,
      body.lng ?? -118.2606,
      new Date().toISOString()
    );

    const created = get<RawArtRow>('SELECT * FROM art_opportunities WHERE id = ?', oppId)!;
    return { ok: true, opportunity: hydrateArt(created, false) };
  });

  /**
   * List peer skill-share mentors.
   */
  app.get('/art/mentors', async () => {
    return { mentors: MENTORS };
  });
}
