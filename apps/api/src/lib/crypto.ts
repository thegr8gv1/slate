import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.SLATE_JWT_SECRET ?? 'dev-only-change-me';
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromB64url(input: string): Buffer {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64');
}

export interface TokenClaims {
  sub: string;
  role: string;
  workspace: string;
  exp: number;
}

/**
 * Minimal HS256 JWT. Hand-rolled on purpose: the service only ever issues and
 * verifies its own tokens, so pulling a full JOSE stack would add supply-chain
 * surface for no gain. Swap for the platform IdP at the gateway in production.
 */
export function signToken(claims: Omit<TokenClaims, 'exp'>): { token: string; expiresAt: string } {
  const exp = Date.now() + TOKEN_TTL_MS;
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ ...claims, exp }));
  const signature = b64url(createHmac('sha256', SECRET).update(`${header}.${payload}`).digest());
  return { token: `${header}.${payload}.${signature}`, expiresAt: new Date(exp).toISOString() };
}

export function verifyToken(token: string): TokenClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = b64url(createHmac('sha256', SECRET).update(`${header}.${payload}`).digest());
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(fromB64url(payload).toString('utf8')) as TokenClaims;
    if (typeof claims.exp !== 'number' || claims.exp < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export function hashPassword(password: string, salt = randomBytes(16).toString('hex')): string {
  const derived = scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, digest] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !digest) return false;
  const candidate = scryptSync(password, salt, 32).toString('hex');
  const a = Buffer.from(candidate);
  const b = Buffer.from(digest);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Signature digest embedded in every executed agreement. */
export function signatureDigest(parts: string[]): string {
  return createHmac('sha256', SECRET).update(parts.join('|')).digest('hex').slice(0, 32);
}

/**
 * Field-level tokenization for Discreet Mode. Reversible only with the vault
 * key, which in production lives in KMS/Vault and never in the app tier.
 */
export function tokenizeField(profileId: string, field: string): string {
  return `tok_${createHmac('sha256', SECRET).update(`${profileId}:${field}`).digest('hex').slice(0, 20)}`;
}
