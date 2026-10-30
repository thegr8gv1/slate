import { readFile } from 'node:fs/promises';
import Fastify from 'fastify';
import cors from '@fastify/cors';

import { closeDb, db } from './db/index.js';
import { seed } from './db/seed.js';
import { expireStaleBeacons } from './domain/beacon.js';
import { auditAllProfiles } from './domain/trust.js';
import { sendError } from './lib/http.js';
import { authRoutes } from './routes/auth.js';
import { brandRoutes } from './routes/brand.js';
import { discoveryRoutes } from './routes/discovery.js';
import { moneyRoutes } from './routes/money.js';
import { projectRoutes } from './routes/projects.js';
import { talentRoutes } from './routes/talent.js';
import { workspaceRoutes } from './routes/workspace.js';

const PORT = Number(process.env.PORT ?? 4000);
const HOST = process.env.HOST ?? '0.0.0.0';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.stdout.isTTY
        ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname,reqId' } }
        : undefined,
    },
    // Mobile clients on flaky networks retry aggressively; a generous body
    // limit keeps self-tape metadata posts from bouncing.
    bodyLimit: 4 * 1024 * 1024,
  });

  // The API is consumed by native apps (no Origin header) and by the web build
  // on a different port, so the allowlist is permissive in dev and driven by
  // SLATE_ALLOWED_ORIGINS in production.
  const allowed = process.env.SLATE_ALLOWED_ORIGINS?.split(',').map((o) => o.trim());
  await app.register(cors, {
    origin: allowed && allowed.length > 0 ? allowed : true,
    credentials: true,
  });

  app.setErrorHandler((error, _request, reply) => {
    if (!(error as { status?: number }).status) app.log.error(error);
    return sendError(reply, error);
  });

  app.get('/', async () => ({
    service: 'slate-api',
    version: '1.0.0',
    region: process.env.SLATE_REGION ?? 'us-west',
    cell: process.env.SLATE_CELL ?? 'cell-03',
    docs: '/openapi',
  }));

  app.get('/health', async () => ({ ok: true, at: new Date().toISOString() }));

  app.get('/privacy', async (_request, reply) => {
    const privacyHtml = await readFile(new URL('./privacy.html', import.meta.url), 'utf-8');
    reply.type('text/html; charset=utf-8');
    return reply.send(privacyHtml);
  });

  await app.register(authRoutes);
  await app.register(discoveryRoutes);
  await app.register(projectRoutes);
  await app.register(moneyRoutes);
  await app.register(talentRoutes);
  await app.register(brandRoutes);
  await app.register(workspaceRoutes);

  return app;
}

/**
 * Background workers.
 *
 * In the target architecture these are Temporal schedules on a separate worker
 * fleet. Co-locating them here keeps the single-node deployment honest about
 * *when* the work happens without pretending it is distributed.
 */
function startWorkers(log: { info: (msg: string) => void }): NodeJS.Timeout[] {
  const beaconSweep = setInterval(() => {
    const expired = expireStaleBeacons();
    if (expired > 0) log.info(`beacon sweep: expired ${expired} stale beacon(s)`);
  }, 60_000);

  // The real cadence is 24h; compressed here so a running demo shows the
  // suppression path actually firing.
  const auditSweep = setInterval(() => {
    const result = auditAllProfiles();
    log.info(`social audit sweep: ${result.audited} profiles, ${result.suppressed} suppressed`);
  }, 15 * 60_000);

  beaconSweep.unref?.();
  auditSweep.unref?.();
  return [beaconSweep, auditSweep];
}

async function main(): Promise<void> {
  db();
  const result = seed(false);

  const app = await buildServer();
  const timers = startWorkers(app.log);

  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received — draining`);
    for (const timer of timers) clearInterval(timer);
    await app.close();
    closeDb();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`slate-api ready · ${result.profiles} talent profiles loaded`);
}

const invokedDirectly = process.argv[1]?.replace(/\\/g, '/').endsWith('src/server.ts');
if (invokedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
