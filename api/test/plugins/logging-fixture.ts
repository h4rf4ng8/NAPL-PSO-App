export const loggingFixture = `
    import assert from 'node:assert/strict';
    import { createApp } from './app.ts';
    import { config, userId, sessionId } from './test/plugins/fixtures.ts';
    const canaries = {bearer:'synthetic-bearer-credential-canary',cookie:'synthetic-cookie-credential-canary',provider:'synthetic-discord-provider-token-canary',internal:'synthetic-private-upstream-error-canary'};
    const app = createApp({
      config: { ...config, NODE_ENV: 'production' },
      db: {
        client: { setting: { findUnique: async () => { throw new TypeError('private-setting-error'); } } },
        query: async () => [],
        execute: async () => { throw new Error('Unexpected business write'); },
        transaction: async () => { throw new Error('Unexpected business transaction'); },
        close: async () => {},
      },
      auth: {
        authStore: { admit: async () => ({ status: 'allowed', retryAfter: 0 }) },
        supabase: {
          verify: async token => {
            assert.equal(token, canaries.bearer);
            return { id: userId, sessionId, claims: {} };
          },
          user: async token => {
            assert.equal(token, canaries.bearer);
            return { id: userId, identities: [{ provider: 'discord', id: '123' }] };
          },
        },
        discord: { identity: async token => {
          assert.equal(token, canaries.provider);
          throw new Error(Object.values(canaries).join(' '));
        } },
      },
    });
`;
