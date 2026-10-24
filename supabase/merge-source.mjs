import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { chmod, mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { auditMerge, canonical, digest, equal, rowKey } from './merge-audit.mjs';
import { legacyTables, tableKeys } from './merge-normalize.mjs';

const { Client } = createRequire(new URL('../api/package.json', import.meta.url))('pg');
const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const relation = (schema, table) => `${quote(schema)}.${quote(table)}`;
const sourceProject = 'qbdqxfoxyoeakbhxmwug';
const destinationProject = 'jvubotxbflumsuwvsfzv';
const readJson = async file => JSON.parse(await readFile(file, 'utf8'));
const saveJson = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
const order = ['accounts','teams','seasons','team_join_requests','team_seasons','articles','rules_sections','settings',
  'scheduled_matches','submissions','news','position_change_requests','totw_voting_periods','totw_candidates','totw_winners','totw_votes','transfers'];

async function protectedDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const actual = await realpath(directory);
  assert.ok(actual !== path.resolve(root) && !actual.startsWith(root), 'Migration artifacts must be outside the repository');
  await chmod(actual, 0o700);
  return actual;
}

async function connect(url, project) {
  const parsed = new URL(url);
  if (project) {
    assert.equal(parsed.hostname, `db.${project}.supabase.co`, 'Use the reviewed direct project endpoint');
    assert.equal(decodeURIComponent(parsed.username), 'postgres', 'Migration requires the administrator connection');
    parsed.searchParams.set('sslmode', 'verify-full');
    if (!parsed.searchParams.has('sslrootcert')) parsed.searchParams.set('sslrootcert', path.join(root,'api/prod-ca-2021.crt'));
  } else assert.ok(['127.0.0.1','localhost','[::1]'].includes(parsed.hostname), 'Rehearsal accepts localhost only');
  const client = new Client({ connectionString: parsed.href, connectionTimeoutMillis: 10_000, statement_timeout: 30_000 });
  await client.connect();
  return client;
}

export async function snapshot(client, destination) {
  const result = { legacy: {}, current: {}, users: [], identities: [] };
  const schemas = destination ? ['public','asl'] : ['public'];
  for (const schema of schemas) {
    const tables = schema === 'public' ? legacyTables : Object.keys(tableKeys);
    const inventory = await client.query('SELECT tablename FROM pg_tables WHERE schemaname=$1', [schema]);
    assert.deepEqual(inventory.rows.map(row => row.tablename).toSorted((a, b) => a.localeCompare(b)), [...tables].toSorted((a, b) => a.localeCompare(b)), `Unexpected ${schema} tables require review`);
    for (const table of tables) {
      const fields = schema === 'asl' ? tableKeys[table] : [table === 'settings' ? 'key' : 'id'];
      const data = await client.query(`SELECT to_jsonb(t) row FROM ${relation(schema,table)} t ORDER BY ${fields.map(field => quote(field)).join(',')}`);
      result[schema === 'public' ? 'legacy' : 'current'][table] = data.rows.map(row => row.row);
    }
  }
  const users = await client.query(`SELECT id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,
    is_super_admin,created_at,banned_until,deleted_at,is_anonymous,is_sso_user FROM auth.users ORDER BY id`);
  result.users = canonical(users.rows);
  const identities = await client.query('SELECT id,user_id,provider,provider_id,identity_data,created_at FROM auth.identities ORDER BY id');
  result.identities = canonical(identities.rows);
  const security = await client.query(`SELECT n.nspname schema,c.relname,c.relrowsecurity,c.relacl::text
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','asl','auth_gateway','auth','storage') AND c.relkind='r' ORDER BY 1,2`);
  result.security = security.rows;
  if (destination) {
    const roles = await client.query('SELECT * FROM auth_gateway.user_roles ORDER BY user_id,role');
    result.roles = roles.rows;
  } else result.roles = [];
  return result;
}

async function securityInventory(client) {
  const queries = {
    policies: "SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname IN ('public','asl','auth_gateway','storage') ORDER BY 1,2,3",
    functions: "SELECT n.nspname schema,p.proname,pg_get_functiondef(p.oid) definition,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','asl','auth_gateway') ORDER BY 1,2,p.oid",
    triggers: "SELECT n.nspname schema,c.relname,t.tgname,pg_get_triggerdef(t.oid) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname IN ('public','asl','auth','auth_gateway','storage') ORDER BY 1,2,3",
    grants: "SELECT table_schema,table_name,grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema IN ('public','asl','auth_gateway') ORDER BY 1,2,3,4",
  };
  const result = {};
  for (const [key, sql] of Object.entries(queries)) {
    const response = await client.query(sql);
    result[key] = response.rows;
  }
  return result;
}

