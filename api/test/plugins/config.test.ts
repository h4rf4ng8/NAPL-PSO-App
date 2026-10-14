import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readConfig } from '../../plugins/cfg.js';

const environment = {
  NODE_ENV: 'test',
  PUBLIC_ORIGIN: 'http://localhost:5173',
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'public',
  DISCORD_CLIENT_ID: '123',
  DISCORD_CLIENT_SECRET: 'secret',
  DISCORD_GUILD_ID: '456',
  DATABASE_URL: 'postgres://localhost/test',
  AUTH_DATABASE_URL: 'postgres://localhost/auth-test',
  COOKIE_KEYS: JSON.stringify({ key: Buffer.alloc(32).toString('base64') }),
};

test('origin secret has the same minimum length in test and production', () => {
  assert.throws(() => readConfig(environment), /ORIGIN_SECRET/);
  assert.throws(() => readConfig({ ...environment, ORIGIN_SECRET: 'too-short' }), /ORIGIN_SECRET/);
  assert.equal(readConfig({ ...environment, ORIGIN_SECRET: 'x'.repeat(32) }).ORIGIN_SECRET.length, 32);
});

test('production browser origin requires HTTPS', () => {
  const production = { ...environment, NODE_ENV: 'production', DATABASE_URL: 'postgres://db.example/app?sslmode=verify-full', AUTH_DATABASE_URL: 'postgres://db.example/auth?sslmode=verify-full', ORIGIN_SECRET: 'x'.repeat(32) };
  assert.throws(() => readConfig({ ...production, PUBLIC_ORIGIN: 'http://league.example' }), /HTTPS/);
  assert.equal(readConfig({ ...production, PUBLIC_ORIGIN: 'https://league.example' }).PUBLIC_ORIGIN, 'https://league.example');
});

test('blank optional SAM values are treated as absent', () => {
  const config = readConfig({ ...environment, SUPABASE_SECRET_KEY: '', DISCORD_TRANSFER_WEBHOOK: '', ORIGIN_SECRET: 'x'.repeat(32) });
  assert.equal(config.SUPABASE_SECRET_KEY, undefined);
  assert.equal(config.DISCORD_TRANSFER_WEBHOOK, undefined);
});


test('production database connections require verified TLS for both roles', () => {
  const production = { ...environment, NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://league.example', ORIGIN_SECRET: 'x'.repeat(32) };
  assert.throws(() => readConfig(production), /DATABASE_URL.*verify-full/);
  assert.throws(() => readConfig({ ...production, DATABASE_URL: 'postgres://db.example/app?sslmode=verify-full' }), /AUTH_DATABASE_URL.*verify-full/);
});
