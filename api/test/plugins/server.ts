import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import type { Config } from '../../plugins/cfg.js';
import { createSession, type SessionDependencies } from '../../plugins/auth/session.js';
import { GatewayError } from '../../plugins/auth/errors.js';

export async function buildTestServer(config: Config, dependencies: SessionDependencies) {
  const app = Fastify({ logger: false });
  await app.register(cookie);
  const session = createSession(config, dependencies);
  app.setErrorHandler((error, _request, reply) => {
    const known = error instanceof GatewayError ? error : new GatewayError(503, 'gateway_unavailable', 1);
    reply.header('Cache-Control', 'no-store');
    if (known.retryAfter) reply.header('Retry-After', known.retryAfter);
    return reply.code(known.status).send({ error: { code: known.code } });
  });
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
  });
  session.registerRoutes(app);
  app.get('/api/test', async request => ({ identity: await session.checkApi(request) }));
  app.post('/api/test', async request => ({ identity: await session.checkApi(request) }));
  return app;
}