export async function writeRow(client, schema, table, row, update = false) {
  const columns = Object.keys(row).filter(key => schema !== 'asl' || key !== 'username_lower');
  const target = relation(schema,table);
  if (update) {
    const keys = tableKeys[table];
    const changed = columns.filter(column => !keys.includes(column));
    const result = await client.query(`UPDATE ${target} t SET ${changed.map(column => `${quote(column)}=v.${quote(column)}`).join(',')}
      FROM jsonb_populate_record(NULL::${target},$1::jsonb) v WHERE ${keys.map(key => `t.${quote(key)}=v.${quote(key)}`).join(' AND ')}`, [JSON.stringify(row)]);
    assert.equal(result.rowCount,1,`Expected one updated ${table} row`);
  } else {
    await client.query(`INSERT INTO ${target} (${columns.map(column => quote(column)).join(',')}) SELECT ${columns.map(column => quote(column)).join(',')}
      FROM jsonb_populate_record(NULL::${target},$1::jsonb)`, [JSON.stringify(row)]);
  }
}

export async function applyOperations(client, plan) {
  for (const item of plan.auth) await writeRow(client,'auth','users',item.user);
  for (const item of plan.auth) await writeRow(client,'auth','identities',item.identity);
  for (const table of order) {
    for (const op of plan.operations) {
      if (op.table !== table) continue;
      const row = table === 'accounts' ? { ...op.after, team_id: op.before?.team_id ?? null } : op.after;
      await writeRow(client,'asl',table,row,Boolean(op.before));
    }
  }
  for (const op of plan.operations) {
    if (op.table !== 'accounts') continue;
    await client.query('UPDATE asl.accounts SET team_id=$1 WHERE id=$2::uuid', [op.after.team_id,op.after.id]);
  }
}

export function verifyAfter(before, after, plan) {
  assert.deepEqual(after.legacy,before.legacy,'Recovery snapshot changed');
  assert.deepEqual(after.roles,before.roles,'Destination roles changed');
  assert.deepEqual(after.security,before.security,'Destination security changed');
  for (const [table,rows] of Object.entries(before.current)) {
    const expected = new Map(rows.map(row => [rowKey(table,row),row]));
    for (const op of plan.operations) {
      if (op.table === table) expected.set(rowKey(table,op.after),op.after);
    }
    assert.equal(after.current[table].length,expected.size,`Unexpected ${table} row count`);
    const actualRows = after.current[table];
    for (const actual of actualRows) {
      const wanted = expected.get(rowKey(table,actual));
      assert.ok(wanted,`Unexpected ${table} row`);
      for (const [field,value] of Object.entries(wanted)) assert.ok(equal(actual[field],value),`Parity failed: ${table}.${field}`);
    }
  }
  for (const table of ['users','identities']) {
    assert.equal(after[table].length,before[table].length+plan.auth.length,`Unexpected Auth ${table} count`);
    const previousRows = before[table];
    for (const row of previousRows) assert.ok(equal(after[table].find(item=>item.id===row.id),row),`Existing Auth ${table} changed`);
    for (const item of plan.auth) {
      const expected = table === 'users' ? item.user : item.identity;
      const actual = after[table].find(row=>row.id===expected.id);
      assert.ok(actual,`Missing imported Auth ${table} row`);
      for (const [field,value] of Object.entries(actual)) {
        if (Object.hasOwn(expected,field)) assert.ok(equal(value,expected[field]),`Imported Auth ${table}.${field} differs`);
      }
    }
  }
}

async function backup(url, file) {
  const parsed = new URL(url);
  const env = { ...process.env, PGHOST: parsed.hostname, PGPORT: parsed.port || '5432', PGDATABASE: parsed.pathname.slice(1),
    PGUSER: decodeURIComponent(parsed.username), PGPASSWORD: decodeURIComponent(parsed.password), PGSSLMODE: 'verify-full',
    PGSSLROOTCERT: parsed.searchParams.get('sslrootcert') ?? path.join(root,'api/prod-ca-2021.crt') };
  const binary = process.env.PG_DUMP ?? 'pg_dump';
  await exec(binary,['--format=custom','--file',file],{env,timeout:120_000,maxBuffer:1024*1024});
  await chmod(file,0o600);
  const backupStat = await stat(file);
  assert.ok(backupStat.size > 0,'Empty backup');
  return digest(await readFile(file));
}

async function audit(directory, manifestFile) {
  const source = await connect(process.env.SOURCE_DATABASE_URL,sourceProject);
  const destination = await connect(process.env.DATABASE_URL,destinationProject);
  try {
    await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await destination.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const a = await snapshot(source,false), b = await snapshot(destination,true);
    const manifest = await readJson(manifestFile);
    assert.equal(manifest.project_ref,destinationProject);
    const plan = auditMerge(a,b,manifest);
    await saveJson(path.join(directory,'source.json'),a);
    await saveJson(path.join(directory,'destination.json'),b);
    await saveJson(path.join(directory,'source-security.json'),await securityInventory(source));
    await saveJson(path.join(directory,'destination-security.json'),await securityInventory(destination));
    await saveJson(path.join(directory,'plan.json'),plan);
    console.log(JSON.stringify({ ...plan.counts, planHash: digest(plan), directory }));
  } finally { await source.end(); await destination.end(); }
}

