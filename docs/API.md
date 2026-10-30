# API reference

Base URL `http://localhost:4000`. Every route except `/health`, `/auth/login`
and `/auth/demo-accounts` requires `Authorization: Bearer <token>`.

Errors return `{ "error": { "code", "message", "details?" } }`. Domain rule
violations (`LedgerError`, `EscrowError`, `BeaconError`) surface as **409** with
their own machine-readable code, so a client can tell a rule violation from a
server fault.

All money is **integer cents**. All timestamps are ISO 8601 UTC.

---

## Auth

| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | `{ email, password }` → `{ token, account, expiresAt }`. Same error whether the email or the password was wrong, so it cannot enumerate accounts. |
| `GET` | `/auth/me` | Current account plus talent profile, if any. |
| `GET` | `/auth/demo-accounts` | Seeded demo logins for the sign-in screen. |

Tokens are HS256, 12-hour expiry.

---

## Discovery

| Method | Path | Notes |
|---|---|---|
| `GET` | `/discovery/talent` | Production deck. Query: `projectId` (required), `sectors`, `roles`, `unionStatuses`, `minRateCents`, `maxRateCents`, `radiusMiles`, `ageMin`, `ageMax`, `minFollowers`, `maxFraudScore`, `limit`, `cursor`. |
| `GET` | `/discovery/opportunities` | Talent deck. Query: `sectors`, `radiusMiles`, `minRateCents`, `limit`, `cursor`. |
| `POST` | `/discovery/swipe` | `{ subjectKind, subjectId, direction, projectId?, pitch? }`. |
| `GET` | `/discovery/matches` | Matches for this account, from whichever side it sits on. |
| `GET` | `/discovery/super-pitch-tiers` | Super Pitch catalogue. |

Both decks return `{ cards, telemetry, nextCursor }`. Each card is
`{ subject, score, reasons[], distanceMiles }`; `telemetry` reports candidates
retrieved and surviving, per-stage timings, cells scanned, and model version.

`direction: 'up'` is an Instant Pitch and carries a `pitch` body. It consumes
plan allowance and returns **402 `PLAN_LIMIT`** when a free account is out —
unless a `superTier` is attached, which always goes through and does not consume
allowance. Repeat swipes on the same subject are idempotent, so a client retry
on a flaky connection cannot double-charge.

---

## Projects & Set-Beacon

| Method | Path | Notes |
|---|---|---|
| `GET` | `/projects` | Owned projects, ordered by how live they are. |
| `GET` | `/projects/:id` | Project, roles, and published sides. |
| `GET` | `/projects/:id/board` | Everything the board renders in one round-trip: shortlist (Discreet-projected), roles, escrows, beacons, sides. |
| `GET` | `/beacons` | Live beacons; expires stale ones first. |
| `GET` | `/beacons/:id` | Beacon plus claimant. |
| `POST` | `/beacons` | `{ projectId, role, sector, callTime, baseRateCents, radiusMiles?, rateMultiplier?, notes?, origin? }`. |
| `POST` | `/beacons/:id/claim` | Atomic claim. |

`POST /beacons` returns `{ beacon, candidates, dispatch }` where `dispatch` is
`{ devicesTargeted, cellsQueried, fanoutMs, withinSlo }`.

`POST /beacons/:id/claim` returns `{ claimed, beacon, reason? }` with `reason`
one of `already_claimed` `expired` `out_of_range` `not_eligible`. A profile can
only be claimed for by its own account — an agency cannot silently commit a
client to a same-day call.

---

## Escrow & ledger

| Method | Path | Notes |
|---|---|---|
| `GET` | `/escrows` | `{ payable, receivable, roster }`. `roster` is populated for agency accounts — the escrows of talent they represent and take commission on. |
| `GET` | `/escrows/:id` | Escrow, its ledger entries, account balances, project, agreement. |
| `POST` | `/escrows` | `{ projectId, talentProfileId, role, rateCents, rateUnit, days?, agreementId? }`. Project owner only. |
| `POST` | `/escrows/:id/actions` | `{ action, milestoneId?, note?, resolution? }`. |
| `GET` | `/ledger` | Recent entries, balances, `driftCents`, measured throughput. |

Actions: `fund` · `check_in` · `sign_milestone` · `release` · `raise_dispute` ·
`resolve_dispute`.

