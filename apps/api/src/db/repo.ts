import { all, get, parseJson } from './index.js';
import type {
  Account,
  Agreement,
  Beacon,
  Campaign,
  CollabNote,
  CollabRoom,
  EscrowAgreement,
  GearListing,
  LiveEvent,
  AppNotification,
  Opportunity,
  Pitch,
  Project,
  SelfTape,
  SideScript,
  TalentProfile,
  Workspace,
} from '../contracts/index.js';

/**
 * Hydration layer. Every table stores its queryable scalars as real columns and
 * the remaining shape in a `data` JSON document — the same denormalised read
 * model the production Scylla tier would materialise.
 */

interface AccountRow {
  id: string;
  email: string;
  display_name: string;
  role: string;
  workspaces: string;
  plan: string;
  avatar_url: string | null;
  pitch_allowance: number | null;
  agency_id: string | null;
  created_at: string;
}

export function hydrateAccount(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as Account['role'],
    workspaces: row.workspaces.split(',').filter(Boolean) as Workspace[],
    plan: row.plan as Account['plan'],
    avatarUrl: row.avatar_url,
    pitchAllowance: row.pitch_allowance,
    createdAt: row.created_at,
  };
}

export function accountById(id: string): Account | null {
  const row = get<AccountRow>('SELECT * FROM accounts WHERE id = ?', id);
  return row ? hydrateAccount(row) : null;
}

export function accountByEmail(email: string): (AccountRow & { password_hash: string }) | undefined {
  return get<AccountRow & { password_hash: string }>(
    'SELECT * FROM accounts WHERE lower(email) = lower(?)',
    email,
  );
}

export function agencyIdForAccount(accountId: string): string | null {
  const row = get<{ agency_id: string | null }>('SELECT agency_id FROM accounts WHERE id = ?', accountId);
  return row?.agency_id ?? null;
}

/* ------------------------------------------------------------------ */

export interface ProfileRow {
  id: string;
  account_id: string;
  display_name: string;
  sector: string;
  primary_role: string;
  union_status: string;
  day_rate_cents: number;
  age: number | null;
  lat: number;
  lng: number;
  cell: string;
  rating: number;
  response_score: number;
  fraud_score: number;
  followers: number;
  discreet_enabled: number;
  budget_floor_cents: number;
  agency_id: string | null;
  suppressed: number;
  embedding: string;
  data: string;
}

export function hydrateProfile(row: ProfileRow): TalentProfile {
  const data = parseJson<Partial<TalentProfile>>(row.data, {});
  return {
    id: row.id,
    accountId: row.account_id,
    displayName: row.display_name,
    legalName: data.legalName ?? null,
    headline: data.headline ?? '',
    sector: row.sector as TalentProfile['sector'],
    primaryRole: row.primary_role,
    specialties: data.specialties ?? [],
    age: row.age,
    pronouns: data.pronouns ?? 'they/them',
    unionStatus: row.union_status as TalentProfile['unionStatus'],
    dayRateCents: row.day_rate_cents,
    dayRateBand: data.dayRateBand ?? '',
    location: data.location ?? { lat: row.lat, lng: row.lng, cell: row.cell, label: '', region: '' },
    travelRadiusMiles: data.travelRadiusMiles ?? 25,
    avatarUrl: data.avatarUrl ?? '',
    reelUrl: data.reelUrl ?? null,
    reelPosterUrl: data.reelPosterUrl ?? null,
    audioSampleUrl: data.audioSampleUrl ?? null,
    portfolio: data.portfolio ?? [],
    credits: data.credits ?? [],
    socials: data.socials ?? [],
    badges: data.badges ?? [],
    discreet: data.discreet ?? {
      enabled: row.discreet_enabled === 1,
      budgetFloorCents: row.budget_floor_cents,
      publicMask: '',
      requireTier1Studio: false,
    },
    routing: data.routing ?? {
      commercial: null,
      film: null,
      musical: null,
      theatrical: null,
      requireNdaBeforeContact: false,
      redactMetricsUntilNda: false,
    },
    agencyId: row.agency_id,
    responseScore: row.response_score,
    rating: row.rating,
    bookingsCompleted: data.bookingsCompleted ?? 0,
    availableFrom: data.availableFrom ?? null,
    masked: false,
  };
}

