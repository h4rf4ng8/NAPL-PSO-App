import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir } from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../../../',import.meta.url));
const baseline = process.argv[2];
assert.ok(baseline,'Pass the unchanged b41fd67 baseline checkout path');
const revision = (await exec('git',['rev-parse','HEAD'],{cwd:baseline})).stdout.trim();
assert.ok(revision.startsWith('b41fd67'),'Baseline must remain the reviewed direct-Lambda commit');
const scenario = process.argv[3] ?? 'routine';
assert.ok(['routine','stress'].includes(scenario),'Scenario must be routine or stress');
const container = `napl-payload-bytes-${process.pid}`;
const sql = text => new Promise((resolve,reject) => {
  const child = spawn('docker',['exec','-i',container,'psql','-v','ON_ERROR_STOP=1','-U','postgres','-d','payload_test']);
  let stderr = '';
  child.stderr.on('data',chunk => { stderr += chunk; });
  child.stdout.resume();
  child.on('error',reject);
  child.on('close',code => code === 0 ? resolve() : reject(new Error(stderr.slice(-2000))));
  child.stdin.end(text);
});
const source = `
  import assert from 'node:assert/strict';
  import {createApp} from './app.ts';
  import {connectDatabase} from './plugins/db/client.ts';
  import {config} from './test/plugins/fixtures.ts';
  const actor = '00000000-0000-4000-8000-000000000001';
  const db = connectDatabase(process.env.PAYLOAD_BENCHMARK_URL);
  const app = createApp({db,config,close:()=>db.close(),auth:{authStore:{admit:async()=>({status:'allowed',retryAfter:0})},supabase:{verify:async()=>({id:actor,sessionId:actor,claims:{}}),user:async()=>{throw Error('unused');}},discord:{identity:async()=>{throw Error('unused');}}}});
  const origin = await app.listen({host:'127.0.0.1',port:0});
  const observations = [];
  const request = async (route,variables) => {
    const response = await fetch(origin+route,{method:variables?'POST':'GET',headers:{authorization:'Bearer '+actor,...(variables && {'content-type':'application/json'})},...(variables && {body:JSON.stringify({variables: variables})})});
    const body = Buffer.from(await response.arrayBuffer());
    assert.equal(response.status,200,route+': '+body.toString().slice(0,200));
    observations.push({route,bytes:body.byteLength,type:response.headers.get('content-type')});
    return response.headers.get('content-type')?.includes('json') ? JSON.parse(body.toString()) : null;
  };
  try {
    if (process.env.PAYLOAD_BENCHMARK_SIDE === 'before') {
      const body = await request('/api/dashboard',{});
      assert.equal(body.errors,undefined);
      assert.equal(body.data.accounts.length,105);
      console.log(JSON.stringify({initial_bytes:observations.reduce((n,row)=>n+row.bytes,0),complete_action_bytes:observations.reduce((n,row)=>n+row.bytes,0),requests:observations,accounts:105,action:'complete snapshot containing all directory, selected card and image data; no additional API reads required'}));
    } else {
      const overview = await request('/api/league-overview',{});
      assert.equal(overview.errors,undefined);
      const initial = await request('/api/leaderboard',{first:10});
      assert.equal(initial.errors,undefined);
      const initialBytes = observations.reduce((n,row)=>n+row.bytes,0);
      const accounts = [...initial.data.leaderboard.nodes];
      let page = initial.data.leaderboard;
      while(page.pageInfo.hasNextPage) {
        page = (await request('/api/leaderboard',{first:10,after:page.pageInfo.endCursor})).data.leaderboard;
        accounts.push(...page.nodes);
      }
      assert.equal(accounts.length,105);
      assert.equal(new Set(accounts.map(row=>row.id)).size,105);
      const media = new Set(accounts.map(row=>row.imageUrl).filter(Boolean));
      for (const route of media) await request(route);
      const jsonRows = observations.filter(row=>row.type?.includes('json'));
      assert.ok(jsonRows.every(row=>row.bytes<=10000));
      const collection = {initial_bytes:initialBytes,complete_action_bytes:observations.reduce((n,row)=>n+row.bytes,0),requests:[...observations],accounts:105,action:'conservative complete-data workload: all leaderboard pages and every account image; not images rendered by StatsView'};
      observations.length=0;
      await request('/api/league-overview',{});
      await request('/api/seasons',{first:10});
      const first=(await request('/api/leaderboard',{first:10})).data.leaderboard;
      const openStatsBytes=observations.reduce((n,row)=>n+row.bytes,0);
      const next=(await request('/api/leaderboard',{first:10,after:first.pageInfo.endCursor})).data.leaderboard;
      const selected=next.nodes[0];
      const card=(await request('/api/player-card',{id:selected.id,season:'all'})).data.accountCard;
      await request('/api/account-awards',{id:selected.id,first:10});
      await request('/api/account-championships',{id:selected.id,first:10});
      for(const route of new Set([card.imageUrl,card.team?.logoUrl].filter(Boolean)))await request(route);
      const json=observations.filter(row=>row.type?.includes('json'));
      assert.ok(json.every(row=>row.bytes<=10000));
      const userAction={action:'scripted component requests: open Stats with overview and seasons; next players; select player; explicitly open both trophy histories; selected card account image and team logo',initial_json_bytes:openStatsBytes,complete_json_bytes:json.reduce((n,row)=>n+row.bytes,0),media_bytes:observations.filter(row=>!row.type?.includes('json')).reduce((n,row)=>n+row.bytes,0),complete_bytes:observations.reduce((n,row)=>n+row.bytes,0),requests:[...observations]};
      console.log(JSON.stringify({...collection,scripted_user_action:userAction}));
    }
  } finally {await app.close();}
`;
try {
  await exec('docker',['run','--rm','-d','--name',container,'-e','POSTGRES_PASSWORD=napl_test_only','-e','POSTGRES_DB=payload_test','-p','127.0.0.1::5432','postgres:17-alpine']);
  let ready=false;
  for (let attempt=0;attempt<30;attempt++) {
    try {await exec('docker',['exec',container,'pg_isready','-h','127.0.0.1','-U','postgres','-d','payload_test']);ready=true;break;} catch {await setTimeout(1000);}
  }
  assert.ok(ready,'Disposable PostgreSQL did not become ready on TCP');
  const migrations = (await readdir(path.join(root,'supabase/migrations'))).filter(name=>name.endsWith('.sql')).toSorted((a,b)=>a.localeCompare(b));
  const files = ['api/test/bootstrap.sql','supabase/fixtures/legacy.sql',...migrations.map(name=>'supabase/migrations/'+name)];
  for (const file of files) await sql(await readFile(path.join(root,file),'utf8'));
  await sql("CREATE ROLE payload_api LOGIN PASSWORD 'napl_test_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT app_runtime,gateway_runtime TO payload_api;");
  const port = (await exec('docker',['port',container,'5432/tcp'])).stdout.trim().split(':').at(-1);
  const suffix = `@127.0.0.1:${port}/payload_test`;
  const env = {...process.env,PAYLOAD_BENCHMARK_SCENARIO:scenario,PAYLOAD_BENCHMARK_ADMIN_URL:'postgresql://postgres:napl_test_only'+suffix};
  await exec(process.execPath,['--import','tsx','test/integration/payload-benchmark-seed.mjs'],{cwd:path.join(root,'api'),env,timeout:120_000,maxBuffer:1024*1024});
  const results = {};
  for (const [side,directory] of [['before',baseline],['after',root]]) {
    const {stdout} = await exec(process.execPath,['--import','tsx','--input-type=module','--eval',source],{cwd:path.join(directory,'api'),env:{...process.env,PAYLOAD_BENCHMARK_URL:'postgresql://payload_api:napl_test_only'+suffix,PAYLOAD_BENCHMARK_SIDE:side},timeout:120_000,maxBuffer:1024*1024});
    results[side] = JSON.parse(stdout);
  }
  console.log(JSON.stringify({baseline_commit:revision,scenario,image_fixture:'synthetic byte payloads; this benchmark makes no rendering/PNG validity claim',measurement:'real HTTP decoded response-body bytes; same disposable SQL fixture; excludes headers/TLS; separately reports conservative complete-data transfer and scripted component action; not browser network capture',results},null,2));
} finally {try {await exec('docker',['rm','-f',container]);} catch { /* The container may not have started. */ }}
