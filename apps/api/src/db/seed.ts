/**
 * Deterministic seed.
 *
 * Builds a Los Angeles-scale marketplace: eight sectors of talent spread across
 * real neighbourhood coordinates, live projects, funded escrows, pending NDAs
 * and audit history. Everything is derived from fixed seeds, so re-running
 * produces byte-identical data and the demo never drifts.
 *
 *   npm run seed          # rebuild from scratch
 */

import { closeDb, db, run, kvSet, kvGet } from './index.js';
import { SECTOR_CATALOG, SECTORS } from '../contracts/index.js';
import type {
  Agreement,
  Campaign,
  CollabNote,
  CollabRoom,
  Credit,
  GearListing,
  LiveEvent,
  Opportunity,
  Pitch,
  Project,
  Sector,
  SelfTape,
  SideScript,
  SocialMetrics,
  TalentProfile,
  UnionStatus,
  VerificationBadge,
} from '../contracts/index.js';
import { encodeTalent, encodeQuery, serialize } from '../domain/embedding.js';
import { createEscrow, fundEscrow, checkIn, persist as persistEscrow } from '../domain/escrow.js';
import { persist as persistAgreement } from '../domain/agreements.js';
import { hashPassword } from '../lib/crypto.js';
import { cellFor, makePlace, offsetPoint } from '../lib/geo.js';
import { staticId } from '../lib/ids.js';

const SEED_VERSION = 'slate-seed-11';

/* ------------------------------------------------------------------ */
/* Deterministic RNG                                                   */
/* ------------------------------------------------------------------ */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length) % list.length];
}

