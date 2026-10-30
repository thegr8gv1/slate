import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { rmSync } from 'node:fs';

/**
 * Domain invariant tests.
 *
 * These cover the properties that must hold no matter what the UI does: the
 * ledger nets to zero, an escrow cannot be drained twice, exactly one device
 * wins a beacon, and a Discreet Mode profile never leaks a real field to an
 * unqualified viewer.
 *
 *   npm test
 */

// A dedicated database so a test run never touches the dev data.
process.env.SLATE_DB_PATH = './data/test.db';

const { closeDb, db, get } = await import('../db/index.js');
const { seed } = await import('../db/seed.js');
const { accountById, profileById, projectById } = await import('../db/repo.js');
const { ACCOUNTS, balanceOf, drift, postTransfer, LedgerError } = await import('./ledger.js');
const { createEscrow, fundEscrow, checkIn, releaseFinal, raiseDispute, resolveDispute, EscrowError } =
  await import('./escrow.js');
const { dispatchBeacon, claimBeacon } = await import('./beacon.js');
const { buildTalentDeck } = await import('./matching.js');
const { buildViewerContext, evaluateReveal, maskProfile } = await import('./discreet.js');
const { auditSocial, seriesFor, runAudit } = await import('./trust.js');
const { computeSplits, totalOf, commissionBpsFor } = await import('../contracts/index.js');
const { staticId } = await import('../lib/ids.js');
const { cellFor, haversineMiles, kRing, planProximity, ringsForMiles } = await import('../lib/geo.js');

const SILVERLINE = staticId('acc', 'prod-silverline');
const PROJECT = staticId('prj', 'silverline');
const SARAH = staticId('tal', 'sarah-jenkins');
const MARCUS = staticId('tal', 'marcus-diallo');

before(() => {
  db();
  seed(true);
});

after(() => {
  closeDb();
  try {
    rmSync('./data/test.db', { force: true });
    rmSync('./data/test.db-wal', { force: true });
    rmSync('./data/test.db-shm', { force: true });
  } catch {
    /* Windows can hold the handle briefly; a stale test db is harmless. */
  }
});

/* ------------------------------------------------------------------ */

describe('money splits', () => {
  it('always sums to exactly the gross, with no rounding dust', () => {
    for (const gross of [1, 7, 99, 333, 100_00, 123_457, 1_500_00, 6_400_000_00]) {
      const splits = computeSplits({
        grossCents: gross,
        talentAccountId: 'talent',
        agencyAccountId: 'agency',
      });
      assert.equal(totalOf(splits), gross, `split of ${gross} did not reconcile`);
    }
  });

  it('drops the agency leg when talent is unrepresented', () => {
    const splits = computeSplits({ grossCents: 100_00, talentAccountId: 't', agencyAccountId: null });
    assert.equal(splits.find((s) => s.party === 'agency'), undefined);
    assert.equal(totalOf(splits), 100_00);
  });

  it('tiers the platform fee down as the booking grows', () => {
    assert.ok(commissionBpsFor(400_00) > commissionBpsFor(40_000_00));
  });
});

describe('ledger', () => {
  it('nets to zero across every account', () => {
    assert.equal(drift(), 0);
  });

  it('rejects a non-positive amount', () => {
    assert.throws(
      () =>
        postTransfer([{ debit: ACCOUNTS.cashIn, credit: ACCOUNTS.platformRevenue, amountCents: 0, reason: 'x' }], {
          escrowId: null,
        }),
      (error: unknown) => error instanceof LedgerError && error.code === 'INVALID_AMOUNT',
    );
  });

  it('refuses to overdraw a segregated escrow account', () => {
    const escrow = createEscrow({
      projectId: PROJECT,
      talentProfileId: MARCUS,
      payerAccountId: SILVERLINE,
      role: 'Gaffer',
      rateCents: 100_00,
      rateUnit: 'day',
      days: 1,
    });
    fundEscrow(escrow.id, SILVERLINE);

    assert.throws(
      () =>
        postTransfer(
          [
            {
              debit: ACCOUNTS.escrow(escrow.id),
              credit: ACCOUNTS.platformRevenue,
              amountCents: 999_999_00,
              reason: 'overdraw attempt',
            },
          ],
          { escrowId: escrow.id },
        ),
      (error: unknown) => error instanceof LedgerError && error.code === 'INSUFFICIENT_FUNDS',
    );

    // The rejected transfer must leave nothing behind.
    assert.equal(balanceOf(ACCOUNTS.escrow(escrow.id)), 100_00);
    assert.equal(drift(), 0);
  });
});

