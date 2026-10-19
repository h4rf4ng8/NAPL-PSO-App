import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('actual API logs retain method/status while credentials and upstream errors stay private', () => {
  const canaries = {
    bearer: 'synthetic-bearer-credential-canary',
    cookie: 'synthetic-cookie-credential-canary',
    provider: 'synthetic-discord-provider-token-canary',
    internal: 'synthetic-private-upstream-error-canary',
  };
  // Capture Pino's real stdout destination without changing the production logger.
  const source = `
    import assert from 'node:assert/strict';
    import { createApp } from './app.ts';
    import { config, userId, sessionId } from './test/plugins/fixtures.ts';
    const canaries = ${JSON.stringify(canaries)};
    const app = createApp({
      config: { ...config, NODE_ENV: 'development' },
      db: {
        client: {},
        query: async sql => sql.sql.includes('session_active') ? [{ active: true }] : [],
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
    try {
      const response = await app.inject({
        method: 'POST', url: '/api/users/me?probe=' + canaries.internal,
        headers: { authorization: 'Bearer ' + canaries.bearer, cookie: 'probe=' + canaries.cookie },
        payload: { providerToken: canaries.provider },
      });
      console.error(JSON.stringify({ status: response.statusCode, headers: response.headers, body: response.json() }));
    } finally { await app.close(); }
  `;
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', source], {
    cwd: new URL('../..', import.meta.url), encoding: 'utf8', timeout: 15_000,
  });
  assert.equal(result.error, undefined, 'logger subprocess must finish');
  assert.equal(result.status, 0, result.stderr);
  for (const value of Object.values(canaries)) {
    assert.ok(!result.stdout.includes(value), 'serialized logs must omit credential and internal-error canaries');
    assert.ok(!result.stderr.includes(value), 'response must omit credential and internal-error canaries');
  }
  const logs = result.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.ok(logs.some(line => line.req?.method === 'POST'), 'request method must remain observable');
  assert.ok(logs.some(line => line.res?.statusCode === 503), 'response status must remain observable');
  assert.ok(logs.some(line => line.msg === 'Request failed' && line.code === 'unknown'), 'safe failure classification must remain observable');
  const response = JSON.parse(result.stderr);
  assert.equal(response.status, 503);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.deepEqual(response.body, { error: 'service_unavailable', message: 'Service temporarily unavailable' });
});
