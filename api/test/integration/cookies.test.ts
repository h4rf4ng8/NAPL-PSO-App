import { authStore } from '../auth-store.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { createApp } from '../../app.js';
import { createHandler } from '../../plugins/lambda.js';
import { CookieCrypto } from '../../plugins/session/crypto.js';
import { sessionSchema } from '../../plugins/session/model.js';
import { GatewayError } from '../../plugins/auth/errors.js';
import { config as base, session, userId, sessionId } from '../plugins/fixtures.js';

const config = { ...base, NODE_ENV: 'production' as const, PUBLIC_ORIGIN: 'https://league.example' };
const crypto = new CookieCrypto(config.COOKIE_KEYS);
const access = 'a'.repeat(3700);
const expired = session();
// Fill the envelope to its supported limit (base64 quantization can leave one byte).
let padding = 0;
while (true) {
  try { await crypto.seal('session', { ...expired, discordRefresh: 'r'.repeat(padding + 1) }); padding++; }
  catch { break; }
}
const fullSession = { ...expired, discordRefresh: 'r'.repeat(padding) };
const sealed = await crypto.seal('session', fullSession);
const csrf = crypto.csrf(sessionId);

function event(path: string, cookies: string[], rawQueryString = ''): APIGatewayProxyEventV2 {
  return {
    version: '2.0', routeKey: '$default', rawPath: path, rawQueryString,
    headers: { 'x-origin-secret': config.ORIGIN_SECRET, 'x-real-ip': '192.0.2.5', origin: config.PUBLIC_ORIGIN, 'x-csrf-token': csrf },
    cookies,
    requestContext: {
      accountId: '123', apiId: 'test', domainName: 'lambda.test', domainPrefix: 'lambda',
      http: { method: path === '/auth/callback' ? 'GET' : 'POST', path, protocol: 'HTTP/1.1', sourceIp: '192.0.2.2', userAgent: 'test' },
      requestId: 'id', routeKey: '$default', stage: '$default', time: '', timeEpoch: Date.now(),
    }, isBase64Encoded: false,
  };
}

function harness(status: 200 | 403 | 503, outage = false) {
  const app = createApp({
    config,
    db: { query: async () => { throw new Error('auth route must not use API guard'); }, execute: async () => 0, transaction: async () => { throw new Error('unused'); }, close: async () => {} },
    session: {
      authStore: authStore({ admit: async () => { if (outage) throw new Error('offline'); return { status: 'allowed', retryAfter: 0 }; } }),
      supabase: {
        verify: async token => { if (token !== access) throw new GatewayError(401, 'session_expired'); return { userId, sessionId, expiresAt: Math.floor(Date.now() / 1000) + 600 }; },
        refresh: async () => ({ access_token: access, refresh_token: expired.supabaseRefresh }),
        exchange: async () => ({ access_token: access, refresh_token: expired.supabaseRefresh, provider_token: expired.discordAccess, provider_refresh_token: fullSession.discordRefresh, user: { id: userId, identities: [{ provider: 'discord', identity_data: { sub: expired.discordUserId } }] } }),
        loginUrl: () => '', logout: async () => {},
      },
      discord: { identity: async () => ({ id: expired.discordUserId, username: 'discord_player' }), membership: async () => true, refresh: async () => { throw new Error('unexpected'); } },
      membership: { fresh: async () => { if (status === 503) throw new GatewayError(503, 'membership_unavailable', 3); return status === 200; }, save: async () => {} },
      provision: async () => {},
    },
  });
  return { app, handler: createHandler(app) };
}

test('Function URL returns separate maximum session cookies on refresh success and failure', async () => {
  assert.ok(sealed.length >= 3698);
  for (const status of [200, 403, 503] as const) {
    const { app, handler } = harness(status);
    try {
      const response = await handler(event('/auth/refresh', [`__Secure-napl-auth=${sealed}`, '__Host-napl-access=expired', `__Host-napl-csrf=${csrf}`]), {} as Context);
      assert.equal(response.statusCode, status, response.body);
      assert.equal(response.cookies?.length, 3);
      assert.equal(response.headers['set-cookie'], undefined);
      assert.equal(response.headers['cache-control'], 'no-store');
      const cookieBytes = response.cookies!.join('\r\n').length;
      assert.ok(cookieBytes > 7600);
      assert.ok(response.cookies!.every(value => value.includes('Secure') && value.includes('SameSite=Lax')));
      const authCookie = response.cookies!.find(value => value.startsWith('__Secure-napl-auth='))!;
      assert.ok(authCookie.includes('Path=/auth'));
      const value = authCookie.slice(authCookie.indexOf('=') + 1).split(';', 1)[0];
      assert.ok((await crypto.open('session', value, sessionSchema)).accessExpiresAt > Date.now() / 1000);
      if (status === 503) assert.equal(response.headers['retry-after'], '3');
    } finally { await app.close(); }
  }
});

test('Function URL preserves callback redirect and logout clearing during auth database outage', async () => {
  const transaction = { id: 't'.repeat(32), verifier: 'v'.repeat(43), expiresAt: Math.floor(Date.now() / 1000) + 600 };
  const healthy = harness(200);
  try {
    const callback = await healthy.handler(event('/auth/callback', [`__Secure-napl-login=${await crypto.seal('login', transaction)}`], `code=one-use&transaction=${transaction.id}`), {} as Context);
    assert.equal(callback.statusCode, 302, callback.body);
    assert.equal(callback.headers.location, `${config.PUBLIC_ORIGIN}/`);
    assert.equal(callback.cookies?.length, 4);
  } finally { await healthy.app.close(); }
  const offline = harness(200, true);
  try {
    const response = await offline.handler(event('/auth/logout', [`__Secure-napl-auth=${sealed}`, `__Host-napl-csrf=${csrf}`]), {} as Context);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), { ok: true, upstreamRevoked: false });
    assert.equal(response.cookies?.length, 4);
    assert.ok(response.cookies!.every(cookie => cookie.includes('Expires=Thu, 01 Jan 1970')));
  } finally { await offline.app.close(); }
});
