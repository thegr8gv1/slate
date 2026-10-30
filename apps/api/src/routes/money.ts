import type { FastifyInstance } from 'fastify';
import type { AgreementKind, CreateEscrowRequest, EscrowActionRequest } from '../contracts/index.js';
import { SLO } from '../contracts/index.js';
import {
  agreementById,
  agreementsForAccount,
  agreementsForRoster,
  escrowById,
  escrowsForPayer,
  escrowsForProfile,
  escrowsForRoster,
  profileByAccount,
  projectById,
} from '../db/repo.js';
import {
  checkIn,
  createEscrow,
  fundEscrow,
  raiseDispute,
  releaseFinal,
  resolveDispute,
  signOffMilestone,
} from '../domain/escrow.js';
import { issueAgreement, pendingFor, signAgreement, verifyIntegrity } from '../domain/agreements.js';
import {
  allBalances,
  balancesForEscrow,
  drift,
  entriesForEscrow,
  measuredThroughput,
  recentEntries,
} from '../domain/ledger.js';
import { badRequest, forbidden, notFound, requireAccount } from '../lib/http.js';

export async function moneyRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------- Escrow ---------------------------------------- */

  app.get('/escrows', async (request) => {
    const account = requireAccount(request);
    const profile = profileByAccount(account.id);
    // Three lenses on the same table: money this account owes, money it is
    // owed, and — for an agency — money moving across the talent it represents
    // and takes commission from.
    return {
      payable: escrowsForPayer(account.id),
      receivable: profile ? escrowsForProfile(profile.id) : [],
      roster: account.workspaces.includes('agency') ? escrowsForRoster(account.id) : [],
    };
  });

  app.get('/escrows/:id', async (request) => {
    requireAccount(request);
    const { id } = request.params as { id: string };
    const escrow = escrowById(id);
    if (!escrow) throw notFound('Escrow');
    return {
      escrow,
      ledger: entriesForEscrow(id),
      balances: balancesForEscrow(id),
      project: projectById(escrow.projectId),
      agreement: escrow.agreementId ? agreementById(escrow.agreementId) : null,
    };
  });

  app.post('/escrows', async (request) => {
    const account = requireAccount(request);
    const body = request.body as CreateEscrowRequest;
    if (!body?.projectId || !body?.talentProfileId || !body?.rateCents) {
      throw badRequest('projectId, talentProfileId and rateCents are required');
    }
    const project = projectById(body.projectId);
    if (!project) throw notFound('Project');
    if (project.ownerAccountId !== account.id) {
      throw forbidden('Only the project owner can open an escrow');
    }

    const escrow = createEscrow({
      projectId: body.projectId,
      talentProfileId: body.talentProfileId,
      payerAccountId: account.id,
      role: body.role ?? 'Talent',
      rateCents: body.rateCents,
      rateUnit: body.rateUnit ?? 'day',
      days: body.days,
      agreementId: body.agreementId,
    });
    return { escrow, ledger: entriesForEscrow(escrow.id), balances: balancesForEscrow(escrow.id) };
  });

  app.post('/escrows/:id/actions', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    const body = request.body as EscrowActionRequest;
    if (!body?.action) throw badRequest('action is required');

    const escrow = escrowById(id);
    if (!escrow) throw notFound('Escrow');

    const profile = profileByAccount(account.id);
    const isPayer = escrow.payerAccountId === account.id;
    const isTalent = profile?.id === escrow.talentProfileId;
    if (!isPayer && !isTalent) throw forbidden('You are not a party to this escrow');

    let updated;
    switch (body.action) {
      case 'fund':
        updated = fundEscrow(id, account.id);
        break;
      case 'check_in':
        updated = checkIn(id, account.id);
        break;
      case 'sign_milestone':
        if (!body.milestoneId) throw badRequest('milestoneId is required');
        updated = signOffMilestone(id, body.milestoneId, account.id);
        break;
      case 'release':
        updated = releaseFinal(id, account.id);
        break;
      case 'raise_dispute':
        updated = raiseDispute(id, account.id, body.note ?? '');
        break;
      case 'resolve_dispute':
        // Arbitration outcomes are adjudicator-only; the payer cannot self-serve.
        if (account.role !== 'admin' && account.plan !== 'studio_enterprise') {
          throw forbidden('Dispute resolution is handled by a Slate adjudicator');
        }
        updated = resolveDispute(id, body.resolution ?? 'split');
        break;
      default:
        throw badRequest(`Unknown escrow action: ${String(body.action)}`);
    }

    return { escrow: updated, ledger: entriesForEscrow(id), balances: balancesForEscrow(id) };
  });

  /* ---------------- Ledger ---------------------------------------- */

  app.get('/ledger', async (request) => {
    requireAccount(request);
    return {
      entries: recentEntries(200),
      balances: allBalances(),
      driftCents: drift(),
      throughputTps: measuredThroughput(),
      sloTps: SLO.ledgerTps,
    };
  });

  /* ---------------- Agreements ------------------------------------ */

  app.get('/agreements', async (request) => {
    const account = requireAccount(request);
    const own = agreementsForAccount(account.id);
    const roster = account.workspaces.includes('agency') ? agreementsForRoster(account.id) : [];

    // An agreement can reach an agency by both routes; de-duplicate by id.
    const byId = new Map(own.map((a) => [a.id, a]));
    for (const agreement of roster) if (!byId.has(agreement.id)) byId.set(agreement.id, agreement);

    return {
      agreements: [...byId.values()],
      pending: pendingFor(account.id),
      roster,
    };
  });

  app.get('/agreements/:id', async (request) => {
    requireAccount(request);
    const { id } = request.params as { id: string };
    const agreement = agreementById(id);
    if (!agreement) throw notFound('Agreement');
    return { agreement, integrity: verifyIntegrity(id) };
  });

  app.post('/agreements', async (request) => {
    const account = requireAccount(request);
    const body = request.body as {
      kind?: AgreementKind;
      counterpartyAccountId?: string;
      projectId?: string | null;
    };
    if (!body?.kind || !body?.counterpartyAccountId) {
      throw badRequest('kind and counterpartyAccountId are required');
    }
    const agreement = issueAgreement({
      kind: body.kind,
      issuer: account,
      counterpartyAccountId: body.counterpartyAccountId,
      projectId: body.projectId ?? null,
    });
    return { agreement };
  });

  app.post('/agreements/:id/sign', async (request) => {
    const account = requireAccount(request);
    const { id } = request.params as { id: string };
    const ip = request.ip ?? '0.0.0.0';
    const result = signAgreement(id, account, ip);
    return { agreement: result.agreement, unlockedProfileIds: result.unlockedProfileIds };
  });
}
