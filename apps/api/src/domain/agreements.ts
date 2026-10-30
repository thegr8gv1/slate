import type { Agreement, AgreementKind, Account } from '../contracts/index.js';
import { all, get, run } from '../db/index.js';
import { accountById, agreementById, profileByAccount, projectById } from '../db/repo.js';
import { signatureDigest } from '../lib/crypto.js';
import { newId } from '../lib/ids.js';
import { notify } from './notifications.js';

/**
 * Standardised agreement issuance and digital signature.
 *
 * Signatures are HMAC digests over the immutable tuple
 * (agreementId, signerId, body, signedAt). Re-deriving the digest from the
 * stored body is how the vault proves a document has not been altered since it
 * was executed — change one character and every signature stops verifying.
 */

const TEMPLATES: Record<AgreementKind, { title: (ctx: TemplateContext) => string; body: (ctx: TemplateContext) => string }> = {
  nda: {
    title: (c) => `Mutual NDA — ${c.projectTitle ?? c.issuerName}`,
    body: (c) => `STANDARD MUTUAL NON-DISCLOSURE AGREEMENT

Between ${c.issuerName} ("Disclosing Party") and ${c.counterpartyName} ("Receiving Party"), effective ${c.today}.

1. CONFIDENTIAL INFORMATION. All scripts, sides, casting lists, budgets, schedules, rough cuts, and identity of attached talent disclosed in connection with ${c.projectTitle ?? 'the Production'} are Confidential Information.

2. OBLIGATIONS. The Receiving Party shall not reproduce, transmit, or publish any Confidential Information, and shall not disclose the existence or terms of any offer made through the Slate platform.

3. WATERMARKING. Receiving Party acknowledges that sides delivered through the Slate Casting Room are dynamically watermarked with the viewer identity, timestamp, and network address, and consents to that identification.

4. DISCREET TALENT. Where a talent profile is published under Slate Discreet Mode, Receiving Party shall treat the talent identity as Confidential Information whether or not it is separately marked.

5. TERM. Obligations survive three (3) years from the effective date, and indefinitely as to unreleased material.

6. GOVERNING LAW. California, without regard to conflict-of-law rules.`,
  },
  sag_aftra: {
    title: (c) => `SAG-AFTRA Standard Engagement — ${c.projectTitle ?? 'Production'}`,
    body: (c) => `SAG-AFTRA THEATRICAL / TELEVISION STANDARD ENGAGEMENT

Producer: ${c.issuerName}
Performer: ${c.counterpartyName}
Production: ${c.projectTitle ?? 'TBD'}
Effective: ${c.today}

1. ENGAGEMENT. Producer engages Performer subject to the SAG-AFTRA Codified Basic Agreement in force on the date of execution.

2. COMPENSATION. Day rate as stated in the linked Slate escrow record. Funds are deposited in full to segregated escrow prior to first call time.

3. PENSION & HEALTH. Producer shall remit contributions at the applicable P&H rate. Slate withholds and remits this amount automatically at wrap sign-off.

4. OVERTIME AND TURNAROUND. Per the Basic Agreement schedules; overages are added as escrow milestones and require 1st AD sign-off.

5. CREDIT. Per Producer's standard form, subject to Guild minimums.`,
  },
  equity: {
    title: (c) => `Actors' Equity Engagement — ${c.projectTitle ?? 'Production'}`,
    body: (c) => `ACTORS' EQUITY ASSOCIATION STANDARD ENGAGEMENT

Producer: ${c.issuerName}
Artist: ${c.counterpartyName}
Effective: ${c.today}

Engagement is subject to the applicable Equity agreement, including minimum weekly salary, rehearsal terms, and health contributions, which Slate calculates and withholds at each milestone release.`,
  },
  work_for_hire: {
    title: (c) => `Work-for-Hire — ${c.projectTitle ?? 'Engagement'}`,
    body: (c) => `INDEPENDENT CONTRACTOR / WORK-FOR-HIRE AGREEMENT

Client: ${c.issuerName}
Contractor: ${c.counterpartyName}
Effective: ${c.today}

1. SERVICES. Contractor shall provide the services described in the linked Slate booking record.

2. OWNERSHIP. All deliverables are works made for hire under 17 U.S.C. 101. To the extent any deliverable does not qualify, Contractor irrevocably assigns all right, title, and interest to Client on final payment.

3. PAYMENT. Client funds the full engagement into Slate escrow before work begins. Releases occur on the milestones recorded against this agreement.

4. TAX. Contractor is responsible for self-employment tax. Slate issues an annual 1099-NEC for amounts released through the platform.`,
  },
  brand_campaign: {
    title: (c) => `Brand Campaign Talent Agreement — ${c.issuerName}`,
    body: (c) => `BRAND CAMPAIGN TALENT AGREEMENT

Brand: ${c.issuerName}
Creator: ${c.counterpartyName}
Effective: ${c.today}

1. DELIVERABLES AND USAGE. As specified in the linked Slate campaign record, including platform, flight dates, and paid-media whitelisting scope.

2. AUTHENTICITY WARRANTY. Creator warrants that audience metrics are organic and has consented to continuous Slate engagement auditing. A verified audit score below the campaign threshold is a material breach.

3. EXCLUSIVITY. Category exclusivity applies for the flight window plus thirty (30) days.

4. PAYMENT. Escrow-funded, released on deliverable acceptance.`,
  },
  audition_release: {
    title: (c) => `Audition & Self-Tape Release — ${c.projectTitle ?? 'Casting'}`,
    body: (c) => `AUDITION AND SELF-TAPE RELEASE

Performer ${c.counterpartyName} consents to the recording of audition material for ${c.projectTitle ?? 'the Production'} and its internal review by ${c.issuerName}, its casting team, and attached financiers.

Material shall not be used for any commercial purpose, shall not be publicly distributed, and shall be deleted within twelve (12) months of the casting decision. Performer retains all other rights.`,
  },
};

