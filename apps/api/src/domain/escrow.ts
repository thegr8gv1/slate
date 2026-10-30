import { computeSplits } from '../contracts/index.js';
import type { EscrowAgreement, EscrowMilestone, EscrowState, SplitLine } from '../contracts/index.js';
import { get, run, tx } from '../db/index.js';
import { escrowById, profileById, projectById, agencyIdForAccount } from '../db/repo.js';
import { newId } from '../lib/ids.js';
import { ACCOUNTS, balanceOf, entriesForEscrow, postTransfer } from './ledger.js';
import { notify } from './notifications.js';

/**
 * Escrow workflow.
 *
 * The state machine below is the durable half of what Temporal orchestrates in
 * the target architecture: each transition is guarded, writes the ledger and
 * the escrow row inside one SQL transaction, and is safe to retry.
 *
 *   offer_accepted -> escrow_funded -> checked_in -> wrap_signed -> paid_out
 *                          |                |
 *                          +----------------+-> dispute_raised -> (paid_out | refunded)
 */

/**
 * Legal transitions.
 *
 * `checked_in -> paid_out` is deliberate: settling in full is a superset of
 * wrapping, and `releaseFinal` signs off every outstanding milestone as part of
 * the payout. A producer who wants to close a short booking on the day should
 * not have to click wrap first just to satisfy the state machine.
 */
const TRANSITIONS: Record<EscrowState, EscrowState[]> = {
  offer_accepted: ['escrow_funded', 'cancelled'],
  escrow_funded: ['checked_in', 'wrap_signed', 'dispute_raised', 'refunded', 'cancelled'],
  checked_in: ['wrap_signed', 'paid_out', 'dispute_raised'],
  dispute_raised: ['paid_out', 'refunded', 'wrap_signed'],
  wrap_signed: ['paid_out', 'dispute_raised'],
  paid_out: [],
  refunded: [],
  cancelled: [],
};

export class EscrowError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EscrowError';
  }
}

function assertTransition(from: EscrowState, to: EscrowState): void {
  if (!TRANSITIONS[from].includes(to)) {
    throw new EscrowError('ILLEGAL_TRANSITION', `Cannot move an escrow from ${from} to ${to}`);
  }
}

/* ------------------------------------------------------------------ */
/* Creation                                                            */
/* ------------------------------------------------------------------ */

export interface CreateEscrowInput {
  projectId: string;
  talentProfileId: string;
  payerAccountId: string;
  role: string;
  rateCents: number;
  rateUnit: EscrowAgreement['rateUnit'];
  days?: number;
  agreementId?: string | null;
}

export function createEscrow(input: CreateEscrowInput): EscrowAgreement {
  const project = projectById(input.projectId);
  if (!project) throw new EscrowError('NO_PROJECT', 'Unknown project');
  const profile = profileById(input.talentProfileId);
  if (!profile) throw new EscrowError('NO_TALENT', 'Unknown talent profile');

  const units = Math.max(1, input.days ?? 1);
  const grossCents = input.rateCents * units;
  const now = new Date().toISOString();
  const id = newId('esc');

  const splits = computeSplits({
    grossCents,
    talentAccountId: profile.accountId,
    agencyAccountId: profile.agencyId,
  });

  const escrow: EscrowAgreement = {
    id,
    projectId: project.id,
    projectTitle: project.title,
    agreementId: input.agreementId ?? null,
    talentProfileId: profile.id,
    talentDisplayName: profile.displayName,
    talentAvatarUrl: profile.avatarUrl,
    payerAccountId: input.payerAccountId,
    role: input.role,
    rateCents: input.rateCents,
    rateUnit: input.rateUnit,
    grossCents,
    fundedCents: 0,
    releasedCents: 0,
    state: 'offer_accepted',
    milestones: defaultMilestones(project.shootStart, project.shootEnd),
    splits,
    disputeOpenedAt: null,
    disputeDeadlineAt: null,
    createdAt: now,
    updatedAt: now,
  };

  persist(escrow);
  notify(profile.accountId, {
    kind: 'escrow',
    title: 'Offer accepted',
    body: `${project.title} — ${input.role}. Escrow opens once the production funds it.`,
    deepLink: `/agency/escrow/${id}`,
    priority: 'high',
  });
  return escrow;
}

