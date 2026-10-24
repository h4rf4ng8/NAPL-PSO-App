import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { equal } from './merge-audit.mjs';
import { legacyTables, tableKeys } from './merge-normalize.mjs';
import { applyOperations, snapshot, verifyAfter, writeRow } from './merge-source.mjs';

const { Client } = createRequire(new URL('../api/package.json', import.meta.url))('pg');
const root = fileURLToPath(new URL('../', import.meta.url));
const migrations = ['202610130001_gateway.sql', '202610130003_rbac.sql', '202610140001_role_audit.sql', '202610140002_auth_state.sql', '20261018232323_asl_normalized.sql'];
const userColumns = ['id', 'instance_id', 'aud', 'role', 'email', 'email_confirmed_at', 'raw_app_meta_data', 'raw_user_meta_data', 'is_super_admin', 'created_at', 'banned_until', 'deleted_at', 'is_anonymous', 'is_sso_user'];
const identityColumns = ['id', 'user_id', 'provider', 'provider_id', 'identity_data', 'created_at'];
const pick = (row, columns) => Object.fromEntries(columns.filter(column => Object.hasOwn(row, column)).map(column => [column, row[column]]));

export async function connectRehearsal(url) {
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname), 'Rehearsal accepts localhost only');
  const client = new Client({ connectionString: parsed.href, connectionTimeoutMillis: 5000, statement_timeout: 60_000 });
  await client.connect();
  return client;
}

// The caller owns the transaction. Only repository-controlled DDL is executed.
export async function seedRehearsal(client, destination, manifest) {
  const existing = await client.query(`SELECT nspname FROM pg_namespace WHERE nspname IN ('auth','asl','auth_gateway')
    UNION ALL SELECT tablename FROM pg_tables WHERE schemaname='public'`);
  assert.equal(existing.rows.length, 0, 'Rehearsal requires an empty disposable database');
  await client.query(`DO $$ DECLARE role_name text; BEGIN
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated','supabase_auth_admin'] LOOP
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('CREATE ROLE %I NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',role_name);
      END IF;
    END LOOP;
  END $$;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (
    id uuid PRIMARY KEY, instance_id uuid, aud text, role text, email text,
    email_confirmed_at timestamptz, raw_app_meta_data jsonb, raw_user_meta_data jsonb,
    is_super_admin boolean, created_at timestamptz, updated_at timestamptz, banned_until timestamptz, deleted_at timestamptz,
    is_anonymous boolean DEFAULT false, is_sso_user boolean DEFAULT false,
    encrypted_password text, confirmation_token text, recovery_token text, email_change_token_new text, email_change text
  );
  CREATE TABLE auth.identities (
    id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider text NOT NULL, provider_id text NOT NULL, identity_data jsonb NOT NULL,
    created_at timestamptz, updated_at timestamptz, UNIQUE(provider_id,provider)
  );
  CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT null::uuid $$;`);
  for (const user of destination.users) await writeRow(client, 'auth', 'users', pick(user, userColumns));
  for (const identity of destination.identities) await writeRow(client, 'auth', 'identities', pick(identity, identityColumns));
  await client.query(await readFile(path.join(root, 'supabase/fixtures/deployment-baseline.sql'), 'utf8'));
  for (const table of legacyTables) {
    const rows = destination.legacy[table];
    for (const row of rows) await writeRow(client, 'public', table, row);
  }
  for (const setting of ['account_aliases', 'excluded_team_ids', 'excluded_vote_ids']) {
    await client.query('SELECT set_config($1,$2,true)', [`asl_migration.${setting}`, JSON.stringify(manifest[setting])]);
  }
  for (const migration of migrations) {
    const sql = await readFile(path.join(root, 'supabase/migrations', migration), 'utf8');
    await client.query(sql.replaceAll(/^BEGIN;\s*$/gm, '').replaceAll(/^COMMIT;\s*$/gm, ''));
  }
  await client.query(`TRUNCATE ${Object.keys(tableKeys).map(table => `asl."${table}"`).join(',')}`);
  const operations = Object.entries(destination.current).flatMap(([table, rows]) => rows.map(row => ({ table, before: null, after: row })));
  await applyOperations(client, { operations, auth: [] });
  for (const role of destination.roles) await writeRow(client, 'auth_gateway', 'user_roles', pick(role, ['user_id', 'role']));
}

function verifySeed(captured, actual) {
  for (const section of ['legacy', 'current']) {
    const tables = Object.entries(captured[section]);
    for (const [table, rows] of tables) {
      const keys = section === 'current' ? tableKeys[table] : [table === 'settings' ? 'key' : 'id'];
      const sort = values => values.toSorted((left, right) => JSON.stringify(keys.map(key => left[key])).localeCompare(JSON.stringify(keys.map(key => right[key])), 'en'));
      assert.ok(equal(sort(actual[section][table]), sort(rows)), `Rehearsal seed differs: ${section}.${table}`);
    }
  }
  for (const section of ['users', 'identities', 'roles']) assert.ok(equal(captured[section], actual[section]), `Rehearsal seed differs: ${section}`);
}

export async function rehearse(directory, url) {
  const destination = JSON.parse(await readFile(path.join(directory, 'destination.json'), 'utf8'));
  const plan = JSON.parse(await readFile(path.join(directory, 'plan.json'), 'utf8'));
  const client = await connectRehearsal(url);
  try {
    await client.query('BEGIN');
    await seedRehearsal(client, destination, plan.manifest);
    const before = await snapshot(client, true);
    verifySeed(destination, before);
    await applyOperations(client, plan);
    const after = await snapshot(client, true);
    verifyAfter(before, after, plan);
    return { status: 'rehearsed', operations: plan.operations.length, identities: plan.auth.length, rolledBack: true };
  } finally {
    try { await client.query('ROLLBACK'); } finally { await client.end(); }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv[2] && process.env.MERGE_TEST_DATABASE_URL, 'Usage: MERGE_TEST_DATABASE_URL=localhost-url node supabase/merge-rehearse.mjs AUDIT_DIRECTORY');
  console.log(JSON.stringify(await rehearse(path.resolve(process.argv[2]), process.env.MERGE_TEST_DATABASE_URL)));
}
