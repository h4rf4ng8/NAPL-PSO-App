import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../../plugins/cfg.js';

const environment = {
  NODE_ENV: 'test',
  PUBLIC_ORIGIN: 'http://localhost:5173',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_JWKS_URL: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
  SUPABASE_PUBLISHABLE_KEY: 'public',
  DATABASE_URL: 'postgres://localhost/test',
};

test('bearer API needs no cookie, Discord OAuth, guild, or origin secrets', () => {
  assert.equal(readConfig(environment).SUPABASE_PUBLISHABLE_KEY, 'public');
});

test('port defaults and coerces bounded integer values', () => {
  const local = { ...environment };
  assert.equal(readConfig(local).PORT, 3000);
  for (const [value, expected] of [['1', 1], ['65535', 65_535], [' 3000 ', 3000], ['3e3', 3000]] as const) {
    assert.equal(readConfig({ ...local, PORT: value }).PORT, expected);
  }
  for (const value of ['', ' ', '0', '-1', '65536', '3000.5', '9007199254740992', 'Infinity', 'NaN', 'not-a-port']) {
    assert.throws(() => readConfig({ ...local, PORT: value }), /PORT/);
  }
});

test('production browser origin requires HTTPS', () => {
  const production = { ...environment, NODE_ENV: 'production', DATABASE_URL: 'postgres://db.example/app?sslmode=verify-full' };
  assert.throws(() => readConfig({ ...production, PUBLIC_ORIGIN: 'http://league.example' }), /HTTPS/);
  assert.equal(readConfig({ ...production, PUBLIC_ORIGIN: 'https://league.example' }).PUBLIC_ORIGIN, 'https://league.example');
});

test('blank optional SAM values are treated as absent', () => {
  const config = readConfig({ ...environment, DISCORD_TRANSFER_WEBHOOK: '' });
  assert.equal(config.DISCORD_TRANSFER_WEBHOOK, undefined);
});

test('Supabase URLs permit local HTTP and require HTTPS in production', () => {
  const local = { ...environment };
  const production = { ...local, NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://league.example', DATABASE_URL: 'postgres://db.example/app?sslmode=verify-full' };
  for (const name of ['SUPABASE_URL', 'SUPABASE_JWKS_URL'] as const) {
    assert.equal(readConfig({ ...local, [name]: 'http://localhost:54321' })[name], 'http://localhost:54321');
    assert.throws(() => readConfig({ ...production, [name]: 'http://localhost:54321' }), new RegExp(`${name}.*HTTPS`));
    for (const value of ['', 'ftp://example.test', 'https://user:pass@example.test', 'https://example.test?token=secret', 'https://example.test#fragment']) {
      assert.throws(() => readConfig({ ...local, [name]: value }), new RegExp(name));
    }
  }
});

test('production uses one database URL and requires PostgreSQL with verified TLS', () => {
  const production = { ...environment, NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://league.example' };
  assert.throws(() => readConfig(production), /DATABASE_URL.*verify-full/);
  assert.throws(() => readConfig({ ...production, DATABASE_URL: 'https://db.example/app?sslmode=verify-full' }), /DATABASE_URL.*PostgreSQL/);
  const url = 'postgres://db.example/app?sslmode=verify-full';
  assert.equal(readConfig({ ...production, DATABASE_URL: url }).DATABASE_URL, url);
});

test('CloudFront trust is explicit and rejects misspelled settings', () => {
  assert.equal(readConfig(environment).TRUST_CLOUDFRONT, false);
  assert.equal(readConfig({ ...environment, TRUST_CLOUDFRONT: 'true' }).TRUST_CLOUDFRONT, true);
  assert.throws(() => readConfig({ ...environment, TRUST_CLOUDFRONT: 'yes' }));
});
