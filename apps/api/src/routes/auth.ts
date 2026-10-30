import type { FastifyInstance } from 'fastify';
import type { LoginRequest, LoginResponse } from '../contracts/index.js';
import { kvGet } from '../db/index.js';
import { accountByEmail, hydrateAccount, profileByAccount } from '../db/repo.js';
import { signToken, verifyPassword } from '../lib/crypto.js';
import { badRequest, requireAccount, unauthorized } from '../lib/http.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/login', async (request) => {
    const body = request.body as Partial<LoginRequest>;
    if (!body?.email || !body?.password) throw badRequest('Email and password are required');

    const row = accountByEmail(body.email);
    // Constant-ish failure path: same error whether the email or the password
    // was wrong, so the endpoint cannot be used to enumerate accounts.
    if (!row || !verifyPassword(body.password, row.password_hash)) {
      throw unauthorized('Email or password is incorrect');
    }

    const account = hydrateAccount(row);
    const { token, expiresAt } = signToken({
      sub: account.id,
      role: account.role,
      workspace: account.workspaces[0] ?? 'talent',
    });
    return { token, account, expiresAt } satisfies LoginResponse;
  });

  app.get('/auth/me', async (request) => {
    const account = requireAccount(request);
    const profile = profileByAccount(account.id);
    return { account, profile };
  });

  /** Surfaces the seeded demo logins so the sign-in screen can offer one tap. */
  app.get('/auth/demo-accounts', async () => {
    const raw = kvGet('demo_accounts');
    return raw ? JSON.parse(raw) : {};
  });
}
