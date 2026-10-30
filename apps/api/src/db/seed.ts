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

import type { DatabaseSync } from 'node:sqlite';
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

  seedLocalGigsAndCommunity(handle, silverlineId);
  seedArtCollaborations(handle, silverlineId);

  const count = handle.prepare('SELECT COUNT(*) AS n FROM talent_profiles').get() as { n: number };
  return { profiles: count.n, projects: 3 };
}

function seedArtCollaborations(handle: DatabaseSync, mainAccountId: string): void {
  handle.exec('DELETE FROM art_opportunities');
  handle.exec('DELETE FROM art_collaborations');

  const opportunities = [
    {
      id: 'art_cam_01',
      creator_id: 'acc_creator_leo',
      creator_name: 'Leo Alvarez',
      creator_avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
      creator_role: 'Indie Film Director',
      title: 'Shadow Our Camera Operator on an Indie Short Film',
      category: 'film_video',
      category_label: 'Movies, Video & Short Films',
      activity_type: 'learning_shadow',
      activity_badge: 'Shadow & Learn 🎥',
      address: '1520 Sunset Blvd (Diner Set)',
      neighborhood: 'Silver Lake',
      distance_miles: 0.2,
      walk_minutes: 4,
      time_range: '2:00 PM – 5:00 PM',
      date_label: 'Today',
      spots_total: 2,
      spots_joined: 1,
      no_experience_needed: 1,
      project_story: 'We are shooting a 10-minute comedy short about two strangers bonding over mismatched coffee orders. Our DP is excited to explain camera lenses, gimbal balance, and blocking to anyone curious about cinematography!',
      what_you_will_do_json: JSON.stringify([
        'Stand alongside camera operator during rehearsal takes',
        'Help hold the reflector board to bounce gentle light on actors',
        'Ask questions between takes about lighting, angles, and camera settings',
        'Enjoy free iced coffee, diner snacks, and set camaraderie',
      ]),
      what_you_will_learn_json: JSON.stringify([
        'How camera lenses (35mm vs 50mm) change the mood of a scene',
        'How to balance and operate a handheld camera gimbal',
        'Basic set etiquette and director-to-crew communication',
      ]),
      perks_json: JSON.stringify(['Screen Credit: Camera Assistant', 'Free Lunch & Crafty', 'Signed Call Sheet', 'New Creative Friends']),
      what_to_bring: 'Wear comfortable sneakers and dark t-shirt. Bring a small notebook or your phone to jot down tips!',
      lat: 34.0782,
      lng: -118.2606,
      created_at: new Date().toISOString(),
    },
    {
      id: 'art_extra_02',
      creator_id: 'acc_creator_maya',
      creator_name: 'Maya Lin',
      creator_avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
      creator_role: 'Student Filmmaker',
      title: 'Background Diner Customers for Short Drama (Zero Experience)',
      category: 'film_video',
      category_label: 'Movies, Video & Short Films',
      activity_type: 'collaboration',
      activity_badge: 'Fun Extra ✨',
      address: '1822 W Sunset Blvd (Echo Diner)',
      neighborhood: 'Echo Park',
      distance_miles: 0.3,
      walk_minutes: 6,
      time_range: '3:30 PM – 6:00 PM',
      date_label: 'Today',
      spots_total: 6,
      spots_joined: 4,
      no_experience_needed: 1,
      project_story: 'A cozy neighborhood story exploring human connection. We need friendly everyday locals to sit at booths in the background so the diner feels warm, lived-in, and authentic.',
      what_you_will_do_json: JSON.stringify([
        'Sit comfortably at a vintage diner booth with another local',
        'Pretend to chat naturally and sip coffee while lead actors play their scene',
        'No lines to memorize, no pressure — just be yourself!',
        'Free hot coffee, diner pie, and snacks provided',
      ]),
      what_you_will_learn_json: JSON.stringify([
        'What being on an indie movie set actually feels like',
        'How multiple camera angles are matched across takes',
        'How background performers bring scenes to life',
      ]),
      perks_json: JSON.stringify(['Screen Credit: Background Cast', 'Complimentary Pie & Coffee', 'Fun Photo on Set', 'Great Weekend Story']),
      what_to_bring: 'Casual everyday clothes with warm colors. Avoid neon or large brand logos.',
      lat: 34.0772,
      lng: -118.2580,
      created_at: new Date().toISOString(),
    },
    {
      id: 'art_mic_03',
      creator_id: 'acc_creator_sam',
      creator_name: 'Sammy Klein',
      creator_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      creator_role: 'Indie Sound Designer',
      title: 'Hold Boom Mic & Learn Field Audio Recording',
      category: 'film_video',
      category_label: 'Movies, Video & Short Films',
      activity_type: 'learning_shadow',
      activity_badge: 'Audio Workshop 🎙️',
      address: 'Echo Park Lake (Boathouse Walk)',
      neighborhood: 'Echo Park',
      distance_miles: 0.3,
      walk_minutes: 6,
      time_range: '10:00 AM – 1:00 PM',
      date_label: 'Tomorrow',
      spots_total: 2,
      spots_joined: 0,
      no_experience_needed: 1,
      project_story: 'Filming an intimate dialogue on the park benches. Good sound is 70% of a movie! Sammy will walk you through microphone shock-mounts, deadcat wind protection, and monitoring clean dialogue.',
      what_you_will_do_json: JSON.stringify([
        'Learn how to hold a carbon fiber boom pole without making handling noise',
        'Listen to live dialogue on professional studio headphones',
        'Help record ambient park room tone and bird sounds for sound design',
        'Super chill morning outdoors by the water',
      ]),
      what_you_will_learn_json: JSON.stringify([
        'How directional shotgun microphones work',
        'How to keep the mic just outside the camera frame line',
        'How audio gain staging prevents dialogue distortion',
      ]),
      perks_json: JSON.stringify(['Screen Credit: Boom Operator Assistant', 'Free Iced Matcha', 'Audio Gear Practice']),
      what_to_bring: 'Comfortable shoes for standing and lightweight layers.',
      lat: 34.0725,
      lng: -118.2605,
      created_at: new Date().toISOString(),
    },
    {
      id: 'art_jam_04',
      creator_id: 'acc_creator_elena',
      creator_name: 'Elena Rostova',
      creator_avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
      creator_role: 'Acoustic Songwriter',
      title: 'Sunday Acoustic Jam & Lyric-Writing Circle in the Park',
      category: 'music_sound',
      category_label: 'Music & Sound Collaborations',
      activity_type: 'jam_session',
      activity_badge: 'Acoustic Jam 🎸',
      address: 'Echo Park Lake (Under the Willow Trees)',
      neighborhood: 'Echo Park',
      distance_miles: 0.3,
      walk_minutes: 5,
      time_range: '1:00 PM – 3:30 PM',
      date_label: 'Sunday',
      spots_total: 8,
      spots_joined: 4,
      no_experience_needed: 1,
      project_story: 'A welcoming, zero-intimidation gathering of local music lovers. Whether you play 3 guitar chords, love writing poetry, or just want to shake a tambourine and listen, you belong here!',
      what_you_will_do_json: JSON.stringify([
        'Share chord progressions and simple acoustic melodies',
        'Brainstorm song lyrics and themes in an open circle',
        'Experiment with shakers, claps, and vocal harmonies',
        'Connect with other local musicians for future projects',
      ]),
      what_you_will_learn_json: JSON.stringify([
        'How to write song verses using sensory imagery',
        'How to listen and lock into a collaborative acoustic groove',
        'Building confidence playing with other people',
      ]),
      perks_json: JSON.stringify(['Homemade Cookies & Lemonade', 'Collaborative Song Recording', 'Community Songbook']),
      what_to_bring: 'Bring an acoustic instrument, notebook & pen, or just yourself and an open heart!',
      lat: 34.0730,
      lng: -118.2610,
      created_at: new Date().toISOString(),
    },
    {
      id: 'art_beat_05',
      creator_id: 'acc_creator_kai',
      creator_name: 'Kai Chen',
      creator_avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
      creator_role: 'Electronic Music Producer',
      title: 'Lo-Fi Beat Collaboration & Synth Jam Session',
      category: 'music_sound',
      category_label: 'Music & Sound Collaborations',
      activity_type: 'collaboration',
      activity_badge: 'Beat Lab 🎧',
      address: '2105 Glendale Blvd (Studio Living Room)',
      neighborhood: 'Silver Lake',
      distance_miles: 0.4,
      walk_minutes: 7,
      time_range: '4:00 PM – 6:30 PM',
      date_label: 'Saturday',
      spots_total: 4,
      spots_joined: 2,
      no_experience_needed: 1,
      project_story: 'Making tape-saturated chill beats on an old Roland sampler. Bring your laptop, pocket operator, or a playlist of your favorite vinyl samples. Let’s make two tracks before sunset!',
      what_you_will_do_json: JSON.stringify([
        'Chop vintage soul vinyl samples into melodic loops',
        'Program dusty boom-bap drum patterns and sidechain basslines',
        'Tweak analog synthesizer knobs to create warm pads',
        'Export and share the finished collaborative EP with everyone',
      ]),
      what_you_will_learn_json: JSON.stringify([
        'Sample chopping and time-stretching techniques',
        'EQ and tape compression for vintage lo-fi warmth',
        'Arranging 16-bar beat progressions with transitions',
      ]),
      perks_json: JSON.stringify(['Mastered WAV files of both tracks', 'Sample pack library swap', 'Fresh hot tea & snacks']),
      what_to_bring: 'Headphones and a flash drive. Laptop or mini-keyboard welcome but not required.',
      lat: 34.0845,
      lng: -118.2612,
      created_at: new Date().toISOString(),
    },
    {
      id: 'art_theater_06',
      creator_id: 'acc_creator_chloe',
      creator_name: 'Chloe Vance & The Backyard Players',
      creator_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      creator_role: 'Community Theater Director',
      title: 'Pack the Audience for DIY Backyard Theater Opening',
      category: 'stage_theater',
      category_label: 'Stage, Theater & Performance',
      activity_type: 'crowd_support',
      activity_badge: 'Pack the Crowd 🎭',
      address: '714 S Santa Fe Ave (Courtyard)',
      neighborhood: 'Arts District',
      distance_miles: 0.5,
      walk_minutes: 10,
      time_range: '7:00 PM – 9:00 PM',
      date_label: 'Friday Night',
      spots_total: 25,
      spots_joined: 16,
      no_experience_needed: 1,
      project_story: 'A completely grassroots, free community theater performance under fairy lights in an Arts District courtyard. We need enthusiastic neighborhood audience members to cheer on our local actors!',
      what_you_will_do_json: JSON.stringify([
        'Grab a folding chair or picnic blanket spot under string lights',
        'Laugh, gasp, and cheer with the neighborhood crowd',
        'Participate in the opening warm-up call & response',
        'Stick around after for hot apple cider and meet the cast',
      ]),
      what_you_will_learn_json: JSON.stringify([
        'How site-specific DIY theater transforms everyday urban spaces',
        'How audience presence and reaction elevates live acting',
      ]),
      perks_json: JSON.stringify(['Complimentary Cider & Popcorn', 'Printed Playbill Souvenir', 'Backstage Tour']),
      what_to_bring: 'Warm sweater or light blanket for outdoor evening seating.',
      lat: 34.0350,
      lng: -118.2320,
      created_at: new Date().toISOString(),
    },
    {
      id: 'art_backstage_07',
      creator_id: 'acc_creator_chloe',
      creator_name: 'Chloe Vance',
      creator_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      creator_role: 'Stage Coordinator',
      title: 'Backstage Hand & Costume Helper for Community Play',
      category: 'stage_theater',
      category_label: 'Stage, Theater & Performance',
      activity_type: 'volunteer_help',
      activity_badge: 'Backstage Helper 🎪',
      address: 'Silver Lake Community Stage',
      neighborhood: 'Silver Lake',
      distance_miles: 0.4,
      walk_minutes: 8,
      time_range: '5:30 PM – 8:30 PM',
      date_label: 'Friday',
      spots_total: 3,
      spots_joined: 1,
      no_experience_needed: 1,
      project_story: 'Our stage crew needs an extra pair of friendly hands to help coordinate quick costume changes behind the curtain, organize prop tables, and signal lighting cues.',
      what_you_will_do_json: JSON.stringify([
        'Help actors change vintage hats, coats, and glasses between scenes',
        'Keep prop table tidy and hand flashlight props to actors entering stage right',
        'Experience the thrill of live backstage theater production',
      ]),
      what_you_will_learn_json: JSON.stringify([
        'How stage managers call cues and coordinate running crew',
        'Organization systems for theater props and costume tracking',
      ]),
      perks_json: JSON.stringify(['Playbill Credit: Stage Assistant', 'Cast Pizza Party', 'Free Tickets for Friends']),
      what_to_bring: 'All black or dark clothes and comfortable shoes.',
      lat: 34.0810,
      lng: -118.2650,
      created_at: new Date().toISOString(),
    },
    {
      id: 'art_gallery_08',
      creator_id: 'acc_creator_nora',
      creator_name: 'Nora Diaz',
      creator_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      creator_role: 'Local Printmaker',
      title: 'Art Print Showcase & Creative Meetup (Come Mingle!)',
      category: 'creative_events',
      category_label: 'Creative Events & Art Showups',
      activity_type: 'crowd_support',
      activity_badge: 'Art Meetup 🎨',
      address: '830 E 3rd St (Loft Gallery)',
      neighborhood: 'Arts District',
      distance_miles: 0.6,
      walk_minutes: 12,
      time_range: '6:30 PM – 9:00 PM',
      date_label: 'Saturday Evening',
      spots_total: 30,
      spots_joined: 18,
      no_experience_needed: 1,
      project_story: 'Showcasing handmade linocut and risograph art prints by 5 Eastside LA illustrators. We invite curious locals and beginner artists to come wander the gallery, chat with creators, and take inspiring photos!',
      what_you_will_do_json: JSON.stringify([
        'Explore vibrant risograph art prints on display',
        'Watch a live 15-minute screen-printing demonstration',
        'Snap stories or reels to help spotlight local neighborhood artists',
        'Mingle and share creative ideas with fellow art enthusiasts',
      ]),
      what_you_will_learn_json: JSON.stringify([
        'How multi-layer risograph and screen printing works',
        'How local artists self-publish art books and zines',
      ]),
      perks_json: JSON.stringify(['Free Hand-Printed Postcard', 'Sparkling Water & Local Pretzels', 'Printmaking Zine']),
      what_to_bring: 'Just your curiosity and a camera or phone if you like taking photos.',
      lat: 34.0450,
      lng: -118.2370,
      created_at: new Date().toISOString(),
    },
  ];

  const stmt = handle.prepare(`
    INSERT INTO art_opportunities (
      id, creator_id, creator_name, creator_avatar, creator_role, title,
      category, category_label, activity_type, activity_badge, address, neighborhood,
      distance_miles, walk_minutes, time_range, date_label, spots_total, spots_joined,
      no_experience_needed, project_story, what_you_will_do_json, what_you_will_learn_json,
      perks_json, what_to_bring, lat, lng, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const o of opportunities) {
    stmt.run(
      o.id, o.creator_id, o.creator_name, o.creator_avatar, o.creator_role, o.title,
      o.category, o.category_label, o.activity_type, o.activity_badge, o.address, o.neighborhood,
      o.distance_miles, o.walk_minutes, o.time_range, o.date_label, o.spots_total, o.spots_joined,
      o.no_experience_needed, o.project_story, o.what_you_will_do_json, o.what_you_will_learn_json,
      o.perks_json, o.what_to_bring, o.lat, o.lng, o.created_at
    );
  }

  // Pre-join one for the default user
  handle.prepare(`
    INSERT INTO art_collaborations (id, opportunity_id, account_id, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('collab_01', 'art_cam_01', mainAccountId, 'joined', new Date().toISOString());
}

function seedLocalGigsAndCommunity(handle: DatabaseSync, mainAccountId: string): void {
  handle.exec('DELETE FROM local_gigs');
  handle.exec('DELETE FROM gig_applications');
  handle.exec('DELETE FROM wallet_items');
  handle.exec('DELETE FROM peer_chats');
  handle.exec('DELETE FROM chat_messages');

  const gigs = [
    {
      id: 'gig_film_extra_01',
      poster_id: 'acc_poster_leo',
      poster_name: 'Leo Alvarez',
      poster_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      poster_rating: 4.9,
      poster_gigs_count: 8,
      title: 'Background Extras for Indie Comedy Scene',
      category: 'film_extra',
      category_label: 'Film & Video Extra',
      pay_cents: 4500, // $45
      duration_hours: 3.0,
      address: '1520 Sunset Blvd (Diner Set)',
      neighborhood: 'Silver Lake',
      distance_miles: 0.2,
      walk_minutes: 5,
      starts_at: 'Today, 2:30 PM',
      time_range: '2:30 PM – 5:30 PM',
      spots_total: 8,
      spots_filled: 5,
      no_experience_needed: 1,
      urgent: 1,
      description: 'We are filming a cozy brunch restaurant conversation scene for a short festival comedy. Need everyday people to sit at background tables, eat diner fries, and look natural. No lines, zero stress!',
      tasks_json: JSON.stringify([
        'Sit at background diner booth with another extra',
        'Pretend to converse naturally without speaking loudly',
        'React to lead character dropping coffee cup',
        'Have fun & enjoy free snacks and iced coffee',
      ]),
      what_to_wear: 'Casual daytime clothes (avoid solid green or loud brand logos). Warm autumn colors look great on camera!',
      lat: 34.0782,
      lng: -118.2606,
      created_at: new Date().toISOString(),
    },
    {
      id: 'gig_music_crowd_02',
      poster_id: 'acc_poster_dj',
      poster_name: 'Luna Perez (Indie Records)',
      poster_avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=200&q=80',
      poster_rating: 5.0,
      poster_gigs_count: 14,
      title: 'Concert Crowd Cheerers for Album Launch Party',
      category: 'music_crowd',
      category_label: 'Concert & Music Video Crowd',
      pay_cents: 3500, // $35
      duration_hours: 2.5,
      address: '1822 W Sunset Blvd (Echo Hall)',
      neighborhood: 'Echo Park',
      distance_miles: 0.4,
      walk_minutes: 8,
      starts_at: 'Tonight, 7:00 PM',
      time_range: '7:00 PM – 9:30 PM',
      spots_total: 20,
      spots_filled: 14,
      no_experience_needed: 1,
      urgent: 0,
      description: 'Local dream-pop band shooting live performance video. We need high-energy crowd members near the front stage to cheer, clap along, and make the venue feel packed and electric!',
      tasks_json: JSON.stringify([
        'Stand near stage and cheer when band takes stage',
        'Clap along during the chorus of 3 songs',
        'Keep good energy for 2 live song video takes',
        'Enjoy free non-alcoholic refreshments & band merch pin',
      ]),
      what_to_wear: 'Dark casual, vintage jacket, band tees, or streetwear style. Comfy sneakers for standing.',
      lat: 34.0772,
      lng: -118.2580,
      created_at: new Date().toISOString(),
    },
    {
      id: 'gig_shop_promo_03',
      poster_id: 'acc_poster_boba',
      poster_name: 'Mochi Milk Bar (Elena)',
      poster_avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
      poster_rating: 4.8,
      poster_gigs_count: 3,
      title: 'Boba Café Grand Opening: Pack the Line & Snap Stories',
      category: 'shop_promo',
      category_label: 'Shop Opening & Local Posts',
      pay_cents: 2500, // $25 + free drink
      duration_hours: 1.5,
      address: '2105 Glendale Blvd',
      neighborhood: 'Silver Lake',
      distance_miles: 0.3,
      walk_minutes: 6,
      starts_at: 'Today, 4:00 PM',
      time_range: '4:00 PM – 5:30 PM',
      spots_total: 15,
      spots_filled: 9,
      no_experience_needed: 1,
      urgent: 0,
      description: 'Grand opening day for our neighborhood boba café! We need friendly locals to hang out, keep the patio lively, take a couple of quick phone videos, and tag our shop on Instagram or TikTok.',
      tasks_json: JSON.stringify([
        'Order complimentary signature boba or matcha latte',
        'Hang out on the sunny patio with other locals for 60-90 mins',
        'Post 1 photo or quick 5-sec video to IG Stories or TikTok',
        'Get paid $25 cash instantly upon check-out',
      ]),
      what_to_wear: 'Cute casual everyday outfit. Bright cheerful colors preferred!',
      lat: 34.0845,
      lng: -118.2612,
      created_at: new Date().toISOString(),
    },
    {
      id: 'gig_helper_04',
      poster_id: 'acc_poster_marcus',
      poster_name: 'Marcus Diallo',
      poster_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      poster_rating: 4.9,
      poster_gigs_count: 22,
      title: 'Music Video Cable & Light Stand Helper (No Skills Req)',
      category: 'helper',
      category_label: 'Gear & Production Helper',
      pay_cents: 6000, // $60
      duration_hours: 4.0,
      address: '830 E 3rd St (Studio Loft)',
      neighborhood: 'Arts District',
      distance_miles: 0.7,
      walk_minutes: 14,
      starts_at: 'Tomorrow, 10:00 AM',
      time_range: '10:00 AM – 2:00 PM',
      spots_total: 3,
      spots_filled: 1,
      no_experience_needed: 1,
      urgent: 1,
      description: 'Assistant canceled last minute! Need an extra pair of hands to help carry folding chairs, wrap basic orange extension cords, and hand light stands to the gaffer. Super friendly crew, will teach you everything.',
      tasks_json: JSON.stringify([
        'Help unpack 3 equipment Pelican cases from van',
        'Hold extension cords and tape them down with gaff tape',
        'Pass bottled water to crew during camera takes',
        'Great way to learn how real video productions run!',
      ]),
      what_to_wear: 'Close-toed sneakers or boots, comfortable jeans or cargo pants, and a dark t-shirt.',
      lat: 34.0450,
      lng: -118.2370,
      created_at: new Date().toISOString(),
    },
    {
      id: 'gig_event_crowd_05',
      poster_id: 'acc_poster_maya',
      poster_name: 'Maya Lin (Silver Gallery)',
      poster_avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
      poster_rating: 5.0,
      poster_gigs_count: 6,
      title: 'Art Gallery Opening Night: Friendly Mingler & Crowd',
      category: 'event_crowd',
      category_label: 'Event Crowd & Attendees',
      pay_cents: 3000, // $30
      duration_hours: 2.0,
      address: '714 S Santa Fe Ave',
      neighborhood: 'Arts District',
      distance_miles: 0.5,
      walk_minutes: 10,
      starts_at: 'Tomorrow, 6:00 PM',
      time_range: '6:00 PM – 8:00 PM',
      spots_total: 12,
      spots_filled: 6,
      no_experience_needed: 1,
      urgent: 0,
      description: 'Contemporary photo exhibit opening. We want a bustling, vibrant room when reviewers and art collectors arrive. Just stroll around, view prints, chat casually, and enjoy complimentary sparkling water.',
      tasks_json: JSON.stringify([
        'Arrive at 5:50 PM for quick greeting and name badge',
        'Mingle naturally in the main gallery room',
        'Participate in artist Q&A applause at 7:00 PM',
        'Take home complimentary exhibition art print poster',
      ]),
      what_to_wear: 'Smart casual or artsy attire (all black, blazer, or neat collared shirt).',
      lat: 34.0350,
      lng: -118.2320,
      created_at: new Date().toISOString(),
    },
    {
      id: 'gig_film_extra_06',
      poster_id: 'acc_poster_sam',
      poster_name: 'Sammy Klein',
      poster_avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
      poster_rating: 4.7,
      poster_gigs_count: 5,
      title: 'Park Jogger & Dog Walker Extra for Student Film',
      category: 'film_extra',
      category_label: 'Film & Video Extra',
      pay_cents: 4000, // $40
      duration_hours: 2.0,
      address: 'Echo Park Lake (Boathouse Walk)',
      neighborhood: 'Echo Park',
      distance_miles: 0.3,
      walk_minutes: 6,
      starts_at: 'Saturday, 9:00 AM',
      time_range: '9:00 AM – 11:00 AM',
      spots_total: 6,
      spots_filled: 3,
      no_experience_needed: 1,
      urgent: 0,
      description: 'USC Cinema thesis film shooting an emotional dialogue bench scene. We need people walking along the perimeter path in the background to look like everyday park visitors.',
      tasks_json: JSON.stringify([
        'Stroll naturally along lake pathway on camera cue',
        'Repeat walk during 4 camera angle takes',
        'You can bring your dog if they are quiet and friendly!',
        'Instant payment released right as we wrap at 11:00 AM',
      ]),
      what_to_wear: 'Running or walking gear, light workout jacket or casual weekend hoodie.',
      lat: 34.0725,
      lng: -118.2605,
      created_at: new Date().toISOString(),
    },
  ];

  const gigStmt = handle.prepare(`
    INSERT INTO local_gigs (
      id, poster_id, poster_name, poster_avatar, poster_rating, poster_gigs_count,
      title, category, category_label, pay_cents, duration_hours, address, neighborhood,
      distance_miles, walk_minutes, starts_at, time_range, spots_total, spots_filled,
      no_experience_needed, urgent, description, tasks_json, what_to_wear, lat, lng, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const g of gigs) {
    gigStmt.run(
      g.id, g.poster_id, g.poster_name, g.poster_avatar, g.poster_rating, g.poster_gigs_count,
      g.title, g.category, g.category_label, g.pay_cents, g.duration_hours, g.address, g.neighborhood,
      g.distance_miles, g.walk_minutes, g.starts_at, g.time_range, g.spots_total, g.spots_filled,
      g.no_experience_needed, g.urgent, g.description, g.tasks_json, g.what_to_wear, g.lat, g.lng, g.created_at
    );
  }

  // Pre-seed 1 applied gig for the user
  handle.prepare(`
    INSERT INTO gig_applications (id, gig_id, account_id, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run('app_01', 'gig_film_extra_01', mainAccountId, 'confirmed', new Date().toISOString());

  // Seed Handshake Wallet for default user
  const walletStmt = handle.prepare(`
    INSERT INTO wallet_items (id, account_id, title, category, amount_cents, date_str, type, status, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const walletItems = [
    {
      id: 'w_01',
      title: 'Background Extra — Sunset Diner Comedy',
      category: 'Film Extra',
      amount_cents: 4500, // $45.00
      date_str: 'Today',
      type: 'gig_payout',
      status: 'held_escrow',
      note: 'Held securely in Handshake Escrow • Releases immediately after check-out',
    },
    {
      id: 'w_02',
      title: 'Boba Café Launch — Patio Posts & Reels',
      category: 'Shop Promo',
      amount_cents: 2500, // $25.00
      date_str: 'Yesterday',
      type: 'gig_payout',
      status: 'available',
      note: 'Verified by Elena • Ready to cash out',
    },
    {
      id: 'w_03',
      title: 'Concert Crowd Cheerer — Echo Park Album Release',
      category: 'Music Crowd',
      amount_cents: 3500, // $35.00
      date_str: '3 days ago',
      type: 'gig_payout',
      status: 'available',
      note: 'Completed • 5.0 ★ Star Rating received',
    },
    {
      id: 'w_04',
      title: 'Gear Setup Helper — Warehouse Studio',
      category: 'Helper',
      amount_cents: 6000, // $60.00
      date_str: 'Last week',
      type: 'gig_payout',
      status: 'available',
      note: 'Tipped $5 extra for great attitude!',
    },
  ];

  for (const w of walletItems) {
    walletStmt.run(w.id, mainAccountId, w.title, w.category, w.amount_cents, w.date_str, w.type, w.status, w.note, new Date().toISOString());
  }

  // Seed Peer Chats & $5 Advice Calls
  const chatStmt = handle.prepare(`
    INSERT INTO peer_chats (
      id, account_id, peer_id, peer_name, peer_avatar, peer_role,
      last_message, last_message_time, unread_count, is_advice_call, advice_topic, advice_price_cents, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const chats = [
    {
      id: 'chat_01',
      peer_id: 'acc_poster_leo',
      peer_name: 'Leo Alvarez',
      peer_avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      peer_role: 'Indie Film Director',
      last_message: 'See you at 2:30 PM! The diner entrance is right behind the vintage blue sign.',
      last_message_time: '12m ago',
      unread_count: 1,
      is_advice_call: 0,
      advice_topic: null,
      advice_price_cents: null,
    },
    {
      id: 'chat_advice_marcus',
      peer_id: 'acc_poster_marcus',
      peer_name: 'Marcus Diallo',
      peer_avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      peer_role: 'Lighting Tech / DP',
      last_message: 'Always wear non-reflective clothes and bring a portable phone charger. You will do great!',
      last_message_time: '2h ago',
      unread_count: 0,
      is_advice_call: 1,
      advice_topic: '$5 Quick Tip: First Day on Film Set Etiquette',
      advice_price_cents: 500,
    },
    {
      id: 'chat_02',
      peer_id: 'acc_poster_boba',
      peer_name: 'Elena @ Mochi Milk Bar',
      peer_avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
      peer_role: 'Café Owner',
      last_message: 'Your video story looked awesome, thank you so much! Payment is sent.',
      last_message_time: 'Yesterday',
      unread_count: 0,
      is_advice_call: 0,
      advice_topic: null,
      advice_price_cents: null,
    },
  ];

  for (const c of chats) {
    chatStmt.run(
      c.id, mainAccountId, c.peer_id, c.peer_name, c.peer_avatar, c.peer_role,
      c.last_message, c.last_message_time, c.unread_count, c.is_advice_call, c.advice_topic, c.advice_price_cents,
      new Date().toISOString()
    );
  }

  // Seed sample messages for chat_advice_marcus
  const msgStmt = handle.prepare(`
    INSERT INTO chat_messages (id, chat_id, sender_id, sender_name, text, timestamp, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  msgStmt.run(
    'm_01', 'chat_advice_marcus', mainAccountId, 'You',
    'Hey Marcus! I just booked my first extra gig today. Any tips so I don\'t make any rookie mistakes?',
    '2:15 PM', new Date().toISOString()
  );
  msgStmt.run(
    'm_02', 'chat_advice_marcus', 'acc_poster_marcus', 'Marcus Diallo',
    'Congrats! Three quick golden rules: 1. Keep phone on silent always. 2. Never look directly into the camera lens unless told. 3. Wear comfortable shoes and bring a water bottle. Have fun with it!',
    '2:18 PM', new Date().toISOString()
  );
  msgStmt.run(
    'm_03', 'chat_advice_marcus', 'acc_poster_marcus', 'Marcus Diallo',
    'Always wear non-reflective clothes and bring a portable phone charger. You will do great!',
    '2:20 PM', new Date().toISOString()
  );
}

/* ------------------------------------------------------------------ */

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('db/seed.ts');
if (invokedDirectly) {
  const result = seed(true);
  console.log(`seeded ${result.profiles} talent profiles across ${result.projects} projects`);
  closeDb();
}
