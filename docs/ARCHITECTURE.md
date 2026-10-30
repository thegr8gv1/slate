# Architecture

How SLATE is built, and where this implementation sits relative to the
distributed design it is modelled on.

---

## 1. Shape of the system

```
                        ┌──────────────────────────────┐
                        │  One Expo Router codebase    │
                        │  iOS · Android · Web         │
                        └──────────────┬───────────────┘
                                       │  HTTPS + SSE
                        ┌──────────────▼───────────────┐
                        │  Fastify service (:4000)     │
                        ├──────────────────────────────┤
   Discovery            │  matching.ts   embedding.ts  │
   Geo dispatch         │  beacon.ts     geo.ts        │
   Money                │  escrow.ts     ledger.ts     │
   Trust & safety       │  trust.ts      discreet.ts   │
   Legal                │  agreements.ts               │
                        ├──────────────────────────────┤
                        │  node:sqlite (WAL)           │
                        └──────────────────────────────┘
```

The client is deliberately thin: it renders, it captures gestures, and it holds
no domain rules. Splits, eligibility, masking, and state transitions are all
decided server-side, because a client that computes them is a client that can be
made to lie.

---

## 2. Discovery pipeline

Both decks — productions swiping talent, talent swiping gigs — run the same
three stages. The split matters: each stage exists to shed candidates so the
expensive stage runs on fewer of them.

### L1 — hard filters (SQL)

Sector, union status, role, rate band, age, follower floor, fraud ceiling, and
proximity, plus two rules that are easy to forget and expensive to get wrong: a
card already swiped is never re-dealt, and an account never sees its own profile.

Proximity uses a hex-cell index (`lib/geo.ts`). `planProximity` picks the
strategy:

- **≤ ~2,200 cells** → enumerate the k-ring and hit the `cell` index directly.
- **Beyond that** → a latitude/longitude bounding box, because the `IN` list
  starts costing more than it saves. Real H3 solves this by rolling up to a
  coarser parent resolution; the bbox is the same trade in one step.

Either way the exact haversine pass runs afterwards, so the index is only ever a
candidate generator — never the source of truth.

### L2 — vector scoring

`domain/embedding.ts` encodes both sides into the same 48-dimensional space:

```
[ 0.. 7] sector one-hot        [16..19] reach & authenticity
[ 8..12] union one-hot         [20..23] track record
[13..15] rate band (log)       [24..47] hashed role + specialty tokens
```

Both towers emit unit vectors, so relevance is a dot product. Rate is
log-scaled — $250/day and $25,000/day have to stay separable, and a linear
scale collapses them.

In production these weights come from a trained retrieval model and the vectors
live in an ANN index. The encoder here is deterministic and inspectable with the
identical feature layout, so the serving path is exercised end to end.

### L3 — rerank

A weighted blend over eight named features (`matching.ts`). Keeping the weights
explicit is what lets every card explain itself — the "why am I seeing this" row
on the deck is the ranker's own attribution, not marketing copy.

A feature only earns a slot in that explanation when it clears a floor. A
feature that scores the same on every card explains nothing, and three cards
that all say "strong profile match" tell a casting director less than nothing.

### Telemetry

Every deck response carries `FeedTelemetry` — candidates retrieved, candidates
surviving filters, per-stage timings, cells scanned, model version. The client
renders it. Casting teams ask "why am I not seeing anyone", and the honest
answer is usually that L1 cut the set before ranking ever ran.

---

## 3. Set-Beacon

```
Producer raises beacon
        │
        ├─► planProximity(origin, radius)     ── hex k-ring or bbox
        ├─► exact haversine + role eligibility
        ├─► fan out one critical push per eligible account
        │
   First to confirm
        │
        └─► UPDATE beacons SET state='claimed'
             WHERE state='broadcasting' AND claim_lock IS NULL
                  │
                  ├── row changed  → winner: contract generated
                  └── row unchanged → "role filled" to everyone else
```

The claim is a compare-and-set inside an `IMMEDIATE` transaction. SQLite
serialises it, so exactly one concurrent caller can win — the single-node
equivalent of the Redlock/optimistic-concurrency claim in the distributed
design. The read-then-write race is closed by re-reading the lock token after
the update and confirming it is ours.

Dispatch reports `devicesTargeted`, `cellsQueried`, and `fanoutMs` against the
2,000 ms fan-out objective.

---

## 4. Money

### Ledger

Append-only double-entry (`domain/ledger.ts`). There is no `UPDATE` or `DELETE`
path to the `ledger` table anywhere in the service; a mistake is corrected by
booking its reverse, so the audit trail is complete by construction.

Invariants, all enforced and all tested:

- Every line books the same amount as a debit and a credit → the sum across all
  accounts is exactly zero. `drift()` surfaces this; the ops screen shows it.
- Amounts are positive integers. Cents cross the wire as integers everywhere;
  floats never touch money.
- A segregated escrow account cannot be overdrawn — the guard runs inside the
  same transaction as the posting.

Chart of accounts: `asset:cash_in_transit`, `liability:escrow:<id>`,
`liability:talent:<id>`, `liability:agency:<id>`, `liability:dispute_hold:<id>`,
`liability:union_and_tax`, `revenue:platform_fee`.

