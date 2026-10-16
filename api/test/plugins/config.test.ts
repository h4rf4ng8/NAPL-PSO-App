import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../../plugins/cfg.js';

const environment = {
  NODE_ENV: 'test',
  PUBLIC_ORIGIN: 'http://localhost:5173',
  SUPABASE_AUTH_URL: 'https://project.supabase.co/auth/v1',
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

test('production browser origin requires HTTPS', () => {
  const production = { ...environment, NODE_ENV: 'production', DATABASE_URL: 'postgres://db.example/app?sslmode=verify-full', ORIGIN_SECRET: 'x'.repeat(32) };
  assert.throws(() => readConfig({ ...production, PUBLIC_ORIGIN: 'http://league.example' }), /HTTPS/);
  assert.equal(readConfig({ ...production, PUBLIC_ORIGIN: 'https://league.example' }).PUBLIC_ORIGIN, 'https://league.example');
});

test('blank optional SAM values are treated as absent', () => {
  const config = readConfig({ ...environment, SUPABASE_SECRET_KEY: '', SUPABASE_AUTH_INTERNAL_URL: '', DISCORD_TRANSFER_WEBHOOK: '', ORIGIN_SECRET: 'x'.repeat(32) });
  assert.equal(config.SUPABASE_SECRET_KEY, undefined);
  assert.equal(config.SUPABASE_AUTH_INTERNAL_URL, undefined);
  assert.equal(config.DISCORD_TRANSFER_WEBHOOK, undefined);
});

test('Auth URLs permit local HTTP and require HTTPS in production', () => {
  const local = { ...environment, ORIGIN_SECRET: 'x'.repeat(32), SUPABASE_AUTH_INTERNAL_URL: 'http://auth:9999' };
  assert.equal(readConfig(local).SUPABASE_AUTH_INTERNAL_URL, 'http://auth:9999');
  assert.equal(readConfig({ ...local, SUPABASE_AUTH_URL: 'http://localhost:54321' }).SUPABASE_AUTH_URL, 'http://localhost:54321');
  const production = { ...local, NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://league.example', DATABASE_URL: 'postgres://db.example/app?sslmode=verify-full' };
  assert.throws(() => readConfig(production), /SUPABASE_AUTH_INTERNAL_URL.*HTTPS/);
  assert.equal(readConfig({ ...production, SUPABASE_AUTH_INTERNAL_URL: 'https://auth.internal' }).SUPABASE_AUTH_INTERNAL_URL, 'https://auth.internal');
  assert.throws(() => readConfig({ ...production, SUPABASE_AUTH_INTERNAL_URL: '', SUPABASE_AUTH_URL: 'http://localhost:54321' }), /SUPABASE_AUTH_URL.*HTTPS/);
});


test('production uses one database URL and requires PostgreSQL with verified TLS', () => {
  const production = { ...environment, NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://league.example', ORIGIN_SECRET: 'x'.repeat(32) };
  assert.throws(() => readConfig(production), /DATABASE_URL.*verify-full/);
  assert.throws(() => readConfig({ ...production, DATABASE_URL: 'https://db.example/app?sslmode=verify-full' }), /DATABASE_URL.*PostgreSQL/);
  const url = 'postgres://db.example/app?sslmode=verify-full';
  assert.equal(readConfig({ ...production, DATABASE_URL: url }).DATABASE_URL, url);
});
