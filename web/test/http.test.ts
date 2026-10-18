import {test,afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {request,ApiError,resetCsrf} from '../src/api/http';
const fixture={cookie:''};
Object.defineProperty(globalThis,'document',{configurable:true,value:{get cookie(){return fixture.cookie;}}});
afterEach(()=>{mock.restoreAll();fixture.cookie='';resetCsrf();});
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Content-Type':'application/json'}});
test('refreshes one expired command and preserves its idempotency key and rotated CSRF',async()=>{
 fixture.cookie='napl-csrf=before';
 const calls:{url:string;headers:Headers}[]=[];
 mock.method(globalThis,'fetch',async(url,options)=>{
  const target=String(url);calls.push({url:target,headers:new Headers(options?.headers)});
  if(target==='/auth/refresh'){fixture.cookie='napl-csrf=after';return json({ok:true});}
  return calls.length===1?json({error:{code:'session_expired'}},401):json({saved:true});
 });
 assert.deepEqual(await request('/api/teams','POST',{name:'Example'}),{saved:true});
 assert.deepEqual(calls.map(c=>c.url),['/api/teams','/auth/refresh','/api/teams']);
 assert.equal(calls[0]!.headers.get('Idempotency-Key'),calls[2]!.headers.get('Idempotency-Key'));
 assert.equal(calls[2]!.headers.get('X-CSRF-Token'),'after');
});
test('bootstraps the CSRF response contract and reads later cross-tab rotation',async()=>{
 const tokens:string[]=[];
 mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url)==='/auth/csrf'){fixture.cookie='__Host-napl-csrf=initial';return json({csrfToken:'initial'});}
  tokens.push(new Headers(options?.headers).get('X-CSRF-Token')||'');return new Response(null,{status:204});
 });
 await request('/api/teams/one','DELETE');fixture.cookie='__Host-napl-csrf=changed';await request('/api/teams/two','DELETE');
 assert.deepEqual(tokens,['initial','changed']);
});
test('does not replay failed mutations or retry refresh indefinitely',async()=>{
 fixture.cookie='napl-csrf=present';let calls=0;
 mock.method(globalThis,'fetch',async()=>{calls++;return json({error:'membership_refresh_required'},503);});
 await assert.rejects(request('/api/teams','POST',{}),error=>error instanceof ApiError&&error.code==='membership_refresh_required');
 assert.equal(calls,2);
 calls=0;mock.method(globalThis,'fetch',async()=>{calls++;return json({error:'upstream_unavailable'},503);});
 await assert.rejects(request('/api/teams','POST',{}),ApiError);assert.equal(calls,1);
});

test('does not replay a REST conflict or an ambiguous network failure',async()=>{
 fixture.cookie='napl-csrf=present';
 const conflict=mock.method(globalThis,'fetch',async()=>json({error:'conflict'},409));
 await assert.rejects(request('/api/import-match','POST',{}),error=>error instanceof ApiError&&error.status===409);
 assert.equal(conflict.mock.callCount(),1);
 mock.restoreAll();
 const failure=new TypeError('network unavailable');
 const network=mock.method(globalThis,'fetch',async()=>{throw failure;});
 await assert.rejects(request('/api/import-match','POST',{}),error=>error===failure);
 assert.equal(network.mock.callCount(),1);
});
test('rejects arbitrary upstream URLs',async()=>{
 await assert.rejects(request('https://app:3000/api/teams'),/Invalid API path/);
});

test('validates CSRF bootstrap data and preserves REST error precedence',async()=>{
 mock.method(globalThis,'fetch',async()=>json({csrfToken:42}));
 await assert.rejects(request('/api/teams','POST',{}),/Could not initialize secure session/);

 mock.restoreAll();
 fixture.cookie='napl-csrf=present';
 mock.method(globalThis,'fetch',async()=>json({
  message:'top-level',error:{code:'rest_code',message:'REST message'},
  errors:[null,{message:'GraphQL message',extensions:{code:'graphql_code'}}],
 },409));
 await assert.rejects(request('/api/teams'),error=>error instanceof ApiError
  &&error.code==='rest_code'&&error.message==='top-level');
});

test('falls back from malformed REST fields to the first GraphQL error object',async()=>{
 fixture.cookie='napl-csrf=present';
 mock.method(globalThis,'fetch',async()=>json({
  error:{code:3,message:'REST message'},
  errors:[null,{message:'GraphQL message',extensions:{code:'graphql_code'}},{message:'later',extensions:{code:'later_code'}}],
 },400));
 await assert.rejects(request('/api/teams'),error=>error instanceof ApiError
  &&error.code==='graphql_code'&&error.message==='REST message');
});