describe('escrow state machine', () => {
  it('runs offer -> funded -> checked in -> paid out and lands on zero', () => {
    const escrow = createEscrow({
      projectId: PROJECT,
      talentProfileId: MARCUS,
      payerAccountId: SILVERLINE,
      role: 'Gaffer',
      rateCents: 950_00,
      rateUnit: 'day',
      days: 3,
    });

    assert.equal(escrow.state, 'offer_accepted');
    assert.equal(balanceOf(ACCOUNTS.escrow(escrow.id)), 0);

    const funded = fundEscrow(escrow.id, SILVERLINE);
    assert.equal(funded.state, 'escrow_funded');
    assert.equal(balanceOf(ACCOUNTS.escrow(escrow.id)), 2850_00);

    const checked = checkIn(escrow.id, SILVERLINE);
    assert.equal(checked.state, 'checked_in');
    assert.ok(balanceOf(ACCOUNTS.escrow(escrow.id)) < 2850_00);

    const paid = releaseFinal(escrow.id, SILVERLINE);
    assert.equal(paid.state, 'paid_out');
    // Full settlement drains the segregated account.
    assert.equal(balanceOf(ACCOUNTS.escrow(escrow.id)), 0);
    assert.equal(drift(), 0);
  });

  it('refuses an illegal transition', () => {
    const escrow = createEscrow({
      projectId: PROJECT,
      talentProfileId: MARCUS,
      payerAccountId: SILVERLINE,
      role: 'Gaffer',
      rateCents: 500_00,
      rateUnit: 'day',
      days: 1,
    });
    // Cannot check in before the money is there.
    assert.throws(
      () => checkIn(escrow.id, SILVERLINE),
      (error: unknown) => error instanceof EscrowError && error.code === 'ILLEGAL_TRANSITION',
    );
  });

  it('freezes the balance on dispute and releases it on resolution', () => {
    const escrow = createEscrow({
      projectId: PROJECT,
      talentProfileId: MARCUS,
      payerAccountId: SILVERLINE,
      role: 'Gaffer',
      rateCents: 800_00,
      rateUnit: 'day',
      days: 2,
    });
    fundEscrow(escrow.id, SILVERLINE);

    const disputed = raiseDispute(escrow.id, SILVERLINE, 'no-show');
    assert.equal(disputed.state, 'dispute_raised');
    assert.equal(balanceOf(ACCOUNTS.escrow(escrow.id)), 0);
    assert.equal(balanceOf(ACCOUNTS.disputeHold(escrow.id)), 1600_00);

    const resolved = resolveDispute(escrow.id, 'release_to_talent');
    assert.equal(resolved.state, 'paid_out');
    assert.equal(balanceOf(ACCOUNTS.disputeHold(escrow.id)), 0);
    assert.equal(drift(), 0);
  });

  it('is idempotent on a repeated final release', () => {
    const escrow = createEscrow({
      projectId: PROJECT,
      talentProfileId: MARCUS,
      payerAccountId: SILVERLINE,
      role: 'Gaffer',
      rateCents: 600_00,
      rateUnit: 'day',
      days: 1,
    });
    fundEscrow(escrow.id, SILVERLINE);
    checkIn(escrow.id, SILVERLINE);
    releaseFinal(escrow.id, SILVERLINE);
    const again = releaseFinal(escrow.id, SILVERLINE);

    assert.equal(again.state, 'paid_out');
    assert.equal(balanceOf(ACCOUNTS.escrow(escrow.id)), 0);
    assert.equal(drift(), 0);
  });
});

describe('set-beacon', () => {
  it('reaches only crew inside the radius', () => {
    const project = projectById(PROJECT)!;
    const report = dispatchBeacon({
      projectId: PROJECT,
      issuedByAccountId: SILVERLINE,
      role: 'Gaffer',
      sector: 'camera_lighting',
      callTime: new Date(Date.now() + 3 * 3600_000).toISOString(),
      baseRateCents: 650_00,
      radiusMiles: 15,
    });

    assert.ok(report.candidates.length > 0, 'expected at least one local gaffer');
    for (const candidate of report.candidates) {
      assert.ok(candidate.distanceMiles <= 15, `${candidate.displayName} is outside the radius`);
      const profile = profileById(candidate.profileId)!;
      assert.ok(haversineMiles(project.location, profile.location) <= 15.001);
    }
  });

  it('lets exactly one claimant win', () => {
    const report = dispatchBeacon({
      projectId: PROJECT,
      issuedByAccountId: SILVERLINE,
      role: 'Gaffer',
      sector: 'camera_lighting',
      callTime: new Date(Date.now() + 4 * 3600_000).toISOString(),
      baseRateCents: 650_00,
      radiusMiles: 25,
    });
    assert.ok(report.candidates.length >= 2, 'need two candidates to race');

    const [first, second] = report.candidates;
    const winner = claimBeacon(report.beacon.id, first.profileId);
    const loser = claimBeacon(report.beacon.id, second.profileId);

    assert.equal(winner.claimed, true);
    assert.equal(loser.claimed, false);
    assert.equal(loser.reason, 'already_claimed');
    assert.equal(loser.beacon.claimedByProfileId, first.profileId);
  });

  it('applies the emergency multiplier to the payout', () => {
    const report = dispatchBeacon({
      projectId: PROJECT,
      issuedByAccountId: SILVERLINE,
      role: 'Gaffer',
      sector: 'camera_lighting',
      callTime: new Date(Date.now() + 5 * 3600_000).toISOString(),
      baseRateCents: 700_00,
      rateMultiplier: 2,
      radiusMiles: 20,
    });
    assert.equal(report.beacon.payoutCents, 1400_00);
  });
});

