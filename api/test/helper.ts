import { authStore } from './auth-store.js';
import type { FastifyInstance } from 'fastify';
import { createApp as buildApp } from '../app.js';
import type { Database } from '../plugins/db/client.js';
import type { ImageStorage } from '../plugins/storage/client.js';
import type { VerifyToken } from '../plugins/auth/identity.js';
import { GatewayError } from '../plugins/auth/errors.js';
import { config } from './plugins/fixtures.js';

export function createApp(deps: { db: Database; verify: VerifyToken; webhookUrl?: string; storage?: ImageStorage }): FastifyInstance {
  return buildApp({
    db: deps.db, config, webhookUrl: deps.webhookUrl, storage: deps.storage,
    auth: {
      authStore: authStore(),
      supabase: {
        verify: async token => {
          try { return await deps.verify(token); }
          catch { throw new GatewayError(401, 'access_invalid'); }
        },
        user: async () => { throw new Error('unused user lookup'); },
      },
      discord: { identity: async () => ({ id: '123456789', username: 'discord_player' }) },
    },
  });
}