`fund` and `release` are payer-only. `resolve_dispute` is adjudicator-only — the
payer cannot self-serve an arbitration outcome. An illegal transition returns
**409 `ILLEGAL_TRANSITION`**; an overdraw attempt returns **409
`INSUFFICIENT_FUNDS`** and leaves nothing behind.

`driftCents` must always be `0`.

---

## Agreements

| Method | Path | Notes |
|---|---|---|
| `GET` | `/agreements` | `{ agreements, pending, roster }`, de-duplicated. |
| `GET` | `/agreements/:id` | Agreement plus an integrity check. |
| `POST` | `/agreements` | `{ kind, counterpartyAccountId, projectId? }`. |
| `POST` | `/agreements/:id/sign` | Records a signature. |

Kinds: `nda` `sag_aftra` `equity` `work_for_hire` `brand_campaign`
`audition_release`.

Signatures are HMAC digests over `(agreementId, signerId, body, signedAt)`.
`GET /agreements/:id` re-derives every digest from the stored body: change one
character and every signature stops verifying. A fully executed NDA returns
`unlockedProfileIds` — the Discreet Mode profiles that reveal to the issuer as a
result.

---

## Talent

| Method | Path | Notes |
|---|---|---|
| `GET` | `/talent/home` | Profile, active gigs, casting calls, inbox, notifications. |
| `GET` | `/talent/:id` | Public profile, Discreet-projected for the caller. |
| `PATCH` | `/talent/privacy` | `{ discreet?, routing?, travelRadiusMiles?, availableFrom? }`. Re-encodes the profile embedding — a stale vector silently mis-ranks the card. |
| `GET` | `/talent/:id/audit` | Runs a fresh engagement audit. |

---

## Casting Room

| Method | Path | Notes |
|---|---|---|
| `GET` | `/casting/sides/:id` | Side, project, this talent's takes, and a watermark spec. |
| `POST` | `/casting/takes` | `{ sideScriptId, durationSeconds, note? }`. |

The watermark is composed server-side and drawn on-device. A server-baked
burn-in would have to be re-encoded per viewer and would still be cached in one
form; drawing it live means the identifying text belongs to the session actually
looking at the side.

---

## Brand

| Method | Path | Notes |
|---|---|---|
| `GET` | `/campaigns` | Campaigns for this brand. |
| `GET` | `/campaigns/:id` | Campaign with a live estimate. |
| `POST` | `/campaigns` | Create a draft. Brand workspace only. |
| `PATCH` | `/campaigns/:id` | Update any wizard step. |
| `POST` | `/campaigns/:id/launch` | Re-audits every creator, then goes live. |
| `GET` | `/analytics` | Leaderboard, cohort series, heat map. |
| `GET` | `/analytics/audit/:profileId` | Full audit for one creator. |

The estimate returns `{ estimatedReach, predictedRoi, cpmCents, spend,
earnedValueCents, breakdown }`. Reach counts verified impressions only and is
de-duplicated for audience overlap (6% per additional creator, capped at 35%) —
stacking raw follower counts is how campaigns pay three people for the same
eyeballs. Return is earned media value across three deliverables per creator,
measured against spend including the platform fee.

Launch returns **400** listing any creator the audit blocked.

---

## Workspace

| Method | Path | Notes |
|---|---|---|
| `GET` | `/marketplace` | `{ crew, gear }`. Query: `sectors`, `union`, `maxRateCents`. |
| `GET` | `/collab/rooms` · `/collab/rooms/:id` | Dailies and VFX rooms with timecoded notes. |
| `POST` | `/collab/rooms/:id/notes` | `{ body, timecodeSeconds }`. |
| `GET` | `/events` | Live events; optional `lat`/`lng`/`radiusMiles`. |
| `GET` | `/agency/dashboard` | Roster revenue, pending agreements, trend. Agency workspace only. |
| `GET` | `/reference` | Sector taxonomy and plan catalogue. |
| `GET` | `/ops/health` | SLO readings, service states, ledger drift. |

---

## Notifications

| Method | Path | Notes |
|---|---|---|
| `GET` | `/notifications` | Recent notifications. |
| `POST` | `/notifications/:id/read` | Mark read. |
| `GET` | `/notifications/stream` | Server-sent events. |

SSE rather than a WebSocket for this lane: it is one-way, it survives proxies,
and it reconnects on its own. Chat and the casting-room SFU are the lanes that
actually need a socket. Notifications are written durably before they are
published, so a dropped connection reconciles from the table.
