import { UNION_LABELS, bpsToPct, formatCount, formatMoney, type UnionStatus } from '../contracts';

export { bpsToPct, formatCount, formatMoney };

export function unionLabel(status: UnionStatus): string {
  return UNION_LABELS[status] ?? status;
}

/** "$1,200/day", "$15,000/wk", "$24,000 flat". */
export function rateLabel(cents: number, unit: 'day' | 'week' | 'flat' | 'episode'): string {
  const amount = formatMoney(cents);
  switch (unit) {
    case 'week':
      return `${amount}/wk`;
    case 'episode':
      return `${amount}/ep`;
    case 'flat':
      return `${amount} flat`;
    default:
      return `${amount}/day`;
  }
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const delta = Date.now() - Date.parse(iso);
  if (Number.isNaN(delta)) return '—';

  const future = delta < 0;
  const abs = Math.abs(delta);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return 'now';
  if (minutes < 60) return future ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return future ? `in ${days}d` : `${days}d ago`;
  const weeks = Math.round(days / 7);
  if (weeks < 5) return future ? `in ${weeks}w` : `${weeks}w ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function clockTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function timecode(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const frames = Math.round((seconds % 1) * 24);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}:${pad(frames)}`;
}

function pad(n: number): string {
  return String(Math.floor(n)).padStart(2, '0');
}

export function titleCase(value: string): string {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** "3.4 mi" / "820 ft" — distances read differently at either end of the scale. */
export function distanceLabel(miles: number): string {
  if (miles < 0.2) return `${Math.round(miles * 5280)} ft`;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

export function hoursUntil(iso: string): string {
  const hours = (Date.parse(iso) - Date.now()) / 3600_000;
  if (Number.isNaN(hours)) return 'ASAP';
  if (hours <= 0) return 'NOW';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} MIN`;
  if (hours < 48) return `${Math.round(hours)} HRS`;
  return `${Math.round(hours / 24)} DAYS`;
}
