import assert from 'node:assert/strict';
import {after,mock,test} from 'node:test';
import {session} from './session-fixture';

const restored=session();
localStorage.setItem('napl-auth',JSON.stringify(restored));
const {supabase,sessionUserId}=await import('../src/auth/client');
const {request}=await import('../src/api/http');
after(async()=>{localStorage.clear();await supabase.auth.dispose();mock.restoreAll();});

test('a newly opened tab can make its first request with its restored SDK identity',async()=>{
 const calls:Headers[]=[];
 mock.method(globalThis,'fetch',async(_url,init)=>{calls.push(new Headers(init?.headers));return Response.json([]);});
 assert.deepEqual(await request('/api/accounts'),[]);
 assert.equal(sessionUserId(),restored.user.id);assert.equal(calls[0]!.get('Authorization'),`Bearer ${restored.access_token}`);
});
test('an anonymous SDK bootstrap keeps public reads available without a bearer token',async()=>{
 localStorage.clear();await supabase.auth.signOut({scope:'local'});
 const calls:Headers[]=[];
 mock.method(globalThis,'fetch',async(_url,init)=>{calls.push(new Headers(init?.headers));return Response.json([]);});
 assert.deepEqual(await request('/api/accounts'),[]);assert.equal(sessionUserId(),null);assert.equal(calls[0]!.get('Authorization'),null);
});
