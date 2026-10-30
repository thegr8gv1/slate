import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/**
 * Single-node stand-in for the storage tier described in the architecture:
 * the relational/ACID half (PostgreSQL — contracts, identity, ledger) and the
 * high-volume half (ScyllaDB — swipes, feed state) collapsed into one embedded
 * engine. Every table below carries the indexes the production split would
 * need, so the query shapes port over unchanged.
 */

const DB_PATH = resolve(process.env.SLATE_DB_PATH ?? './data/slate.db');

let handle: DatabaseSync | null = null;

export function db(): DatabaseSync {
  if (handle) return handle;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  handle = new DatabaseSync(DB_PATH);
  handle.exec('PRAGMA journal_mode = WAL');
  handle.exec('PRAGMA foreign_keys = ON');
  handle.exec('PRAGMA busy_timeout = 5000');
  migrate(handle);
  return handle;
}

export function closeDb(): void {
  handle?.close();
  handle = null;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  display_name    TEXT NOT NULL,
  role            TEXT NOT NULL,
  workspaces      TEXT NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'free',
  avatar_url      TEXT,
  pitch_allowance INTEGER,
  agency_id       TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS talent_profiles (
  id                 TEXT PRIMARY KEY,
  account_id         TEXT NOT NULL REFERENCES accounts(id),
  display_name       TEXT NOT NULL,
  sector             TEXT NOT NULL,
  primary_role       TEXT NOT NULL,
  union_status       TEXT NOT NULL,
  day_rate_cents     INTEGER NOT NULL,
  age                INTEGER,
  lat                REAL NOT NULL,
  lng                REAL NOT NULL,
  cell               TEXT NOT NULL,
  rating             REAL NOT NULL DEFAULT 0,
  response_score     INTEGER NOT NULL DEFAULT 0,
  fraud_score        REAL NOT NULL DEFAULT 0,
  followers          INTEGER NOT NULL DEFAULT 0,
  discreet_enabled   INTEGER NOT NULL DEFAULT 0,
  budget_floor_cents INTEGER NOT NULL DEFAULT 0,
  agency_id          TEXT,
  suppressed         INTEGER NOT NULL DEFAULT 0,
  embedding          TEXT NOT NULL,
  data               TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_profiles_sector ON talent_profiles(sector, union_status, day_rate_cents);
CREATE INDEX IF NOT EXISTS idx_profiles_cell   ON talent_profiles(cell);
CREATE INDEX IF NOT EXISTS idx_profiles_agency ON talent_profiles(agency_id);

CREATE TABLE IF NOT EXISTS projects (
  id               TEXT PRIMARY KEY,
  owner_account_id TEXT NOT NULL REFERENCES accounts(id),
  title            TEXT NOT NULL,
  status           TEXT NOT NULL,
  lat              REAL NOT NULL,
  lng              REAL NOT NULL,
  cell             TEXT NOT NULL,
  budget_cents     INTEGER NOT NULL,
  union_status     TEXT NOT NULL,
  data             TEXT NOT NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_account_id);

CREATE TABLE IF NOT EXISTS opportunities (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL REFERENCES projects(id),
  role           TEXT NOT NULL,
  sector         TEXT NOT NULL,
  rate_cents     INTEGER NOT NULL,
  sponsored      INTEGER NOT NULL DEFAULT 0,
  side_script_id TEXT,
  embedding      TEXT NOT NULL,
  data           TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_opps_sector ON opportunities(sector, rate_cents);

CREATE TABLE IF NOT EXISTS swipes (
  id               TEXT PRIMARY KEY,
  actor_account_id TEXT NOT NULL,
  subject_kind     TEXT NOT NULL,
  subject_id       TEXT NOT NULL,
  direction        TEXT NOT NULL,
  project_id       TEXT,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_swipes_actor ON swipes(actor_account_id, subject_kind, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_swipes_unique ON swipes(actor_account_id, subject_id, project_id);

CREATE TABLE IF NOT EXISTS matches (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL,
  talent_profile_id TEXT NOT NULL,
  opportunity_id    TEXT,
  state             TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  last_activity_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_matches_pair ON matches(project_id, talent_profile_id);

CREATE TABLE IF NOT EXISTS pitches (
  id              TEXT PRIMARY KEY,
  from_account_id TEXT NOT NULL,
  to_account_id   TEXT NOT NULL,
  project_id      TEXT,
  opportunity_id  TEXT,
  super_tier      TEXT,
  queue_rank      INTEGER NOT NULL DEFAULT 9,
  outcome         TEXT NOT NULL DEFAULT 'pending',
  data            TEXT NOT NULL,
  created_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pitches_inbox ON pitches(to_account_id, queue_rank, created_at);

CREATE TABLE IF NOT EXISTS beacons (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL,
  issued_by_account_id  TEXT NOT NULL,
  role                  TEXT NOT NULL,
  sector                TEXT NOT NULL,
  lat                   REAL NOT NULL,
  lng                   REAL NOT NULL,
  cell                  TEXT NOT NULL,
  radius_miles          REAL NOT NULL,
  state                 TEXT NOT NULL,
  claimed_by_profile_id TEXT,
  claim_lock            TEXT,
  expires_at            TEXT NOT NULL,
  data                  TEXT NOT NULL,
  created_at            TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_beacons_state ON beacons(state, expires_at);

CREATE TABLE IF NOT EXISTS agreements (
  id                       TEXT PRIMARY KEY,
  kind                     TEXT NOT NULL,
  title                    TEXT NOT NULL,
  project_id               TEXT,
  counterparty_account_id  TEXT NOT NULL,
  issuer_account_id        TEXT NOT NULL,
  state                    TEXT NOT NULL,
  data                     TEXT NOT NULL,
  created_at               TEXT NOT NULL,
  executed_at              TEXT
);
CREATE INDEX IF NOT EXISTS idx_agreements_party ON agreements(counterparty_account_id, state);

CREATE TABLE IF NOT EXISTS escrows (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL,
  talent_profile_id TEXT NOT NULL,
  payer_account_id  TEXT NOT NULL,
  state             TEXT NOT NULL,
  gross_cents       INTEGER NOT NULL,
  funded_cents      INTEGER NOT NULL DEFAULT 0,
  released_cents    INTEGER NOT NULL DEFAULT 0,
  data              TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_escrows_payer  ON escrows(payer_account_id, state);
CREATE INDEX IF NOT EXISTS idx_escrows_talent ON escrows(talent_profile_id, state);

-- Append-only. There is no UPDATE or DELETE path to this table anywhere in the
-- service; corrections are booked as compensating entries.
CREATE TABLE IF NOT EXISTS ledger (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,
  id             TEXT NOT NULL UNIQUE,
  escrow_id      TEXT,
  transfer_id    TEXT NOT NULL,
  debit_account  TEXT NOT NULL,
  credit_account TEXT NOT NULL,
  amount_cents   INTEGER NOT NULL CHECK (amount_cents > 0),
  currency       TEXT NOT NULL DEFAULT 'USD',
  reason         TEXT NOT NULL,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_escrow   ON ledger(escrow_id, seq);
CREATE INDEX IF NOT EXISTS idx_ledger_transfer ON ledger(transfer_id);

CREATE TABLE IF NOT EXISTS side_scripts (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS self_tapes (
  id                TEXT PRIMARY KEY,
  side_script_id    TEXT NOT NULL,
  project_id        TEXT NOT NULL,
  talent_profile_id TEXT NOT NULL,
  take_number       INTEGER NOT NULL,
  status            TEXT NOT NULL,
  data              TEXT NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tapes_side ON self_tapes(side_script_id, take_number);

CREATE TABLE IF NOT EXISTS campaigns (
  id               TEXT PRIMARY KEY,
  brand_account_id TEXT NOT NULL,
  state            TEXT NOT NULL,
  step             INTEGER NOT NULL DEFAULT 1,
  data             TEXT NOT NULL,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collab_rooms (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  department TEXT NOT NULL,
  data       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collab_notes (
  id                TEXT PRIMARY KEY,
  room_id           TEXT NOT NULL,
  timecode_seconds  REAL NOT NULL,
  data              TEXT NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_room ON collab_notes(room_id, timecode_seconds);

CREATE TABLE IF NOT EXISTS gear (
  id               TEXT PRIMARY KEY,
  owner_profile_id TEXT NOT NULL,
  category         TEXT NOT NULL,
  day_rate_cents   INTEGER NOT NULL,
  lat              REAL NOT NULL,
  lng              REAL NOT NULL,
  cell             TEXT NOT NULL,
  data             TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS live_events (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  starts_at  TEXT NOT NULL,
  lat        REAL NOT NULL,
  lng        REAL NOT NULL,
  cell       TEXT NOT NULL,
  data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_cell ON live_events(cell, starts_at);

CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  kind       TEXT NOT NULL,
  priority   TEXT NOT NULL DEFAULT 'normal',
  read_at    TEXT,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_account ON notifications(account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS social_audits (
  id         TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  verdict    TEXT NOT NULL,
  score      REAL NOT NULL,
  data       TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audits_profile ON social_audits(profile_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function migrate(handle: DatabaseSync): void {
  handle.exec(SCHEMA);
}

/* ------------------------------------------------------------------ */
/* Typed helpers                                                       */
/* ------------------------------------------------------------------ */

export type Row = Record<string, string | number | bigint | null | Uint8Array>;

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return db().prepare(sql).all(...(params as never[])) as T[];
}

export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  return db().prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]): void {
  db().prepare(sql).run(...(params as never[]));
}

let txDepth = 0;

/**
 * Wraps a unit of work in a transaction; rolls back on any throw.
 *
 * Re-entrant: domain services compose freely (an escrow transition calls into
 * the ledger, which opens its own transaction), so nested calls become
 * SAVEPOINTs and only the outermost frame commits. A failure at any depth
 * unwinds to that frame's savepoint and rethrows, so a partially applied
 * transfer can never survive.
 */
export function tx<T>(fn: () => T): T {
  const handle = db();
  const depth = txDepth;
  const savepoint = `sp_${depth}`;

  handle.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${savepoint}`);
  txDepth += 1;
  try {
    const result = fn();
    handle.exec(depth === 0 ? 'COMMIT' : `RELEASE ${savepoint}`);
    return result;
  } catch (error) {
    handle.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}`);
    throw error;
  } finally {
    txDepth = depth;
  }
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function kvGet(key: string): string | null {
  const row = get<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  return row?.value ?? null;
}

export function kvSet(key: string, value: string): void {
  run('INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
