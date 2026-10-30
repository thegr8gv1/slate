import { BEACON, SLO } from '../contracts/index.js';
import type { Beacon, BeaconCandidate, GeoPlace, Sector } from '../contracts/index.js';
import { db, get, run, tx } from '../db/index.js';
import { hydrateProfile, profileById, projectById, type ProfileRow } from '../db/repo.js';
import { haversineMiles, planProximity } from '../lib/geo.js';
import { newId } from '../lib/ids.js';
import { notify, notifyMany } from './notifications.js';

/**
 * Set-Beacon: emergency crew replacement.
 *
 * Dispatch is a spatial-index scan (k-ring over hex cells) followed by an exact
 * haversine filter, then a single high-priority fan-out. Claiming is a
 * compare-and-set on the beacon row inside an IMMEDIATE transaction, which is
 * the single-node equivalent of the Redlock/optimistic-concurrency claim in the
 * distributed design: exactly one caller can win, everyone else is told the
 * role is filled.
 */

export class BeaconError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BeaconError';
  }
}

export interface CreateBeaconInput {
  projectId: string;
  issuedByAccountId: string;
  role: string;
  sector: Sector;
  notes?: string;
  radiusMiles?: number;
  callTime: string;
  baseRateCents: number;
  rateMultiplier?: number;
  origin?: { lat: number; lng: number; label: string };
}

export interface DispatchReport {
  beacon: Beacon;
  candidates: BeaconCandidate[];
  devicesTargeted: number;
  cellsQueried: number;
  fanoutMs: number;
  withinSlo: boolean;
}