interface TemplateContext {
  issuerName: string;
  counterpartyName: string;
  projectTitle: string | null;
  today: string;
}

export interface IssueAgreementInput {
  kind: AgreementKind;
  issuer: Account;
  counterpartyAccountId: string;
  projectId?: string | null;
  titleOverride?: string;
  bodyOverride?: string;
}

export function issueAgreement(input: IssueAgreementInput): Agreement {
  const counterparty = accountById(input.counterpartyAccountId);
  if (!counterparty) throw new Error('Unknown counterparty');
  const project = input.projectId ? projectById(input.projectId) : null;

  const ctx: TemplateContext = {
    issuerName: input.issuer.displayName,
    counterpartyName: counterparty.displayName,
    projectTitle: project?.title ?? null,
    today: new Date().toISOString().slice(0, 10),
  };

  const template = TEMPLATES[input.kind];
  const agreement: Agreement = {
    id: newId('agr'),
    kind: input.kind,
    title: input.titleOverride ?? template.title(ctx),
    projectId: project?.id ?? null,
    counterpartyAccountId: counterparty.id,
    counterpartyName: counterparty.displayName,
    counterpartyAvatarUrl: counterparty.avatarUrl,
    issuerAccountId: input.issuer.id,
    issuerName: input.issuer.displayName,
    body: input.bodyOverride ?? template.body(ctx),
    state: 'awaiting_signature',
    signatures: [],
    createdAt: new Date().toISOString(),
    executedAt: null,
  };

  persist(agreement);
  notify(counterparty.id, {
    kind: 'agreement',
    title: 'Signature requested',
    body: agreement.title,
    deepLink: `/agency/vault/${agreement.id}`,
    priority: 'high',
  });
  return agreement;
}

export interface SignResult {
  agreement: Agreement;
  unlockedProfileIds: string[];
}

