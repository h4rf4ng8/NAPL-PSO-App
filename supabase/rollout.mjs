import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { Client } = require('pg');
const [manifestPath, mode = '--plan', planPath] = process.argv.slice(2);
if (!manifestPath || !['--plan', '--execute', '--rehearse'].includes(mode)) {
  throw new Error('Usage: node [--env-file=protected.env] supabase/rollout.mjs manifest.json --plan [output.sql] | --execute | --rehearse');
}
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
if (manifest.project_ref !== 'jvubotxbflumsuwvsfzv') throw new Error('Replacement project manifest required');
if (!Array.isArray(manifest.initial_admin_ids) || manifest.initial_admin_ids.length !== 1) throw new Error('Review exactly one initial administrator');
const migrations = [
  '202610130001_gateway.sql',
  '202610130003_rbac.sql',
  '202610140001_role_audit.sql',
  '202610140002_auth_state.sql',
  '20261018232323_asl_normalized.sql',
];
const loaded = await Promise.all(migrations.map(async name => {
  const sql = await readFile(`${root}supabase/migrations/${name}`, 'utf8');
  return { name, sql: sql.replaceAll(/^BEGIN;\s*$/gm, '').replaceAll(/^COMMIT;\s*$/gm, ''), sha256: createHash('sha256').update(sql).digest('hex') };
}));
const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const settings = Object.entries({
  account_aliases: manifest.account_aliases,
  excluded_team_ids: manifest.excluded_team_ids,
  excluded_vote_ids: manifest.excluded_vote_ids,
}).map(([key, value]) => `SET LOCAL asl_migration.${key} = ${quote(JSON.stringify(value))};`).join('\n');
const sql = `BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
${settings}
DO $$ BEGIN
 IF to_regnamespace('asl') IS NOT NULL OR to_regnamespace('auth_gateway') IS NOT NULL OR to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
  RAISE EXCEPTION 'Fresh replacement baseline required; refusing partial rollout or migration-history overwrite';
 END IF;
END $$;
-- Block legacy league writers while the normalized snapshot is installed.
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename LOOP
  EXECUTE format('LOCK TABLE public.%I IN SHARE MODE NOWAIT',t);
 END LOOP;
END $$;
CREATE TEMP TABLE rollout_source_rows(tab text,row_data jsonb) ON COMMIT DROP;
DO $$ DECLARE t text; BEGIN
 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
  EXECUTE format('INSERT INTO rollout_source_rows SELECT %L,to_jsonb(t) FROM public.%I t',t,t);
 END LOOP;
END $$;
${loaded.map(m => `-- Applied migration ${m.name}; SHA256 ${m.sha256}\n${m.sql}`).join('\n')}
-- Administrator authority comes from the reviewed legacy list, not an escalation.
DO $$ DECLARE resolved uuid[]; listed integer; BEGIN
 SELECT array_agg(DISTINCT a.id ORDER BY a.id) INTO resolved
 FROM public.settings s CROSS JOIN LATERAL jsonb_array_elements_text(s.value::jsonb) n(username)
 JOIN public.accounts a ON lower(a.username)=lower(n.username)
 WHERE s.key='admin_list';
 SELECT COALESCE(sum(jsonb_array_length(value::jsonb)),0) INTO listed FROM public.settings WHERE key='admin_list';
 IF listed<>cardinality(resolved) OR resolved IS DISTINCT FROM ARRAY[${manifest.initial_admin_ids.map(id => `${quote(id)}::uuid`).join(',')}] THEN
  RAISE EXCEPTION 'Legacy admin_list does not match the reviewed initial administrator IDs';
 END IF;
END $$;
INSERT INTO auth_gateway.user_roles(user_id,role)
SELECT unnest(ARRAY[${manifest.initial_admin_ids.map(id => `${quote(id)}::uuid`).join(',')}]),'admin';
-- The replacement API reads/writes asl; legacy public is a recovery snapshot.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated,app_runtime,gateway_runtime;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,anon,authenticated,app_runtime,gateway_runtime;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated,app_runtime,gateway_runtime;
REVOKE CREATE ON SCHEMA public FROM app_runtime,gateway_runtime;
DO $$ DECLARE t text; difference bigint; BEGIN
 FOR t IN SELECT DISTINCT tab FROM rollout_source_rows LOOP
  EXECUTE format('SELECT count(*) FROM ((SELECT row_data FROM rollout_source_rows WHERE tab=%L EXCEPT ALL SELECT to_jsonb(t) FROM public.%I t) UNION ALL (SELECT to_jsonb(t) FROM public.%I t EXCEPT ALL SELECT row_data FROM rollout_source_rows WHERE tab=%L)) d',t,t,t,t) INTO difference;
  IF difference<>0 THEN RAISE EXCEPTION 'Legacy recovery rows changed in %',t; END IF;
 END LOOP;
END $$;
${await readFile(`${root}api/test/integration/asl-preservation.sql`, 'utf8')}
${await readFile(`${root}api/test/integration/asl-migration.sql`, 'utf8')}
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (
   has_table_privilege('app_runtime',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR
   has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE') OR
   has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'))) THEN
  RAISE EXCEPTION 'Legacy browser/runtime table access remains';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND
   (has_function_privilege('app_runtime',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE'))) THEN
  RAISE EXCEPTION 'Legacy browser/runtime function access remains';
 END IF;
 IF has_schema_privilege('gateway_runtime','asl','USAGE') THEN RAISE EXCEPTION 'Gateway role can access league schema'; END IF;
END $$;
CREATE SCHEMA supabase_migrations;
REVOKE ALL ON SCHEMA supabase_migrations FROM PUBLIC,anon,authenticated,app_runtime,gateway_runtime;
CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,statements text[],name text);
${loaded.map(m => `INSERT INTO supabase_migrations.schema_migrations VALUES (${quote(m.name.split('_',1)[0])},ARRAY[${quote(m.sql)}],${quote(m.name.slice(m.name.indexOf('_')+1,-4))});`).join('\n')}
COMMIT;`;
if (mode === '--plan') {
  if (planPath) await writeFile(planPath, sql, { mode: 0o600 });
  console.log(JSON.stringify({ project: manifest.project_ref, migrations: loaded.map(({ name, sha256 }) => ({ name, sha256 })), skipped: '202610130002_cutover.sql', aliases: Object.keys(manifest.account_aliases).length, excludedTeams: manifest.excluded_team_ids.length, excludedVotes: manifest.excluded_vote_ids.length, initialAdmins: manifest.initial_admin_ids.length, sqlFile: planPath ?? null }, null, 2));
} else {
  const url = new URL(process.env.ROLLOUT_DATABASE_URL ?? process.env.DATABASE_URL ?? '');
  if (mode === '--rehearse') {
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Rehearsal accepts localhost databases only');
  } else {
    if (new URL(process.env.SUPABASE_URL ?? '').hostname !== `${manifest.project_ref}.supabase.co`) throw new Error('SUPABASE_URL must match the reviewed replacement project');
    const direct = url.hostname === `db.${manifest.project_ref}.supabase.co`;
    const pooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) && decodeURIComponent(url.username) === `postgres.${manifest.project_ref}`;
    if (!direct && !pooler) throw new Error('Database endpoint must identify the reviewed replacement Supabase project');
  }
  const client = new Client({ connectionString: url.href });
  try {
    await client.connect();
    await client.query(sql);
    console.log(JSON.stringify({ project: manifest.project_ref, applied: migrations, status: 'committed' }));
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* A lost connection makes rollback unavailable. */ }
    throw new Error(`Rollout did not report success; inspect replacement migration history before retrying: ${error.message}`, { cause: error });
  } finally {
    await client.end();
  }
}
