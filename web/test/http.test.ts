import { apiTarget } from './auth-fixture';
import { page } from './page-fixture';
import {test,afterEach,mock} from 'node:test';
import assert from 'node:assert/strict';
import {request,ApiError} from '../src/api/http';
import {client,resetClient} from '../src/api/client';
import {TeamRecordsDocument} from '../src/api/generated/graphql';
import {supabase} from '../src/auth/client';
import {apiPath,clearSession,login,session,tick} from './auth-fixture';
const json=(body:unknown,status=200)=>Response.json(body,{status});
afterEach(async()=>{await clearSession();await resetClient();});
test('direct bearer writes retry expiry with stable method, URL, serialized body and key',async()=>{
 const renewal=Promise.withResolvers<Response>(),started=Promise.withResolvers<void>();const attempts:{url:string;init:RequestInit}[]=[];
 const original=await login(async(url,init)=>{if(url.includes('grant_type=refresh_token')){started.resolve();return renewal.promise;}attempts.push({url,init:init!});return attempts.length===1?json({error:'access_expired'},401):json({saved:true});});
 const body={matchId:'original'};const pending=request('/api/match-imports','POST',body);await started.promise;body.matchId='changed';renewal.resolve(json(session('user-a',2)));
 assert.deepEqual(await pending,{saved:true});assert.equal(attempts.length,2);
 assert.deepEqual(attempts.map(({url,init})=>({url,method:init.method,body:init.body,credentials:init.credentials})),Array.from({length:2},()=>({url:'http://api.example.test/api/match-imports',method:'POST',body:'{"matchId":"original"}',credentials:'omit'})));
 const headers=attempts.map(({init})=>new Headers(init.headers));assert.equal(headers[0]!.get('Authorization'),`Bearer ${original.access_token}`);assert.equal(headers[1]!.get('Authorization'),`Bearer ${session('user-a',2).access_token}`);assert.ok(headers[0]!.get('Idempotency-Key'));assert.equal(headers[0]!.get('Idempotency-Key'),headers[1]!.get('Idempotency-Key'));assert.equal(headers[0]!.get('X-CSRF-Token'),null);
});
test('real SDK shares one refresh between concurrent Apollo and REST expiry and persists rotated tokens',async()=>{
 const renewal=Promise.withResolvers<Response>(),started=Promise.withResolvers<void>();let renewals=0;const attempts=new Map<string,number>();
 await login(async(url,init)=>{if(url.includes('grant_type=refresh_token')){renewals++;assert.deepEqual(JSON.parse(String(init?.body)),{refresh_token:'user-a-refresh-1'});started.resolve();return renewal.promise;}const path=apiTarget(url,init),count=(attempts.get(path)??0)+1;attempts.set(path,count);return count===1?json({errors:[{extensions:{code:'access_expired'}}]},401):json(path==='TeamRecords'?{data:{teamRecords: page([])}}:[]);});
 const pending=Promise.all([client.query({query:TeamRecordsDocument}),request('/api/accounts')]);await started.promise;await tick();assert.equal(renewals,1);renewal.resolve(json(session('user-a',2)));
 const [graph,rest]=await pending;assert.deepEqual(graph.data,{teamRecords: page([])});assert.deepEqual(rest,[]);assert.equal(renewals,1);assert.deepEqual(attempts.values().toArray(),[2,2]);assert.equal((await supabase.auth.getSession()).data.session?.refresh_token,'user-a-refresh-2');
});
test('delayed expired response reuses a token already refreshed by SDK',async()=>{
 const delayed=Promise.withResolvers<Response>();let reads=0,refreshes=0;await login(async url=>{if(url.includes('grant_type=refresh_token')){refreshes++;return json(session('user-a',2));}reads++;return reads===1?delayed.promise:json([]);});const pending=request('/api/accounts');await tick();await supabase.auth.refreshSession();delayed.resolve(json({error:'access_expired'},401));assert.deepEqual(await pending,[]);assert.equal(refreshes,1);assert.equal(reads,2);
});
for(const [code,status] of [['access_expired',503],['session_expired',401],['membership_refresh_required',401],['session_revoked',401],['forbidden',403],['csrf_invalid',403],['conflict',409],['upstream_unavailable',503]] as const)test(`does not replay writes after ${code} (${status})`,async()=>{let calls=0;await login(async()=>{calls++;return json({error:code},status);});await assert.rejects(request('/api/match-imports','POST',{}),error=>error instanceof ApiError&&error.code===code);assert.equal(calls,1);});
test('does not replay ambiguous network failures',async()=>{const failure=new TypeError('offline');let calls=0;await login(async()=>{calls++;throw failure;});await assert.rejects(request('/api/match-imports','POST',{}),error=>error===failure);assert.equal(calls,1);});
test('renewed commands get at most two application attempts',async()=>{let writes=0,refreshes=0;await login(async url=>{if(url.includes('grant_type=refresh_token')){refreshes++;return json(session('user-a',2));}writes++;return json({error:'access_expired'},401);});await assert.rejects(request('/api/match-imports','POST',{}),error=>error instanceof ApiError&&error.code==='access_expired');assert.equal(writes,2);assert.equal(refreshes,1);});
test('cancelling Apollo during shared SDK refresh prevents its retry while REST completes',async()=>{
 const renewal=Promise.withResolvers<Response>(),started=Promise.withResolvers<void>();const calls:string[]=[];await login(async(url,init)=>{if(url.includes('grant_type=refresh_token')){assert.equal(init?.signal,undefined);started.resolve();return renewal.promise;}const path=apiTarget(url,init);calls.push(path);return calls.filter(value=>value===path).length===1?json({error:'access_expired'},401):json([]);});
 const graph=Promise.allSettled([client.query({query:TeamRecordsDocument})]),rest=request('/api/accounts');await started.promise;await tick();await resetClient();renewal.resolve(json(session('user-a',2)));await graph;assert.deepEqual(await rest,[]);assert.equal(calls.filter(path=>path==='TeamRecords').length,1);assert.deepEqual(client.cache.extract(),{});
});
test('cancellation stops before auth and after response decoding',async()=>{
 const before=new AbortController();before.abort();const fetch=mock.method(globalThis,'fetch');await assert.rejects(request('/api/accounts','GET',undefined,before.signal),{name:'AbortError'});assert.equal(fetch.mock.callCount(),0);mock.restoreAll();
 const controller=new AbortController();let calls=0;await login(async()=>{calls++;const response=json([]);mock.method(response,'json',async()=>{controller.abort();return [];});return response;});await assert.rejects(request('/api/accounts','GET',undefined,controller.signal),{name:'AbortError'});assert.equal(calls,1);
});
test('old identity responses cannot retry with a newly signed-in account or return stale write results',async()=>{
 for(const expired of [true,false]){const delayed=Promise.withResolvers<Response>();let writes=0;await login(async()=>{writes++;return delayed.promise;});const pending=request('/api/teams','POST',{});await tick();mock.method(globalThis,'fetch',async()=>json(session('user-b')));await supabase.auth.signInWithPassword({email:'new@example.test',password:'test'});delayed.resolve(expired?json({error:'access_expired'},401):json({saved:true}));await assert.rejects(pending,error=>error instanceof ApiError&&error.code==='login_required');assert.equal(writes,1);await clearSession();}
});
test('rejects arbitrary upstream URLs and removed auth paths',async()=>{for(const path of ['https://app:3000/api/teams','/auth/refresh'])await assert.rejects(request(path),/Invalid API path/);});
test('preserves REST error precedence and first GraphQL error object decoding',async()=>{
 for(const [body,code,message] of [[{message:'top-level',error:{code:'rest_code',message:'REST message'},errors:[null,{message:'GraphQL message',extensions:{code:'graphql_code'}}]},'rest_code','top-level'],[{error:{code:3,message:'REST message'},errors:[null,{message:'GraphQL message',extensions:{code:'graphql_code'}}]},'graphql_code','REST message'],[null,'request_failed','Request failed (400)'],[{errors:[{}, {extensions:{code:'access_expired'}}]},'request_failed','Request failed (400)'],[{errors:[[], {extensions:{code:'access_expired'}}]},'request_failed','Request failed (400)']] as const){mock.method(globalThis,'fetch',async()=>json(body,400));await assert.rejects(request('/api/accounts'),error=>error instanceof ApiError&&error.code===code&&error.message===message);mock.restoreAll();}
});
test('a write waiting for its first SDK session cannot adopt a later login',async()=>{
 let writes=0;await login(async()=>{writes++;return json({saved:true});});
 const waiting=Promise.withResolvers<Awaited<ReturnType<typeof supabase.auth.getSession>>>();
 const original=supabase.auth.getSession.bind(supabase.auth);mock.method(supabase.auth,'getSession',()=>waiting.promise);
 const pending=request('/api/teams','POST',{owner:'old'});await tick();
 mock.method(globalThis,'fetch',async()=>json(session('user-b')));await supabase.auth.signInWithPassword({email:'new@example.test',password:'test'});
 waiting.resolve(await original());await assert.rejects(pending,error=>error instanceof ApiError&&error.code==='login_required');assert.equal(writes,0);
});
test('switching identities during response JSON decoding cannot invalidate or return old results',async()=>{
 const decoded=Promise.withResolvers<unknown>();let reads=0;
 await login(async()=>{const response=json({saved:true});mock.method(response,'json',()=>decoded.promise);reads++;return response;});
 const pending=request('/api/teams','POST',{});await tick();mock.method(globalThis,'fetch',async()=>json(session('user-b')));await supabase.auth.signInWithPassword({email:'new@example.test',password:'test'});
 client.cache.writeQuery({query:TeamRecordsDocument,data:{teamRecords: page([])}});const cached=client.cache.extract();decoded.resolve({saved:true});
 await assert.rejects(pending,error=>error instanceof ApiError&&error.code==='login_required');assert.equal(reads,1);assert.deepEqual(client.cache.extract(),cached);
});
test('binary media shares bearer renewal and returns image bytes without JSON decoding',async()=>{
 let attempts=0;const bytes=new Uint8Array([137,80,78,71]);
 await login(async(url,init)=>{
  if(url.includes('grant_type=refresh_token'))return json(session('user-a',2));
  assert.equal(apiPath(url),'/api/media/accounts/a/pending-image');
  assert.match(new Headers(init?.headers).get('Authorization')??'',/^Bearer /);
  attempts++;return attempts===1?json({error:'access_expired'},401):new Response(bytes,{headers:{'Content-Type':'image/png'}});
 });
 const image=await request<Blob>('/api/media/accounts/a/pending-image');
 assert.deepEqual(new Uint8Array(await image.arrayBuffer()),bytes);assert.equal(attempts,2);
});
