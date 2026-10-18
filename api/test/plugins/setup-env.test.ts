import assert from 'node:assert/strict';
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
  for (const name of ['DISCORD_ENABLED', 'GOTRUE_JWT_SECRET', 'GOTRUE_JWT_KEYS']) assert.equal(values[name], undefined);
  assert.equal(values.PUBLIC_ORIGIN, 'http://localhost:5173');
  assert.equal(new URL(values.DATABASE_URL).searchParams.get('sslmode'), 'verify-full');
  assert.equal(new URL(values.DATABASE_URL).searchParams.get('sslrootcert'), 'prod-ca-2021.crt');
  assert.equal(values.SUPABASE_URL, 'https://PROJECT.supabase.co');
  assert.equal(values.SUPABASE_JWKS_URL, `${values.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
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

test('preserves hosted settings and ignores obsolete local Auth settings', async t => {
  const { root, api, web } = await fixture(t);
  await setupEnv(root);
  const hosted = [
    'DATABASE_URL=postgresql://hosted.example/league?sslmode=verify-full',
    'SUPABASE_URL=https://hosted.example',
    'SUPABASE_PUBLISHABLE_KEY=existing-publishable-key',
    'SUPABASE_SECRET_KEY=sb_secret_existing-key',
    'SUPABASE_JWKS_URL=https://hosted.example/auth/v1/.well-known/jwks.json',
    'DISCORD_CLIENT_ID=123',
    'DISCORD_CLIENT_SECRET=existing-discord-secret',
    'DISCORD_GUILD_ID=456',
    'DISCORD_ENABLED=false',
    'GOTRUE_JWT_SECRET=obsolete',
    'GOTRUE_JWT_KEYS=obsolete',
  ];
  const generated = parseEnv(await readFile(api, 'utf8'));
  const apiText = [...hosted, `COOKIE_KEYS='${generated.COOKIE_KEYS}'`, `ORIGIN_SECRET='${generated.ORIGIN_SECRET}'`, ''].join('\n');
  const webText = await readFile(web, 'utf8');
  await writeFile(api, apiText);
  await setupEnv(root);
  assert.equal(await readFile(api, 'utf8'), apiText);
  assert.equal(await readFile(web, 'utf8'), webText);
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
  for (const name of ['COOKIE_KEYS', 'GOTRUE_JWT_KEYS', 'GOTRUE_JWT_SECRET', 'DISCORD_CLIENT_SECRET', 'SUPABASE_SECRET_KEY', 'DATABASE_URL']) {
    const { root, api, web } = await fixture(t);
    const original = `${name}=not-for-web\n`;
    await writeFile(web, original);
    await assert.rejects(setupEnv(root), /secrets belong in api\/\.env/);
    assert.equal(await readFile(web, 'utf8'), original);
    await assert.rejects(readFile(api), { code: 'ENOENT' });
  }
});
