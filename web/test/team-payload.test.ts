import { test, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { TeamsView } from '../src/features/teams/teams-view';
import { TeamRosterFormation } from '../src/features/teams/roster';
import { TeamSelect } from '../src/features/teams/TeamSelect';
import type { Account } from '../src/features/accounts/models';
import { accountStatsSchema } from '@napl/contracts/accounts';
import { page } from './page-fixture';
Object.defineProperty(globalThis,'React',{configurable:true,value:React});
after(()=>{Reflect.deleteProperty(globalThis,'React');});
afterEach(()=>mock.restoreAll());
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const info={id:'team-a',name:'First Team',tag:'ONE',color:'#123456',ownerUsername:'Captain',status:'approved',logoUrl:null,totw:false,totwSetAt:null,createdAt:1,reviewedAt:null,reviewedBy:null,memberCount:2,invitationCount:0,seasonCount:0,viewerInvitation:null};
const stats=Object.fromEntries(Object.keys(accountStatsSchema.shape).map(key=>[key,0]));
const card=(id:string)=>({__typename:'AccountCard',id,username:id==='captain'?'Captain':'Other',position:'CM',teamId:info.id,team:{...info,__typename:'TeamIdentity'},imageUrl:null,country:null,stats,season:'all',ranking:{__typename:'AccountRanking',score:0,percentile:0,ranked:false,gamesPlayed:0,tier:'BRONZE'},cardStats:Array.from({length:6},()=>({__typename:'AccountCardStatCell',label:'Goals',value:'0'})),totwUntil:null,cheater:false,strikersId:'123',steamUrl:null,createdAt:1,awardCount:0,championshipCount:0,awardPreview:[],championshipPreview:[],previewHasMore:false});
const graphPage=<T>(nodes:T[],more=false)=>({...page(nodes),__typename:'AccountCardPage',pageInfo:{__typename:'PayloadPageInfo',endCursor:more?'next':null,hasNextPage:more}});

test('captain lineup editing waits for every selected-team roster page and recovers from a stale last page',async()=>{
 const first=Promise.withResolvers<unknown>(),last=Promise.withResolvers<unknown>();let rosterCalls=0;
 const client=new ApolloClient({cache:new InMemoryCache(),link:new ApolloLink(operation=>new Observable(observer=>{
  let result:unknown;
  switch(operation.operationName){
  case 'TeamSummaries': {result={teamSummaries:{...graphPage([{...info,__typename:'TeamSummary'}]),__typename:'TeamSummaryPage'}};break;
  }
  case 'Seasons': {result={seasons:{...graphPage(['S1']),__typename:'StringPage',summaries:[{games:0,players:0}]}};break;
  }
  case 'TeamStandings': {result={standings:{...graphPage([]),__typename:'JsonPage'}};break;
  }
  default: {rosterCalls++;const pending=rosterCalls===1?first.promise:(rosterCalls===2?last.promise:Promise.resolve({teamPlayers:graphPage([card('captain'),card('other')])}));let active=true;void pending.then(data=>{if (!active) {
    return;
  }

  observer.next({data:data as Record<string,unknown>});observer.complete();}).catch(error=>{if(active)observer.error(error);});return()=>{active=false;};}}
  observer.next({data:result as Record<string,unknown>});observer.complete();
 }))});
 mock.method(globalThis,'fetch',async url=>Response.json(String(url).includes('/lineup')?page([]):{...info,formation:'2-1-2',lineupUrl:'/api/teams/team-a/lineup?revision=one',descriptionUrl:'/api/team/description',rejectionReasonUrl:'/api/team/reason'}));
 let view:ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(ApolloProvider,{client},React.createElement(TeamsView,{account:{id:'captain',username:'Captain',teamId:info.id} as Account})));await tick();});
 const button=(label:string)=>view!.root.findAllByType('button').find(node=>node.children.join('')===label)!;
 await act(async()=>{button('View roster and team').props.onClick();await tick();});
 assert.equal(view!.root.findByType(TeamRosterFormation).props.isCaptain,false);
 await act(async()=>{first.resolve({teamPlayers:graphPage([card('captain')],true)});await tick();});
 assert.equal(view!.root.findByType(TeamRosterFormation).props.isCaptain,false);
 await act(async()=>{button('Load more roster cards').props.onClick();await tick();last.reject(new Error('stale_cursor'));await tick();});
 assert.equal(view!.root.findByType(TeamRosterFormation).props.isCaptain,false);
 await act(async()=>{button('Reload team').props.onClick();await tick();});
 assert.equal(view!.root.findByType(TeamRosterFormation).props.isCaptain,true);assert.equal(view!.root.findByType(TeamRosterFormation).props.allPlayers.length,2);
 act(()=>view!.unmount());client.stop();
});

const Host=()=>{const[value,setValue]=React.useState('');return React.createElement(TeamSelect,{value,onChange:setValue,label:'Selected team'});};
test('team selectors keep an off-page selected value and expose later choices',async()=>{
 mock.method(globalThis,'fetch',async url=>{const second=String(url).includes('after=next');return Response.json({...page([{...info,id:second?'team-b':'team-a',name:second?'Second Team':'First Team'}]),pageInfo:{endCursor:second?null:'next',hasNextPage:!second}});});
 let view:ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(Host));await tick();});
 await act(async()=>{view!.root.findByType('select').props.onChange({target:{value:'team-a'}});});
 await act(async()=>{view!.root.findAllByType('button').find(node=>node.children.join('')==='Next page')!.props.onClick();await tick();});
 assert.equal(view!.root.findByType('select').props.value,'team-a');assert.equal(view!.root.findAllByType('option').find(node=>node.props.value==='team-a')!.children.join(''),'First Team');assert.ok(view!.root.findAllByType('option').some(node=>node.props.value==='team-b'));
 act(()=>view!.unmount());
});