function defaultMilestones(shootStart: string, shootEnd: string): EscrowMilestone[] {
  return [
    {
      id: newId('mst'),
      label: 'Deposit confirmed',
      kind: 'deposit',
      dueAt: shootStart,
      releaseBps: 0,
      signedOffBy: null,
      signedOffAt: null,
    },
    {
      id: newId('mst'),
      label: 'On-set check-in',
      kind: 'check_in',
      dueAt: shootStart,
      releaseBps: 3000,
      signedOffBy: null,
      signedOffAt: null,
    },
    {
      id: newId('mst'),
      label: 'Wrap sign-off',
      kind: 'wrap',
      dueAt: shootEnd,
      releaseBps: 5000,
      signedOffBy: null,
      signedOffAt: null,
    },
    {
      id: newId('mst'),
      label: 'Final payout',
      kind: 'final_payout',
      dueAt: shootEnd,
      releaseBps: 2000,
      signedOffBy: null,
      signedOffAt: null,
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Transitions                                                         */
/* ------------------------------------------------------------------ */

/** Producer deposits 100% of the booking before call time. */
export function fundEscrow(escrowId: string, actorAccountId: string): EscrowAgreement {
  const escrow = load(escrowId);
  assertTransition(escrow.state, 'escrow_funded');
  if (escrow.payerAccountId !== actorAccountId) {
    throw new EscrowError('FORBIDDEN', 'Only the payer can fund this escrow');
  }

  return tx(() => {
    postTransfer(
      [
        {
          debit: ACCOUNTS.cashIn,
          credit: ACCOUNTS.escrow(escrow.id),
          amountCents: escrow.grossCents,
          reason: `Escrow funded for ${escrow.projectTitle} — ${escrow.role}`,
        },
      ],
      { escrowId: escrow.id },
    );

    const updated: EscrowAgreement = {
      ...escrow,
      state: 'escrow_funded',
      fundedCents: escrow.grossCents,
      milestones: signMilestone(escrow.milestones, 'deposit', actorAccountId),
      updatedAt: new Date().toISOString(),
    };
    persist(updated);
    notifyBothSides(updated, 'Escrow funded', 'Funds are held in escrow. Call sheet is live.');
    return updated;
  });
}

/** 1st AD and talent both sign the on-set check-in; releases the first tranche. */
export function checkIn(escrowId: string, actorAccountId: string): EscrowAgreement {
  const escrow = load(escrowId);
  assertTransition(escrow.state, 'checked_in');

  return tx(() => {
    const milestone = escrow.milestones.find((m) => m.kind === 'check_in');
    const updated: EscrowAgreement = {
      ...escrow,
      state: 'checked_in',
      milestones: signMilestone(escrow.milestones, 'check_in', actorAccountId),
      releasedCents: escrow.releasedCents,
      updatedAt: new Date().toISOString(),
    };
    if (milestone && milestone.releaseBps > 0) {
      const tranche = Math.floor((escrow.grossCents * milestone.releaseBps) / 10_000);
      releaseTranche(escrow, tranche, 'Check-in tranche');
      updated.releasedCents = escrow.releasedCents + tranche;
    }
    persist(updated);
    notifyBothSides(updated, 'Checked in on set', 'First tranche released to the talent ledger.');
    return updated;
  });
}

export function signOffMilestone(
  escrowId: string,
  milestoneId: string,
  actorAccountId: string,
): EscrowAgreement {
  const escrow = load(escrowId);
  const milestone = escrow.milestones.find((m) => m.id === milestoneId);
  if (!milestone) throw new EscrowError('NO_MILESTONE', 'Unknown milestone');
  if (milestone.signedOffAt) return escrow;
  if (escrow.state === 'dispute_raised') {
    throw new EscrowError('DISPUTED', 'Resolve the dispute before signing further milestones');
  }

  return tx(() => {
    const milestones = escrow.milestones.map((m) =>
      m.id === milestoneId
        ? { ...m, signedOffBy: actorAccountId, signedOffAt: new Date().toISOString() }
        : m,
    );

    let releasedCents = escrow.releasedCents;
    if (milestone.releaseBps > 0) {
      const tranche = Math.floor((escrow.grossCents * milestone.releaseBps) / 10_000);
      releaseTranche(escrow, tranche, `${milestone.label} tranche`);
      releasedCents += tranche;
    }

    const allSigned = milestones.every((m) => m.signedOffAt !== null);
    const nextState: EscrowState =
      milestone.kind === 'wrap'
        ? 'wrap_signed'
        : allSigned
          ? 'paid_out'
          : escrow.state;

    const updated: EscrowAgreement = {
      ...escrow,
      milestones,
      releasedCents,
      state: nextState,
      updatedAt: new Date().toISOString(),
    };
    persist(updated);
    notifyBothSides(updated, `${milestone.label} signed`, `${escrow.projectTitle} — ${escrow.role}`);
    return updated;
  });
}

/**
 * Final settlement. Drains the escrow account into the four split legs in one
 * atomic transfer; the split maths guarantees the legs sum to the remaining
 * balance exactly, so the escrow account lands on zero.
 */
export function releaseFinal(escrowId: string, actorAccountId: string): EscrowAgreement {
  const escrow = load(escrowId);
  if (escrow.state === 'paid_out') return escrow;
  assertTransition(escrow.state, 'paid_out');
  if (escrow.payerAccountId !== actorAccountId) {
    throw new EscrowError('FORBIDDEN', 'Only the payer can release the final payout');
  }

  return tx(() => {
    const remaining = balanceOf(ACCOUNTS.escrow(escrow.id));
    if (remaining <= 0) {
      const settled: EscrowAgreement = { ...escrow, state: 'paid_out', updatedAt: new Date().toISOString() };
      persist(settled);
      return settled;
    }

    const profile = profileById(escrow.talentProfileId);
    const splits = computeSplits({
      grossCents: remaining,
      talentAccountId: profile?.accountId ?? escrow.talentProfileId,
      agencyAccountId: profile?.agencyId ?? null,
    });

    postTransfer(
      splits.map((line) => ({
        debit: ACCOUNTS.escrow(escrow.id),
        credit: destinationFor(line, profile?.accountId ?? escrow.talentProfileId),
        amountCents: line.amountCents,
        reason: `${line.label} — ${escrow.projectTitle}`,
      })),
      { escrowId: escrow.id },
    );

    const updated: EscrowAgreement = {
      ...escrow,
      state: 'paid_out',
      releasedCents: escrow.grossCents,
      milestones: escrow.milestones.map((m) =>
        m.signedOffAt ? m : { ...m, signedOffBy: actorAccountId, signedOffAt: new Date().toISOString() },
      ),
      updatedAt: new Date().toISOString(),
    };
    persist(updated);
    notifyBothSides(updated, 'Payout complete', `${escrow.projectTitle} settled in full.`);
    return updated;
  });
}

export function raiseDispute(escrowId: string, actorAccountId: string, note: string): EscrowAgreement {
  const escrow = load(escrowId);
  assertTransition(escrow.state, 'dispute_raised');

  return tx(() => {
    // Freeze whatever is still in escrow so no milestone can drain it.
    const remaining = balanceOf(ACCOUNTS.escrow(escrow.id));
    if (remaining > 0) {
      postTransfer(
        [
          {
            debit: ACCOUNTS.escrow(escrow.id),
            credit: ACCOUNTS.disputeHold(escrow.id),
            amountCents: remaining,
            reason: `Dispute freeze: ${note || 'no reason supplied'}`,
          },
        ],
        { escrowId: escrow.id },
      );
    }

    const openedAt = new Date();
    const updated: EscrowAgreement = {
      ...escrow,
      state: 'dispute_raised',
      disputeOpenedAt: openedAt.toISOString(),
      // 72-hour arbitration countdown before a human adjudicator is paged.
      disputeDeadlineAt: new Date(openedAt.getTime() + 72 * 3600_000).toISOString(),
      updatedAt: openedAt.toISOString(),
    };
    persist(updated);
    notifyBothSides(updated, 'Dispute raised', '72-hour arbitration window has started.');
    void actorAccountId;
    return updated;
  });
}

export function resolveDispute(
  escrowId: string,
  resolution: 'release_to_talent' | 'refund_payer' | 'split',
): EscrowAgreement {
  const escrow = load(escrowId);
  if (escrow.state !== 'dispute_raised') {
    throw new EscrowError('NOT_DISPUTED', 'This escrow is not in dispute');
  }

  return tx(() => {
    const held = balanceOf(ACCOUNTS.disputeHold(escrow.id));
    const profile = profileById(escrow.talentProfileId);
    const talentAccountId = profile?.accountId ?? escrow.talentProfileId;

    if (held > 0) {
      if (resolution === 'refund_payer') {
        postTransfer(
          [
            {
              debit: ACCOUNTS.disputeHold(escrow.id),
              credit: ACCOUNTS.payer(escrow.payerAccountId),
              amountCents: held,
              reason: 'Arbitration: refunded to payer',
            },
          ],
          { escrowId: escrow.id },
        );
      } else {
        const payable = resolution === 'split' ? Math.floor(held / 2) : held;
        const refund = held - payable;
        const splits = computeSplits({
          grossCents: payable,
          talentAccountId,
          agencyAccountId: profile?.agencyId ?? null,
        });
        const lines = splits.map((line) => ({
          debit: ACCOUNTS.disputeHold(escrow.id),
          credit: destinationFor(line, talentAccountId),
          amountCents: line.amountCents,
          reason: `Arbitration: ${line.label}`,
        }));
        if (refund > 0) {
          lines.push({
            debit: ACCOUNTS.disputeHold(escrow.id),
            credit: ACCOUNTS.payer(escrow.payerAccountId),
            amountCents: refund,
            reason: 'Arbitration: partial refund to payer',
          });
        }
        postTransfer(lines, { escrowId: escrow.id });
      }
    }

    const updated: EscrowAgreement = {
      ...escrow,
      state: resolution === 'refund_payer' ? 'refunded' : 'paid_out',
      releasedCents: resolution === 'refund_payer' ? escrow.releasedCents : escrow.grossCents,
      disputeOpenedAt: escrow.disputeOpenedAt,
      disputeDeadlineAt: null,
      updatedAt: new Date().toISOString(),
    };
    persist(updated);
    notifyBothSides(updated, 'Dispute resolved', `Arbitration outcome: ${resolution.replace(/_/g, ' ')}.`);
    return updated;
  });
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function releaseTranche(escrow: EscrowAgreement, amountCents: number, reason: string): void {
  if (amountCents <= 0) return;
  const available = balanceOf(ACCOUNTS.escrow(escrow.id));
  const amount = Math.min(amountCents, available);
  if (amount <= 0) return;

  const profile = profileById(escrow.talentProfileId);
  const talentAccountId = profile?.accountId ?? escrow.talentProfileId;
  const splits = computeSplits({
    grossCents: amount,
    talentAccountId,
    agencyAccountId: profile?.agencyId ?? null,
  });

  postTransfer(
    splits.map((line) => ({
      debit: ACCOUNTS.escrow(escrow.id),
      credit: destinationFor(line, talentAccountId),
      amountCents: line.amountCents,
      reason: `${reason} — ${line.label}`,
    })),
    { escrowId: escrow.id },
  );
}

function destinationFor(line: SplitLine, talentAccountId: string): string {
  switch (line.party) {
    case 'talent':
      return ACCOUNTS.talent(talentAccountId);
    case 'agency':
      return ACCOUNTS.agency(line.accountId ?? 'unassigned');
    case 'platform':
      return ACCOUNTS.platformRevenue;
    case 'union_tax':
      return ACCOUNTS.unionWithholding;
  }
}

function signMilestone(
  milestones: EscrowMilestone[],
  kind: EscrowMilestone['kind'],
  actorAccountId: string,
): EscrowMilestone[] {
  return milestones.map((m) =>
    m.kind === kind && !m.signedOffAt
      ? { ...m, signedOffBy: actorAccountId, signedOffAt: new Date().toISOString() }
      : m,
  );
}

function load(escrowId: string): EscrowAgreement {
  const escrow = escrowById(escrowId);
  if (!escrow) throw new EscrowError('NOT_FOUND', 'Unknown escrow');
  return escrow;
}

export function persist(escrow: EscrowAgreement): void {
  const exists = get<{ id: string }>('SELECT id FROM escrows WHERE id = ?', escrow.id);
  if (exists) {
    run(
      `UPDATE escrows SET state = ?, funded_cents = ?, released_cents = ?, data = ?, updated_at = ?
        WHERE id = ?`,
      escrow.state,
      escrow.fundedCents,
      escrow.releasedCents,
      JSON.stringify(escrow),
      escrow.updatedAt,
      escrow.id,
    );
  } else {
    run(
      `INSERT INTO escrows (id, project_id, talent_profile_id, payer_account_id, state, gross_cents, funded_cents, released_cents, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      escrow.id,
      escrow.projectId,
      escrow.talentProfileId,
      escrow.payerAccountId,
      escrow.state,
      escrow.grossCents,
      escrow.fundedCents,
      escrow.releasedCents,
      JSON.stringify(escrow),
      escrow.createdAt,
      escrow.updatedAt,
    );
  }
}

function notifyBothSides(escrow: EscrowAgreement, title: string, body: string): void {
  const profile = profileById(escrow.talentProfileId);
  const link = `/agency/escrow/${escrow.id}`;
  if (profile) notify(profile.accountId, { kind: 'escrow', title, body, deepLink: link, priority: 'normal' });
  notify(escrow.payerAccountId, { kind: 'escrow', title, body, deepLink: link, priority: 'normal' });
  const agencyAccountId = profile?.agencyId ?? agencyIdForAccount(profile?.accountId ?? '');
  if (agencyAccountId) {
    notify(agencyAccountId, { kind: 'escrow', title, body, deepLink: link, priority: 'normal' });
  }
}

export function ledgerFor(escrowId: string) {
  return entriesForEscrow(escrowId);
}
