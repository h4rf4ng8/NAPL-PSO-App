import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../../plugins/cfg.js';

const environment = {
  NODE_ENV: 'test',
  PUBLIC_ORIGIN: 'http://localhost:5173',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_JWKS_URL: 'https://project.supabase.co/auth/v1/.well-known/jwks.json',
  SUPABASE_PUBLISHABLE_KEY: 'public',
  DISCORD_CLIENT_ID: '123',
  DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_GUILD_ID: '456',
  DATABASE_URL: 'postgres://localhost/test',
  COOKIE_KEYS: JSON.stringify({ key: Buffer.alloc(32).toString('base64') }),
};

test('origin secret has the same minimum length in test and production', () => {
  assert.throws(() => readConfig(environment), /ORIGIN_SECRET/);
  assert.throws(() => readConfig({ ...environment, ORIGIN_SECRET: 'too-short' }), /ORIGIN_SECRET/);
  assert.equal(readConfig({ ...environment, ORIGIN_SECRET: 'x'.repeat(32) }).ORIGIN_SECRET.length, 32);
});

test('port defaults and coerces bounded integer values', () => {
  const local = { ...environment, ORIGIN_SECRET: 'x'.repeat(32) };
  assert.equal(readConfig(local).PORT, 3000);
  for (const [value, expected] of [['1', 1], ['65535', 65_535], [' 3000 ', 3000], ['3e3', 3000]] as const) {
    assert.equal(readConfig({ ...local, PORT: value }).PORT, expected);
  }
  for (const value of ['', ' ', '0', '-1', '65536', '3000.5', '9007199254740992', 'Infinity', 'NaN', 'not-a-port']) {
    assert.throws(() => readConfig({ ...local, PORT: value }), /PORT/);
  }
});

test('production browser origin requires HTTPS', () => {
  const production = { ...environment, NODE_ENV: 'production', DATABASE_URL: 'postgres://db.example/app?sslmode=verify-full', ORIGIN_SECRET: 'x'.repeat(32) };
  assert.throws(() => readConfig({ ...production, PUBLIC_ORIGIN: 'http://league.example' }), /HTTPS/);
  assert.equal(readConfig({ ...production, PUBLIC_ORIGIN: 'https://league.example' }).PUBLIC_ORIGIN, 'https://league.example');
});

test('blank optional SAM values are treated as absent', () => {
  const config = readConfig({ ...environment, SUPABASE_SECRET_KEY: '', DISCORD_TRANSFER_WEBHOOK: '', ORIGIN_SECRET: 'x'.repeat(32) });
  assert.equal(config.SUPABASE_SECRET_KEY, undefined);
  assert.equal(config.DISCORD_TRANSFER_WEBHOOK, undefined);
});

test('Supabase URLs permit local HTTP and require HTTPS in production', () => {
  const local = { ...environment, ORIGIN_SECRET: 'x'.repeat(32) };
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
  const production = { ...environment, NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://league.example', ORIGIN_SECRET: 'x'.repeat(32) };
  assert.throws(() => readConfig(production), /DATABASE_URL.*verify-full/);
  assert.throws(() => readConfig({ ...production, DATABASE_URL: 'https://db.example/app?sslmode=verify-full' }), /DATABASE_URL.*PostgreSQL/);
  const url = 'postgres://db.example/app?sslmode=verify-full';
  assert.equal(readConfig({ ...production, DATABASE_URL: url }).DATABASE_URL, url);
});
