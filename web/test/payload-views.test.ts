import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { StatsView } from '../src/features/accounts/StatsView';
import { accountStatsSchema } from '@napl/contracts/accounts';
Object.defineProperty(globalThis,'React',{configurable:true,value:React});
after(()=>{Reflect.deleteProperty(globalThis,'React');});
const stats=Object.fromEntries(Object.keys(accountStatsSchema.shape).map(key=>[key,0]));
test('leaderboard auto-pages every result and filters on the server',async()=>{
 const calls:{name:string;variables:Record<string,unknown>}[]=[];
 // Each fetch returns one row. The server reports hasNextPage: true on page 1
 // and hasNextPage: false on page 2, so the client should auto-fetch exactly
 // two leaderboard pages per filter view (one initial + one follow-up).
 const client=new ApolloClient({cache:new InMemoryCache(),link:new ApolloLink(operation=>new Observable(observer=>{
  calls.push({name:operation.operationName,variables:operation.variables});
  if(operation.operationName==='Seasons')observer.next({data:{seasons:{__typename:'StringPage',nodes:['S2','S1'],summaries:[{games:1,players:1},{games:1,players:1}],totalCount:2,pageInfo:{__typename:'PayloadPageInfo',endCursor:null,hasNextPage:false}}}});
  else {const hasNext=!operation.variables.after;observer.next({data:{leaderboard:{__typename:'AccountSummaryPage',totalCount:2,nodes:[{__typename:'AccountSummary',id:operation.variables.after?'second':'first',username:operation.variables.after?'Second':'First',position:'CM',team:null,teamId:null,imageUrl:null,country:null,stats,ranking:{__typename:'Ranking',score:95,percentile:0.9,ranked:true,gamesPlayed:20,tier:'DIAMOND'}}],pageInfo:{__typename:'PayloadPageInfo',endCursor:hasNext?'next':null,hasNextPage:hasNext}}}});}
  observer.complete();
 }))});
 let view:ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(ApolloProvider,{client},React.createElement(StatsView)));await new Promise(resolve=>setImmediate(resolve));});
 // Initial filter view auto-fetched both pages (first page + hasNextPage triggered fetchMore).
 assert.equal(calls.filter(call=>call.name==='Leaderboard').length,2);
 assert.equal(calls.find(call=>call.name==='Leaderboard')!.variables.after,null);
 assert.equal(calls.filter(call=>call.name==='Leaderboard')[1]!.variables.after,'next');
 const button=(label:string)=>view!.root.findAllByType('button').find(node=>node.children.join('')===label)!;
 // Switching season refetches from page 1 and auto-pages again.
 await act(async()=>{button('S2').props.onClick();await new Promise(resolve=>setImmediate(resolve));});
 assert.equal(calls.findLast(call=>call.name==='Leaderboard')!.variables.season,'S2');
 // Switching position does the same.
 await act(async()=>{button('GK').props.onClick();await new Promise(resolve=>setImmediate(resolve));});
 assert.equal(calls.findLast(call=>call.name==='Leaderboard')!.variables.position,'GK');
 // No Next/Previous buttons are rendered — pagination controls are gone.
 assert.equal(view!.root.findAllByType('button').find(node=>node.children.join('')==='Next players'),undefined);
 assert.equal(view!.root.findAllByType('button').find(node=>node.children.join('')==='Previous players'),undefined);
 act(()=>view!.unmount());client.stop();
});
