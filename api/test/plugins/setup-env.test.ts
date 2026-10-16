import assert from 'node:assert/strict';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { setupEnv } from '../../scripts/setup-env.mjs';
import { CookieCrypto } from '../../plugins/session/crypto.js';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(path.join(tmpdir(), 'napl-env-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'api'));
  await mkdir(path.join(root, 'web'));
  const api = path.join(root, 'api/.env');
  const web = path.join(root, 'web/.env');
  await copyFile(new URL('../../.env.example', import.meta.url), `${api}.example`);
  await copyFile(new URL('../../../web/.env.example', import.meta.url), `${web}.example`);
  return { root, api, web };
}

test('sets up private app env files once and gives web only its origin secret', async t => {
  const { root, api, web } = await fixture(t);
  await setupEnv(root);
  const apiText = await readFile(api, 'utf8');
  const webText = await readFile(web, 'utf8');
  const values = parseEnv(apiText);
  const webValues = parseEnv(webText);
  assert.doesNotThrow(() => new CookieCrypto(values.COOKIE_KEYS));
  assert.match(values.ORIGIN_SECRET, /^[\da-f]{64}$/);
  assert.match(values.GOTRUE_JWT_SECRET, /^[\da-f]{64}$/);
  assert.notEqual(values.ORIGIN_SECRET, values.GOTRUE_JWT_SECRET);
  const [jwk] = JSON.parse(values.GOTRUE_JWT_KEYS);
  assert.equal(jwk.alg, 'ES256');
  const key = createPrivateKey({ key: jwk, format: 'jwk' });
  const message = Buffer.from('local auth');
  assert.ok(verify('sha256', message, createPublicKey(key), sign('sha256', message, key)));
  assert.deepEqual(webValues, { LOCAL_API_URL: 'http://127.0.0.1:3000', ORIGIN_SECRET: values.ORIGIN_SECRET });
  assert.equal((await stat(api)).mode & 0o777, 0o600);
  assert.equal((await stat(web)).mode & 0o777, 0o600);
  await setupEnv(root);
  assert.equal(await readFile(api, 'utf8'), apiText);
  assert.equal(await readFile(web, 'utf8'), webText);
});

test('preserves existing keys, exported assignments, comments, and line endings', async t => {
  const { root, api, web } = await fixture(t);
  await setupEnv(root);
  const originalApi = `# retained\r\n${(await readFile(api, 'utf8')).replace(/^COOKIE_KEYS=/m, 'export COOKIE_KEYS=').replaceAll('\n', '\r\n')}OTHER=untouched\r\n`;
  const originalWeb = (await readFile(web, 'utf8')).replace(/ORIGIN_SECRET=(.*)/, 'export ORIGIN_SECRET=$1 # retained');
  await writeFile(api, originalApi);
  await writeFile(web, originalWeb);
  await setupEnv(root);
  assert.equal(await readFile(api, 'utf8'), originalApi);
  assert.equal(await readFile(web, 'utf8'), originalWeb);
});

test('concurrent setup calls preserve the same keys and leave matching origins', async t => {
  const { root, api, web } = await fixture(t);
  await Promise.all([setupEnv(root), setupEnv(root)]);
  const first = await readFile(api, 'utf8');
  assert.equal(parseEnv(first).ORIGIN_SECRET, parseEnv(await readFile(web, 'utf8')).ORIGIN_SECRET);
  await setupEnv(root);
  assert.equal(await readFile(api, 'utf8'), first);
});

test('rejects malformed keys before changing either env file without exposing values', async t => {
  for (const [name, value] of [
    ['COOKIE_KEYS', '{not-json-secret}'],
    ['COOKIE_KEYS', JSON.stringify({ key: `${Buffer.alloc(32).toString('base64')}!` })],
    ['ORIGIN_SECRET', 'short-secret'],
    ['GOTRUE_JWT_SECRET', 'short-secret'],
    ['GOTRUE_JWT_KEYS', '{not-jwk-secret}'],
    ['GOTRUE_JWT_KEYS', '[]'],
  ]) {
    const { root, api, web } = await fixture(t);
    const apiText = `${name}='${value}'\n`;
    const webText = '# unchanged\nORIGIN_SECRET=\n';
    await writeFile(api, apiText);
    await writeFile(web, webText);
    await assert.rejects(setupEnv(root), error => {
      assert.match(error.message, new RegExp(name));
      assert.ok(!error.message.includes(value));
      return true;
    });
    assert.equal(await readFile(api, 'utf8'), apiText);
    assert.equal(await readFile(web, 'utf8'), webText);
  }
});

test('rejects duplicate assignments and conflicting origins before creating or modifying files', async t => {
  const { root, api, web } = await fixture(t);
  const duplicate = 'COOKIE_KEYS=\nexport COOKIE_KEYS=\n';
  await writeFile(api, duplicate);
  await assert.rejects(setupEnv(root), /Multiple COOKIE_KEYS/);
  assert.equal(await readFile(api, 'utf8'), duplicate);
  await assert.rejects(readFile(web), { code: 'ENOENT' });

  const apiText = `ORIGIN_SECRET='${'a'.repeat(32)}'\n`;
  const webText = `ORIGIN_SECRET='${'b'.repeat(32)}'\n`;
  await writeFile(api, apiText);
  await writeFile(web, webText);
  await assert.rejects(setupEnv(root), /ORIGIN_SECRET differs/);
  assert.equal(await readFile(api, 'utf8'), apiText);
  assert.equal(await readFile(web, 'utf8'), webText);
});

test('rejects Auth keys that cannot issue ES256 tokens before modifying either file', async t => {
  const { root, api, web } = await fixture(t);
  await setupEnv(root);
  const apiText = await readFile(api, 'utf8');
  const webText = await readFile(web, 'utf8');
  const [key] = JSON.parse(parseEnv(apiText).GOTRUE_JWT_KEYS);
  for (const override of [{ d: undefined }, { alg: 'HS256' }, { key_ops: ['verify'] }, { key_ops: 'sign' }]) {
    const invalid = apiText.replace(/^GOTRUE_JWT_KEYS=.*$/m, () => `GOTRUE_JWT_KEYS='${JSON.stringify([{ ...key, ...override }])}'`);
    await writeFile(api, invalid);
    await assert.rejects(setupEnv(root), /GOTRUE_JWT_KEYS is invalid/);
    assert.equal(await readFile(api, 'utf8'), invalid);
    assert.equal(await readFile(web, 'utf8'), webText);
  }
});

test('fills absent and placeholder keys while preserving an existing web origin', async t => {
  const { root, api, web } = await fixture(t);
  const origin = 'existing-local-origin-'.repeat(3);
  await writeFile(api, 'COOKIE_KEYS=REPLACE_WITH_A_JSON_KEY_RING\nOTHER=untouched\n');
  await writeFile(web, `ORIGIN_SECRET='${origin}'\n`);
  await setupEnv(root);
  const values = parseEnv(await readFile(api, 'utf8'));
  assert.equal(values.ORIGIN_SECRET, origin);
  assert.equal(values.OTHER, 'untouched');
  assert.doesNotThrow(() => new CookieCrypto(values.COOKIE_KEYS));
  assert.equal(await readFile(web, 'utf8'), `ORIGIN_SECRET='${origin}'\n`);
});

test('rejects API or Auth keys in web env before writing either file', async t => {
  for (const name of ['COOKIE_KEYS', 'GOTRUE_JWT_KEYS', 'GOTRUE_JWT_SECRET', 'DISCORD_CLIENT_SECRET']) {
    const { root, api, web } = await fixture(t);
    const original = `${name}=not-for-web\n`;
    await writeFile(web, original);
    await assert.rejects(setupEnv(root), /secrets belong in api\/\.env/);
    assert.equal(await readFile(web, 'utf8'), original);
    await assert.rejects(readFile(api), { code: 'ENOENT' });
  }
});
