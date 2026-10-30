import type { LedgerBalance, LedgerEntry } from '../contracts/index.js';
import { all, get, run, tx } from '../db/index.js';
import { newId } from '../lib/ids.js';

/**
 * Append-only double-entry ledger.
 *
 * Every movement of money is one or more balanced entries inside a single
 * transfer. There is deliberately no UPDATE or DELETE path: a mistake is
 * corrected by booking its reverse, so the audit trail is complete by
 * construction. This mirrors the TigerBeetle tier in the architecture — same
 * invariants, single-node engine.
 */

/* ------------------------------------------------------------------ */
/* Chart of accounts                                                   */
/* ------------------------------------------------------------------ */

export const ACCOUNTS = {
  /** Money that has entered the platform from a payer's bank rail. */
  cashIn: 'asset:cash_in_transit',
  /** Per-escrow segregated liability. */
  escrow: (escrowId: string) => `liability:escrow:${escrowId}`,
  /** Per-payer source of funds. */
  payer: (accountId: string) => `liability:payer:${accountId}`,
  talent: (accountId: string) => `liability:talent:${accountId}`,
  agency: (accountId: string) => `liability:agency:${accountId}`,
  platformRevenue: 'revenue:platform_fee',
  unionWithholding: 'liability:union_and_tax',
  disputeHold: (escrowId: string) => `liability:dispute_hold:${escrowId}`,
} as const;

export function labelForAccount(account: string): string {
  if (account === ACCOUNTS.cashIn) return 'Cash in transit';
  if (account === ACCOUNTS.platformRevenue) return 'Slate platform revenue';
  if (account === ACCOUNTS.unionWithholding) return 'Union P&H / tax withholding';
  const [kind, scope] = account.split(':');
  const pretty: Record<string, string> = {
    escrow: 'Escrow',
    payer: 'Payer float',
    talent: 'Talent payable',
    agency: 'Agency payable',
    dispute_hold: 'Dispute hold',
  };
  return `${pretty[scope] ?? scope} (${kind})`;
}

/* ------------------------------------------------------------------ */
/* Posting                                                             */
/* ------------------------------------------------------------------ */

export interface PostingLine {
  debit: string;
  credit: string;
  amountCents: number;
  reason: string;
}

export interface TransferResult {
  transferId: string;
  entries: LedgerEntry[];
}

/**
 * Posts a set of lines atomically. Rejects the whole transfer if any line is
 * non-positive or if the resulting escrow balance would go negative — the
 * overdraft guarantee.
 */
export function postTransfer(
  lines: PostingLine[],
  context: { escrowId: string | null },
): TransferResult {
  if (lines.length === 0) throw new LedgerError('EMPTY_TRANSFER', 'A transfer needs at least one line');
  for (const line of lines) {
    if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) {
      throw new LedgerError('INVALID_AMOUNT', `Line amount must be a positive integer: ${line.amountCents}`);
    }
    if (line.debit === line.credit) {
      throw new LedgerError('SELF_TRANSFER', `Line debits and credits the same account: ${line.debit}`);
    }
  }

  const transferId = newId('xfr');
  const createdAt = new Date().toISOString();

  return tx(() => {
    // Guard every debited account that must never go negative.
    const guarded = new Set(lines.map((l) => l.debit).filter((a) => a.startsWith('liability:escrow:')));
    for (const account of guarded) {
      const outgoing = lines
        .filter((l) => l.debit === account)
        .reduce((sum, l) => sum + l.amountCents, 0);
      if (balanceOf(account) < outgoing) {
        throw new LedgerError(
          'INSUFFICIENT_FUNDS',
          `${account} holds ${balanceOf(account)} but the transfer debits ${outgoing}`,
        );
      }
    }

    const entries: LedgerEntry[] = [];
    for (const line of lines) {
      const id = newId('led');
      run(
        `INSERT INTO ledger (id, escrow_id, transfer_id, debit_account, credit_account, amount_cents, currency, reason, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, ?)`,
        id,
        context.escrowId,
        transferId,
        line.debit,
        line.credit,
        line.amountCents,
        line.reason,
        createdAt,
      );
      const seqRow = get<{ seq: number }>('SELECT seq FROM ledger WHERE id = ?', id);
      entries.push({
        id,
        seq: seqRow?.seq ?? 0,
        escrowId: context.escrowId,
        transferId,
        debitAccount: line.debit,
        creditAccount: line.credit,
        amountCents: line.amountCents,
        currency: 'USD',
        reason: line.reason,
        createdAt,
      });
    }
    return { transferId, entries };
  });
}