export function dispatchBeacon(input: CreateBeaconInput): DispatchReport {
  const project = projectById(input.projectId);
  if (!project) throw new BeaconError('NO_PROJECT', 'Unknown project');

  const radiusMiles = Math.min(input.radiusMiles ?? BEACON.defaultRadiusMiles, BEACON.maxRadiusMiles);
  const multiplier = input.rateMultiplier ?? BEACON.defaultRateMultiplier;
  const origin: GeoPlace = input.origin
    ? {
        lat: input.origin.lat,
        lng: input.origin.lng,
        label: input.origin.label,
        region: project.location.region,
        cell: project.location.cell,
      }
    : project.location;

  const started = performance.now();

  /* ---- Spatial candidate generation ---- */
  const plan = planProximity(origin, radiusMiles, BEACON.spatialResolution);

  const rows = (
    plan.strategy === 'cells'
      ? db()
          .prepare(
            `SELECT * FROM talent_profiles
              WHERE sector = ? AND suppressed = 0
                AND cell IN (${plan.cells.map(() => '?').join(',')})`,
          )
          .all(input.sector, ...plan.cells)
      : db()
          .prepare(
            `SELECT * FROM talent_profiles
              WHERE sector = ? AND suppressed = 0
                AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
          )
          .all(input.sector, plan.bbox.minLat, plan.bbox.maxLat, plan.bbox.minLng, plan.bbox.maxLng)
  ) as unknown as ProfileRow[];

  /* ---- Exact filter + eligibility ---- */
  const candidates: BeaconCandidate[] = [];
  for (const row of rows) {
    const profile = hydrateProfile(row);
    if (profile.accountId === input.issuedByAccountId) continue;
    if (!matchesRole(profile.primaryRole, profile.specialties, input.role)) continue;
    const distanceMiles = haversineMiles(origin, profile.location);
    if (distanceMiles > radiusMiles) continue;

    candidates.push({
      profileId: profile.id,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      role: profile.primaryRole,
      rating: profile.rating,
      distanceMiles: Math.round(distanceMiles * 10) / 10,
      // Response score is a percentile; invert it into a plausible ETA.
      respondsInMinutes: Math.max(2, Math.round((100 - profile.responseScore) / 3)),
    });
  }
  candidates.sort((a, b) => a.distanceMiles - b.distanceMiles || b.rating - a.rating);

  const payoutCents = Math.round(input.baseRateCents * multiplier);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + BEACON.ttlMinutes * 60_000);

  const beacon: Beacon = {
    id: newId('bcn'),
    projectId: project.id,
    issuedByAccountId: input.issuedByAccountId,
    role: input.role,
    sector: input.sector,
    notes: input.notes ?? '',
    origin,
    radiusMiles,
    callTime: input.callTime,
    baseRateCents: input.baseRateCents,
    rateMultiplier: multiplier,
    payoutCents,
    state: 'broadcasting',
    claimedByProfileId: null,
    claimedAt: null,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    devicesTargeted: candidates.length,
    fanoutMs: 0,
    cellsQueried: plan.cellsConsidered,
  };

  persist(beacon);

  /* ---- High-priority fan-out ---- */
  const accountIds = candidates
    .map((c) => profileById(c.profileId)?.accountId)
    .filter((id): id is string => Boolean(id));

  notifyMany(accountIds, {
    kind: 'beacon',
    title: `${input.role.toUpperCase()} NEEDED — ${hoursUntil(input.callTime)}`,
    body: `${origin.label} · ${formatRate(payoutCents)} emergency rate · first to confirm books it`,
    deepLink: `/talent/beacon/${beacon.id}`,
    priority: 'critical',
  });

  const fanoutMs = Math.round(performance.now() - started);
  const dispatched: Beacon = { ...beacon, fanoutMs };
  persist(dispatched);

  return {
    beacon: dispatched,
    candidates: candidates.slice(0, 24),
    devicesTargeted: candidates.length,
    cellsQueried: plan.cellsConsidered,
    fanoutMs,
    withinSlo: fanoutMs <= SLO.beaconFanoutMs,
  };
}

/**
 * Atomic claim. The UPDATE ... WHERE state = 'broadcasting' is the
 * compare-and-set: SQLite serialises it, so exactly one concurrent caller sees
 * a changed row.
 */
export interface ClaimResult {
  claimed: boolean;
  beacon: Beacon;
  reason?: 'already_claimed' | 'expired' | 'out_of_range' | 'not_eligible';
}

export function claimBeacon(beaconId: string, profileId: string): ClaimResult {
  const profile = profileById(profileId);
  if (!profile) throw new BeaconError('NO_PROFILE', 'Unknown profile');

  return tx(() => {
    const current = loadRow(beaconId);
    if (current.state !== 'broadcasting') {
      return { claimed: false, beacon: current, reason: 'already_claimed' as const };
    }
    if (Date.parse(current.expiresAt) < Date.now()) {
      const expired = { ...current, state: 'expired' as const };
      persist(expired);
      return { claimed: false, beacon: expired, reason: 'expired' as const };
    }
    const distance = haversineMiles(current.origin, profile.location);
    if (distance > current.radiusMiles) {
      return { claimed: false, beacon: current, reason: 'out_of_range' as const };
    }
    if (!matchesRole(profile.primaryRole, profile.specialties, current.role)) {
      return { claimed: false, beacon: current, reason: 'not_eligible' as const };
    }

    const lock = newId('lck');
    run(
      `UPDATE beacons
          SET state = 'claimed', claimed_by_profile_id = ?, claim_lock = ?
        WHERE id = ? AND state = 'broadcasting' AND claim_lock IS NULL`,
      profileId,
      lock,
      beaconId,
    );

    const confirmed = get<{ claim_lock: string | null; claimed_by_profile_id: string | null }>(
      'SELECT claim_lock, claimed_by_profile_id FROM beacons WHERE id = ?',
      beaconId,
    );
    if (confirmed?.claim_lock !== lock) {
      // Another device won the race between our read and our write.
      return { claimed: false, beacon: loadRow(beaconId), reason: 'already_claimed' as const };
    }

    const claimed: Beacon = {
      ...current,
      state: 'claimed',
      claimedByProfileId: profileId,
      claimedAt: new Date().toISOString(),
    };
    persist(claimed, lock);

    notify(profile.accountId, {
      kind: 'beacon',
      title: 'Beacon claimed — you booked it',
      body: `${claimed.role} · call ${new Date(claimed.callTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · ${formatRate(claimed.payoutCents)}`,
      deepLink: `/talent/beacon/${claimed.id}`,
      priority: 'critical',
    });
    notify(claimed.issuedByAccountId, {
      kind: 'beacon',
      title: 'Beacon filled',
      body: `${profile.displayName} confirmed for ${claimed.role}. Contract generated and routed.`,
      deepLink: `/production/beacon/${claimed.id}`,
      priority: 'high',
    });

    return { claimed: true, beacon: claimed };
  });
}

export function expireStaleBeacons(): number {
  const nowIso = new Date().toISOString();
  const stale = db()
    .prepare(`SELECT id, data FROM beacons WHERE state = 'broadcasting' AND expires_at <= ?`)
    .all(nowIso) as unknown as { id: string; data: string }[];
  for (const row of stale) {
    const beacon = JSON.parse(row.data) as Beacon;
    persist({ ...beacon, state: 'expired' });
  }
  return stale.length;
}

/* ------------------------------------------------------------------ */

function matchesRole(primaryRole: string, specialties: string[], wanted: string): boolean {
  const target = wanted.toLowerCase();
  if (primaryRole.toLowerCase() === target) return true;
  if (specialties.some((s) => s.toLowerCase() === target)) return true;
  // Tolerate qualifier drift: "Gaffer" should match "Key Gaffer".
  return primaryRole.toLowerCase().includes(target) || target.includes(primaryRole.toLowerCase());
}

function persist(beacon: Beacon, claimLock?: string): void {
  const exists = get<{ id: string }>('SELECT id FROM beacons WHERE id = ?', beacon.id);
  if (exists) {
    run(
      `UPDATE beacons SET state = ?, claimed_by_profile_id = ?, data = ?${claimLock ? ', claim_lock = ?' : ''}
        WHERE id = ?`,
      ...([
        beacon.state,
        beacon.claimedByProfileId,
        JSON.stringify(beacon),
        ...(claimLock ? [claimLock] : []),
        beacon.id,
      ] as unknown[]),
    );
  } else {
    run(
      `INSERT INTO beacons (id, project_id, issued_by_account_id, role, sector, lat, lng, cell, radius_miles, state, claimed_by_profile_id, claim_lock, expires_at, data, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      beacon.id,
      beacon.projectId,
      beacon.issuedByAccountId,
      beacon.role,
      beacon.sector,
      beacon.origin.lat,
      beacon.origin.lng,
      beacon.origin.cell,
      beacon.radiusMiles,
      beacon.state,
      beacon.claimedByProfileId,
      beacon.expiresAt,
      JSON.stringify(beacon),
      beacon.createdAt,
    );
  }
}

function loadRow(beaconId: string): Beacon {
  const row = get<{ data: string }>('SELECT data FROM beacons WHERE id = ?', beaconId);
  if (!row) throw new BeaconError('NOT_FOUND', 'Unknown beacon');
  return JSON.parse(row.data) as Beacon;
}

function hoursUntil(iso: string): string {
  const hours = (Date.parse(iso) - Date.now()) / 3600_000;
  if (Number.isNaN(hours)) return 'ASAP';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} MIN`;
  return `${Math.round(hours)} HRS`;
}

function formatRate(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}/day`;
}
