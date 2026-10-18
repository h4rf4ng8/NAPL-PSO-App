import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authStore } from '../auth-store.js';
import { CookieCrypto } from '../../plugins/session/crypto.js';
import { SessionRefresher } from '../../plugins/session/refresh.js';
import type { AuthStore } from '../../plugins/session/store.js';
import type { SupabaseAuth } from '../../plugins/supabase/client.js';
import { sessionSchema } from '../../plugins/session/model.js';
import { keys, session, userId, sessionId } from './fixtures.js';

const crypto = new CookieCrypto(keys);
function harness(store: AuthStore, refresh?: SupabaseAuth['refresh']) {
  let rotations = 0;
  let verifications = 0;
  const refresher = new SessionRefresher(store, crypto, {
    refresh: refresh ?? (async () => { rotations++; return { access_token: 'fresh', refresh_token: 'rotated' }; }),
    verify: async () => { verifications++; return { userId, sessionId, expiresAt: Math.floor(Date.now() / 1000) + 600 }; },
    exchange: async () => { throw new Error('unused'); }, loginUrl: () => '', logout: async () => {},
  }, {
    refresh: async () => { throw new Error('unused'); }, identity: async () => ({ id: '', username: 'discord_player' }), membership: async () => true,
  }, { fresh: async () => true, save: async () => {} });
  return { refresher, rotations: () => rotations, verifications: () => verifications };
}

test('rotated credentials survive failed publication and a lost lease', async () => {
  for (const publishRefresh of [async () => false, async () => { throw new Error('database unavailable'); }]) {
    const { refresher } = harness(authStore({ publishRefresh }));
    const result = await refresher.refresh(session(), 'expired', '192.0.2.1');
    assert.equal(result.error?.status, 503);
    assert.equal(result.error?.code, 'refresh_cache_unavailable');
    assert.equal(result.accessToken, 'fresh');
    assert.equal((await crypto.open('session', result.authCookie, sessionSchema)).supabaseRefresh, 'rotated');
  }
});

test('refresh result reuse is bound to both refresh credentials and access generation', async () => {
  const { refresher, rotations } = harness(authStore());
  const original = session();
  const first = await refresher.refresh(original, 'expired', '192.0.2.1');
  const duplicate = await refresher.refresh(original, 'expired', '192.0.2.1');
  assert.equal(first.authCookie, duplicate.authCookie);
  assert.equal(rotations(), 1);
  for (const changed of [
    { ...original, discordRefresh: 'other-discord' },
    { ...original, supabaseRefresh: 'other-supabase' },
    { ...original, accessExpiresAt: original.accessExpiresAt - 1 },
  ]) await refresher.refresh(changed, 'expired', '192.0.2.1');
  assert.equal(rotations(), 4);
});

test('an expired work deadline starts no further provider calls and leaves its lease to expire', async context => {
  let clock = Date.now();
  context.mock.method(Date, 'now', () => clock);
  let released = false;
  const { refresher, verifications } = harness(authStore({ releaseRefresh: async () => { released = true; } }), async () => {
    clock += 36_000;
    return { access_token: 'fresh', refresh_token: 'rotated' };
  });
  await assert.rejects(() => refresher.refresh(session(), 'expired', '192.0.2.1'), /refresh_busy/);
  assert.equal(verifications(), 0);
  assert.equal(released, false);
});
