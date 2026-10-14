import { authStore } from '../auth-store.js';
import type { Admission } from '../../plugins/session/store.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTestServer } from './server.js';
import type { SessionDependencies } from '../../plugins/auth/session.js';
import { GatewayError } from '../../plugins/auth/errors.js';
import { hashKey } from '../../plugins/limits/auth.js';
import { CookieCrypto } from '../../plugins/session/crypto.js';
import { config, keys, session, sessionId } from './fixtures.js';

type Eval = (keys: string[]) => Admission;

async function server(evalScript: Eval) {
  const calls: string[][] = [];
  let verifies = 0;
  let refreshes = 0;
  let revokes = 0;
  const store = authStore({
    admit: async limits => {
      const keys = limits.map(limit => limit.key);
      calls.push(keys);
      return evalScript(keys);
    },
  });
  const dependencies: SessionDependencies = {
    authStore: store,
    supabase: {
      verify: async () => { verifies++; throw new GatewayError(401, 'session_invalid'); },
      loginUrl: () => '',
      exchange: async () => { throw new Error('unexpected exchange'); },
      refresh: async () => { refreshes++; throw new Error('unexpected refresh'); },
      logout: async () => { revokes++; },
    },
    discord: { identity: async () => '', membership: async () => false, refresh: async () => { throw new Error('unexpected refresh'); } },
    membership: { fresh: async () => null, save: async () => {} },
    provision: async () => {},
  };
  return {
    app: await buildTestServer(config, dependencies),
    calls,
    counts: () => ({ verifies, refreshes, revokes }),
  };
}

const headers = (token: string, cookie: string) => ({
  origin: config.PUBLIC_ORIGIN,
  'x-csrf-token': token,
  'x-real-ip': '192.0.2.44',
  cookie,
});

test('logout rejects at the IP/global limit before verifying an invalid access token', async () => {
  const crypto = new CookieCrypto(keys);
  const csrf = crypto.csrf('anonymous');
  const harness = await server(() => ({ status: 'limited', retryAfter: 60 }));
  try {
    const response = await harness.app.inject({ method: 'POST', url: '/auth/logout', headers: headers(csrf, `napl-csrf=${csrf}; napl-access=invalid`) });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, upstreamRevoked: false });
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0]?.length, 2);
    assert.equal(harness.counts().verifies, 0);
    assert.equal(harness.counts().refreshes, 0);
    assert.equal(harness.counts().revokes, 0);
    assert.equal(response.cookies.find(cookie => cookie.name === 'napl-access')?.value, '');
  } finally {
    await harness.app.close();
  }
});

test('logout applies the session quota separately and preserves cookie clearing on auth state failure', async t => {
  const crypto = new CookieCrypto(keys);
  const csrf = crypto.csrf(sessionId);
  const original = session();
  const harness = await server(keys => keys.includes(hashKey(`logout:session:${sessionId}`)) ? { status: 'limited', retryAfter: 60 } : { status: 'allowed', retryAfter: 0 });
  try {
    const response = await harness.app.inject({ method: 'POST', url: '/auth/logout', headers: headers(csrf, `napl-auth=${await crypto.seal('session', original)}; napl-csrf=${csrf}`) });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { ok: true, upstreamRevoked: false });
    assert.equal(harness.calls.length, 2);
    assert.deepEqual(harness.calls[0]?.length, 2);
    assert.deepEqual(harness.calls[1], [hashKey(`logout:session:${sessionId}`)]);
    assert.equal(harness.counts().refreshes, 0);
    assert.equal(harness.counts().revokes, 0);
    assert.equal(response.cookies.find(cookie => cookie.name === 'napl-auth')?.value, '');
  } finally {
    await harness.app.close();
  }

  await t.test('auth state failure still clears cookies and invalid signed CSRF cannot log out', async () => {
    const unavailable = await server(() => { throw new Error('auth state unavailable'); });
    try {
      const result = await unavailable.app.inject({ method: 'POST', url: '/auth/logout', headers: headers(csrf, `napl-auth=${await crypto.seal('session', original)}; napl-csrf=${csrf}`) });
      assert.equal(result.statusCode, 200);
      assert.deepEqual(result.json(), { ok: true, upstreamRevoked: false });
      assert.equal(result.cookies.find(cookie => cookie.name === 'napl-auth')?.value, '');
      assert.equal(unavailable.counts().verifies, 0);
      assert.equal(unavailable.counts().refreshes, 0);
      assert.equal(unavailable.counts().revokes, 0);
    } finally {
      await unavailable.app.close();
    }

    const denied = await server(() => ({ status: 'allowed', retryAfter: 0 }));
    try {
      const result = await denied.app.inject({ method: 'POST', url: '/auth/logout', headers: headers(`${csrf}x`, `napl-access=invalid; napl-csrf=${csrf}`) });
      assert.equal(result.statusCode, 403);
      assert.equal(denied.calls.length, 0);
      assert.equal(denied.counts().verifies, 0);
    } finally {
      await denied.app.close();
    }
  });
});