export function profileById(id: string): TalentProfile | null {
  const row = get<ProfileRow>('SELECT * FROM talent_profiles WHERE id = ?', id);
  return row ? hydrateProfile(row) : null;
}

export function profileByAccount(accountId: string): TalentProfile | null {
  const row = get<ProfileRow>('SELECT * FROM talent_profiles WHERE account_id = ?', accountId);
  return row ? hydrateProfile(row) : null;
}

export function profilesByIds(ids: string[]): TalentProfile[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return all<ProfileRow>(`SELECT * FROM talent_profiles WHERE id IN (${placeholders})`, ...ids).map(
    hydrateProfile,
  );
}

/* ------------------------------------------------------------------ */

interface ProjectRow {
  id: string;
  owner_account_id: string;
  title: string;
  status: string;
  lat: number;
  lng: number;
  cell: string;
  budget_cents: number;
  union_status: string;
  data: string;
  created_at: string;
}

export function hydrateProject(row: ProjectRow): Project {
  const data = parseJson<Partial<Project>>(row.data, {});
  return {
    id: row.id,
    ownerAccountId: row.owner_account_id,
    title: row.title,
    productionCompany: data.productionCompany ?? '',
    kind: data.kind ?? 'feature',
    status: row.status as Project['status'],
    synopsis: data.synopsis ?? '',
    location: data.location ?? { lat: row.lat, lng: row.lng, cell: row.cell, label: '', region: '' },
    shootStart: data.shootStart ?? '',
    shootEnd: data.shootEnd ?? '',
    budgetCents: row.budget_cents,
    unionStatus: row.union_status as Project['unionStatus'],
    coverUrl: data.coverUrl ?? '',
    createdAt: row.created_at,
  };
}

export function projectById(id: string): Project | null {
  const row = get<ProjectRow>('SELECT * FROM projects WHERE id = ?', id);
  return row ? hydrateProject(row) : null;
}

/**
 * Ordered by how live the project is, not by when it was created — a producer
 * opening the app is almost always working the show that is on the floor today.
 */
export function projectsForOwner(accountId: string): Project[] {
  return all<ProjectRow>(
    `SELECT * FROM projects WHERE owner_account_id = ?
      ORDER BY CASE status
        WHEN 'shooting'       THEN 0
        WHEN 'casting'        THEN 1
        WHEN 'pre_production' THEN 2
        WHEN 'post'           THEN 3
        WHEN 'development'    THEN 4
        ELSE 5
      END, created_at DESC`,
    accountId,
  ).map(hydrateProject);
}

/* ------------------------------------------------------------------ */