export async function claimAttempt(directory, planHash) {
  for (const name of ['backups.json','source-before.dump','destination-before.dump','destination-committed.json']) {
    try { await stat(path.join(directory,name)); }
    catch (error) { if (error.code==='ENOENT') continue; throw error; }
    throw new Error('This directory contains a previous apply attempt; preserve its backups and use a new audit directory');
  }
  // Exclusive creation also prevents concurrent applies from overwriting rollback evidence.
  await saveJson(path.join(directory,'attempt.json'),{planHash,startedAt:new Date().toISOString()});
}

async function apply(directory) {
  const plan = await readJson(path.join(directory,'plan.json'));
  const a = await readJson(path.join(directory,'source.json')), b = await readJson(path.join(directory,'destination.json'));
  assert.equal(plan.sourceHash,digest(a)); assert.equal(plan.destinationHash,digest(b));
  assert.ok(equal(plan,auditMerge(a,b,plan.manifest,Date.parse(plan.auditedAt))),'Audit plan was modified');
  try { await stat(path.join(directory,'applied.json')); console.log('Already applied; refusing a second write.'); return; }
  catch(error) { if(error.code!=='ENOENT') throw error; }
  await claimAttempt(directory,digest(plan));
  const backups = { source: await backup(process.env.SOURCE_DATABASE_URL,path.join(directory,'source-before.dump')),
    destination: await backup(process.env.DATABASE_URL,path.join(directory,'destination-before.dump')) };
  await saveJson(path.join(directory,'backups.json'),backups);
  const source = await connect(process.env.SOURCE_DATABASE_URL,sourceProject);
  const destination = await connect(process.env.DATABASE_URL,destinationProject);
  let committed = false;
  try {
    await source.query("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'");
    await destination.query("BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s'");
    await source.query(`LOCK TABLE ${legacyTables.map(table=>relation('public',table)).join(',')},auth.users,auth.identities IN SHARE MODE NOWAIT`);
    await destination.query(`LOCK TABLE ${Object.keys(tableKeys).map(table=>relation('asl',table)).join(',')},auth.users,auth.identities IN SHARE ROW EXCLUSIVE MODE NOWAIT`);
    assert.equal(digest(await snapshot(source,false)),plan.sourceHash,'Source changed since audit; generate a new audit');
    assert.equal(digest(await snapshot(destination,true)),plan.destinationHash,'Destination changed since audit; generate a new audit');
    assert.ok(equal(await securityInventory(source),await readJson(path.join(directory,'source-security.json'))),'Source security drift');
    assert.ok(equal(await securityInventory(destination),await readJson(path.join(directory,'destination-security.json'))),'Destination security drift');
    await applyOperations(destination,plan);
    const after = await snapshot(destination,true);
    verifyAfter(b,after,plan);
    assert.ok(equal(await securityInventory(destination),await readJson(path.join(directory,'destination-security.json'))),'Destination security changed during merge');
    // Keep source writers blocked until the destination commits; retire the legacy browser surface.
    await source.query('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role; REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role; REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated,service_role');
    await destination.query('COMMIT'); committed = true;
    await saveJson(path.join(directory,'destination-after.json'),after);
    await saveJson(path.join(directory,'destination-committed.json'),{planHash:digest(plan),committedAt:new Date().toISOString()});
    await source.query('COMMIT');
    await saveJson(path.join(directory,'applied.json'),{planHash:digest(plan),appliedAt:new Date().toISOString(),counts:plan.counts,sourceRetired:true});
    console.log(JSON.stringify({status:'applied',...plan.counts,sourceRetired:true}));
  } catch(error) {
    try { await destination.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
    try { await source.query('ROLLBACK'); } catch { /* Preserve the original failure. */ }
    if(committed) throw new Error('Destination committed; source retirement or receipt failed. Inspect protected receipts before any retry.',{cause:error});
    throw error;
  } finally { await destination.end(); await source.end(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode,directory,manifest] = process.argv.slice(2);
  assert.ok(['audit','apply'].includes(mode) && directory, 'Usage: node --env-file=.env ../supabase/merge-source.mjs audit DIRECTORY MANIFEST | apply DIRECTORY');
  const target = await protectedDirectory(path.resolve(directory));
  if(mode==='audit') await audit(target,manifest);
  else await apply(target);
}
