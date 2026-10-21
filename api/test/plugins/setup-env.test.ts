import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { parseEnv } from 'node:util';
import { setupEnv } from '../../scripts/setup-env.mjs';

async function fixture(t: import('node:test').TestContext) {
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

test('creates private app configs with public browser values and no generated secrets', async t => {
  const { root, api, web } = await fixture(t);
  await Promise.all([setupEnv(root), setupEnv(root)]);
  const apiText = await readFile(api, 'utf8');
  const webText = await readFile(web, 'utf8');
  const values = parseEnv(apiText);
  assert.equal(values.PUBLIC_ORIGIN, 'http://localhost:5173');
  assert.equal(new URL(values.DATABASE_URL).searchParams.get('sslmode'), 'verify-full');
  for (const name of ['COOKIE_KEYS', 'ORIGIN_SECRET', 'DISCORD_CLIENT_SECRET', 'SUPABASE_SECRET_KEY']) assert.equal(values[name], undefined);
  assert.deepEqual(parseEnv(webText), {
    VITE_API_URL: 'http://localhost:3000', VITE_SUPABASE_URL: 'https://PROJECT.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'REPLACE_WITH_SUPABASE_PUBLISHABLE_KEY',
  });
  assert.equal((await stat(api)).mode & 0o777, 0o600);
  assert.equal((await stat(web)).mode & 0o777, 0o600);
  await setupEnv(root);
  assert.equal(await readFile(api, 'utf8'), apiText);
  assert.equal(await readFile(web, 'utf8'), webText);
});

test('preserves existing hosted config, comments, old rollback secrets and line endings', async t => {
  const { root, api, web } = await fixture(t);
  const apiText = '# retained\r\nDATABASE_URL=postgresql://hosted.example/league\r\nCOOKIE_KEYS=old-rollback-value\r\n';
  const webText = '# retained\nexport VITE_API_URL=https://api.example # retained\n';
  await writeFile(api, apiText);
  await writeFile(web, webText);
  await setupEnv(root);
  assert.equal(await readFile(api, 'utf8'), apiText);
  assert.equal(await readFile(web, 'utf8'), webText);
});

test('rejects duplicate assignments and server secrets in web before changing either file', async t => {
  const { root, api, web } = await fixture(t);
  const duplicate = 'DATABASE_URL=first\nexport DATABASE_URL=second\n';
  await writeFile(api, duplicate);
  await assert.rejects(setupEnv(root), /Multiple DATABASE_URL/);
  await assert.rejects(readFile(web), { code: 'ENOENT' });
  await writeFile(api, '# unchanged\n');
  await writeFile(web, 'DATABASE_URL=private-value\n');
  await assert.rejects(setupEnv(root), /secrets belong in api/);
  assert.equal(await readFile(api, 'utf8'), '# unchanged\n');
  assert.equal(await readFile(web, 'utf8'), 'DATABASE_URL=private-value\n');
  await writeFile(web, 'VITE_SUPABASE_SECRET_KEY=private-storage-secret\n');
  await assert.rejects(setupEnv(root), /secrets belong in api/);
  assert.equal(await readFile(api, 'utf8'), '# unchanged\n');
  assert.equal(await readFile(web, 'utf8'), 'VITE_SUPABASE_SECRET_KEY=private-storage-secret\n');
});