### Escrow state machine

```
offer_accepted ─► escrow_funded ─► checked_in ─► wrap_signed ─► paid_out
                       │               │              │
                       └───────────────┴──────────────┴─► dispute_raised
                                                              │
                                                    ┌─────────┴─────────┐
                                                paid_out            refunded
```

`checked_in → paid_out` is legal on purpose: settling in full is a superset of
wrapping, and `releaseFinal` signs off every outstanding milestone as part of the
payout. A producer closing a one-day booking should not have to click wrap first
to satisfy a diagram.

A dispute moves the remaining balance into a hold account, so no milestone can
drain it while arbitration runs. The 72-hour countdown is stored on the record.

### Splits

`computeSplits` uses largest-remainder allocation: floor every leg, then hand
the leftover cents to the largest fractional parts. The four legs therefore sum
to *exactly* the gross for any amount — tested from 1 cent to $6.4M. Naive
rounding leaks a cent somewhere in the range, and a cent that escapes a ledger
is a cent that shows up as drift.

The platform fee tiers down as the booking grows (8% → 5%).

---

## 5. Discreet Mode

Three independent gates, evaluated per viewer per read:

1. an executed NDA against that profile,
2. proven escrow capacity above the talent's own floor,
3. optionally, tier-1 studio status.

What leaves the service is a **projection**, never the record with a flag on it.
`maskProfile` replaces the identity surface with the talent's public mask, nulls
the protected fields, tokenizes social handles, rounds reach into bands, and
coarsens coordinates to the region centroid — an exact cell would re-identify.

Masking at the projection layer rather than in the UI means no read path can
leak: the deck, search, the board, and the roster all inherit it, and a test
asserts the deck never emits an unmasked discreet profile.

---

## 6. Trust & safety

Two independent signals decide a verdict (`domain/trust.ts`):

- **Engagement Authenticity Index** — interactions over impressions, discounted
  by a spike coefficient. Genuine virality is one large step; purchased
  followers are repeated large steps, which is what pushes the coefficient past
  the sigma threshold.
- **Structural anomaly score** — a weighted blend of growth spikiness, verified
  account share, Herfindahl concentration of audience geography, and
  implausible engagement rates.

Past the threshold, the profile is suppressed **in storage** (`suppressed = 1`),
so every read path inherits it rather than each caller remembering to filter.
Campaigns re-audit at launch, because a creator can degrade between selection
and spend.

---

## 7. Client architecture

### One codebase, three platforms

`<Screen>` draws the app's own chrome — header, title strip, responsive
navigation. The navigator renders no platform headers, because a stack header
looks different on iOS, Android, and the web, which is precisely what the design
system exists to prevent.

Navigation is one structure presented three ways: bottom tabs under 900px, an
icon rail to 1280px, a full rail above, and a menu sheet everywhere. The rail
follows the *route*, not the last workspace picked, so an agency link from a
production board lands with the right sidebar.

### Data access

`useQuery` and `useMutation` (`lib/query.ts`) are deliberately small. Two things
in them matter more than they look:

- Both read their callback through a ref. `mutate` is stable so it can go
  straight onto an `onPress`, which means capturing the callback in the closure
  would freeze whatever state it referenced on first render — the bug class that
  makes a mutation post a `projectId` that was still `null` when the component
  first mounted.
- `useMutation` guards with an `inFlight` ref, so a double-tapped button cannot
  fire the same escrow release or beacon claim twice.

### The React Compiler constraint

The app builds with React Compiler on. It memoises object literals at render
time, so anything dereferenced inside a request object must already be safe —
`activeProject!.id` inside a fetcher throws even when the query is disabled. Ids
are hoisted into nullable locals and the query is gated on them instead.

### Session gate

Restoring a session is asynchronous, and screens mount the instant a route
resolves. Without a gate, a deep link fires its requests before the bearer token
is installed and the API correctly rejects them — a race that only appears on a
cold load of a nested URL, which is how the web build is normally opened.
`SessionGate` holds the tree until the session settles.

---

## 8. Distance from the target design

| Target | Here | Portability |
|---|---|---|
| PostgreSQL + ScyllaDB + Redis | one `node:sqlite` file, WAL | Tables carry the indexes the split needs; query shapes are unchanged |
| Uber H3 | hand-rolled hex grid on H3's resolution ladder | Swap for `h3-js`; the radius maths above it does not move |
| Milvus/Qdrant HNSW | in-process cosine over stored vectors | Same encoder, same top-K contract |
| TigerBeetle | double-entry tables with the same invariants | Account model and transfer semantics map directly |
| Temporal | guarded transitions inside SQL transactions | Each transition is already idempotent and retry-safe |
| Kafka/Pulsar | in-process bus + durable rows, write-then-publish | Ordering guarantee is preserved; a dropped subscriber reconciles from the table |
| APNs/FCM | SSE + durable notification rows | The write is the source of truth either way |
| LightGBM ranker | explicit weighted blend, same feature vector | Feature extraction is the reusable half |

Everything in the right column runs. Nothing in it pretends to be the left
column.
