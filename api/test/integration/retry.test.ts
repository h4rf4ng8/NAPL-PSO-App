import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HTTPMethods } from 'fastify';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createApp } from '../../app.js';
import { connectDatabase } from '../../plugins/db/client.js';
import { SupabaseClient } from '../../plugins/supabase/client.js';
import { authStore } from '../auth-store.js';
import { config } from '../plugins/fixtures.js';
import { request, ApiError } from '../../../web/src/api/http.js';
import { resetClient } from '../../../web/src/api/client.js';
import { apiPath, clearSession, login, session, tick } from '../../../web/test/auth-fixture.js';

const id = '11111111-1111-4111-8111-111111111111';
const otherId = '22222222-2222-4222-8222-222222222222';

test('real SDK and bearer routes retry concurrent GraphQL/PATCH expiry once with one DB commit', {
  skip: !process.env.API_TEST_DATABASE_URL,
}, async () => {
  const database = connectDatabase(process.env.API_TEST_DATABASE_URL!);
  const original = await database.client.account.findUniqueOrThrow({ where: { id }, select: { country: true } });
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(publicKey), kid: 'retry', alg: 'ES256', use: 'sig' };
  const issue = (expires: number) => new SignJWT({ sub: id, session_id: id, iss: 'https://auth.example.test/auth/v1', aud: 'authenticated', exp: expires })
    .setProtectedHeader({ alg: 'ES256', kid: 'retry' }).sign(privateKey);
  // Keep SDK cache fresh while the server observes JWT expiry, as with clock skew.
  const first = { ...session(id), access_token: await issue(1) };
  const renewed = { ...session(id, 2), access_token: await issue(Math.floor(Date.now() / 1000) + 3600) };
  const refreshStarted = Promise.withResolvers<void>();
  const renewal = Promise.withResolvers<Response>();
  const attempts = new Map<string, Array<{ method: string; body: string | undefined; key: string | null; bearer: string | null }>>();
  let refreshes = 0, commits = 0;
  const apiConfig = { ...config, SUPABASE_URL: 'https://auth.example.test', SUPABASE_JWKS_URL: 'https://keys.example.test/jwks' };
  const app = createApp({
    config: apiConfig,
    db: { ...database, transaction: async (work, options) => { const result = await database.transaction(work, options); commits++; return result; } },
    auth: { authStore: authStore(), supabase: new SupabaseClient(apiConfig), discord: { identity: async () => { throw new Error('unexpected profile lookup'); } } },
  });
  const country = original.country === 'sdk-retry' ? 'sdk-retry-next' : 'sdk-retry';
  try {
    await login(async (url, init) => {
      if (url === apiConfig.SUPABASE_JWKS_URL) return Response.json({ keys: [jwk] });
      if (url.includes('grant_type=refresh_token')) {
        refreshes++;
        assert.deepEqual(JSON.parse(String(init?.body)), { refresh_token: first.refresh_token });
        refreshStarted.resolve(); return renewal.promise;
      }
      if (url.includes('/auth/v1/logout')) return Response.json({});
      const path = apiPath(url);
      assert.ok(path.startsWith('/api/'), `unexpected upstream ${url}`);
      const headers = new Headers(init?.headers);
      const method = init?.method ?? 'GET';
      const body = typeof init?.body === 'string' ? init.body : undefined;
      const recorded = attempts.get(path) ?? [];
      recorded.push({ method, body, key: headers.get('Idempotency-Key'), bearer: headers.get('Authorization') });
      attempts.set(path, recorded);
      const response = await app.inject({ method: method as HTTPMethods, url: path, headers: Object.fromEntries(headers), ...(body !== undefined && { payload: body }) });
      return new Response(response.body, { status: response.statusCode, headers: response.headers as HeadersInit });
    }, first);
    const payload = { country };
    const pending = Promise.all([
      request<{ data: { teamRecords: unknown[] } }>('/api/graphql', 'POST', { operationName: 'TeamRecords', variables: {} }),
      request(`/api/accounts/${id}`, 'PATCH', payload),
    ]);
    await refreshStarted.promise;
    for (let i = 0; i < 50 && (attempts.size < 2 || attempts.values().some(value => value.length !== 1)); i++) await tick();
    await tick();
    assert.equal(refreshes, 1); assert.equal(commits, 0);
    assert.equal(attempts.get('/api/graphql')?.length, 1);
    assert.equal(attempts.get(`/api/accounts/${id}`)?.length, 1);
    assert.deepEqual(await database.client.account.findUniqueOrThrow({ where: { id }, select: { country: true } }), original);
    payload.country = 'must-not-be-serialized';
    renewal.resolve(Response.json(renewed));
    const [graph] = await pending;
    assert.ok(Array.isArray((graph.data?.teamRecords as { nodes?: unknown[] })?.nodes));
    assert.equal(refreshes, 1); assert.equal(commits, 1);
    assert.deepEqual(await database.client.account.findUniqueOrThrow({ where: { id }, select: { country: true } }), { country });
    for (const [path, requests] of attempts) {
      assert.equal(requests.length, 2, path);
      assert.deepEqual(requests.map(({ method, body, key }) => ({ method, body, key })), Array.from({ length: 2 }, () => ({ method: requests[0]!.method, body: requests[0]!.body, key: requests[0]!.key })));
      assert.equal(requests[0]!.bearer, `Bearer ${first.access_token}`); assert.equal(requests[1]!.bearer, `Bearer ${renewed.access_token}`);
    }
    const writeAttempts = attempts.get(`/api/accounts/${id}`)!;
    assert.equal(writeAttempts[0]!.body, JSON.stringify({ country })); assert.ok(writeAttempts[0]!.key);

    attempts.clear();
    await assert.rejects(request(`/api/accounts/${otherId}`, 'PATCH', { country: 'forbidden' }), error => error instanceof ApiError && error.code === 'forbidden');
    assert.equal(attempts.get(`/api/accounts/${otherId}`)?.length, 1); assert.equal(refreshes, 1); assert.equal(commits, 1);
  } finally {
    try {
      await database.client.account.update({ where: { id }, data: original });
      await clearSession(); await resetClient();
    } finally { await app.close(); await database.close(); }
  }
});