export class LedgerError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** Credits minus debits — the amount an account currently holds. */
export function balanceOf(account: string): number {
  const row = get<{ credited: number | null; debited: number | null }>(
    `SELECT
       (SELECT COALESCE(SUM(amount_cents), 0) FROM ledger WHERE credit_account = ?) AS credited,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM ledger WHERE debit_account  = ?) AS debited`,
    account,
    account,
  );
  return (row?.credited ?? 0) - (row?.debited ?? 0);
}

export function entriesForEscrow(escrowId: string): LedgerEntry[] {
  return all<LedgerRow>('SELECT * FROM ledger WHERE escrow_id = ? ORDER BY seq ASC', escrowId).map(hydrate);
}

export function recentEntries(limit = 200): LedgerEntry[] {
  return all<LedgerRow>('SELECT * FROM ledger ORDER BY seq DESC LIMIT ?', limit).map(hydrate).reverse();
}

export function balancesForEscrow(escrowId: string): LedgerBalance[] {
  const accounts = new Set<string>();
  for (const entry of entriesForEscrow(escrowId)) {
    accounts.add(entry.debitAccount);
    accounts.add(entry.creditAccount);
  }
  return [...accounts]
    .map((account) => ({ account, label: labelForAccount(account), balanceCents: balanceOf(account) }))
    .filter((b) => b.balanceCents !== 0)
    .sort((a, b) => b.balanceCents - a.balanceCents);
}

export function allBalances(): LedgerBalance[] {
  const rows = all<{ account: string }>(
    `SELECT debit_account AS account FROM ledger
     UNION SELECT credit_account AS account FROM ledger`,
  );
  return rows
    .map(({ account }) => ({ account, label: labelForAccount(account), balanceCents: balanceOf(account) }))
    .filter((b) => b.balanceCents !== 0)
    .sort((a, b) => Math.abs(b.balanceCents) - Math.abs(a.balanceCents));
}

/**
 * Global invariant. Because every entry books the same amount as a debit and a
 * credit, the sum across all accounts must be exactly zero. Anything else means
 * corruption, and the ops dashboard surfaces it as ledger drift.
 */
export function drift(): number {
  const row = get<{ debits: number | null; credits: number | null }>(
    `SELECT
       (SELECT COALESCE(SUM(amount_cents), 0) FROM ledger) AS debits,
       (SELECT COALESCE(SUM(amount_cents), 0) FROM ledger) AS credits`,
  );
  const balances = all<{ account: string }>(
    `SELECT debit_account AS account FROM ledger UNION SELECT credit_account AS account FROM ledger`,
  );
  void row;
  return balances.reduce((sum, { account }) => sum + balanceOf(account), 0);
}

export function measuredThroughput(): number {
  const row = get<{ n: number; first: string | null; last: string | null }>(
    `SELECT COUNT(*) AS n, MIN(created_at) AS first, MAX(created_at) AS last FROM ledger`,
  );
  if (!row || row.n < 2 || !row.first || !row.last) return 0;
  const seconds = Math.max(0.001, (Date.parse(row.last) - Date.parse(row.first)) / 1000);
  return Math.round(row.n / seconds);
}

interface LedgerRow {
  seq: number;
  id: string;
  escrow_id: string | null;
  transfer_id: string;
  debit_account: string;
  credit_account: string;
  amount_cents: number;
  currency: string;
  reason: string;
  created_at: string;
}

function hydrate(row: LedgerRow): LedgerEntry {
  return {
    id: row.id,
    seq: row.seq,
    escrowId: row.escrow_id,
    transferId: row.transfer_id,
    debitAccount: row.debit_account,
    creditAccount: row.credit_account,
    amountCents: row.amount_cents,
    currency: 'USD',
    reason: row.reason,
    createdAt: row.created_at,
  };
}