export function signAgreement(agreementId: string, signer: Account, ip: string): SignResult {
  const agreement = agreementById(agreementId);
  if (!agreement) throw new Error('Unknown agreement');
  if (agreement.state === 'void') throw new Error('Agreement has been voided');

  if (agreement.signatures.some((s) => s.accountId === signer.id)) {
    return { agreement, unlockedProfileIds: [] };
  }
  if (![agreement.counterpartyAccountId, agreement.issuerAccountId].includes(signer.id)) {
    throw new Error('Only a named party may sign this agreement');
  }

  const signedAt = new Date().toISOString();
  const signature = {
    accountId: signer.id,
    displayName: signer.displayName,
    signedAt,
    digest: signatureDigest([agreement.id, signer.id, agreement.body, signedAt]),
    ip,
  };

  const signatures = [...agreement.signatures, signature];
  const signerIds = new Set(signatures.map((s) => s.accountId));
  const fullyExecuted =
    signerIds.has(agreement.counterpartyAccountId) && signerIds.has(agreement.issuerAccountId);

  const updated: Agreement = {
    ...agreement,
    signatures,
    state: fullyExecuted ? 'executed' : 'countersigned',
    executedAt: fullyExecuted ? signedAt : null,
  };
  persist(updated);

  // An executed NDA is the gate that reveals Discreet Mode profiles to the issuer.
  const unlockedProfileIds: string[] = [];
  if (fullyExecuted && updated.kind === 'nda') {
    const profile = profileByAccount(updated.counterpartyAccountId);
    if (profile?.discreet.enabled) unlockedProfileIds.push(profile.id);
  }

  const other = signer.id === updated.issuerAccountId ? updated.counterpartyAccountId : updated.issuerAccountId;
  notify(other, {
    kind: 'agreement',
    title: fullyExecuted ? 'Agreement executed' : 'Countersigned',
    body: `${signer.displayName} signed ${updated.title}`,
    deepLink: `/agency/vault/${updated.id}`,
    priority: 'normal',
  });

  return { agreement: updated, unlockedProfileIds };
}

/** Recomputes every stored digest; any mismatch means the body was altered. */
export function verifyIntegrity(agreementId: string): { valid: boolean; invalidSigners: string[] } {
  const agreement = agreementById(agreementId);
  if (!agreement) return { valid: false, invalidSigners: [] };
  const invalidSigners = agreement.signatures
    .filter(
      (s) => s.digest !== signatureDigest([agreement.id, s.accountId, agreement.body, s.signedAt]),
    )
    .map((s) => s.displayName);
  return { valid: invalidSigners.length === 0, invalidSigners };
}

export function pendingFor(accountId: string): Agreement[] {
  return all<{ data: string }>(
    `SELECT data FROM agreements
      WHERE (counterparty_account_id = ? OR issuer_account_id = ?)
        AND state IN ('awaiting_signature', 'countersigned')
      ORDER BY created_at DESC`,
    accountId,
    accountId,
  )
    .map((r) => JSON.parse(r.data) as Agreement)
    .filter((a) => !a.signatures.some((s) => s.accountId === accountId));
}

export function persist(agreement: Agreement): void {
  const exists = get<{ id: string }>('SELECT id FROM agreements WHERE id = ?', agreement.id);
  if (exists) {
    run(
      'UPDATE agreements SET state = ?, data = ?, executed_at = ? WHERE id = ?',
      agreement.state,
      JSON.stringify(agreement),
      agreement.executedAt,
      agreement.id,
    );
  } else {
    run(
      `INSERT INTO agreements (id, kind, title, project_id, counterparty_account_id, issuer_account_id, state, data, created_at, executed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      agreement.id,
      agreement.kind,
      agreement.title,
      agreement.projectId,
      agreement.counterpartyAccountId,
      agreement.issuerAccountId,
      agreement.state,
      JSON.stringify(agreement),
      agreement.createdAt,
      agreement.executedAt,
    );
  }
}
