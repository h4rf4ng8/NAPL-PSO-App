import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { setupEnv } from '../../scripts/setup-env.mjs';

async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'napl-env-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const envPath = path.join(dir, '.env');
  const examplePath = path.join(dir, '.env.example');
  return { envPath, examplePath };
}

test('creates a private env file and generates a valid cookie key once', async t => {
  const { envPath, examplePath } = await fixture(t);
  await writeFile(examplePath, 'OTHER=value\nCOOKIE_KEYS=REPLACE_WITH_A_JSON_KEY_RING\n');
  assert.equal(await setupEnv(envPath, examplePath, {}), 'Generated COOKIE_KEYS');
  const contents = await readFile(envPath, 'utf8');
  const keyRing = JSON.parse(contents.split('COOKIE_KEYS=', 2)[1].trim().slice(1, -1));
  assert.equal(Buffer.from(keyRing.v1, 'base64').length, 32);
  assert.match(contents, /^OTHER=value\n/);
  assert.equal((await stat(envPath)).mode & 0o777, 0o600);
  assert.equal(await setupEnv(envPath, examplePath, {}), 'Existing COOKIE_KEYS preserved');
  assert.equal(await readFile(envPath, 'utf8'), contents);
});

test('preserves existing real keys and all other env text byte-for-byte', async t => {
  const { envPath, examplePath } = await fixture(t);
  const original = `# retained\r\nCOOKIE_KEYS='${JSON.stringify({ keep: Buffer.alloc(32, 7).toString('base64') })}'\r\nVALUE=untouched\r\n`;
  await writeFile(envPath, original);
  await writeFile(examplePath, 'unused');
  assert.equal(await setupEnv(envPath, examplePath, {}), 'Existing COOKIE_KEYS preserved');
  assert.equal(await readFile(envPath, 'utf8'), original);
});

test('fails on malformed existing cookie keys without replacing or printing them', async t => {
  const { envPath, examplePath } = await fixture(t);
  const secretish = 'COOKIE_KEYS={not-json-secret}\n';
  await writeFile(envPath, secretish);
  await writeFile(examplePath, 'COOKIE_KEYS=REPLACE_WITH_A_JSON_KEY_RING\n');
  await assert.rejects(setupEnv(envPath, examplePath, {}), error => {
    assert.match(error.message, /COOKIE_KEYS/);
    assert.doesNotMatch(error.message, /not-json-secret/);
    return true;
  });
  assert.equal(await readFile(envPath, 'utf8'), secretish);
});

test('concurrent setup calls keep the same generated key', async t => {
  const { envPath, examplePath } = await fixture(t);
  await writeFile(examplePath, 'COOKIE_KEYS=REPLACE_WITH_A_JSON_KEY_RING\n');
  const results = await Promise.all([setupEnv(envPath, examplePath, {}), setupEnv(envPath, examplePath, {})]);
  assert.equal(results.includes('Existing COOKIE_KEYS preserved'), true);
  assert.equal(results.includes('Generated COOKIE_KEYS'), true);
  const contents = await readFile(envPath, 'utf8');
  const ring = JSON.parse(contents.match(/COOKIE_KEYS='(.*)'/)?.[1] ?? '{}');
  assert.equal(Buffer.from(ring.v1, 'base64').length, 32);
});

test('appends a key when the copied example has no COOKIE_KEYS entry', async t => {
  const { envPath, examplePath } = await fixture(t);
  await writeFile(examplePath, 'EXISTING=value\n');
  assert.equal(await setupEnv(envPath, examplePath, {}), 'Generated COOKIE_KEYS');
  const contents = await readFile(envPath, 'utf8');
  assert.match(contents, /^EXISTING=value\nCOOKIE_KEYS='/);
});

test('fills a blank entry and validates Node-style exported, quoted and commented values', async t => {
  const { envPath, examplePath } = await fixture(t);
  const valid = JSON.stringify({ old: Buffer.alloc(32, 4).toString('base64') });
  await writeFile(envPath, `COOKIE_KEYS= # blank\n`);
  await writeFile(examplePath, 'unused');
  assert.equal(await setupEnv(envPath, examplePath, {}), 'Generated COOKIE_KEYS');

  await writeFile(envPath, `export COOKIE_KEYS='${valid}' # active\n`);
  const original = await readFile(envPath, 'utf8');
  assert.equal(await setupEnv(envPath, examplePath, {}), 'Existing COOKIE_KEYS preserved');
  assert.equal(await readFile(envPath, 'utf8'), original);
});

test('rejects duplicate assignments and non-canonical base64 without changing secrets', async t => {
  const { envPath, examplePath } = await fixture(t);
  await writeFile(examplePath, 'unused');
  const secret = JSON.stringify({ k: `${Buffer.alloc(32).toString('base64')}!` });
  const original = `COOKIE_KEYS='${secret}'\n`;
  await writeFile(envPath, original);
  await assert.rejects(setupEnv(envPath, examplePath, {}), /COOKIE_KEYS/);
  assert.equal(await readFile(envPath, 'utf8'), original);
  await writeFile(envPath, `${original}export COOKIE_KEYS=${secret}\n`);
  await assert.rejects(setupEnv(envPath, examplePath, {}), /Multiple COOKIE_KEYS/);
});

test('valid injected COOKIE_KEYS takes precedence without writing its value locally', async t => {
  const { envPath, examplePath } = await fixture(t);
  const injected = JSON.stringify({ deploy: Buffer.alloc(32, 9).toString('base64') });
  await writeFile(examplePath, 'COOKIE_KEYS=REPLACE_WITH_A_JSON_KEY_RING\n');
  assert.equal(await setupEnv(envPath, examplePath, { COOKIE_KEYS: injected }), 'Using injected COOKIE_KEYS');
  assert.doesNotMatch(await readFile(envPath, 'utf8'), /deploy/);
  await assert.rejects(setupEnv(envPath, examplePath, { COOKIE_KEYS: 'bad-injected-value' }), /COOKIE_KEYS/);
  await assert.rejects(setupEnv(envPath, examplePath, { COOKIE_KEYS: '' }), /COOKIE_KEYS/);
  await assert.rejects(setupEnv(envPath, examplePath, { COOKIE_KEYS: 'REPLACE_WITH_A_JSON_KEY_RING' }), /COOKIE_KEYS/);
});
