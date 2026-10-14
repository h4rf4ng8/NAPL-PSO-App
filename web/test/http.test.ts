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
test('rejects arbitrary upstream URLs',async()=>{
 await assert.rejects(request('https://app:3000/api/teams'),/Invalid API path/);
});

test('reads GraphQL error extensions.code for session refresh and reuses the request key',async()=>{
 fixture.cookie='napl-csrf=before';
 const calls:{url:string;headers:Headers}[]=[];
 mock.method(globalThis,'fetch',async(url,options)=>{
  const target=String(url);calls.push({url:target,headers:new Headers(options?.headers)});
  if(target==='/auth/refresh'){fixture.cookie='napl-csrf=after';return json({ok:true});}
  return calls.length===1
   ?json({errors:[{message:'Session expired',extensions:{code:'membership_refresh_required'}}]},401)
   :json({data:{accounts:[]}});
 });
 assert.deepEqual(await request('/api/graphql','POST',{query:'query { accounts { id } }'}),{data:{accounts:[]}});
 assert.deepEqual(calls.map(call=>call.url),['/api/graphql','/auth/refresh','/api/graphql']);
 assert.equal(calls[0]!.headers.get('Idempotency-Key'),calls[2]!.headers.get('Idempotency-Key'));
 assert.equal(calls[2]!.headers.get('X-CSRF-Token'),'after');
});