describe('geo index', () => {
  it('places a point in its own k-ring', () => {
    const cell = cellFor({ lat: 34.0522, lng: -118.2437 }, 7);
    assert.ok(kRing(cell, 2).includes(cell));
  });

  it('returns 1 + 3k(k+1) cells per ring', () => {
    for (const k of [1, 2, 5, 9]) {
      assert.equal(kRing('h7:0:0', k).length, 1 + 3 * k * (k + 1));
    }
  });

  it('switches to a bounding box before the cell list explodes', () => {
    const tight = planProximity({ lat: 34.05, lng: -118.24 }, 5, 7);
    const wide = planProximity({ lat: 34.05, lng: -118.24 }, 120, 7);
    assert.equal(tight.strategy, 'cells');
    assert.equal(wide.strategy, 'bbox');
    assert.ok(wide.bbox.maxLat > wide.bbox.minLat);
  });

  it('measures a known distance correctly', () => {
    // LA City Hall to Santa Monica Pier is roughly 14.5 miles.
    const miles = haversineMiles({ lat: 34.0537, lng: -118.2428 }, { lat: 34.0094, lng: -118.4973 });
    assert.ok(miles > 13.5 && miles < 15.5, `expected ~14.5mi, got ${miles.toFixed(2)}`);
  });

  it('covers the requested radius with enough rings', () => {
    const k = ringsForMiles(25, 7, 34);
    // Each ring step covers ~1.5 edge lengths of ground.
    assert.ok(k >= 20 && k <= 60, `unexpected ring count ${k}`);
  });
});

describe('discreet mode', () => {
  it('masks every protected field for an unqualified viewer', () => {
    const sarah = profileById(SARAH)!;
    assert.equal(sarah.discreet.enabled, true);

    const masked = maskProfile(sarah);
    assert.equal(masked.masked, true);
    assert.equal(masked.legalName, null);
    assert.equal(masked.dayRateCents, null);
    assert.equal(masked.age, null);
    assert.equal(masked.reelUrl, null);
    assert.deepEqual(masked.portfolio, []);
    assert.notEqual(masked.displayName, sarah.displayName);
    // The mask must not accidentally carry the real handle through.
    for (const social of masked.socials) {
      assert.ok(social.handle.startsWith('tok_'), 'social handle leaked');
    }
  });

  it('requires an NDA even when the budget clears the floor', () => {
    const sarah = profileById(SARAH)!;
    const decision = evaluateReveal(sarah, {
      accountId: 'someone',
      role: 'production',
      escrowCapacityCents: 10_000_000_00,
      tier1Studio: true,
      ndaProfileIds: new Set<string>(),
    });
    assert.equal(decision.revealed, false);
    assert.ok(decision.failedGates.includes('nda'));
  });

  it('reveals only when every gate is satisfied', () => {
    const sarah = profileById(SARAH)!;
    const decision = evaluateReveal(sarah, {
      accountId: 'someone',
      role: 'production',
      escrowCapacityCents: 10_000_000_00,
      tier1Studio: true,
      ndaProfileIds: new Set([sarah.id]),
    });
    assert.equal(decision.revealed, true);
  });

  it('never emits an unmasked discreet profile through the deck', () => {
    const account = accountById(SILVERLINE)!;
    const project = projectById(PROJECT)!;
    const viewer = buildViewerContext(account);
    const deck = buildTalentDeck(
      project,
      { projectId: PROJECT, sectors: ['screen_stage'], radiusMiles: 80, limit: 50 },
      viewer,
      account.id,
    );

    const sarahCard = deck.cards.find((card) => card.subject.id === SARAH);
    if (sarahCard) {
      assert.equal(sarahCard.subject.masked, true);
      assert.equal(sarahCard.subject.dayRateCents, null);
    }
  });
});

