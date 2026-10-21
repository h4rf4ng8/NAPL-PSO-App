import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { SupabaseClient } from '../../plugins/supabase/client.js';
import { config } from './fixtures.js';
const user = '11111111-1111-4111-8111-111111111111';
test('merged API verifier requires signatures, expiry, issuer, audience and session', async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = await exportJWK(publicKey);
    const server = createServer((request, res) => {
        assert.equal(request.url, '/auth/v1/.well-known/jwks.json');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
            keys: [{
                    ...jwk, kid: 'test', alg: 'ES256', use: 'sig'
                }]
        }));
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const url = 'https://project.supabase.co/auth/v1';
    const jwksUrl = `http://127.0.0.1:${address.port}/auth/v1/.well-known/jwks.json`;
    const client = new SupabaseClient({ ...config, SUPABASE_URL: 'https://project.supabase.co', SUPABASE_JWKS_URL: jwksUrl });
    const verify = client.verify.bind(client);
    const token = async (overrides: Record<string, unknown> = {}) => new SignJWT({
        sub: user, session_id: user, iss: url, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60, ...overrides
    }).setProtectedHeader({
        alg: 'ES256', kid: 'test'
    }).sign(privateKey);
    try {
        assert.equal((await verify(await token())).id, user);
        for (const override of [{
                exp: undefined
            }, {
                exp: 0
            }, {
                session_id: undefined
            }, {
                sub: undefined
            }, {
                iss: 'https://evil.example'
            }, {
                iss: 'https://project.supabase.co'
            }, {
                iss: jwksUrl
            }, {
                aud: 'different'
            }])
            await assert.rejects(async () => verify(await token(override)));
        for (const claim of ['sub', 'session_id']) {
            for (const value of ['not-a-uuid', '11111111-1111-4111-7111-111111111111']) {
                await assert.rejects(async () => verify(await token({ [claim]: value })), /access_invalid/);
            }
        }
        const valid = await token();
        await assert.rejects(() => verify(valid.slice(0, -4) + 'xxxx'));
    }
    finally {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
});

for (const authPath of ['', '/auth/v1']) {
  test(`Auth /user and JWT issuer use the configured local root (${authPath || '/'})`, async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256');
    const jwk = await exportJWK(publicKey);
    const requests: string[] = [];
    const server = createServer((request, response) => {
      requests.push(request.url ?? '');
      response.setHeader('content-type', 'application/json');
      if (request.url === '/keys') response.end(JSON.stringify({ keys: [{ ...jwk, kid: 'local', alg: 'ES256', use: 'sig' }] }));
      else {
        assert.equal(request.url, `${authPath}/user`);
        assert.equal(request.headers.authorization, 'Bearer access');
        assert.equal(request.headers.apikey, config.SUPABASE_PUBLISHABLE_KEY);
        response.end(JSON.stringify({ id: user, identities: [{ provider: 'discord', id: '123', identity_id: 'internal-uuid', identity_data: { sub: 'forged' } }], user_metadata: { username: 'untrusted' } }));
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address === 'object');
    const authUrl = `http://127.0.0.1:${address.port}${authPath}`;
    const client = new SupabaseClient({ ...config, SUPABASE_URL: `${authUrl}/`, SUPABASE_JWKS_URL: `http://127.0.0.1:${address.port}/keys` });
    const issue = (issuer: string) => new SignJWT({ session_id: user }).setSubject(user).setIssuer(issuer).setAudience('authenticated').setExpirationTime('1m').setProtectedHeader({ alg: 'ES256', kid: 'local' }).sign(privateKey);
    try {
      assert.equal((await client.verify(await issue(authUrl))).id, user);
      await assert.rejects(async () => client.verify(await issue(`${authUrl}/wrong`)), /access_invalid/);
      assert.deepEqual(await client.user('access'), { id: user, identities: [{ provider: 'discord', id: '123' }] });
      assert.deepEqual(requests, ['/keys', `${authPath}/user`]);
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
}

test('hosted roots and explicit auth paths normalize /user without trusting metadata', async context => {
  const requests: string[] = [];
  context.mock.method(globalThis, 'fetch', async (url: string) => {
    requests.push(url);
    return Response.json({ id: user, user_metadata: { identities: [{ provider: 'discord', id: '123' }] } });
  });
  for (const [url, authUrl] of [
    ['https://project.supabase.co', 'https://project.supabase.co/auth/v1'],
    ['https://project.supabase.co/', 'https://project.supabase.co/auth/v1'],
    ['https://auth.example.test', 'https://auth.example.test/auth/v1'],
    ['https://project.supabase.co/auth/v1/', 'https://project.supabase.co/auth/v1'],
    ['http://localhost:54321', 'http://localhost:54321'],
    ['http://[::1]:54321', 'http://[::1]:54321'],
  ]) {
    const client = new SupabaseClient({ ...config, SUPABASE_URL: url });
    assert.deepEqual(await client.user('access'), { id: user, identities: [] });
    assert.equal(requests.at(-1), `${authUrl}/user`);
  }
});

test('only a signed JWT with expired exp returns access_expired', async () => {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = await exportJWK(publicKey);
  const server = createServer((_request, response) => response.end(JSON.stringify({ keys: [{ ...jwk, kid: 'test', alg: 'ES256', use: 'sig' }] })));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const client = new SupabaseClient({ ...config, SUPABASE_JWKS_URL: `http://127.0.0.1:${address.port}/keys` });
  const issue = (claims: Record<string, unknown>) => new SignJWT({ sub: user, session_id: user, iss: 'https://example.supabase.co/auth/v1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60, ...claims }).setProtectedHeader({ alg: 'ES256', kid: 'test' }).sign(privateKey);
  try {
    const expired = await issue({ exp: 1 });
    await assert.rejects(client.verify(expired), /access_expired/);
    await assert.rejects(client.verify(expired.slice(0, -8) + 'xxxxxxxx'), /access_invalid/);
    for (const claims of [{ nbf: Math.floor(Date.now() / 1000) + 3600 }, { exp: 'expired' }, { exp: undefined }, { sub: 'invalid' }, { session_id: 'invalid' }, { exp: 1, sub: 'invalid' }, { exp: 1, session_id: 'invalid' }])
      await assert.rejects(async () => client.verify(await issue(claims)), /access_invalid/);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});

test('Supabase /user calls use bounded requests and never label upstream rejection as JWT expiry', async context => {
  const client = new SupabaseClient(config);
  for (const [status, code] of [[401, 'access_invalid'], [403, 'access_invalid'], [429, 'identity_provider_rate_limited'], [500, 'identity_provider_unavailable']] as const) {
    context.mock.method(globalThis, 'fetch', async (_url: string, init: RequestInit) => {
      assert.ok(init.signal instanceof AbortSignal); assert.equal(init.redirect, 'error');
      assert.deepEqual(init.headers, { Authorization: 'Bearer access', apikey: config.SUPABASE_PUBLISHABLE_KEY });
      return Response.json({ private: 'upstream detail' }, { status });
    });
    await assert.rejects(client.user('access'), new RegExp(code));
  }
  context.mock.method(globalThis, 'fetch', async () => Response.json({ user_metadata: { id: user } }));
  await assert.rejects(client.user('access'), /identity_provider_unavailable/);
});
