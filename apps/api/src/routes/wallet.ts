import type { FastifyInstance } from 'fastify';
import type { WalletSummary, WalletTransactionItem } from '../contracts/index.js';
import { all, get, run } from '../db/index.js';
import { badRequest, requireAccount } from '../lib/http.js';
import { newId } from '../lib/ids.js';

interface WalletRow {
  id: string;
  account_id: string;
  title: string;
  category: string;
  amount_cents: number;
  date_str: string;
  type: string;
  status: string;
  note: string | null;
  created_at: string;
}

export async function walletRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Get user wallet summary, available balance, escrow pending, and history.
   */
  app.get('/wallet', async (request) => {
    const account = requireAccount(request);

    const rows = all<WalletRow>(
      'SELECT * FROM wallet_items WHERE account_id = ? ORDER BY created_at DESC',
      account.id
    );

    let availableBalanceCents = 0;
    let escrowPendingCents = 0;
    let lifetimeEarningsCents = 0;

    const transactions: WalletTransactionItem[] = rows.map((r) => {
      if (r.status === 'available') {
        availableBalanceCents += r.amount_cents;
        lifetimeEarningsCents += r.amount_cents;
      } else if (r.status === 'held_escrow') {
        escrowPendingCents += r.amount_cents;
      }

      return {
        id: r.id,
        title: r.title,
        category: r.category,
        amountCents: r.amount_cents,
        date: r.date_str,
        type: r.type as WalletTransactionItem['type'],
        status: r.status as WalletTransactionItem['status'],
        note: r.note ?? undefined,
      };
    });

    const summary: WalletSummary = {
      availableBalanceCents,
      escrowPendingCents,
      lifetimeEarningsCents,
      transactions,
    };

    return summary;
  });

  /**
   * Cash out available balance to bank / debit card.
   */
  app.post('/wallet/cashout', async (request) => {
    const account = requireAccount(request);

    const availableRows = all<WalletRow>(
      "SELECT * FROM wallet_items WHERE account_id = ? AND status = 'available'",
      account.id
    );

    const totalToCashOut = availableRows.reduce((sum, r) => sum + r.amount_cents, 0);
    if (totalToCashOut <= 0) {
      throw badRequest('No available balance to cash out at this time.');
    }

    // Mark previous available rows as paid_out
    run(
      "UPDATE wallet_items SET status = 'paid_out' WHERE account_id = ? AND status = 'available'",
      account.id
    );

    // Record cashout event
    const cashoutId = newId('w_out');
    run(
      'INSERT INTO wallet_items (id, account_id, title, category, amount_cents, date_str, type, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      cashoutId,
      account.id,
      'Direct Deposit to Bank Account',
      'Cash Out',
      -totalToCashOut,
      'Today',
      'cashout',
      'paid_out',
      'Transferred via ACH Direct Deposit • Typically arrives in 1-2 business days',
      new Date().toISOString()
    );

    return {
      ok: true,
      amountCents: totalToCashOut,
      message: `Successfully transferred $${(totalToCashOut / 100).toFixed(2)} to your linked bank account!`,
    };
  });
}
