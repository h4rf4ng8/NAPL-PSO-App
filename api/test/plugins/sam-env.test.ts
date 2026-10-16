import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { prepareSamParams } from '../../scripts/sam-env.mjs';

const ring = JSON.stringify({ active: Buffer.alloc(32, 7).toString('base64'), previous: Buffer.alloc(32, 8).toString('base64') });
const env = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://db.example/app?sslmode=verify-full',
  SUPABASE_AUTH_URL: 'https://project.supabase.co/auth/v1',
  SUPABASE_PUBLISHABLE_KEY: 'public-key',
  SUPABASE_SECRET_KEY: '',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  PUBLIC_ORIGIN: 'https://league.example',
  COOKIE_KEYS: ring,
  ORIGIN_SECRET: 'x'.repeat(32),
  DISCORD_CLIENT_ID: '123',
  DISCORD_CLIENT_SECRET: 'discord-secret',
  DISCORD_GUILD_ID: '456',
  DISCORD_TRANSFER_WEBHOOK: '',
  VERCEL_TEAM_SLUG: 'napl-team',
  VERCEL_PROJECT_NAME: 'napl-web',
  APPLICATION_ROLE_BOUNDARY_ARN: 'arn:aws:iam::123456789012:policy/napl-deployment-boundary',
};

async function paths(t: import('node:test').TestContext) {
  const dir = await mkdtemp(path.join(tmpdir(), 'napl-sam-env-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return { envPath: path.join(dir, 'local.env'), outputPath: path.join(dir, 'params.json') };
}

test('maps validated production values to SAM parameters and preserves cookie JSON', async t => {
  const files = await paths(t);
  await writeFile(files.envPath, Object.entries(env).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n');
  await prepareSamParams({ ...files, environment: { PATH: 'must-not-leak', DATABASE_URL: 'postgres://injected.example/app?sslmode=verify-full' } });
  const params = JSON.parse(await readFile(files.outputPath, 'utf8'));
  assert.equal(params.DatabaseUrl, 'postgres://injected.example/app?sslmode=verify-full');
  assert.equal(params.CookieKeys, ring);
  assert.equal(params.SupabaseUrl, env.SUPABASE_AUTH_URL);
  assert.equal(params.SupabaseJwtAudience, 'authenticated');
  assert.equal(params.SupabaseSecretKey, '');
  assert.equal(params.DiscordTransferWebhook, '');
  assert.equal(params.VercelTeamSlug, 'napl-team');
  assert.equal(params.VercelProjectName, 'napl-web');
  assert.equal(params.ExistingVercelOidcProviderArn, '');
  assert.equal(params.RolePermissionsBoundaryArn, env.APPLICATION_ROLE_BOUNDARY_ARN);
  assert.equal(params.PATH, undefined);
  assert.equal(params.NODE_ENV, undefined);
});

test('injected COOKIE_KEYS takes precedence over the local env file', async t => {
  const files = await paths(t);
  await writeFile(files.envPath, Object.entries(env).map(([key, value]) => `${key}='${value}'`).join('\n') + '\n');
  const injected = JSON.stringify({ injected: Buffer.alloc(32, 9).toString('base64') });
  await prepareSamParams({ ...files, environment: { COOKIE_KEYS: injected } });
  assert.equal(JSON.parse(await readFile(files.outputPath, 'utf8')).CookieKeys, injected);
});

test('writes the parameter file with private permissions', async t => {
  const files = await paths(t);
  await prepareSamParams({ ...files, environment: env });
  assert.equal((await stat(files.outputPath)).mode & 0o777, 0o600);
});

test('accepts only an existing provider ARN scoped to the selected Vercel team', async t => {
  const files = await paths(t);
  const arn = 'arn:aws:iam::123456789012:oidc-provider/oidc.vercel.com/napl-team';
  await prepareSamParams({ ...files, environment: { ...env, EXISTING_VERCEL_OIDC_PROVIDER_ARN: arn } });
  assert.equal(JSON.parse(await readFile(files.outputPath, 'utf8')).ExistingVercelOidcProviderArn, arn);

  const otherTeam = { ...env, EXISTING_VERCEL_OIDC_PROVIDER_ARN: arn.replace('napl-team', 'other-team') };
  await assert.rejects(prepareSamParams({ ...files, environment: otherTeam }), /must be an AWS OIDC provider ARN for VercelTeamSlug/);
  await assert.rejects(prepareSamParams({ ...files, environment: { ...env, VERCEL_PROJECT_NAME: 'bad"project' } }), /VercelTeamSlug or VercelProjectName/);
});

test('rejects missing or malformed COOKIE_KEYS without generating or writing a key', async t => {
  for (const cookieValue of [undefined, 'malformed-cookie-json']) {
    const files = await paths(t);
    const values = { ...env };
    if (cookieValue === undefined) delete (values as Partial<typeof values>).COOKIE_KEYS;
    else values.COOKIE_KEYS = cookieValue;
    await assert.rejects(prepareSamParams({ ...files, environment: values }), /COOKIE_KEYS/);
    await assert.rejects(readFile(files.outputPath));
  }
});

test('requires a permissions-boundary policy ARN without exposing invalid values', async t => {
  for (const boundary of ['', 'REPLACE_WITH_PRIVATE_VALUE', 'arn:aws:iam::123456789012:role/not-a-policy']) {
    const files = await paths(t);
    await assert.rejects(prepareSamParams({ ...files, environment: { ...env, APPLICATION_ROLE_BOUNDARY_ARN: boundary } }), error => {
      assert.match(error.message, /RolePermissionsBoundaryArn/);
      if (boundary) assert.ok(!error.message.includes(boundary));
      return true;
    });
    await assert.rejects(readFile(files.outputPath));
  }
});

test('rejects a Lambda environment over 4 KiB without writing it', async t => {
  const files = await paths(t);
  await assert.rejects(
    prepareSamParams({ ...files, environment: { ...env, DISCORD_CLIENT_SECRET: 'x'.repeat(4200) } }),
    /4096 bytes/,
  );
  await assert.rejects(readFile(files.outputPath));
});

test('rejects unfilled production credentials without exposing their values', async t => {
  const files = await paths(t);
  const secret = 'REPLACE_WITH_PRIVATE_VALUE';
  await assert.rejects(prepareSamParams({ ...files, environment: { ...env, DISCORD_CLIENT_SECRET: secret } }), error => {
    assert.match(error.message, /DISCORD_CLIENT_SECRET/);
    assert.ok(!error.message.includes(secret));
    return true;
  });
  await assert.rejects(readFile(files.outputPath));
});
