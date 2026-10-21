import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { normalizeIp } from '../../plugins/limits/auth.js';
import { SupabaseClient } from '../../plugins/supabase/client.js';
import { config, sessionId, userId } from './fixtures.js';

test('IP limits normalize mapped IPv4 and aggregate IPv6 by /64', () => {
  assert.equal(normalizeIp('::ffff:192.0.2.1'), '192.0.2.1');
  assert.equal(normalizeIp('2001:db8:1:2::1'), normalizeIp('2001:db8:1:2::ffff'));
  assert.notEqual(normalizeIp('2001:db8:1:2::1'), normalizeIp('2001:db8:1:3::1'));
  assert.throws(() => normalizeIp('1.2.3.4,5.6.7.8'), /invalid_client_ip/);
});

test('Supabase verifier enforces signatures, audience, issuer, expiration and session claim', async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test', alg: 'ES256', use: 'sig' };
  const server = createServer((_request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const url = `http://127.0.0.1:${address.port}/auth/v1`;
    const verifier = new SupabaseClient({ ...config, SUPABASE_URL: url, SUPABASE_JWKS_URL: `${url}/.well-known/jwks.json` });
    const issue = (overrides: Record<string, unknown> = {}) => new SignJWT({ sub: userId, session_id: sessionId, iss: url, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 60, ...overrides }).setProtectedHeader({ alg: 'ES256', kid: 'test' }).sign(privateKey);
    assert.equal((await verifier.verify(await issue())).id, userId);
    await assert.rejects(async () => verifier.verify(await issue({ iss: 'https://evil.example' })), /access_invalid/);
    await assert.rejects(async () => verifier.verify(await issue({ aud: 'other' })), /access_invalid/);
    await assert.rejects(async () => verifier.verify(await issue({ exp: 1 })), /access_expired/);
    await assert.rejects(async () => verifier.verify(await issue({ session_id: undefined })), /access_invalid/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
