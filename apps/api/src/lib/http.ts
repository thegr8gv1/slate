import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Account } from '../contracts/index.js';
import { accountById } from '../db/repo.js';
import { verifyToken } from './crypto.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Sign in to continue') =>
  new HttpError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'Not permitted for this workspace') =>
  new HttpError(403, 'FORBIDDEN', message);
export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found`);
export const conflict = (message: string) => new HttpError(409, 'CONFLICT', message);
export const paymentRequired = (message: string) =>
  new HttpError(402, 'PLAN_LIMIT', message);

/** Resolves the caller from the bearer token, or throws 401. */
export function requireAccount(request: FastifyRequest): Account {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw unauthorized();
  const claims = verifyToken(header.slice(7));
  if (!claims) throw unauthorized('Session expired — sign in again');
  const account = accountById(claims.sub);
  if (!account) throw unauthorized('Account no longer exists');
  return account;
}

export function requireWorkspace(request: FastifyRequest, workspace: Account['workspaces'][number]): Account {
  const account = requireAccount(request);
  if (!account.workspaces.includes(workspace)) {
    throw forbidden(`This action needs the ${workspace} workspace`);
  }
  return account;
}

export function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof HttpError) {
    return reply.status(error.status).send({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }
  const named = error as { name?: string; code?: string; message?: string };
  // Domain errors carry their own machine-readable code; surface it as a 409
  // so clients can distinguish a rule violation from a server fault.
  if (named?.name && ['LedgerError', 'EscrowError', 'BeaconError'].includes(named.name)) {
    return reply.status(409).send({
      error: { code: named.code ?? 'DOMAIN_ERROR', message: named.message ?? 'Rejected' },
    });
  }
  return reply.status(500).send({
    error: { code: 'INTERNAL', message: named?.message ?? 'Unexpected server error' },
  });
}

/** Query params arrive as strings; these coerce with sane fallbacks. */
export function num(value: unknown, fallback?: number): number | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function list(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  return String(value)
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export function bool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === '1';
}