function between(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/* ------------------------------------------------------------------ */
/* Reference data                                                      */
/* ------------------------------------------------------------------ */

const LA = { lat: 34.0522, lng: -118.2437 };

const NEIGHBOURHOODS: { label: string; lat: number; lng: number }[] = [
  { label: 'Silver Lake', lat: 34.0869, lng: -118.2702 },
  { label: 'Downtown LA', lat: 34.0407, lng: -118.2468 },
  { label: 'Culver City', lat: 34.0211, lng: -118.3965 },
  { label: 'Burbank', lat: 34.1808, lng: -118.309 },
  { label: 'Santa Monica', lat: 34.0195, lng: -118.4912 },
  { label: 'Echo Park', lat: 34.0782, lng: -118.2606 },
  { label: 'Hollywood', lat: 34.0928, lng: -118.3287 },
  { label: 'Highland Park', lat: 34.1156, lng: -118.1926 },
  { label: 'Venice', lat: 33.985, lng: -118.4695 },
  { label: 'Glendale', lat: 34.1425, lng: -118.2551 },
  { label: 'Pasadena', lat: 34.1478, lng: -118.1445 },
  { label: 'Studio City', lat: 34.1397, lng: -118.396 },
  { label: 'Warehouse District', lat: 34.0353, lng: -118.2306 },
  { label: 'Inglewood', lat: 33.9617, lng: -118.3531 },
  { label: 'Long Beach', lat: 33.7701, lng: -118.1937 },
];

const FIRST_NAMES = [
  'Sarah', 'Mia', 'Alex', 'James', 'Liam', 'Chloe', 'Marcus', 'Nadia', 'Theo', 'Priya',
  'Elena', 'Omar', 'Jonah', 'Ivy', 'Dante', 'Rosa', 'Kai', 'Simone', 'Ezra', 'Noor',
  'Cassian', 'Maya', 'Rhys', 'Talia', 'Jasper', 'Imani', 'Leo', 'Anika', 'Silas', 'Zoe',
  'Rafael', 'Freya', 'Kwame', 'Delphine', 'Bo', 'Yara', 'Emmett', 'Lucia', 'Arjun', 'Wren',
];

const LAST_NAMES = [
  'Jenkins', 'Chen', 'Rivers', 'Larkin', 'Kovacs', 'Vance', 'Diallo', 'Okafor', 'Marchetti', 'Rao',
  'Petrova', 'Haddad', 'Whitfield', 'Nakamura', 'Salazar', 'Bright', 'Osei', 'Lindqvist', 'Cortez', 'Ashby',
  'Moreau', 'Iyer', 'Bellamy', 'Quintero', 'Novak', 'Adeyemi', 'Strand', 'Bassi', 'Mercer', 'Falk',
];

const PRONOUNS = ['she/her', 'he/him', 'they/them'];

const HEADLINES: Record<Sector, string[]> = {
  screen_stage: [
    'Grounded dramatic lead, seven features, two Sundance premieres',
    'Comedic character work, multicam and single-cam series regular',
    'Classically trained, Shakespeare in the Park to network procedural',
    'Physical performer, fight-certified, stage combat instructor',
  ],
  digital_social: [
    'Beauty and lifestyle UGC, 4.2% verified engagement',
    'Long-form tech reviews, audience skews 25-34 US/UK',
    'Daily live streams, 90-minute median watch time',
    'Food and travel shorts, brand-safe, agency repped',
  ],
  music_sound: [
    'Orchestral and hybrid scoring, two Emmy-nominated series',
    'Location sound, dual Zaxcom bags, IATSE 695',
    'Foley for prestige drama, purpose-built stage in Glendale',
    'Mix and master, Dolby Atmos certified room',
  ],
  directing_writing: [
    'Character-driven features, festival circuit regular',
    'Commercial director, automotive and fashion specialist',
    'Showrunner, two seasons ordered straight-to-series',
    'Feature screenwriter, three studio assignments',
  ],
  camera_lighting: [
    'Anamorphic narrative DP, Alexa 35 and Panavision owner-op',
    'Gaffer, 40k truck package, union crew on call',
    'Steadicam and Trinity operator, commercial and episodic',
    'FAA Part 107 drone pilot, cinema payload certified',
  ],
  art_style_sfx: [
    'Prosthetic and creature makeup, prestige horror credits',
    'Wardrobe styling, editorial to national commercial',
    'Production design, period drama and near-future sci-fi',
    'Prop fabrication and armory, licensed and insured',
  ],
  modeling_print: [
    'Editorial and runway, Paris and Milan seasons',
    'Commercial and lifestyle print, national campaigns',
    'Fitness and athletic wear, brand ambassador history',
    'Hand and detail modelling, jewellery and watch specialist',
  ],
  post_production: [
    'Offline editor, prestige drama and documentary features',
    'Colorist, Baselight and DaVinci, HDR delivery',
    'VFX compositing and supervision, Nuke and Flame',
    '3D animation and motion design, Houdini pipeline',
  ],
};

const CREDIT_TITLES = [
  'Silverline', 'The Long Dark', 'Harbor Lights', 'Nightfall County', 'Cinder & Ash',
  'Paper Moons', 'The Quiet Signal', 'Meridian', 'Blue Hour', 'Static Bloom',
  'Wolf Season', 'Glasshouse', 'Salt Flats', 'The Understudy', 'Northbound',
];

const NETWORKS = ['A24', 'Netflix', 'HBO', 'Searchlight', 'Apple TV+', 'Amazon MGM', 'FX', 'Hulu', null];

const BRAND_INTERESTS = ['Beauty', 'Fitness', 'Travel', 'Gaming', 'Food', 'Fashion', 'Tech', 'Wellness'];

/* ------------------------------------------------------------------ */
/* Insert helpers                                                      */
/* ------------------------------------------------------------------ */

interface SeedAccount {
  id: string;
  email: string;
  displayName: string;
  role: string;
  workspaces: string[];
  plan: string;
  avatarUrl: string;
  agencyId?: string | null;
  pitchAllowance?: number | null;
}

function avatarFor(seed: string): string {
  return `https://i.pravatar.cc/280?u=${encodeURIComponent(seed)}`;
}

function photoFor(seed: string, w = 800, h = 450): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

function insertAccount(account: SeedAccount): void {
  run(
    `INSERT INTO accounts (id, email, password_hash, display_name, role, workspaces, plan, avatar_url, pitch_allowance, agency_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    account.id,
    account.email,
    hashPassword('slate'),
    account.displayName,
    account.role,
    account.workspaces.join(','),
    account.plan,
    account.avatarUrl,
    account.pitchAllowance ?? null,
    account.agencyId ?? null,
    new Date('2026-01-04T09:00:00Z').toISOString(),
  );
}

function insertProfile(profile: TalentProfile): void {
  const embedding = encodeTalent({
    sector: profile.sector,
    unionStatus: profile.unionStatus,
    dayRateCents: profile.dayRateCents ?? 0,
    followers: profile.socials[0]?.followers ?? 0,
    engagementRate: profile.socials[0]?.engagementRate ?? 0,
    eai: profile.socials[0]?.eai ?? 70,
    fraudScore: profile.socials[0]?.fraudScore ?? 0.05,
    rating: profile.rating,
    bookingsCompleted: profile.bookingsCompleted,
    responseScore: profile.responseScore,
    creditCount: profile.credits.length,
    primaryRole: profile.primaryRole,
    specialties: profile.specialties,
  });

  run(
    `INSERT INTO talent_profiles
      (id, account_id, display_name, sector, primary_role, union_status, day_rate_cents, age, lat, lng, cell,
       rating, response_score, fraud_score, followers, discreet_enabled, budget_floor_cents, agency_id, suppressed, embedding, data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    profile.id,
    profile.accountId,
    profile.displayName,
    profile.sector,
    profile.primaryRole,
    profile.unionStatus,
    profile.dayRateCents ?? 0,
    profile.age,
    profile.location.lat,
    profile.location.lng,
    profile.location.cell,
    profile.rating,
    profile.responseScore,
    profile.socials[0]?.fraudScore ?? 0.04,
    profile.socials[0]?.followers ?? 0,
    profile.discreet.enabled ? 1 : 0,
    profile.discreet.budgetFloorCents,
    profile.agencyId,
    serialize(embedding),
    JSON.stringify(profile),
  );
}

function insertProject(project: Project): void {
  run(
    `INSERT INTO projects (id, owner_account_id, title, status, lat, lng, cell, budget_cents, union_status, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    project.id,
    project.ownerAccountId,
    project.title,
    project.status,
    project.location.lat,
    project.location.lng,
    project.location.cell,
    project.budgetCents,
    project.unionStatus,
    JSON.stringify(project),
    project.createdAt,
  );
}

function insertOpportunity(opportunity: Opportunity): void {
  const embedding = encodeQuery({
    sectors: [opportunity.sector],
    unionStatuses: [opportunity.project.unionStatus],
    targetRateCents: opportunity.rateCents,
    minFollowers: 0,
    wantsAuthenticity: opportunity.sector === 'digital_social',
    roles: [opportunity.role],
    keywords: [opportunity.roleDescription, opportunity.project.title],
  });
  run(
    `INSERT INTO opportunities (id, project_id, role, sector, rate_cents, sponsored, side_script_id, embedding, data, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    opportunity.id,
    opportunity.projectId,
    opportunity.role,
    opportunity.sector,
    opportunity.rateCents,
    opportunity.sponsored ? 1 : 0,
    opportunity.sideScriptId,
    serialize(embedding),
    JSON.stringify(opportunity),
    opportunity.createdAt,
  );
}

/* ------------------------------------------------------------------ */
/* Profile factory                                                     */
/* ------------------------------------------------------------------ */

interface ProfileSpec {
  key: string;
  displayName?: string;
  sector: Sector;
  primaryRole?: string;
  age?: number;
  unionStatus?: UnionStatus;
  dayRateCents?: number;
  neighbourhood?: string;
  followers?: number;
  engagementRate?: number;
  fraudScore?: number;
  agencyId?: string | null;
  discreet?: boolean;
  badges?: VerificationBadge[];
  email?: string;
  plan?: string;
}

function makeProfile(spec: ProfileSpec): { account: SeedAccount; profile: TalentProfile } {
  const rng = mulberry32(hashSeed(spec.key));
  const sector = spec.sector;
  const catalog = SECTOR_CATALOG[sector];
  const primaryRole = spec.primaryRole ?? pick(rng, catalog.roles);

  const displayName =
    spec.displayName ?? `${pick(rng, FIRST_NAMES)} ${pick(rng, LAST_NAMES)}`;

  const hood = spec.neighbourhood
    ? NEIGHBOURHOODS.find((n) => n.label === spec.neighbourhood)!
    : pick(rng, NEIGHBOURHOODS);
  const jittered = offsetPoint(hood, between(rng, 0, 360), between(rng, 0.2, 2.4));
  const location = makePlace(jittered.lat, jittered.lng, hood.label, 'Los Angeles, CA');

  const accountId = staticId('acc', spec.key);
  const profileId = staticId('tal', spec.key);

  const dayRateCents =
    spec.dayRateCents ??
    Math.round(
      between(
        rng,
        sector === 'screen_stage' ? 65000 : sector === 'post_production' ? 55000 : 45000,
        sector === 'screen_stage' ? 320000 : 180000,
      ) / 500,
    ) * 500;

  const followers =
    spec.followers ??
    (sector === 'digital_social'
      ? Math.round(between(rng, 45_000, 900_000))
      : Math.round(between(rng, 1_200, 90_000)));

  const engagementRate = spec.engagementRate ?? Number(between(rng, 1.4, 6.8).toFixed(2));
  const fraudScore = spec.fraudScore ?? Number(between(rng, 0.01, 0.22).toFixed(3));
  const verifiedShare = Math.max(0.4, 1 - fraudScore * 1.4);
  // Drawn once: verified reach is a *subset* of total reach, so both must be
  // derived from the same impression figure or the audit chart plots the
  // verified line above the total line.
  const reachMultiplier = between(rng, 1.4, 3.2);
  const totalReach = Math.round(followers * reachMultiplier);
  const verifiedReach = Math.round(totalReach * verifiedShare);

  const socials: SocialMetrics[] = [
    {
      platform: 'instagram',
      handle: `@${displayName.toLowerCase().replace(/[^a-z]/g, '')}`,
      followers,
      engagementRate,
      totalReach,
      verifiedReach,
      fraudScore,
      eai: Math.round(Math.min(99, (engagementRate / 6) * 100 * (1 - fraudScore))),
      lastSyncedAt: new Date(Date.now() - Math.round(between(rng, 1, 22)) * 3600_000).toISOString(),
      topClipUrl: photoFor(`${spec.key}-clip`, 480, 854),
      audienceTopGeos: [
        { code: 'US', share: Math.round(between(rng, 38, 62)) },
        { code: 'UK', share: Math.round(between(rng, 6, 14)) },
        { code: 'CA', share: Math.round(between(rng, 5, 11)) },
        { code: 'AU', share: Math.round(between(rng, 3, 8)) },
        { code: 'DE', share: Math.round(between(rng, 2, 7)) },
      ],
      audienceAgeBands: [
        { band: '18-24', share: Math.round(between(rng, 18, 34)) },
        { band: '25-34', share: Math.round(between(rng, 28, 45)) },
        { band: '35-44', share: Math.round(between(rng, 12, 24)) },
        { band: '45+', share: Math.round(between(rng, 6, 16)) },
      ],
    },
  ];

  if (sector === 'digital_social') {
    socials.push({
      ...socials[0],
      platform: 'tiktok',
      followers: Math.round(followers * between(rng, 0.6, 2.1)),
      engagementRate: Number((engagementRate * between(rng, 1.1, 1.8)).toFixed(2)),
    });
  }

  const credits: Credit[] = Array.from({ length: Math.round(between(rng, 3, 14)) }, (_, i) => ({
    id: staticId('crd', `${spec.key}-${i}`),
    title: pick(rng, CREDIT_TITLES),
    role: primaryRole,
    year: 2019 + Math.floor(rng() * 8),
    kind: pick(rng, ['film', 'tv', 'commercial', 'theatre', 'campaign'] as const),
    network: pick(rng, NETWORKS),
  }));

  const unionStatus =
    spec.unionStatus ??
    (catalog.unionCommon ? pick(rng, ['sag_aftra', 'iatse', 'non_union'] as const) : 'non_union');

  const profile: TalentProfile = {
    id: profileId,
    accountId,
    displayName,
    legalName: displayName,
    headline: pick(rng, HEADLINES[sector]),
    sector,
    primaryRole,
    specialties: [primaryRole, ...catalog.roles.filter((r) => r !== primaryRole).slice(0, 2)],
    age: spec.age ?? Math.round(between(rng, 22, 48)),
    pronouns: pick(rng, PRONOUNS),
    unionStatus,
    dayRateCents,
    dayRateBand: '',
    location,
    travelRadiusMiles: Math.round(between(rng, 15, 60)),
    avatarUrl: avatarFor(spec.key),
    reelUrl: `slate://reel/${profileId}`,
    reelPosterUrl: photoFor(`${spec.key}-reel`),
    audioSampleUrl: sector === 'music_sound' ? `slate://audio/${profileId}` : null,
    portfolio: Array.from({ length: 6 }, (_, i) => photoFor(`${spec.key}-p${i}`, 600, 600)),
    credits,
    socials,
    badges: spec.badges ?? [
      'identity',
      ...(unionStatus !== 'non_union' ? (['union'] as VerificationBadge[]) : []),
      ...(rng() > 0.55 ? (['background_check'] as VerificationBadge[]) : []),
    ],
    discreet: {
      enabled: spec.discreet ?? false,
      budgetFloorCents: 50_000_00,
      publicMask: spec.discreet ? 'Emmy-Nominated Lead · F · 30-35' : '',
      requireTier1Studio: spec.discreet ?? false,
    },
    routing: {
      commercial: spec.agencyId ? 'WME' : null,
      film: spec.agencyId ? 'CAA' : null,
      musical: spec.agencyId ? 'Direct Manager' : null,
      theatrical: spec.agencyId ? 'CAA' : null,
      requireNdaBeforeContact: spec.discreet ?? false,
      redactMetricsUntilNda: spec.discreet ?? false,
    },
    agencyId: spec.agencyId ?? null,
    responseScore: Math.round(between(rng, 55, 99)),
    rating: Number(between(rng, 4.1, 5).toFixed(1)),
    bookingsCompleted: Math.round(between(rng, 2, 58)),
    availableFrom: new Date(Date.now() + Math.round(between(rng, -10, 20)) * 86_400_000).toISOString(),
    masked: false,
  };

  const account: SeedAccount = {
    id: accountId,
    email: spec.email ?? `${spec.key.replace(/[^a-z0-9]/g, '')}@talent.slate.dev`,
    displayName,
    role: sector === 'camera_lighting' || sector === 'post_production' || sector === 'music_sound' ? 'crew' : 'talent',
    workspaces: ['talent'],
    plan: spec.plan ?? (rng() > 0.6 ? 'pro' : 'free'),
    avatarUrl: profile.avatarUrl,
    agencyId: spec.agencyId ?? null,
    pitchAllowance: spec.plan === 'pro' ? null : 5,
  };

  return { account, profile };
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

export function seed(force = false): { profiles: number; projects: number } {
  const handle = db();
  if (!force && kvGet('seed_version') === SEED_VERSION) {
    const row = handle.prepare('SELECT COUNT(*) AS n FROM talent_profiles').get() as { n: number };
    return { profiles: row.n, projects: 0 };
  }

  for (const table of [
    'ledger', 'escrows', 'agreements', 'notifications', 'social_audits', 'self_tapes',
    'side_scripts', 'collab_notes', 'collab_rooms', 'gear', 'live_events', 'campaigns',
    'pitches', 'matches', 'swipes', 'beacons', 'opportunities', 'projects',
    'talent_profiles', 'accounts', 'kv',
  ]) {
    handle.exec(`DELETE FROM ${table}`);
  }

  /* ---- Agencies & hirers ---------------------------------------- */

  const wmeId = staticId('acc', 'agency-wme');
  const caaId = staticId('acc', 'agency-caa');
  const silverlineId = staticId('acc', 'prod-silverline');
  const brandId = staticId('acc', 'brand-loreal');
  const eventsId = staticId('acc', 'org-greek');

  insertAccount({
    id: wmeId,
    email: 'agency@slate.dev',
    displayName: 'WME · Talent Partners',
    role: 'agency',
    workspaces: ['agency', 'production'],
    plan: 'studio_enterprise',
    avatarUrl: avatarFor('agency-wme'),
  });
  insertAccount({
    id: caaId,
    email: 'caa@slate.dev',
    displayName: 'CAA · Motion Picture',
    role: 'agency',
    workspaces: ['agency'],
    plan: 'studio',
    avatarUrl: avatarFor('agency-caa'),
  });
  insertAccount({
    id: silverlineId,
    email: 'vempatigowtham@live.com',
    displayName: 'Ava Mercer · Silverline Pictures',
    role: 'production',
    workspaces: ['production', 'agency'],
    plan: 'studio_enterprise',
    avatarUrl: avatarFor('prod-silverline'),
  });
  insertAccount({
    id: brandId,
    email: 'brand@slate.dev',
    displayName: "L'Oréal · Global Brand Studio",
    role: 'brand',
    workspaces: ['brand', 'production'],
    plan: 'studio',
    avatarUrl: avatarFor('brand-loreal'),
  });
  insertAccount({
    id: eventsId,
    email: 'events@slate.dev',
    displayName: 'Greek Theatre · Live Events',
    role: 'production',
    workspaces: ['production'],
    plan: 'studio',
    avatarUrl: avatarFor('org-greek'),
  });

  /* ---- Named cast ------------------------------------------------ */

  const featured: ProfileSpec[] = [
    {
      key: 'sarah-jenkins',
      displayName: 'Sarah Jenkins',
      sector: 'screen_stage',
      primaryRole: 'Lead Actor',
      age: 28,
      unionStatus: 'sag_aftra',
      dayRateCents: 250_000,
      neighbourhood: 'Silver Lake',
      followers: 250_000,
      engagementRate: 4.6,
      fraudScore: 0.03,
      agencyId: wmeId,
      discreet: true,
      plan: 'pro',
      email: 'sarah@slate.dev',
      badges: ['identity', 'union', 'agency_repped', 'background_check'],
    },
    {
      key: 'mia-chen',
      displayName: 'Mia Chen',
      sector: 'screen_stage',
      primaryRole: 'Lead Actor',
      age: 26,
      unionStatus: 'sag_aftra',
      dayRateCents: 140_000,
      neighbourhood: 'Echo Park',
      followers: 180_000,
      engagementRate: 5.1,
      fraudScore: 0.04,
      agencyId: wmeId,
      plan: 'pro',
      email: 'talent@slate.dev',
      badges: ['identity', 'union', 'agency_repped'],
    },
    {
      key: 'alex-rivers',
      displayName: 'Alex Rivers',
      sector: 'digital_social',
      primaryRole: 'Macro Influencer',
      age: 24,
      unionStatus: 'non_union',
      dayRateCents: 95_000,
      neighbourhood: 'Venice',
      followers: 612_000,
      engagementRate: 3.9,
      fraudScore: 0.08,
      plan: 'pro',
      email: 'alex@slate.dev',
    },
    {
      key: 'chloe-vance',
      displayName: 'Chloe Vance',
      sector: 'digital_social',
      primaryRole: 'UGC Creator',
      age: 27,
      unionStatus: 'non_union',
      dayRateCents: 65_000,
      neighbourhood: 'Santa Monica',
      followers: 148_000,
      engagementRate: 6.2,
      fraudScore: 0.02,
      plan: 'pro',
    },
    {
      key: 'james-larkin',
      displayName: 'James Larkin',
      sector: 'music_sound',
      primaryRole: 'Film Composer',
      age: 38,
      unionStatus: 'non_union',
      dayRateCents: 180_000,
      neighbourhood: 'Glendale',
      agencyId: caaId,
      plan: 'pro',
      email: 'james@slate.dev',
    },
    {
      key: 'liam-kovacs',
      displayName: 'Liam Kovacs',
      sector: 'post_production',
      primaryRole: 'VFX Supervisor',
      age: 35,
      unionStatus: 'non_union',
      dayRateCents: 165_000,
      neighbourhood: 'Culver City',
      plan: 'pro',
      email: 'liam@slate.dev',
    },
    {
      key: 'marcus-diallo',
      displayName: 'Marcus Diallo',
      sector: 'camera_lighting',
      primaryRole: 'Gaffer',
      age: 41,
      unionStatus: 'iatse',
      dayRateCents: 95_000,
      neighbourhood: 'Warehouse District',
      plan: 'pro',
      email: 'crew@slate.dev',
      badges: ['identity', 'union', 'gear_insurance', 'background_check'],
    },
    {
      key: 'james-dunbar',
      displayName: 'James Dunbar',
      sector: 'screen_stage',
      primaryRole: 'Supporting Actor',
      age: 34,
      unionStatus: 'sag_aftra',
      dayRateCents: 120_000,
      neighbourhood: 'Highland Park',
      agencyId: wmeId,
      plan: 'pro',
    },
    {
      key: 'nadia-okafor',
      displayName: 'Nadia Okafor',
      sector: 'directing_writing',
      primaryRole: 'Commercial Director',
      age: 36,
      unionStatus: 'non_union',
      dayRateCents: 300_000,
      neighbourhood: 'Downtown LA',
      plan: 'pro',
    },
    // Deliberately fraudulent: exercises the suppression path end to end.
    {
      key: 'devon-swift',
      displayName: 'Devon Swift',
      sector: 'digital_social',
      primaryRole: 'Micro Influencer',
      age: 23,
      unionStatus: 'non_union',
      dayRateCents: 40_000,
      neighbourhood: 'Hollywood',
      followers: 410_000,
      engagementRate: 0.4,
      fraudScore: 0.58,
    },
  ];

  const specs: ProfileSpec[] = [...featured];

  // Fill out the marketplace: eight per sector, spread across the basin.
  for (const sector of SECTORS) {
    const roles = SECTOR_CATALOG[sector].roles;
    for (let i = 0; i < 9; i += 1) {
      specs.push({
        key: `${sector}-${i}`,
        sector,
        primaryRole: roles[i % roles.length],
        neighbourhood: NEIGHBOURHOODS[(i * 3 + SECTORS.indexOf(sector)) % NEIGHBOURHOODS.length].label,
      });
    }
  }
  // Extra gaffers so a Set-Beacon has a believable local pool.
  for (let i = 0; i < 14; i += 1) {
    specs.push({
      key: `gaffer-pool-${i}`,
      sector: 'camera_lighting',
      primaryRole: 'Gaffer',
      unionStatus: i % 3 === 0 ? 'non_union' : 'iatse',
      neighbourhood: NEIGHBOURHOODS[i % NEIGHBOURHOODS.length].label,
      dayRateCents: 65_000 + i * 2_500,
    });
  }

  const profilesByKey = new Map<string, TalentProfile>();
  for (const spec of specs) {
    const { account, profile } = makeProfile(spec);
    insertAccount(account);
    insertProfile(profile);
    profilesByKey.set(spec.key, profile);
  }

  const sarah = profilesByKey.get('sarah-jenkins')!;
  const mia = profilesByKey.get('mia-chen')!;
  const alex = profilesByKey.get('alex-rivers')!;
  const chloe = profilesByKey.get('chloe-vance')!;
  const james = profilesByKey.get('james-larkin')!;
  const liam = profilesByKey.get('liam-kovacs')!;
  const marcus = profilesByKey.get('marcus-diallo')!;
  const dunbar = profilesByKey.get('james-dunbar')!;

  /* ---- Projects -------------------------------------------------- */

  const silverlineProject: Project = {
    id: staticId('prj', 'silverline'),
    ownerAccountId: silverlineId,
    title: 'Silverline',
    productionCompany: 'Silverline Pictures',
    kind: 'feature',
    status: 'shooting',
    synopsis:
      'A cyber-forensics analyst uncovers a conspiracy inside the agency she works for. Neo-noir thriller, practical night exteriors, warehouse district.',
    location: makePlace(34.0353, -118.2306, 'Warehouse District', 'Los Angeles, CA'),
    shootStart: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    shootEnd: new Date(Date.now() + 24 * 86_400_000).toISOString(),
    budgetCents: 1_850_000_00,
    unionStatus: 'sag_aftra',
    coverUrl: photoFor('silverline-cover', 1200, 675),
    createdAt: new Date(Date.now() - 60 * 86_400_000).toISOString(),
  };

  const lorealProject: Project = {
    id: staticId('prj', 'loreal'),
    ownerAccountId: brandId,
    title: "L'Oréal — Luminous Spring",
    productionCompany: "L'Oréal Global Brand Studio",
    kind: 'campaign',
    status: 'casting',
    synopsis:
      'Multi-market creator campaign for the Luminous Spring line. Paid social, whitelisting, and one hero TVC.',
    location: makePlace(34.0195, -118.4912, 'Santa Monica', 'Los Angeles, CA'),
    shootStart: new Date(Date.now() + 12 * 86_400_000).toISOString(),
    shootEnd: new Date(Date.now() + 19 * 86_400_000).toISOString(),
    budgetCents: 420_000_00,
    unionStatus: 'non_union',
    coverUrl: photoFor('loreal-cover', 1200, 675),
    createdAt: new Date(Date.now() - 21 * 86_400_000).toISOString(),
  };

  const seriesProject: Project = {
    id: staticId('prj', 'series-y'),
    ownerAccountId: silverlineId,
    title: 'Series Y',
    productionCompany: 'Silverline Television',
    kind: 'series',
    status: 'pre_production',
    synopsis: 'Eight-episode limited series. Ensemble drama, Glendale stages plus Pasadena locations.',
    location: makePlace(34.1425, -118.2551, 'Glendale', 'Los Angeles, CA'),
    shootStart: new Date(Date.now() + 34 * 86_400_000).toISOString(),
    shootEnd: new Date(Date.now() + 120 * 86_400_000).toISOString(),
    budgetCents: 6_400_000_00,
    unionStatus: 'sag_aftra',
    coverUrl: photoFor('series-y-cover', 1200, 675),
    createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
  };

  for (const project of [silverlineProject, lorealProject, seriesProject]) insertProject(project);

  /* ---- Sides ----------------------------------------------------- */

  const side: SideScript = {
    id: staticId('sid', 'silverline-s4'),
    projectId: silverlineProject.id,
    title: 'Silverline — Scene 4 Side',
    sceneNumber: '4',
    character: 'MIA',
    watermark: 'viewer_id_ip',
    confidential: true,
    body: `SCENE 4 — INT. WAREHOUSE — NIGHT

The warehouse is silent. MIA moves between the server racks, torch low, breath visible.

MIA
I've read every line of this log four times. Somebody rewrote the timestamps before I got here.

She stops. A fan cycles down somewhere above her. She kills the torch.

MIA (CONT'D)
(quiet, to herself)
And they left the door open on purpose.

Footsteps. She does not run. She turns toward them.

MIA (CONT'D)
You want the drive, you can have it. But you're going to tell me who signed the order first.`,
    createdAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
  };
  run(
    'INSERT INTO side_scripts (id, project_id, data, created_at) VALUES (?, ?, ?, ?)',
    side.id,
    side.projectId,
    JSON.stringify(side),
    side.createdAt,
  );

  const takes: SelfTape[] = [1, 2].map((n) => ({
    id: staticId('tap', `mia-${n}`),
    sideScriptId: side.id,
    projectId: silverlineProject.id,
    talentProfileId: mia.id,
    takeNumber: n,
    durationSeconds: 62 + n * 9,
    status: n === 1 ? 'reviewed' : 'submitted',
    note: n === 1 ? 'Slower on the last beat.' : 'Closer lens, held the turn.',
    reviewerRating: n === 1 ? 4 : null,
    submittedAt: new Date(Date.now() - (3 - n) * 86_400_000).toISOString(),
    createdAt: new Date(Date.now() - (3 - n) * 86_400_000).toISOString(),
  }));
  for (const take of takes) {
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
  }

  /* ---- Opportunities --------------------------------------------- */

  const opportunitySpecs: {
    key: string;
    project: Project;
    role: string;
    sector: Sector;
    description: string;
    rateCents: number;
    unit: Opportunity['rateUnit'];
    slots: number;
    sponsored?: boolean;
    side?: boolean;
  }[] = [
    { key: 'silverline-lead', project: silverlineProject, role: 'Lead Actor', sector: 'screen_stage', description: 'MIA — analyst, late 20s. Interior night work, four weeks.', rateCents: 1_500_00, unit: 'week', slots: 1, side: true },
    { key: 'silverline-support', project: silverlineProject, role: 'Supporting Actor', sector: 'screen_stage', description: 'DETECTIVE RUIZ — recurring, six shoot days.', rateCents: 1_200_00, unit: 'day', slots: 2 },
    { key: 'silverline-gaffer', project: silverlineProject, role: 'Gaffer', sector: 'camera_lighting', description: 'Night exteriors, 40k package, IATSE crew.', rateCents: 950_00, unit: 'day', slots: 1 },
    { key: 'silverline-mixer', project: silverlineProject, role: 'Sound Mixer', sector: 'music_sound', description: 'Location sound, dual bag, warehouse acoustics.', rateCents: 950_00, unit: 'day', slots: 1 },
    { key: 'silverline-vfx', project: silverlineProject, role: 'VFX Compositor', sector: 'post_production', description: 'Screen comps and tracking cleanup, 120 shots.', rateCents: 850_00, unit: 'day', slots: 3 },
    { key: 'loreal-ugc', project: lorealProject, role: 'UGC Creator', sector: 'digital_social', description: 'Three in-feed assets plus whitelisting, 90-day flight.', rateCents: 6_500_00, unit: 'flat', slots: 8, sponsored: true },
    { key: 'loreal-macro', project: lorealProject, role: 'Macro Influencer', sector: 'digital_social', description: 'Hero creator, one TVC day plus paid social.', rateCents: 24_000_00, unit: 'flat', slots: 2, sponsored: true },
    { key: 'loreal-stylist', project: lorealProject, role: 'Wardrobe Stylist', sector: 'art_style_sfx', description: 'Two-day studio shoot, spring palette.', rateCents: 1_100_00, unit: 'day', slots: 1 },
    { key: 'series-vo', project: seriesProject, role: 'Voiceover Artist', sector: 'screen_stage', description: 'Lead narration across eight episodes. Booth in Glendale.', rateCents: 900_00, unit: 'episode', slots: 1 },
    { key: 'series-composer', project: seriesProject, role: 'Film Composer', sector: 'music_sound', description: 'Series score, hybrid orchestral, 8x50.', rateCents: 85_000_00, unit: 'flat', slots: 1 },
    { key: 'series-dp', project: seriesProject, role: 'Director of Photography', sector: 'camera_lighting', description: 'Block one and two, anamorphic.', rateCents: 2_400_00, unit: 'day', slots: 1 },
    { key: 'series-editor', project: seriesProject, role: 'Offline Editor', sector: 'post_production', description: 'Two blocks, Avid, remote-friendly.', rateCents: 1_050_00, unit: 'day', slots: 2 },
    { key: 'series-model', project: seriesProject, role: 'Editorial Model', sector: 'modeling_print', description: 'Key art and unit stills campaign.', rateCents: 1_800_00, unit: 'day', slots: 3 },
    { key: 'series-writer', project: seriesProject, role: 'Screenwriter', sector: 'directing_writing', description: 'Episodes 5-6, staffed for eight weeks.', rateCents: 12_000_00, unit: 'week', slots: 1 },
  ];

  for (const spec of opportunitySpecs) {
    const opportunity: Opportunity = {
      id: staticId('opp', spec.key),
      projectId: spec.project.id,
      project: {
        title: spec.project.title,
        productionCompany: spec.project.productionCompany,
        kind: spec.project.kind,
        coverUrl: spec.project.coverUrl,
        location: spec.project.location,
        unionStatus: spec.project.unionStatus,
      },
      role: spec.role,
      sector: spec.sector,
      roleDescription: spec.description,
      rateCents: spec.rateCents,
      rateUnit: spec.unit,
      shootDates: `${new Date(spec.project.shootStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${new Date(spec.project.shootEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      slots: spec.slots,
      slotsFilled: 0,
      sponsored: spec.sponsored ?? false,
      sideScriptId: spec.side ? side.id : null,
      createdAt: new Date(Date.now() - Math.round(Math.random() * 0) - 3 * 86_400_000).toISOString(),
    };
    insertOpportunity(opportunity);
  }

  /* ---- Shortlist / matches --------------------------------------- */

  const shortlist: { profile: TalentProfile; state: string }[] = [
    { profile: mia, state: 'mutual' },
    { profile: sarah, state: 'offer_sent' },
    { profile: dunbar, state: 'shortlisted' },
    { profile: profilesByKey.get('screen_stage-2')!, state: 'shortlisted' },
    { profile: profilesByKey.get('screen_stage-5')!, state: 'shortlisted' },
    { profile: liam, state: 'booked' },
  ];
  for (const [index, entry] of shortlist.entries()) {
    run(
      `INSERT INTO matches (id, project_id, talent_profile_id, opportunity_id, state, created_at, last_activity_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      staticId('mch', `silverline-${index}`),
      silverlineProject.id,
      entry.profile.id,
      null,
      entry.state,
      new Date(Date.now() - (10 - index) * 86_400_000).toISOString(),
      new Date(Date.now() - index * 3600_000).toISOString(),
    );
  }

  /* ---- Pitches --------------------------------------------------- */

  const pitchSpecs: { key: string; from: string; to: string; message: string; offer: number | null; tier: Pitch['superTier'] }[] = [
    { key: 'p1', from: silverlineId, to: mia.accountId, message: 'Scene 4 side attached. We would like you on tape by Thursday — the role is MIA, four weeks interior nights.', offer: 1_500_00, tier: null },
    { key: 'p2', from: brandId, to: alex.accountId, message: 'Hero creator slot on Luminous Spring. One TVC day plus 90-day whitelisting.', offer: 24_000_00, tier: 'headline' },
    { key: 'p3', from: silverlineId, to: marcus.accountId, message: 'Night exteriors starting Monday, 40k package. Can you hold the week?', offer: 950_00, tier: 'priority' },
    { key: 'p4', from: brandId, to: chloe.accountId, message: 'Three in-feed assets, spring palette. Your audit score is the highest in the pool.', offer: 6_500_00, tier: null },
  ];
  for (const [index, spec] of pitchSpecs.entries()) {
    const pitch: Pitch = {
      id: staticId('pch', spec.key),
      fromAccountId: spec.from,
      toAccountId: spec.to,
      projectId: spec.from === brandId ? lorealProject.id : silverlineProject.id,
      opportunityId: null,
      message: spec.message,
      offerCents: spec.offer,
      sideScriptId: spec.key === 'p1' ? side.id : null,
      superTier: spec.tier,
      queueRank: spec.tier === 'headline' ? 1 : spec.tier === 'priority' ? 2 : 9,
      readAt: index === 0 ? new Date(Date.now() - 2 * 3600_000).toISOString() : null,
      respondedAt: null,
      outcome: 'pending',
      createdAt: new Date(Date.now() - (index + 1) * 7 * 3600_000).toISOString(),
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
  }

  /* ---- Agreements ------------------------------------------------ */

  const agreementSpecs: { key: string; kind: Agreement['kind']; counterparty: TalentProfile; issuer: string; issuerName: string; project: Project; signed: boolean }[] = [
    { key: 'nda-sarah', kind: 'nda', counterparty: sarah, issuer: silverlineId, issuerName: 'Ava Mercer · Silverline Pictures', project: silverlineProject, signed: false },
    { key: 'nda-mia', kind: 'nda', counterparty: mia, issuer: brandId, issuerName: "L'Oréal · Global Brand Studio", project: lorealProject, signed: false },
    { key: 'nda-james', kind: 'nda', counterparty: james, issuer: silverlineId, issuerName: 'Ava Mercer · Silverline Pictures', project: seriesProject, signed: false },
    { key: 'sag-sarah', kind: 'sag_aftra', counterparty: sarah, issuer: silverlineId, issuerName: 'Ava Mercer · Silverline Pictures', project: silverlineProject, signed: true },
    { key: 'wfh-liam', kind: 'work_for_hire', counterparty: liam, issuer: silverlineId, issuerName: 'Ava Mercer · Silverline Pictures', project: silverlineProject, signed: true },
  ];

  for (const spec of agreementSpecs) {
    const createdAt = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const agreement: Agreement = {
      id: staticId('agr', spec.key),
      kind: spec.kind,
      title:
        spec.kind === 'nda'
          ? `Mutual NDA — ${spec.project.title}`
          : spec.kind === 'sag_aftra'
            ? `SAG-AFTRA Standard Engagement — ${spec.project.title}`
            : `Work-for-Hire — ${spec.project.title}`,
      projectId: spec.project.id,
      counterpartyAccountId: spec.counterparty.accountId,
      counterpartyName: spec.counterparty.displayName,
      counterpartyAvatarUrl: spec.counterparty.avatarUrl,
      issuerAccountId: spec.issuer,
      issuerName: spec.issuerName,
      body: `STANDARD PROVISIONS\n\nThis ${spec.kind === 'nda' ? 'Mutual Non-Disclosure Agreement' : 'Engagement'} is entered into between ${spec.issuerName} and ${spec.counterparty.displayName} in connection with ${spec.project.title}.\n\n1. All scripts, sides, casting lists, budgets, schedules and rough cuts disclosed are Confidential Information.\n\n2. Sides delivered through the Slate Casting Room are dynamically watermarked with viewer identity, timestamp and network address.\n\n3. Where a profile is published under Slate Discreet Mode, the talent identity is Confidential Information whether or not separately marked.\n\n4. Obligations survive three (3) years, and indefinitely as to unreleased material.\n\n5. Governed by the laws of California.`,
      state: spec.signed ? 'executed' : 'awaiting_signature',
      signatures: [],
      createdAt,
      executedAt: spec.signed ? createdAt : null,
    };
    persistAgreement(agreement);
  }

  /* ---- Escrows --------------------------------------------------- */

  const sarahEscrow = createEscrow({
    projectId: silverlineProject.id,
    talentProfileId: sarah.id,
    payerAccountId: silverlineId,
    role: 'Lead Actress',
    rateCents: 1_500_00,
    rateUnit: 'week',
    days: 4,
    agreementId: staticId('agr', 'sag-sarah'),
  });
  fundEscrow(sarahEscrow.id, silverlineId);
  checkIn(sarahEscrow.id, silverlineId);

  const liamEscrow = createEscrow({
    projectId: silverlineProject.id,
    talentProfileId: liam.id,
    payerAccountId: silverlineId,
    role: 'VFX Supervisor',
    rateCents: 1_650_00,
    rateUnit: 'day',
    days: 12,
  });
  fundEscrow(liamEscrow.id, silverlineId);

  const miaEscrow = createEscrow({
    projectId: lorealProject.id,
    talentProfileId: mia.id,
    payerAccountId: brandId,
    role: 'Campaign Face',
    rateCents: 3_400_00,
    rateUnit: 'flat',
    days: 1,
  });
  fundEscrow(miaEscrow.id, brandId);

  const dunbarEscrow = createEscrow({
    projectId: silverlineProject.id,
    talentProfileId: dunbar.id,
    payerAccountId: silverlineId,
    role: 'Detective Ruiz',
    rateCents: 1_200_00,
    rateUnit: 'day',
    days: 6,
  });
  persistEscrow(dunbarEscrow);

  /* ---- Collaboration rooms --------------------------------------- */

  const rooms: CollabRoom[] = [
    {
      id: staticId('rom', 'silverline-vfx'),
      projectId: silverlineProject.id,
      projectTitle: silverlineProject.title,
      name: "Silverline — VFX",
      department: 'vfx',
      cutUrl: `slate://cut/${silverlineProject.id}/vfx`,
      posterUrl: photoFor('silverline-vfx', 1200, 675),
      durationSeconds: 214,
      status: 'in_progress',
      thumbnails: Array.from({ length: 6 }, (_, i) => photoFor(`silverline-vfx-t${i}`, 240, 135)),
      supervisor: { displayName: liam.displayName, role: 'VFX Supervisor', avatarUrl: liam.avatarUrl },
    },
    {
      id: staticId('rom', 'silverline-post'),
      projectId: silverlineProject.id,
      projectTitle: silverlineProject.title,
      name: 'Silverline — Post',
      department: 'post',
      cutUrl: `slate://cut/${silverlineProject.id}/post`,
      posterUrl: photoFor('silverline-post', 1200, 675),
      durationSeconds: 1980,
      status: 'in_progress',
      thumbnails: Array.from({ length: 6 }, (_, i) => photoFor(`silverline-post-t${i}`, 240, 135)),
      supervisor: { displayName: james.displayName, role: 'Composer', avatarUrl: james.avatarUrl },
    },
  ];
  for (const room of rooms) {
    run(
      'INSERT INTO collab_rooms (id, project_id, department, data) VALUES (?, ?, ?, ?)',
      room.id,
      room.projectId,
      room.department,
      JSON.stringify(room),
    );
  }

  interface NoteSpec {
    room: CollabRoom;
    author: TalentProfile;
    role: string;
    tc: number;
    body: string;
  }
  const notes: NoteSpec[] = [
    { room: rooms[0], author: liam, role: 'VFX Supervisor', tc: 42, body: 'Refine the tracking on the monitor comp — it is too loose through the pan.' },
    { room: rooms[0], author: profilesByKey.get('post_production-3')!, role: 'Compositor', tc: 44, body: 'Fixed and re-rendered. Ready for colour.' },
    { room: rooms[0], author: liam, role: 'VFX Supervisor', tc: 128, body: 'Screen glow is reading a stop hot against the practical.' },
    { room: rooms[1], author: profilesByKey.get('directing_writing-0')!, role: 'Director', tc: 610, body: 'Good cut. Hold two more beats before she turns — more tension.' },
    { room: rooms[1], author: profilesByKey.get('post_production-0')!, role: 'Editor', tc: 640, body: 'Added Foley for the fan cycle. Check the low end on the stage.' },
    { room: rooms[1], author: james, role: 'Composer', tc: 902, body: 'Cue 4B is up. Strings enter on the door, not the footsteps.' },
  ];
  for (const [index, note] of notes.entries()) {
    const record: CollabNote = {
      id: staticId('nte', `note-${index}`),
      roomId: note.room.id,
      authorAccountId: note.author.accountId,
      authorName: note.author.displayName,
      authorRole: note.role,
      authorAvatarUrl: note.author.avatarUrl,
      timecodeSeconds: note.tc,
      body: note.body,
      createdAt: new Date(Date.now() - (notes.length - index) * 5400_000).toISOString(),
      resolved: index === 1,
    };
    run(
      'INSERT INTO collab_notes (id, room_id, timecode_seconds, data, created_at) VALUES (?, ?, ?, ?, ?)',
      record.id,
      record.roomId,
      record.timecodeSeconds,
      JSON.stringify(record),
      record.createdAt,
    );
  }

  /* ---- Gear ------------------------------------------------------- */

  const gearSpecs: { key: string; name: string; category: GearListing['category']; rate: number; owner: TalentProfile }[] = [
    { key: 'alexa35', name: 'Arri Alexa 35 w/ Signature Prime Kit', category: 'camera', rate: 175_000, owner: profilesByKey.get('camera_lighting-0')! },
    { key: 'zaxcom', name: 'Zaxcom Nova II Recorder + 8ch Bag', category: 'audio', rate: 95_000, owner: profilesByKey.get('music_sound-5')! },
    { key: 'venice2', name: 'Sony Venice 2 w/ Rialto Extension', category: 'camera', rate: 210_000, owner: profilesByKey.get('camera_lighting-2')! },
    { key: 'skypanel', name: 'ARRI SkyPanel S60-C ×6 + Distro', category: 'lighting', rate: 84_000, owner: marcus },
    { key: 'ronin', name: 'DJI Ronin 4D-8K + Gimbal Package', category: 'grid' as never, rate: 120_000, owner: profilesByKey.get('camera_lighting-3')! },
    { key: 'inspire3', name: 'DJI Inspire 3 (Part 107 pilot incl.)', category: 'drone', rate: 145_000, owner: profilesByKey.get('camera_lighting-4')! },
    { key: 'cookes', name: 'Cooke S7/i Full-Frame Prime Set', category: 'lens', rate: 132_000, owner: profilesByKey.get('camera_lighting-1')! },
    { key: 'dolly', name: 'Chapman Hybrid IV Dolly + Track', category: 'grip', rate: 68_000, owner: profilesByKey.get('camera_lighting-6')! },
  ];
  for (const spec of gearSpecs) {
    const listing: GearListing = {
      id: staticId('ger', spec.key),
      ownerProfileId: spec.owner.id,
      name: spec.name,
      category: (spec.category === ('grid' as never) ? 'grip' : spec.category) as GearListing['category'],
      dayRateCents: spec.rate,
      rating: Number((4.6 + (hashSeed(spec.key) % 4) / 10).toFixed(1)),
      insured: true,
      imageUrl: photoFor(`gear-${spec.key}`, 600, 400),
      location: spec.owner.location,
    };
    run(
      'INSERT INTO gear (id, owner_profile_id, category, day_rate_cents, lat, lng, cell, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      listing.id,
      listing.ownerProfileId,
      listing.category,
      listing.dayRateCents,
      listing.location.lat,
      listing.location.lng,
      listing.location.cell,
      JSON.stringify(listing),
    );
  }

  /* ---- Live events ------------------------------------------------ */

  const eventSpecs: { key: string; name: string; venue: string; kind: LiveEvent['kind']; lat: number; lng: number; inDays: number; booked: TalentProfile[] }[] = [
    { key: 'greek', name: 'Live Appearance — Luminous Spring Launch', venue: 'The Greek Theatre, L.A.', kind: 'performance', lat: 34.1197, lng: -118.2952, inDays: 3, booked: [sarah, alex] },
    { key: 'orpheum', name: 'Silverline Premiere', venue: 'Orpheum Theatre', kind: 'premiere', lat: 34.0442, lng: -118.2534, inDays: 26, booked: [mia, dunbar] },
    { key: 'peacock', name: 'Creator Panel — Audience Authenticity', venue: 'Peacock Theater', kind: 'panel', lat: 34.0447, lng: -118.2673, inDays: 9, booked: [chloe] },
    { key: 'warehouse', name: 'Night Exterior Block — Silverline', venue: 'Warehouse District Lot 4', kind: 'shoot', lat: 34.0353, lng: -118.2306, inDays: 1, booked: [mia, marcus] },
    { key: 'hollywoodbowl', name: 'Score Recording — Series Y', venue: 'Hollywood Bowl Studio', kind: 'appearance', lat: 34.1122, lng: -118.3391, inDays: 15, booked: [james] },
    { key: 'venice', name: 'UGC Shoot Day — Beach Block', venue: 'Venice Boardwalk', kind: 'shoot', lat: 33.985, lng: -118.4695, inDays: 5, booked: [chloe, alex] },
  ];
  for (const spec of eventSpecs) {
    const event: LiveEvent = {
      id: staticId('evt', spec.key),
      name: spec.name,
      venue: spec.venue,
      kind: spec.kind,
      startsAt: new Date(Date.now() + spec.inDays * 86_400_000).toISOString(),
      location: makePlace(spec.lat, spec.lng, spec.venue, 'Los Angeles, CA'),
      capacity: 1200 + (hashSeed(spec.key) % 4000),
      bookedProfileIds: spec.booked.map((p) => p.id),
      organizerAccountId: eventsId,
    };
    run(
      'INSERT INTO live_events (id, kind, starts_at, lat, lng, cell, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
      event.id,
      event.kind,
      event.startsAt,
      event.location.lat,
      event.location.lng,
      event.location.cell,
      JSON.stringify(event),
    );
  }

  /* ---- Campaign draft --------------------------------------------- */

  const campaign: Campaign = {
    id: staticId('cmp', 'luminous-spring'),
    brandAccountId: brandId,
    name: 'Luminous Spring — Creator Wave 1',
    objective: 'launch',
    audience: {
      geos: ['US', 'UK', 'CA'],
      ageBands: ['18-24', '25-34'],
      interests: BRAND_INTERESTS.slice(0, 4),
    },
    budgetCents: 45_000_00,
    cpmTargetCents: 2_200,
    selectedProfileIds: [alex.id, chloe.id, mia.id],
    estimatedReach: 0,
    predictedRoi: 0,
    state: 'draft',
    step: 4,
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  };
  run(
    'INSERT INTO campaigns (id, brand_account_id, state, step, data, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    campaign.id,
    campaign.brandAccountId,
    campaign.state,
    campaign.step,
    JSON.stringify(campaign),
    campaign.createdAt,
  );

  kvSet('seed_version', SEED_VERSION);
  kvSet('demo_accounts', JSON.stringify({
    production: 'vempatigowtham@live.com',
    talent: 'talent@slate.dev',
    brand: 'brand@slate.dev',
    agency: 'agency@slate.dev',
    crew: 'crew@slate.dev',
    password: 'slate',
  }));

  const count = handle.prepare('SELECT COUNT(*) AS n FROM talent_profiles').get() as { n: number };
  return { profiles: count.n, projects: 3 };
}

/* ------------------------------------------------------------------ */

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('db/seed.ts');
if (invokedDirectly) {
  const result = seed(true);
  console.log(`seeded ${result.profiles} talent profiles across ${result.projects} projects`);
  closeDb();
}
