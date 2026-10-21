import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authStore } from '../auth-store.js';
import { buildTestServer } from './server.js';
import { config, keys, sessionId, userId } from './fixtures.js';
import { CookieCrypto } from '../../plugins/session/crypto.js';
import type { SessionDependencies } from '../../plugins/auth/session.js';

for (const scenario of [
  { name: 'provider Discord ID differs from the verified profile', providerId: '987654321', accountId: userId, accepted: false },
  { name: 'exchanged Supabase account differs from the verified JWT', providerId: '123456789', accountId: '22222222-2222-4222-8222-222222222222', accepted: false },
  { name: 'matching UUID and Discord ID provision the verified current handle', providerId: '123456789', accountId: userId, accepted: true },
]) test(`callback: ${scenario.name}`, async () => {
  const provisioned: Array<[string, string]> = [];
  let membershipChecks = 0, membershipWrites = 0;
  const dependencies: SessionDependencies = {
    authStore: authStore(),
    supabase: {
      verify: async () => ({ userId, sessionId, expiresAt: Math.floor(Date.now() / 1000) + 600, claims: { user_metadata: { username: 'untrusted-display-name' } } }),
      loginUrl: () => '',
      exchange: async () => ({ access_token: 'verified-access', refresh_token: 'refresh', provider_token: 'discord-access', provider_refresh_token: 'discord-refresh', user: { id: scenario.accountId, identities: [{ provider: 'discord', identity_data: { sub: scenario.providerId } }] } }),
      refresh: async () => { throw new Error('unexpected refresh'); }, logout: async () => {},
    },
    discord: {
      identity: async () => ({ id: '123456789', username: 'current_discord_handle' }),
      membership: async () => { membershipChecks++; return true; },
      refresh: async () => { throw new Error('unexpected Discord refresh'); },
    },
    membership: { fresh: async () => null, save: async () => { membershipWrites++; } },
    provision: async (token, username) => { provisioned.push([token, username]); },
  };
  const app = await buildTestServer(config, dependencies);
  const transaction = { id: 'a'.repeat(32), verifier: 'b'.repeat(43), expiresAt: Math.floor(Date.now() / 1000) + 600 };
  const cookie = await new CookieCrypto(keys).seal('login', transaction);
  try {
    const response = await app.inject({ url: `/auth/callback?code=one-use&transaction=${transaction.id}`, headers: { 'x-real-ip': '192.0.2.8', cookie: `napl-login=${cookie}` } });
    assert.equal(response.statusCode, scenario.accepted ? 302 : 401, response.body);
    assert.deepEqual(provisioned, scenario.accepted ? [['verified-access', 'current_discord_handle']] : []);
    assert.equal(membershipChecks, scenario.accepted ? 1 : 0, 'mismatched identities must not check or persist membership');
    assert.equal(membershipWrites, scenario.accepted ? 1 : 0);
    assert.equal(response.cookies.some(value => value.name === 'napl-access'), scenario.accepted, 'mismatched identities must not receive an access cookie');
    if (!scenario.accepted) assert.equal(response.json().error.code, 'discord_identity_mismatch');
  } finally { await app.close(); }
});