test('keeps the first object error authoritative and handles malformed error bodies',async()=>{
 for (const body of [null, [], {errors:[{}, {extensions:{code:'session_expired'}}]}, {errors:[[], {extensions:{code:'session_expired'}}]}]) {
  let calls=0;
  mock.method(globalThis,'fetch',async()=>{calls++;return json(body,400);});
  await assert.rejects(request('/api/teams'),error=>error instanceof ApiError
   &&error.code==='request_failed'&&error.message==='Request failed (400)');
  assert.equal(calls,1);
  mock.restoreAll();
 }
});

test('reads GraphQL error extensions.code and keeps refresh protected by signed CSRF',async()=>{
 fixture.cookie='napl-csrf=before';
 const calls:{url:string;headers:Headers}[]=[];
 mock.method(globalThis,'fetch',async(url,options)=>{
  const target=String(url);calls.push({url:target,headers:new Headers(options?.headers)});
  if(target==='/auth/refresh'){fixture.cookie='napl-csrf=after';return json({ok:true});}
  return calls.length===1
   ?json({errors:[{message:'Session expired',extensions:{code:'membership_refresh_required'}}]},401)
   :json({data:{accounts:[]}});
 });
 assert.deepEqual(await request('/api/standings','POST',{variables:{}}),{data:{accounts:[]}});
 assert.deepEqual(calls.map(call=>call.url),['/api/standings','/auth/refresh','/api/standings']);
 assert.equal(calls[1]!.headers.get('X-CSRF-Token'),'before');
 for(const index of [0,2]) {
  assert.equal(calls[index]!.headers.get('Apollo-Require-Preflight'),'true');
  assert.equal(calls[index]!.headers.get('X-CSRF-Token'),null);
  assert.equal(calls[index]!.headers.get('Idempotency-Key'),null);
 }
});

test('an expired REST command gets only one retry even when renewal succeeds',async()=>{
 fixture.cookie='napl-csrf=present';
 const calls:{url:string;headers:Headers}[]=[];
 mock.method(globalThis,'fetch',async(url,options)=>{
  const target=String(url);calls.push({url:target,headers:new Headers(options?.headers)});
  return target==='/auth/refresh'?json({ok:true}):json({error:'access_expired'},401);
 });
 await assert.rejects(request('/api/import-match','POST',{}),error=>error instanceof ApiError&&error.code==='access_expired');
 assert.deepEqual(calls.map(call=>call.url),['/api/import-match','/auth/refresh','/api/import-match']);
 assert.ok(calls[0]!.headers.get('Idempotency-Key'));
 assert.equal(calls[0]!.headers.get('Idempotency-Key'),calls[2]!.headers.get('Idempotency-Key'));
});

test('REST CSRF rotation retries once without changing the logical write key',async()=>{
 fixture.cookie='napl-csrf=old';
 const writes:Headers[]=[];
 mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url)==='/auth/csrf'){fixture.cookie='napl-csrf=new';return json({csrfToken:'new'});}
  writes.push(new Headers(options?.headers));
  return json({error:'csrf_invalid'},403);
 });
 await assert.rejects(request('/api/import-match','POST',{}),error=>error instanceof ApiError&&error.code==='csrf_invalid');
 assert.equal(writes.length,2);
 assert.deepEqual(writes.map(headers=>headers.get('X-CSRF-Token')),['old','new']);
 assert.equal(writes[0]!.get('Idempotency-Key'),writes[1]!.get('Idempotency-Key'));
});

test('a write keeps its original method, URL and body while session renewal is pending',async()=>{
 fixture.cookie='napl-csrf=present';
 const renewal=Promise.withResolvers<Response>();
 const started=Promise.withResolvers<void>();
 const attempts:{url:string;method:string|undefined;body:BodyInit|null|undefined}[]=[];
 mock.method(globalThis,'fetch',async(url,options)=>{
  if(String(url)==='/auth/refresh'){started.resolve();return renewal.promise;}
  attempts.push({url:String(url),method:options?.method,body:options?.body});
  return attempts.length===1?json({error:'session_expired'},401):json({saved:true});
 });
 const body={matchId:'original'};
 const pending=request('/api/import-match','POST',body);
 await started.promise;
 body.matchId='changed';
 renewal.resolve(json({ok:true}));
 await pending;
 assert.deepEqual(attempts,[
  {url:'/api/import-match',method:'POST',body:'{"matchId":"original"}'},
  {url:'/api/import-match',method:'POST',body:'{"matchId":"original"}'},
 ]);
});
