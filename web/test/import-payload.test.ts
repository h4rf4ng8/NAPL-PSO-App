import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { ImportMatchManager } from '../src/features/matches/match-import';
import type { Account } from '../src/features/accounts/models';
import { login, clearSession, tick, apiPath } from './auth-fixture';
import { page } from './page-fixture';
Object.defineProperty(globalThis,'React',{configurable:true,value:React});
after(()=>{Reflect.deleteProperty(globalThis,'React');});
afterEach(clearSession);

test('import matches only uploaded IDs across necessary lookup pages, preserves manual off-page mapping and renders indexed skips',async()=>{
 const skippedName='未登録'.repeat(100);const writes:Record<string,unknown>[]=[];const paths:string[]=[];
 await login(async(url,init)=>{
  const path=apiPath(url);paths.push(path);
  if(path.startsWith('/api/teams?'))return Response.json(page([{id:'team-a',name:'Home Team',tag:'HOME'},{id:'team-b',name:'Away Team',tag:'AWAY'}]));
  if(path.startsWith('/api/accounts?')){const second=path.includes('after=next');return Response.json({...page([{id:second?'manual':'first',username:second?'Manual Player':'First Choice',position:'CM'}]),pageInfo:{endCursor:second?null:'next',hasNextPage:!second}});}
  assert.equal(path,'/api/import-match');writes.push(JSON.parse(String(init?.body)));return Response.json({ok:true,matchId:'fixture',updated:1,alreadyImported:1,skipped:1,skippedIndexes:[2],homeTeam:'Home Team',awayTeam:'Away Team',score:'2 - 0'});
 });
 const lookups:Record<string,unknown>[]=[];
 const client=new ApolloClient({cache:new InMemoryCache(),link:new ApolloLink(operation=>new Observable(observer=>{
  assert.equal(operation.operationName,'ImportAccountMatches');lookups.push(operation.variables);
  const second=!!operation.variables.after;
  observer.next({data:{importAccountMatches:{...page([{__typename:'ImportAccountSummary',username:second?'Auto Two':'Auto One',strikersId:second?'102':'101'}]),__typename:'ImportAccountSummaryPage',pageInfo:{__typename:'PayloadPageInfo',endCursor:second?null:'next',hasNextPage:!second}}}});observer.complete();
 }))});
 let view:ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(ApolloProvider,{client},React.createElement(ImportMatchManager,{account:{id:'user-a'} as Account,currentSeason:'S1',onRefresh(){}})));});
 assert.equal(paths.length,0);assert.equal(lookups.length,0);
 const source={match_id:'fixture',score:{home:2,away:0},players:[{player_id:'101',username:'Source One',team:'home',stats:{goals:2}},{player_id:'102',username:'Source Two',team:'away',stats:{}},{player_id:'103',username:skippedName,team:'away',stats:{}}]};
 const file=new File([JSON.stringify(source)],'match.json',{type:'application/json'});
 await act(async()=>{await view!.root.findByProps({type:'file'}).props.onChange({target:{files:[file]}});await tick();});
 assert.deepEqual(lookups.map(value=>value.strikersIds),[['101','102','103'],['101','102','103']]);assert.equal(lookups[1]!.after,'next');assert.ok(paths.every(path=>!path.startsWith('/api/accounts?')));
 await act(async()=>{view!.root.findByProps({'aria-label':'Home import team'}).props.onChange({target:{value:'team-a'}});view!.root.findByProps({'aria-label':'Away import team'}).props.onChange({target:{value:'team-b'}});});
 const button=(label:string)=>view!.root.findAllByType('button').find(node=>node.children.join('')===label)!;
 await act(async()=>{button('NEXT: MAP PLAYERS →').props.onClick();});
 assert.ok(button('Auto One'));assert.ok(button('Auto Two'));
 await act(async()=>{button('Auto Two').props.onClick();await tick();});
 await act(async()=>{button('Next page').props.onClick();await tick();});
 await act(async()=>{button('Manual Player · CM').props.onClick();});
 assert.ok(button('Manual Player'));
 await act(async()=>{button('NEXT: CONFIRM →').props.onClick();});
 await act(async()=>{await button('✓ CONFIRM IMPORT (2 PLAYERS)').props.onClick();});
 assert.deepEqual(writes[0]!.playerMap,{'101':'Auto One','102':'Manual Player','103':''});
 const rendered=JSON.stringify(view!.toJSON());assert.ok(rendered.includes(skippedName));assert.ok(rendered.includes('Already had this match'));assert.ok(rendered.includes('IMPORT COMPLETE'));assert.equal(writes.length,1);
 act(()=>view!.unmount());client.stop();
});
