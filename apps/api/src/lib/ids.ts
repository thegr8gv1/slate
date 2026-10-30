import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz'; // Crockford base32, no look-alikes

/**
 * Sortable, collision-resistant identifier: 10 chars of millisecond timestamp
 * followed by 12 chars of entropy. Prefixed so a raw id is self-describing in
 * logs and ledger exports.
 */
export function newId(prefix: string): string {
  let time = Date.now();
  let stamp = '';
  for (let i = 0; i < 10; i += 1) {
    stamp = ALPHABET[time % 32] + stamp;
    time = Math.floor(time / 32);
  }
  const bytes = randomBytes(12);
  let entropy = '';
  for (let i = 0; i < 12; i += 1) entropy += ALPHABET[bytes[i] % 32];
  return `${prefix}_${stamp}${entropy}`;
}

/** Deterministic id used by the seeder so re-seeding is idempotent. */
export function staticId(prefix: string, key: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  let out = '';
  let n = h;
  for (let i = 0; i < 8; i += 1) {
    out = ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return `${prefix}_seed${out}`;
}
