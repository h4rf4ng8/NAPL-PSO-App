import {test,after,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {act,create,type ReactTestRenderer,type ReactTestInstance} from 'react-test-renderer';
import {AdminsManager} from '../src/features/admin/AdminsManager';
import {login,clearSession,tick,apiPath} from './auth-fixture';
Object.defineProperty(globalThis,'React',{configurable:true,value:React});
after(()=>{Reflect.deleteProperty(globalThis,'React');});
afterEach(clearSession);
const page=(nodes:unknown[],next:string|null=null)=>({nodes,totalCount:2,pageInfo:{endCursor:next,hasNextPage:!!next}});
test('administrator promotion reads remaining assignments only on explicit write and preserves them',async()=>{
 const calls:string[]=[];let saved:unknown;
 await login(async(url,init)=>{
  const path=apiPath(url);calls.push(path);
  if(init?.method==='PUT'){saved=JSON.parse(String(init.body));return Response.json({ok:true});}
  if(path.startsWith('/api/accounts'))return Response.json(page([{id:'new',username:'New Player',position:'CM'}]));
  return Response.json(path.includes('after=') ? page([{userId:'offpage',username:'Off Page',role:'admin'}]) : page([{userId:'first',username:'First',role:'admin'}],'next'));
 });
 let view:ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(AdminsManager));await tick();});
 assert.equal(calls.filter(path=>path.includes('after=')).length,0);
 const text=(node:ReactTestInstance):string=>node.children.map(child=>typeof child==='string'?child:text(child)).join('');
 const button=(needle:string)=>view!.root.findAllByType('button').find(node=>text(node).includes(needle))!;
 await act(async()=>{button('PROMOTE').props.onClick();await tick();});
 await act(async()=>{button('NEW PLAYER').props.onClick();await tick();await tick();});
 assert.deepEqual(saved,{userIds:['first','offpage','new']});
 assert.equal(calls.filter(path=>path.includes('after=')).length,1);
 act(()=>view!.unmount());
});