interface OpportunityRow {
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

export function hydrateOpportunity(row: OpportunityRow): Opportunity {
  const data = parseJson<Partial<Opportunity>>(row.data, {});
  return {
    id: row.id,
    projectId: row.project_id,
    project: data.project ?? {
      title: '',
      productionCompany: '',
      kind: 'feature',
      coverUrl: '',
      location: { lat: 0, lng: 0, cell: '', label: '', region: '' },
      unionStatus: 'non_union',
    },
    role: row.role,
    sector: row.sector as Opportunity['sector'],
    roleDescription: data.roleDescription ?? '',
    rateCents: row.rate_cents,
    rateUnit: data.rateUnit ?? 'day',
    shootDates: data.shootDates ?? '',
    slots: data.slots ?? 1,
    slotsFilled: data.slotsFilled ?? 0,
    sponsored: row.sponsored === 1,
    sideScriptId: row.side_script_id,
    createdAt: row.created_at,
  };
}

export function opportunityById(id: string): Opportunity | null {
  const row = get<OpportunityRow>('SELECT * FROM opportunities WHERE id = ?', id);
  return row ? hydrateOpportunity(row) : null;
}

export function opportunitiesForProject(projectId: string): Opportunity[] {
  return all<OpportunityRow>('SELECT * FROM opportunities WHERE project_id = ?', projectId).map(
    hydrateOpportunity,
  );
}

/* ------------------------------------------------------------------ */

interface JsonRow {
  id: string;
  data: string;
}

function hydrateJson<T>(row: JsonRow | undefined): T | null {
  return row ? (parseJson<T>(row.data, {} as T) as T) : null;
}

export function agreementById(id: string): Agreement | null {
  return hydrateJson<Agreement>(get<JsonRow>('SELECT id, data FROM agreements WHERE id = ?', id));
}

export function agreementsForAccount(accountId: string): Agreement[] {
  return all<JsonRow>(
    `SELECT id, data FROM agreements
      WHERE counterparty_account_id = ? OR issuer_account_id = ?
      ORDER BY created_at DESC`,
    accountId,
    accountId,
  ).map((r) => parseJson<Agreement>(r.data, {} as Agreement));
}

export function escrowById(id: string): EscrowAgreement | null {
  return hydrateJson<EscrowAgreement>(get<JsonRow>('SELECT id, data FROM escrows WHERE id = ?', id));
}

export function escrowsForProject(projectId: string): EscrowAgreement[] {
  return all<JsonRow>('SELECT id, data FROM escrows WHERE project_id = ? ORDER BY created_at DESC', projectId)
    .map((r) => parseJson<EscrowAgreement>(r.data, {} as EscrowAgreement));
}

export function escrowsForPayer(accountId: string): EscrowAgreement[] {
  return all<JsonRow>(
    'SELECT id, data FROM escrows WHERE payer_account_id = ? ORDER BY created_at DESC',
    accountId,
  ).map((r) => parseJson<EscrowAgreement>(r.data, {} as EscrowAgreement));
}

/** Profile ids an agency represents. */
export function rosterProfileIds(agencyAccountId: string): string[] {
  return all<{ id: string }>('SELECT id FROM talent_profiles WHERE agency_id = ?', agencyAccountId).map(
    (r) => r.id,
  );
}

/** Account ids an agency represents — the counterparty side of an agreement. */
export function rosterAccountIds(agencyAccountId: string): string[] {
  return all<{ account_id: string }>(
    'SELECT account_id FROM talent_profiles WHERE agency_id = ?',
    agencyAccountId,
  ).map((r) => r.account_id);
}

/**
 * Every escrow across an agency's roster. An agency is not the payer or the
 * payee on these, but it is a split party on all of them, so settlement has to
 * be visible to it.
 */
export function escrowsForRoster(agencyAccountId: string): EscrowAgreement[] {
  const ids = rosterProfileIds(agencyAccountId);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return all<JsonRow>(
    `SELECT id, data FROM escrows WHERE talent_profile_id IN (${placeholders}) ORDER BY created_at DESC`,
    ...ids,
  ).map((r) => parseJson<EscrowAgreement>(r.data, {} as EscrowAgreement));
}

/** Agreements naming an agency's roster talent on either side. */
export function agreementsForRoster(agencyAccountId: string): Agreement[] {
  const ids = rosterAccountIds(agencyAccountId);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(',');
  return all<JsonRow>(
    `SELECT id, data FROM agreements
      WHERE counterparty_account_id IN (${placeholders}) OR issuer_account_id IN (${placeholders})
      ORDER BY created_at DESC`,
    ...ids,
    ...ids,
  ).map((r) => parseJson<Agreement>(r.data, {} as Agreement));
}

export function escrowsForProfile(profileId: string): EscrowAgreement[] {
  return all<JsonRow>(
    'SELECT id, data FROM escrows WHERE talent_profile_id = ? ORDER BY created_at DESC',
    profileId,
  ).map((r) => parseJson<EscrowAgreement>(r.data, {} as EscrowAgreement));
}

export function beaconById(id: string): Beacon | null {
  return hydrateJson<Beacon>(get<JsonRow>('SELECT id, data FROM beacons WHERE id = ?', id));
}

export function activeBeacons(): Beacon[] {
  return all<JsonRow>(
    `SELECT id, data FROM beacons WHERE state = 'broadcasting' AND expires_at > ? ORDER BY created_at DESC`,
    new Date().toISOString(),
  ).map((r) => parseJson<Beacon>(r.data, {} as Beacon));
}

export function beaconsForProject(projectId: string): Beacon[] {
  return all<JsonRow>('SELECT id, data FROM beacons WHERE project_id = ? ORDER BY created_at DESC', projectId)
    .map((r) => parseJson<Beacon>(r.data, {} as Beacon));
}

export function pitchesForInbox(accountId: string): Pitch[] {
  return all<JsonRow>(
    `SELECT id, data FROM pitches WHERE to_account_id = ?
      ORDER BY queue_rank ASC, created_at DESC LIMIT 60`,
    accountId,
  ).map((r) => parseJson<Pitch>(r.data, {} as Pitch));
}

export function sideScriptById(id: string): SideScript | null {
  return hydrateJson<SideScript>(get<JsonRow>('SELECT id, data FROM side_scripts WHERE id = ?', id));
}

export function sideScriptsForProject(projectId: string): SideScript[] {
  return all<JsonRow>('SELECT id, data FROM side_scripts WHERE project_id = ?', projectId).map((r) =>
    parseJson<SideScript>(r.data, {} as SideScript),
  );
}

export function takesForSide(sideScriptId: string, profileId?: string): SelfTape[] {
  const rows = profileId
    ? all<JsonRow>(
        'SELECT id, data FROM self_tapes WHERE side_script_id = ? AND talent_profile_id = ? ORDER BY take_number',
        sideScriptId,
        profileId,
      )
    : all<JsonRow>('SELECT id, data FROM self_tapes WHERE side_script_id = ? ORDER BY take_number', sideScriptId);
  return rows.map((r) => parseJson<SelfTape>(r.data, {} as SelfTape));
}

export function campaignById(id: string): Campaign | null {
  return hydrateJson<Campaign>(get<JsonRow>('SELECT id, data FROM campaigns WHERE id = ?', id));
}

export function campaignsForBrand(accountId: string): Campaign[] {
  return all<JsonRow>(
    'SELECT id, data FROM campaigns WHERE brand_account_id = ? ORDER BY created_at DESC',
    accountId,
  ).map((r) => parseJson<Campaign>(r.data, {} as Campaign));
}

export function collabRooms(): CollabRoom[] {
  return all<JsonRow>('SELECT id, data FROM collab_rooms').map((r) =>
    parseJson<CollabRoom>(r.data, {} as CollabRoom),
  );
}

export function collabRoomById(id: string): CollabRoom | null {
  return hydrateJson<CollabRoom>(get<JsonRow>('SELECT id, data FROM collab_rooms WHERE id = ?', id));
}

export function collabNotes(roomId: string): CollabNote[] {
  return all<JsonRow>(
    'SELECT id, data FROM collab_notes WHERE room_id = ? ORDER BY timecode_seconds ASC',
    roomId,
  ).map((r) => parseJson<CollabNote>(r.data, {} as CollabNote));
}

export function gearListings(): GearListing[] {
  return all<JsonRow>('SELECT id, data FROM gear').map((r) =>
    parseJson<GearListing>(r.data, {} as GearListing),
  );
}

export function liveEvents(): LiveEvent[] {
  return all<JsonRow>('SELECT id, data FROM live_events ORDER BY starts_at ASC').map((r) =>
    parseJson<LiveEvent>(r.data, {} as LiveEvent),
  );
}

export function notificationsForAccount(accountId: string, limit = 40): AppNotification[] {
  return all<JsonRow>(
    'SELECT id, data FROM notifications WHERE account_id = ? ORDER BY created_at DESC LIMIT ?',
    accountId,
    limit,
  ).map((r) => parseJson<AppNotification>(r.data, {} as AppNotification));
}
