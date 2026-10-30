import { SECTORS, UNION_STATUSES } from '../contracts/index.js';
import type { Sector, UnionStatus } from '../contracts/index.js';

/**
 * Two-tower feature encoder.
 *
 * Both towers project into the same 48-dimensional space so a dot product is a
 * meaningful relevance score. In production these weights come from a trained
 * retrieval model; here the encoder is a deterministic, inspectable stand-in
 * with the identical feature layout, so the serving path (encode -> ANN search
 * -> rerank) is exercised end to end.
 *
 * Layout
 *   [ 0.. 7] sector one-hot
 *   [ 8..12] union one-hot
 *   [13..15] rate band (log-scaled, low/mid/high membership)
 *   [16..19] reach & authenticity
 *   [20..23] track record
 *   [24..47] hashed role + specialty tokens
 */

export const EMBEDDING_DIM = 48;
const HASH_OFFSET = 24;
const HASH_BUCKETS = 24;

function hashToken(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % HASH_BUCKETS;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t.length > 2);
}

/** Rate bands are log-scaled: $250/day and $25,000/day must stay separable. */
function rateFeatures(cents: number): [number, number, number] {
  const dollars = Math.max(1, cents / 100);
  const logged = Math.log10(dollars) / 5; // ~0.46 at $250, ~0.88 at $25k
  const low = Math.max(0, 1 - Math.abs(dollars - 500) / 1500);
  const high = Math.min(1, Math.max(0, (dollars - 3000) / 20000));
  return [logged, low, high];
}

export interface TalentFeatures {
  sector: Sector;
  unionStatus: UnionStatus;
  dayRateCents: number;
  followers: number;
  engagementRate: number;
  eai: number;
  fraudScore: number;
  rating: number;
  bookingsCompleted: number;
  responseScore: number;
  creditCount: number;
  primaryRole: string;
  specialties: string[];
}

export interface QueryFeatures {
  sectors: Sector[];
  unionStatuses: UnionStatus[];
  targetRateCents: number;
  minFollowers: number;
  wantsAuthenticity: boolean;
  roles: string[];
  keywords: string[];
}

function base(): number[] {
  return new Array(EMBEDDING_DIM).fill(0);
}

export function encodeTalent(f: TalentFeatures): number[] {
  const v = base();
  v[SECTORS.indexOf(f.sector)] = 1;
  v[8 + UNION_STATUSES.indexOf(f.unionStatus)] = 1;

  const [logged, low, high] = rateFeatures(f.dayRateCents);
  v[13] = logged;
  v[14] = low;
  v[15] = high;

  v[16] = Math.min(1, Math.log10(Math.max(1, f.followers)) / 8);
  v[17] = Math.min(1, f.engagementRate / 12);
  v[18] = f.eai / 100;
  v[19] = 1 - Math.min(1, f.fraudScore / 0.6);

  v[20] = f.rating / 5;
  v[21] = Math.min(1, f.bookingsCompleted / 60);
  v[22] = f.responseScore / 100;
  v[23] = Math.min(1, f.creditCount / 25);

  for (const token of [...tokenize(f.primaryRole), ...f.specialties.flatMap(tokenize)]) {
    v[HASH_OFFSET + hashToken(token)] += 1;
  }
  return normalize(v);
}

export function encodeQuery(q: QueryFeatures): number[] {
  const v = base();
  for (const sector of q.sectors) v[SECTORS.indexOf(sector)] = 1;
  if (q.sectors.length === 0) for (let i = 0; i < SECTORS.length; i += 1) v[i] = 0.35;

  for (const union of q.unionStatuses) v[8 + UNION_STATUSES.indexOf(union)] = 1;
  if (q.unionStatuses.length === 0) for (let i = 0; i < UNION_STATUSES.length; i += 1) v[8 + i] = 0.35;

  const [logged, low, high] = rateFeatures(q.targetRateCents);
  v[13] = logged;
  v[14] = low;
  v[15] = high;

  v[16] = q.minFollowers > 0 ? Math.min(1, Math.log10(q.minFollowers) / 8) : 0.3;
  v[17] = q.wantsAuthenticity ? 0.8 : 0.4;
  v[18] = q.wantsAuthenticity ? 1 : 0.5;
  v[19] = q.wantsAuthenticity ? 1 : 0.5;

  // Productions always prefer proven, responsive talent — constant positive prior.
  v[20] = 0.9;
  v[21] = 0.6;
  v[22] = 0.8;
  v[23] = 0.6;

  for (const token of [...q.roles.flatMap(tokenize), ...q.keywords.flatMap(tokenize)]) {
    v[HASH_OFFSET + hashToken(token)] += 1;
  }
  return normalize(v);
}

export function normalize(v: number[]): number[] {
  const magnitude = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)) || 1;
  return v.map((x) => x / magnitude);
}

/** Cosine similarity — both towers emit unit vectors, so this is a dot product. */
export function similarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < EMBEDDING_DIM; i += 1) dot += a[i] * b[i];
  return dot;
}

export function serialize(v: number[]): string {
  return v.map((x) => x.toFixed(5)).join(',');
}

export function deserialize(s: string): number[] {
  const parsed = s.split(',').map(Number);
  return parsed.length === EMBEDDING_DIM ? parsed : base();
}