describe('matching', () => {
  it('returns candidates ordered by score', () => {
    const account = accountById(SILVERLINE)!;
    const project = projectById(PROJECT)!;
    const deck = buildTalentDeck(
      project,
      { projectId: PROJECT, sectors: ['screen_stage'], radiusMiles: 60, limit: 20 },
      buildViewerContext(account),
      account.id,
    );

    assert.ok(deck.cards.length > 0);
    for (let i = 1; i < deck.cards.length; i += 1) {
      assert.ok(deck.cards[i - 1].score >= deck.cards[i].score, 'deck is not sorted by score');
    }
  });

  it('honours the union hard filter', () => {
    const account = accountById(SILVERLINE)!;
    const project = projectById(PROJECT)!;
    const deck = buildTalentDeck(
      project,
      { projectId: PROJECT, unionStatuses: ['sag_aftra'], radiusMiles: 80, limit: 50 },
      buildViewerContext(account),
      account.id,
    );
    for (const card of deck.cards) {
      assert.equal(card.subject.unionStatus, 'sag_aftra');
    }
  });

  it('never deals the requesting account its own profile', () => {
    const account = accountById(SILVERLINE)!;
    const project = projectById(PROJECT)!;
    const deck = buildTalentDeck(
      project,
      { projectId: PROJECT, radiusMiles: 80, limit: 50 },
      buildViewerContext(account),
      account.id,
    );
    assert.ok(!deck.cards.some((card) => card.subject.accountId === account.id));
  });

  it('meets the p95 feed latency objective', () => {
    const account = accountById(SILVERLINE)!;
    const project = projectById(PROJECT)!;
    const timings: number[] = [];

    for (let i = 0; i < 25; i += 1) {
      const deck = buildTalentDeck(
        project,
        { projectId: PROJECT, sectors: ['screen_stage'], radiusMiles: 50, limit: 20 },
        buildViewerContext(account),
        account.id,
      );
      timings.push(deck.telemetry.totalMs);
    }

    timings.sort((a, b) => a - b);
    const p95 = timings[Math.floor(timings.length * 0.95)];
    assert.ok(p95 < 45, `p95 feed latency was ${p95.toFixed(2)}ms, budget is 45ms`);
  });
});

describe('trust & safety', () => {
  it('suppresses a profile with purchased engagement', () => {
    const devon = profileById(staticId('tal', 'devon-swift'))!;
    const result = runAudit(devon.id);
    assert.equal(result.verdict, 'suppressed');
    assert.ok(result.flags.length > 0);

    // Suppression must be enforced in storage, not just in the response.
    const row = get<{ suppressed: number }>('SELECT suppressed FROM talent_profiles WHERE id = ?', devon.id);
    assert.equal(row?.suppressed, 1);
  });

  it('clears a profile with organic engagement', () => {
    const chloe = profileById(staticId('tal', 'chloe-vance'))!;
    const result = runAudit(chloe.id);
    assert.notEqual(result.verdict, 'suppressed');
  });

  it('keeps a suppressed profile out of the discovery deck', () => {
    const account = accountById(SILVERLINE)!;
    const project = projectById(PROJECT)!;
    runAudit(staticId('tal', 'devon-swift'));

    const deck = buildTalentDeck(
      project,
      { projectId: PROJECT, sectors: ['digital_social'], radiusMiles: 80, limit: 50 },
      buildViewerContext(account),
      account.id,
    );
    assert.ok(!deck.cards.some((card) => card.subject.id === staticId('tal', 'devon-swift')));
  });

  it('never reports verified reach above total reach', () => {
    const profile = profileById(staticId('tal', 'alex-rivers'))!;
    const series = seriesFor(profile, profile.socials[0]);
    for (const point of series) {
      assert.ok(point.verifiedReach <= point.totalReach, 'verified reach exceeded total reach');
    }
  });

  it('penalises a spiky growth curve', () => {
    const profile = profileById(staticId('tal', 'chloe-vance'))!;
    const metrics = profile.socials[0];

    const smooth = auditSocial(metrics, seriesFor(profile, metrics));
    const spiky = auditSocial(metrics, [
      ...seriesFor(profile, metrics).slice(0, 8),
      { t: '2026-01-01', totalReach: metrics.totalReach * 4, verifiedReach: metrics.verifiedReach },
      { t: '2026-01-08', totalReach: metrics.totalReach * 4.2, verifiedReach: metrics.verifiedReach },
      { t: '2026-01-15', totalReach: metrics.totalReach * 4.3, verifiedReach: metrics.verifiedReach },
      { t: '2026-01-22', totalReach: metrics.totalReach * 4.4, verifiedReach: metrics.verifiedReach },
    ]);

    assert.ok(spiky.fraudScore > smooth.fraudScore, 'spike did not raise the fraud score');
  });
});
