import Fastify from 'fastify';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { loggerOptions, renderLocal } from '../../plugins/logging.js';

import { loggingFixture as fixture } from './logging-fixture.js';

function capture(script: string) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', fixture + `
    try { ${script} } finally { await app.close(); }
  `], { cwd: new URL('../..', import.meta.url), encoding: 'utf8', timeout: 15_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return { logs: result.stdout.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)), response: result.stderr.trim() ? JSON.parse(result.stderr) : undefined, output: result.stdout + result.stderr };
}

test('one canonical error event correlates the response without logging secrets', () => {
  const { logs, response, output } = capture(`
    const response = await app.inject({
      method: 'POST', url: '/api/users/me?probe=' + canaries.internal,
      headers: { authorization: 'Bearer ' + canaries.bearer, cookie: 'probe=' + canaries.cookie, 'x-request-id': canaries.internal },
      payload: { providerToken: canaries.provider },
    });
    console.error(JSON.stringify({status:response.statusCode, headers:response.headers, body:response.json()}));
  `);
  for (const value of ['synthetic-bearer-credential-canary','synthetic-cookie-credential-canary','synthetic-discord-provider-token-canary','synthetic-private-upstream-error-canary']) assert.ok(!output.includes(value));
  assert.equal(logs.length, 1);
  assert.equal(logs[0].event, 'api.request.completed');
  assert.equal(logs[0].component, 'api');
  assert.equal(logs[0].level, 'ERROR');
  assert.equal(logs[0].method, 'POST');
  assert.equal(logs[0].route, '/api/users/me');
  assert.equal(logs[0].status, 503);
  assert.equal(logs[0].actor_id, 'fef79a51-49a9-45c9-a2a5-99d7b601e497');
  assert.equal(logs[0].code, 'service_unavailable');
  assert.equal(logs[0].error_type, 'Error');
  assert.match(logs[0].source, /api\/routes\/accounts\/routes.ts:\d+:\d+/);
  assert.equal(logs[0].request_id, response.headers['x-request-id']);
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['set-cookie'], undefined);
  assert.deepEqual(response.body, { error: 'service_unavailable', message: 'Service temporarily unavailable' });
});

test('Lambda IDs remain isolated across overlapping requests and cannot be spoofed', () => {
  const { logs, response } = capture(`
    const { createHandler } = await import('./plugins/lambda.ts');
    app.get('/observe/:name', async request => {
      await new Promise(resolve => setTimeout(resolve, request.params.name === 'slow' ? 20 : 1));
      return {ok:true};
    });
    const handler = createHandler(app);
    const invoke = async (name, id) => {
      const path = '/observe/' + name;
      const result = await handler({version:'2.0', routeKey:'$default', rawPath:path, rawQueryString:'', headers:{'x-request-id':'spoofed'}, requestContext:{http:{method:'GET',path,sourceIp:'192.0.2.1',protocol:'HTTP/1.1',userAgent:''},requestId:'different-url-id'},isBase64Encoded:false}, {awsRequestId:id,functionVersion:'42'});
      return result.headers['x-request-id'];
    };
    console.error(JSON.stringify(await Promise.all([invoke('slow','aws-slow'),invoke('fast','aws-fast')])));
  `);
  assert.deepEqual(response, ['aws-slow','aws-fast']);
  assert.equal(logs.length, 2);
  assert.deepEqual(logs.map(log => log.request_id).toSorted((a: string,b: string) => a.localeCompare(b)), ['aws-fast','aws-slow']);
  for (const log of logs) {
    assert.equal(log.route, '/observe/:name');
    assert.equal(log.version, '42');
    assert.equal(log.level, 'INFO');
  }
});

test('GraphQL failures and handled auth rejection retain their classifications', () => {
  const { logs } = capture(`
    const { GatewayError } = await import('./plugins/auth/errors.ts');
    app.get('/reject', async () => { throw new GatewayError(401, 'access_invalid'); });
    app.get('/recover', async request => {
      const { diagnose } = await import('./plugins/logging.ts');
      diagnose(request, new Error('private warning'), 'discord_notification_failed', 'warn');
      diagnose(request, new Error('later ordinary classification'), 'later_info', 'info');
      return {ok:true};
    });
    const { schema } = await import('./routes/graphql/schema.ts');
    schema.getQueryType().getFields().defaultPositionWeights.resolve = () => { throw new TypeError('private-resolver-error'); };
    const bad = await app.inject({method:'POST',url:'/api/default-position-weights',headers:{'content-type':'application/json','apollo-require-preflight':'true'},payload:{variables:{}}});
    assert.equal(bad.statusCode,503);
    await app.inject('/reject');
    await app.inject('/recover');
    const cors = await app.inject({method:'OPTIONS',url:'/api/settings/current_season',headers:{origin:config.PUBLIC_ORIGIN,'access-control-request-method':'GET'}});
    assert.match(cors.headers['access-control-expose-headers'] ?? '', /X-Request-Id/i);
  `);
  assert.equal(logs.length, 4);
  assert.equal(logs[0].level, 'ERROR');
  assert.equal(logs[0].code, 'internal_error');
  assert.equal(logs[0].route, '/api/default-position-weights');
  assert.equal(logs[1].level, 'INFO');
  assert.equal(logs[1].code, 'access_invalid');
  assert.equal(logs[2].level, 'WARN');
  assert.equal(logs[2].status, 200);
});

test('local rendering is stable and sink failure cannot throw into request processing', () => {
  const line = '{"timestamp":"2026-10-18T00:00:00.000Z","level":"INFO","component":"api","event":"api.request.completed","request_id":"one","status":200}';
  assert.equal(renderLocal(line), '2026-10-18T00:00:00.000Z INFO api api.request.completed request_id="one" status=200\n');
  assert.doesNotThrow(() => loggerOptions({NODE_ENV:'production',LOG_LEVEL:'info'}, () => { throw new Error('sink failed'); }).stream.write(line));
  const rendered: string[] = [];
  loggerOptions({NODE_ENV:'development',LOG_LEVEL:'debug'}, value => { rendered.push(value); }).stream.write(line);
  assert.deepEqual(rendered, [renderLocal(line)]);
});


test('unmatched routes, invalid JSON/content type and GraphQL pre-execution rejection emit safe completions', () => {
  const { logs, output } = capture(`
    await app.inject('/missing/private-secret?token=private-secret');
    await app.inject({method:'POST',url:'/api/default-position-weights',headers:{'content-type':'application/json'},payload:'{private-secret'});
    await app.inject({method:'POST',url:'/api/default-position-weights',headers:{'content-type':'application/private-secret'},payload:'private-secret'});
    await app.inject({method:'POST',url:'/api/default-position-weights',headers:{'content-type':'text/plain'},payload:'private-secret'});
  `);
  assert.equal(logs.length, 4);
  assert.equal(logs[0].route, 'unmatched');
  assert.deepEqual(logs.map(log => log.status), [404,400,415,400]);
  assert.equal(logs[3].code, 'invalid_graphql_request');
  assert.ok(!output.includes('private-secret'));
});

test('HTTP 200 GraphQL errors and database codes remain diagnostic without raw error text', () => {
  const { logs, output } = capture(String.raw`
    const { GraphQLError } = await import('graphql');
    const { schema } = await import('./routes/graphql/schema.ts');
    schema.getQueryType().getFields().defaultPositionWeights.resolve = () => { throw new GraphQLError('private-secret', {extensions:{code:'BAD_USER_INPUT',status:422}}); };
    app.get('/db-failure', async () => { throw Object.assign(new Error('private-secret\n    at api/private-secret.ts:1:1'),{name:'PrismaClientKnownRequestError',code:'P2010',meta:{code:'08006'}}); });
    const response = await app.inject({method:'POST',url:'/api/default-position-weights',headers:{'content-type':'application/json'},payload:{variables:{}}});
    assert.equal(response.statusCode,200);
    await app.inject('/db-failure');
  `);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].status, 200);
  assert.equal(logs[0].code, 'invalid_query');
  assert.equal(logs[1].db_code, 'P2010');
  assert.equal(logs[1].sqlstate, '08006');
  assert.ok(!output.includes('private-secret'));
});

test('a failed output sink preserves the actual HTTP outcome', async () => {
  const app = Fastify({logger:loggerOptions({NODE_ENV:'production',LOG_LEVEL:'info'}, () => { throw new Error('disk full'); })});
  app.get('/', async () => ({ok:true}));
  app.addHook('onResponse', async request => { request.log.info({event:'test.complete'}); });
  try { assert.equal((await app.inject('/')).statusCode, 200); }
  finally { await app.close(); }
});

test('overlapping local requests fold framework warnings into their own completion and retain lifecycle warnings', () => {
  const { logs, output } = capture(`
    app.get('/local/:name', async request => {
      await new Promise(resolve => setTimeout(resolve, request.params.name === 'warn' ? 20 : 1));
      if (request.params.name === 'warn') request.log.warn('Reply was already sent private-secret');
      return {ok:true};
    });
    app.log.warn(new TypeError('private-secret lifecycle'));
    await Promise.all([app.inject('/local/warn'),app.inject('/local/ok')]);
  `);
  assert.equal(logs.length, 3);
  assert.equal(logs[0].event, 'api.framework.diagnostic');
  assert.equal(logs[0].error_type, 'TypeError');
  assert.equal(logs[1].level, 'INFO');
  assert.equal(logs[2].level, 'WARN');
  assert.equal(logs[2].code, 'reply_already_sent');
  assert.notEqual(logs[1].request_id, logs[2].request_id);
  assert.ok(!output.includes('private-secret'));
});

test('debug is opt-in and every production event has one static emission site', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const ts = await import('typescript');
  const events = new Map<string, string>();
  const walk = async (directory: URL) => {
    const entries = await readdir(directory, {withFileTypes:true});
    for (const entry of entries) {
      if (['node_modules','test','generated','dist'].includes(entry.name)) continue;
      const location = new URL(entry.name, directory);
      if (entry.isDirectory()) { await walk(new URL(entry.name + '/', directory)); continue; }
      if (!entry.name.endsWith('.ts')) continue;
      const source = ts.createSourceFile(location.pathname, await readFile(location, 'utf8'), ts.ScriptTarget.Latest, true);
      const visit = (node: import('typescript').Node) => {
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === 'event') {
          assert.ok(ts.isStringLiteral(node.initializer), `event name must be static in ${location.pathname}`);
          const name = (node.initializer as import('typescript').StringLiteral).text;
          assert.equal(events.has(name), false, `duplicate event ${name}: ${events.get(name)} and ${location.pathname}`);
          events.set(name, location.pathname);
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  };
  await walk(new URL('../../', import.meta.url));
  assert.ok(events.has('api.request.completed'));
  for (const level of ['info','debug'] as const) {
    const lines: string[] = [];
    const app = Fastify({logger:loggerOptions({NODE_ENV:'production',LOG_LEVEL:level}, line => { lines.push(line); })});
    app.log.debug({event:'test.debug'});
    app.log.info({event:'test.info'});
    assert.deepEqual(lines.map(line => JSON.parse(line).level), level === 'debug' ? ['DEBUG','INFO'] : ['INFO']);
    await app.close();
  }
});

test('warnings after completion remain correlated without duplicate request ID keys', () => {
  const { logs, output } = capture(`
    app.get('/late', async request => {
      setTimeout(() => { request.log.warn('stream payload does not end properly private-secret'); }, 10);
      return {ok:true};
    });
    await app.inject('/late');
    await new Promise(resolve => setTimeout(resolve, 30));
  `);
  assert.equal(logs.length, 2);
  assert.equal(logs[0].event, 'api.request.completed');
  assert.equal(logs[1].event, 'api.framework.diagnostic');
  assert.equal(logs[1].code, 'stream_incomplete');
  assert.equal(logs[1].request_id, logs[0].request_id);
  for (const line of output.trim().split('\n')) assert.equal(line.match(/"request_id":/g)?.length, 1);
  assert.ok(!output.includes('private-secret'));
});

test('late Apollo cache warnings preserve Lambda correlation and version', () => {
  const {logs,output} = capture(`
    const { ApolloServer } = await import('@apollo/server');
    const original = ApolloServer.prototype.executeHTTPGraphQLRequest;
    ApolloServer.prototype.executeHTTPGraphQLRequest = async function (...args) {
      const response = await original.apply(this,args);
      setTimeout(() => { this.logger.warn('Could not store validated document. private-secret'); }, 10);
      return response;
    };
    const { createHandler } = await import('./plugins/lambda.ts');
    const handler = createHandler(app);
    const path = '/api/default-position-weights';
    await handler({version:'2.0',routeKey:'$default',rawPath:path,rawQueryString:'',headers:{'content-type':'application/json'},body:'{"variables":{}}',requestContext:{requestId:'url-id',http:{method:'POST',path,sourceIp:'192.0.2.1',protocol:'HTTP/1.1',userAgent:''}},isBase64Encoded:false}, {awsRequestId:'late-apollo',functionVersion:'42'});
    await new Promise(resolve => setTimeout(resolve,30));
  `);
  assert.equal(logs.length,2);
  assert.equal(logs[0].event,'api.request.completed');
  assert.equal(logs[1].event,'api.graphql.lifecycle');
  assert.equal(logs[1].code,'document_cache_write_failed');
  assert.equal(logs[1].request_id,'late-apollo');
  assert.equal(logs[1].version,'42');
  for (const line of output.trim().split('\n')) assert.equal(line.match(/"request_id":/g)?.length,1);
  assert.ok(!output.includes('private-secret'));
});


test('filesystem codes are not SQLSTATE while native PostgreSQL codes remain available', () => {
  const {logs} = capture(`
    app.get('/code/:code', async request => { throw Object.assign(new Error('private'),{code:request.params.code}); });
    await app.inject('/code/EPIPE');
    await app.inject('/code/23505');
    await app.inject('/code/P0001');
  `);
  assert.equal(logs[0].sqlstate,undefined);
  assert.equal(logs[0].db_code,undefined);
  assert.equal(logs[1].sqlstate,'23505');
  assert.equal(logs[2].sqlstate,'P0001');
  assert.equal(logs[2].db_code,undefined);
});

test('resolved REST and fixed GraphQL targets enrich one completion without copying unknown IDs or secrets',()=>{
 const {logs,response,output}=capture(`
  const {payloadFixture,fixtureUser}=await import('./test/payload-fixture.ts');
  const {db}=payloadFixture();
  db.client.submission={deleteMany:async()=>({count:1})};
  const resources=createApp({config:{...config,NODE_ENV:'production'},db,auth:{authStore:{admit:async()=>({status:'allowed',retryAfter:0})},supabase:{verify:async()=>({id:fixtureUser,sessionId:fixtureUser,claims:{}}),user:async()=>{throw Error('unused');}},discord:{identity:async()=>{throw Error('unused');}}}});
  const headers={authorization:'Bearer '+canaries.bearer};
  const requests=[
   {url:'/api/teams/t_0'},
   {url:'/api/accounts/id/'+fixtureUser},
   {method:'POST',url:'/api/player-card',payload:{variables:{id:fixtureUser}}},
   {method:'POST',url:'/api/team-players',payload:{variables:{teamId:'t_0'}}},
   {method:'PATCH',url:'/api/accounts/'+fixtureUser,payload:{steamUrl:'https://example.test/'+canaries.internal}},
   {method:'PATCH',url:'/api/news/n_0',payload:{body:canaries.internal}},
   {url:'/api/rules/r_0'},
   {url:'/api/voting/periods/10000000-0000-4000-8000-000000000001/votes/me'},
   {method:'POST',url:'/api/rules/r_0/move',payload:{direction:'up'}},
   {method:'DELETE',url:'/api/submissions/sub_0'},
   {url:'/api/teams/unknown-target-secret'},
   {url:'/api/accounts/id/unknown-target-secret'},
   {url:'/api/accounts/id/99999999-9999-4999-8999-999999999999'},
   {url:'/api/accounts'},
   {method:'POST',url:'/api/player-card',payload:{variables:{id:'99999999-9999-4999-8999-999999999999'}}},
  ];
  try{const statuses=[];for(const input of requests)statuses.push((await resources.inject({...input,headers})).statusCode);console.error(JSON.stringify(statuses));}finally{await resources.close();}
 `);
 assert.deepEqual(response,[200,200,200,200,200,200,200,200,200,200,404,400,404,200,200]);
 assert.equal(logs.length,15);
 assert.ok(logs.every(row=>row.event==='api.request.completed'));
 for(const [index,type,id] of [[0,'team','t_0'],[1,'account','00000000-0000-4000-8000-000000000001'],[2,'account','00000000-0000-4000-8000-000000000001'],[3,'team','t_0'],[4,'account','00000000-0000-4000-8000-000000000001'],[5,'news','n_0'],[6,'rule','r_0'],[7,'voting_period','10000000-0000-4000-8000-000000000001'],[8,'rule','r_0'],[9,'submission','sub_0']] as const){assert.equal(logs[index].resource_type,type);assert.equal(logs[index].resource_id,id);}
 for(const row of logs.slice(10)){assert.equal(row.resource_id,undefined);assert.equal(row.resource_type,undefined);}
 assert.ok(!output.includes('unknown-target-secret'));
 for(const secret of ['synthetic-bearer-credential-canary','synthetic-private-upstream-error-canary'])assert.ok(!output.includes(secret));
});

test('Apollo warning followed by an unexpected serialization failure completes once at ERROR',()=>{
 const {logs,output}=capture(`
  const {ApolloServer}=await import('@apollo/server');
  const {JSONScalar}=await import('./routes/graphql/scalar.ts');
  const original=ApolloServer.prototype.executeHTTPGraphQLRequest;
  ApolloServer.prototype.executeHTTPGraphQLRequest=function(...args){
   this.logger.warn('Could not store validated document. private-serialization-secret');
   return original.apply(this,args);
  };
  JSONScalar.serialize=()=>{throw new TypeError('private-serialization-secret');};
  await app.inject({method:'POST',url:'/api/default-position-weights',headers:{'content-type':'application/json'},payload:{variables:{}}});
 `);
 assert.equal(logs.length,1);assert.equal(logs[0].event,'api.request.completed');
 assert.equal(logs[0].level,'ERROR');assert.equal(logs[0].code,'internal_error');
 assert.equal(logs[0].error_type,'TypeError');assert.ok(!output.includes('private-serialization-secret'));
});
