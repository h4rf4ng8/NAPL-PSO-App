import { afterEach, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFields } from '../src/api/page';
import { ApiError } from '../src/api/http';
afterEach(()=>mock.restoreAll());
test('explicit selected-record editing reconstructs large values and prototype-shaped own keys',async()=>{
 const large='⚽'.repeat(9000);const calls:string[]=[];
 mock.method(globalThis,'fetch',async url=>{
  const path=String(url);calls.push(path);
  return Response.json(path.includes('/value') ? {nodes:[JSON.stringify({key:'__proto__',value:{large}})],pageInfo:{endCursor:null,hasNextPage:false},totalCount:1} : {nodes:[{index:0,key:'__proto__',valueUrl:'/api/record/value?revision=one'},{index:1,key:'constructor',value:'saved'},{index:2,key:'ordinary',value:[1,2]}],pageInfo:{endCursor:null,hasNextPage:false},totalCount:3});
 });
 const result=await readFields('/api/record/detail?revision=one');
 assert.equal(Object.getPrototypeOf(result),Object.prototype);assert.equal(Object.hasOwn(result,'__proto__'),true);
 assert.deepEqual(result.__proto__,{large});assert.equal(result.constructor,'saved');assert.deepEqual(result.ordinary,[1,2]);assert.equal(calls.length,2);
});
test('stale selected-record details fail visibly instead of mixing saved snapshots',async()=>{
 mock.method(globalThis,'fetch',async url=>String(url).includes('/value')?Response.json({error:'stale_cursor'},{status:409}):Response.json({nodes:[{index:0,key:'body',valueUrl:'/api/record/value?revision=old'}],pageInfo:{endCursor:null,hasNextPage:false},totalCount:1}));
 await assert.rejects(readFields('/api/record/detail?revision=old'),error=>error instanceof ApiError&&error.code==='stale_cursor');
});
test('full legacy Unicode keys are recovered from explicit field detail placeholders',async()=>{
 const key='長'.repeat(600);
 mock.method(globalThis,'fetch',async url=>Response.json({nodes:[String(url).includes('/value')?JSON.stringify({key,value:{preserved:true}}):{index:0,key:null,valueUrl:'/api/record/value?revision=same'}],pageInfo:{endCursor:null,hasNextPage:false},totalCount:1}));
 const result=await readFields('/api/record/detail?revision=same');assert.deepEqual(Object.keys(result),[key]);assert.deepEqual(result[key],{preserved:true});
});
test('a complete text action cannot adopt a different session between pages',async()=>{
 const { endSession } = await import('../src/auth/client');
 const { readText } = await import('../src/api/page');
 let calls=0;
 mock.method(globalThis,'fetch',async()=>{
  calls++;const response=Response.json(null);mock.method(response,'json',async()=>({nodes:['old identity'],pageInfo:{endCursor:'next',get hasNextPage(){endSession();return true;}},totalCount:2}));return response;
 });
 await assert.rejects(readText('/api/record/text'),error=>error instanceof ApiError&&error.code==='login_required');assert.equal(calls,1);
});
test('explicit settings values retain null and array roots',async()=>{
 const { readValue } = await import('../src/api/page');
 for(const value of [null,[{key:'legacy',value:1}]]){
  mock.method(globalThis,'fetch',async()=>Response.json({nodes:[{index:0,key:null,value}],pageInfo:{endCursor:null,hasNextPage:false},totalCount:1}));
  assert.deepEqual(await readValue('/api/settings/value'),value);mock.restoreAll();
 }
});
