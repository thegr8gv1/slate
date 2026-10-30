import { DEFAULT_SPLIT_BPS, commissionBpsFor } from './config';
import type { SplitLine } from './domain';

/** Cents in, "$1,250" / "$1.2K" out. All money crosses the wire as integer cents. */
export function formatMoney(
  cents: number | null | undefined,
  opts: { compact?: boolean; cents?: boolean } = {},
): string {
  if (cents == null) return '—';
  const dollars = cents / 100;
  if (opts.compact && Math.abs(dollars) >= 1000) {
    const units = [
      { v: 1e9, s: 'B' },
      { v: 1e6, s: 'M' },
      { v: 1e3, s: 'K' },
    ];
    const unit = units.find((u) => Math.abs(dollars) >= u.v)!;
    const scaled = dollars / unit.v;
    const digits = scaled >= 100 ? 0 : 1;
    return `$${trimZero(scaled.toFixed(digits))}${unit.s}`;
  }
  return `$${dollars.toLocaleString('en-US', {
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  })}`;
}

function trimZero(s: string): string {
  return s.endsWith('.0') ? s.slice(0, -2) : s;
}

export function formatCount(n: number): string {
  if (n >= 1e9) return `${trimZero((n / 1e9).toFixed(1))}B`;
  if (n >= 1e6) return `${trimZero((n / 1e6).toFixed(1))}M`;
  if (n >= 1e3) return `${trimZero((n / 1e3).toFixed(n >= 1e5 ? 0 : 1))}K`;
  return String(n);
}

export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}

export interface SplitInput {
  grossCents: number;
  agencyAccountId: string | null;
  talentAccountId: string;
  /** Overrides in bps; must sum with the remainder to 10000. */
  overrides?: Partial<Record<SplitLine['party'], number>>;
}

/**
 * Deterministic multi-party split.
 *
 * Uses largest-remainder allocation so the four lines always sum to exactly
 * `grossCents` — no rounding dust can escape the ledger.
 */
export function computeSplits(input: SplitInput): SplitLine[] {
  const platformBps = input.overrides?.platform ?? commissionBpsFor(input.grossCents);
  const agencyBps = input.agencyAccountId ? (input.overrides?.agency ?? DEFAULT_SPLIT_BPS.agency) : 0;
  const unionBps = input.overrides?.union_tax ?? DEFAULT_SPLIT_BPS.unionAndTax;
  const talentBps = 10_000 - platformBps - agencyBps - unionBps;

  type SpecLine = { party: SplitLine['party']; label: string; bps: number; accountId: string | null };
  const allLines: SpecLine[] = [
    { party: 'talent', label: 'Talent net', bps: talentBps, accountId: input.talentAccountId },
    { party: 'agency', label: 'Agency commission', bps: agencyBps, accountId: input.agencyAccountId },
    { party: 'platform', label: 'Slate platform fee', bps: platformBps, accountId: null },
    { party: 'union_tax', label: 'Union P&H / withholding', bps: unionBps, accountId: null },
  ];
  const spec: SpecLine[] = allLines.filter((line) => line.bps > 0);

  const raw = spec.map((line) => ({ ...line, exact: (input.grossCents * line.bps) / 10_000 }));
  const floored = raw.map((line) => ({ ...line, amountCents: Math.floor(line.exact) }));
  let remainder = input.grossCents - floored.reduce((sum, l) => sum + l.amountCents, 0);

  // Largest-remainder: hand the leftover cents to the biggest fractional parts.
  const order = [...floored]
    .map((line, index) => ({ index, frac: line.exact - Math.floor(line.exact) }))
    .sort((a, b) => b.frac - a.frac);

  for (const { index } of order) {
    if (remainder <= 0) break;
    floored[index].amountCents += 1;
    remainder -= 1;
  }

  return floored.map(({ party, label, bps, accountId, amountCents }) => ({
    party,
    label,
    bps,
    accountId,
    amountCents,
  }));
}

export function totalOf(splits: SplitLine[]): number {
  return splits.reduce((sum, s) => sum + s.amountCents, 0);
}
