import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareSamParams } from '../../scripts/sam-env.mjs';

const env = {
  DATABASE_URL: 'postgres://db.example/app?sslmode=verify-full',
  SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'public-key', SUPABASE_SECRET_KEY: 'server-storage-secret',
  SUPABASE_JWKS_URL: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
  PUBLIC_ORIGIN: 'https://league.example', DISCORD_TRANSFER_WEBHOOK: '',
  APPLICATION_ROLE_BOUNDARY_ARN: 'arn:aws:iam::123456789012:policy/napl-deployment-boundary',
};
async function paths(t: import('node:test').TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), 'napl-sam-env-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { envPath: path.join(dir, 'local.env'), outputPath: path.join(dir, 'params.json') };
}
test('writes only current validated parameters, with injected settings taking precedence', async t => {
  const files = await paths(t);
  await writeFile(files.envPath, Object.entries(env).map(([key, value]) => `${key}='${value}'`).join('\n'));
  await prepareSamParams({ ...files, environment: { DATABASE_URL: 'postgres://injected.example/app?sslmode=verify-full', COOKIE_KEYS: 'obsolete', ORIGIN_SECRET: 'obsolete' } });
  const params = JSON.parse(await readFile(files.outputPath, 'utf8'));
  assert.deepEqual(params, {
    DatabaseUrl: 'postgres://injected.example/app?sslmode=verify-full', SupabaseUrl: env.SUPABASE_URL,
    SupabasePublishableKey: env.SUPABASE_PUBLISHABLE_KEY, SupabaseSecretKey: env.SUPABASE_SECRET_KEY, SupabaseJwksUrl: env.SUPABASE_JWKS_URL,
    PublicOrigin: env.PUBLIC_ORIGIN, DiscordTransferWebhook: '', RolePermissionsBoundaryArn: env.APPLICATION_ROLE_BOUNDARY_ARN,
  });
  assert.equal((await stat(files.outputPath)).mode & 0o777, 0o600);
});
test('requires an HTTPS JWKS endpoint without writing invalid parameters', async t => {
  for (const jwks of ['', 'http://localhost:54321/.well-known/jwks.json']) {
    const files = await paths(t);
    await assert.rejects(prepareSamParams({ ...files, environment: { ...env, SUPABASE_JWKS_URL: jwks } }), /SupabaseJwksUrl/);
    await assert.rejects(readFile(files.outputPath));
  }
});
test('requires a permissions boundary without exposing invalid values', async t => {
  const files = await paths(t);
  await assert.rejects(prepareSamParams({ ...files, environment: { ...env, APPLICATION_ROLE_BOUNDARY_ARN: 'private-invalid-value' } }), error => {
    assert.match(error.message, /RolePermissionsBoundaryArn/);
    assert.ok(!error.message.includes('private-invalid-value'));
    return true;
  });
});
test('rejects Lambda environments above 4 KiB and unfilled placeholders', async t => {
  const files = await paths(t);
  await assert.rejects(prepareSamParams({ ...files, environment: { ...env, SUPABASE_PUBLISHABLE_KEY: 'x'.repeat(4200) } }), /4096 bytes/);
  await assert.rejects(prepareSamParams({ ...files, environment: { ...env, SUPABASE_PUBLISHABLE_KEY: 'REPLACE_WITH_KEY' } }), /placeholders/);
  await assert.rejects(prepareSamParams({ ...files, environment: { ...env, SUPABASE_SECRET_KEY: 'REPLACE_WITH_STORAGE_SECRET' } }), /placeholders/);
  await assert.rejects(readFile(files.outputPath));
});
