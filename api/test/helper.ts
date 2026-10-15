import { authStore } from './auth-store.js';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { createApp as buildApp } from '../app.js';
import type { Database } from '../plugins/db/client.js';
import type { VerifyToken } from '../plugins/auth/identity.js';
import { GatewayError } from '../plugins/auth/errors.js';
import { CookieCrypto } from '../plugins/session/crypto.js';
import { config as fixtureConfig } from './plugins/fixtures.js';

// Domain regression fixtures predate the cookie transport. Translate their identities
// into real signed CSRF/access cookies; the production guard still executes normally.
export function createApp(deps: { db: Database; verify: VerifyToken; webhookUrl?: string }): FastifyInstance {
  const config = { ...fixtureConfig, ORIGIN_SECRET: 'domain-tests-origin-secret-32-characters' };
  const crypto = new CookieCrypto(config.COOKIE_KEYS);
  const app = buildApp({
    db: deps.db, config, webhookUrl: deps.webhookUrl,
    session: {
      authStore: authStore(),
      supabase: {
        verify: async token => {
          try {
            const identity = await deps.verify(token);
            return { userId: identity.id, sessionId: identity.sessionId, claims: identity.claims, expiresAt: Date.now() / 1000 + 600 };
          } catch { throw new GatewayError(401, 'session_invalid'); }
        },
        loginUrl: () => '', exchange: async () => { throw new Error('unused exchange'); },
        refresh: async () => { throw new Error('unused refresh'); }, logout: async () => {},
      },
      discord: { identity: async () => '', membership: async () => true, refresh: async () => { throw new Error('unused refresh'); } },
      membership: { fresh: async () => true, save: async () => {} }, provision: async () => {},
    },
  });
  const inject = app.inject.bind(app);
  const domainInject = async (input: string | InjectOptions) => {
    const options = typeof input === 'string' ? { url: input } : input;
    const headers = { ...options.headers };
    const bearer = headers.authorization;
    const token = typeof bearer === 'string' ? bearer.replace(/^Bearer /, '') : undefined;
    let binding = 'anonymous';
    if (token) {
      try { binding = (await deps.verify(token)).sessionId; } catch { /* The real guard rejects this token. */ }
    }
    const csrf = crypto.csrf(binding);
    delete headers.authorization;
    return inject({ ...options, headers: {
      ...headers, 'x-origin-secret': config.ORIGIN_SECRET, 'x-real-ip': '192.0.2.10',
      origin: config.PUBLIC_ORIGIN, 'x-csrf-token': csrf,
      cookie: `napl-csrf=${csrf}${token ? `; napl-access=${token}` : ''}`,
    } });
  };
  app.inject = domainInject as typeof app.inject;
  return app;
}
