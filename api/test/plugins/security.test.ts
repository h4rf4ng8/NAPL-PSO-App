import assert from 'node:assert/strict';
import { createCipheriv } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { CompactEncrypt, compactDecrypt, decodeProtectedHeader, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { CookieCrypto } from '../../plugins/session/crypto.js';
import { sessionSchema } from '../../plugins/session/model.js';
import { normalizeIp } from '../../plugins/limits/auth.js';
import { SupabaseClient } from '../../plugins/supabase/client.js';
import { config, keys, session, sessionId, userId } from './fixtures.js';

test('cookies use authenticated JWE, bind purpose, and support legacy reads and key rotation', async () => {
  const crypto = new CookieCrypto(keys);
  const original = session();
  const sealed = await crypto.seal('session', original);
  assert.ok(sealed.startsWith('2.'));
  assert.equal(sealed.includes('supabase-secret'), false);
  const interop = await compactDecrypt(sealed.slice(2), Buffer.alloc(32, 42), {
    keyManagementAlgorithms: ['dir'], contentEncryptionAlgorithms: ['A256GCM'],
  });
  assert.deepEqual(interop.protectedHeader, { alg: 'dir', enc: 'A256GCM', kid: 'current', purpose: 'session', version: 2 });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(interop.plaintext)), original);
  assert.deepEqual(await crypto.open('session', sealed, sessionSchema), original);
  await assert.rejects(() => crypto.open('login', sealed, sessionSchema), /session_invalid/);
  const wrongVersion = await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(original)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', kid: 'current', purpose: 'session', version: 1 })
    .encrypt(Buffer.alloc(32, 42));
  await assert.rejects(() => crypto.open('session', `2.${wrongVersion}`, sessionSchema), /session_invalid/);
  const wrongPurpose = await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(original)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', kid: 'current', purpose: 'login', version: 2 })
    .encrypt(Buffer.alloc(32, 42));
  await assert.rejects(() => crypto.open('session', `2.${wrongPurpose}`, sessionSchema), /session_invalid/);
  const fields = sealed.split('.');
  fields[4] = `${fields[4]?.startsWith('A') ? 'B' : 'A'}${fields[4]?.slice(1)}`;
  await assert.rejects(() => crypto.open('session', fields.join('.'), sessionSchema), /session_invalid/);
  const alternateEnc = await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(original)))
    .setProtectedHeader({ alg: 'dir', enc: 'A128CBC-HS256', kid: 'current', purpose: 'session', version: 2 })
    .encrypt(Buffer.alloc(32, 42));
  await assert.rejects(() => crypto.open('session', `2.${alternateEnc}`, sessionSchema), /session_invalid/);
  const unknownKid = await new CompactEncrypt(new TextEncoder().encode(JSON.stringify(original)))
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM', kid: 'other', purpose: 'session', version: 2 })
    .encrypt(Buffer.alloc(32, 42));
  await assert.rejects(() => crypto.open('session', `2.${unknownKid}`, sessionSchema), /session_invalid/);
  const wrongKey = new CookieCrypto(JSON.stringify({ current: Buffer.alloc(32, 43).toString('base64') }));
  await assert.rejects(() => wrongKey.open('session', sealed, sessionSchema), /session_invalid/);

  const key = Buffer.alloc(32, 42);
  const iv = Buffer.alloc(12, 8);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('napl:1:session:current'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(original)), cipher.final()]);
  const legacy = ['1', 'current', iv.toString('base64url'), ciphertext.toString('base64url'), cipher.getAuthTag().toString('base64url')].join('.');
  assert.deepEqual(await crypto.open('session', legacy, sessionSchema), original);
  await assert.rejects(() => crypto.open('login', legacy, sessionSchema), /session_invalid/);
  const legacyFields = legacy.split('.');
  legacyFields[3] = `${legacyFields[3]?.startsWith('A') ? 'B' : 'A'}${legacyFields[3]?.slice(1)}`;
  await assert.rejects(() => crypto.open('session', legacyFields.join('.'), sessionSchema), /session_invalid/);

  const rotated = new CookieCrypto(JSON.stringify({ next: Buffer.alloc(32, 43).toString('base64'), ...JSON.parse(keys) }));
  const shared = new CookieCrypto(keys);
  assert.deepEqual(await rotated.open('session', sealed, sessionSchema), original);
  assert.deepEqual(await rotated.open('session', legacy, sessionSchema), original);
  assert.equal(decodeProtectedHeader((await rotated.seal('session', original)).slice(2)).kid, 'next');
  const fromShared = await shared.seal('session', original);
  assert.deepEqual(await crypto.open('session', fromShared, sessionSchema), original);
  await assert.rejects(() => crypto.seal('session', { huge: 'x'.repeat(4000) }), /session_cookie_too_large/);
  await assert.rejects(() => crypto.seal('refresh-result', { huge: 'x'.repeat(17_000) }), /session_cookie_too_large/);
  assert.throws(() => new CookieCrypto(JSON.stringify({ bad: Buffer.alloc(31, 1).toString('base64') })), /32 random bytes/);
  assert.throws(() => new CookieCrypto(JSON.stringify({ bad: `${Buffer.alloc(32, 1).toString('base64')}!` })), /32 random bytes/);
});

test('CSRF binds the signature to the session, header, cookie and expiry', () => {
  const crypto = new CookieCrypto(keys);
  const token = crypto.csrf(sessionId);
  assert.equal(crypto.verifyCsrf(token, token, sessionId), true);
  assert.equal(crypto.verifyCsrf(token, token, 'anonymous'), false);
  assert.equal(crypto.verifyCsrf(token, `${token}x`, sessionId), false);
  assert.equal(crypto.verifyCsrf(token, token, sessionId, Date.now() + 3_601_000), false);
  assert.equal(crypto.verifyLogoutCsrf(token, token), true);
});

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
    assert.equal((await verifier.verify(await issue())).userId, userId);
    await assert.rejects(async () => verifier.verify(await issue({ iss: 'https://evil.example' })), /session_invalid/);
    await assert.rejects(async () => verifier.verify(await issue({ aud: 'other' })), /session_invalid/);
    await assert.rejects(async () => verifier.verify(await issue({ exp: 1 })), /session_expired/);
    await assert.rejects(async () => verifier.verify(await issue({ session_id: undefined })), /session_invalid/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
