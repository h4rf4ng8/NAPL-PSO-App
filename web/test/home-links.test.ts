import { test, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { HomeView } from '../src/features/content/Home';
import { mapCurrentCard } from '../src/features/accounts/api';
import { accountStatsSchema } from '@napl/contracts/accounts';
import { login, clearSession, tick, apiPath } from './auth-fixture';
import { page } from './page-fixture';
Object.defineProperty(globalThis,'React',{configurable:true,value:React});
after(()=>{Reflect.deleteProperty(globalThis,'React');});
afterEach(clearSession);
const stats=Object.fromEntries(Object.keys(accountStatsSchema.shape).map(key=>[key,0]));
const card={id:'user-a',username:'Alice',position:'CM',teamId:null,team:null,imageUrl:null,pendingImageUrl:null,email:null,country:null,roles:[],stats,season:'all',ranking:{score:0,percentile:0,ranked:false,gamesPlayed:0,tier:'BRONZE'},cardStats:Array.from({length:6},()=>({label:'Goals',value:'0'})),totwUntil:null,cheater:false,strikersId:'123',steamUrl:'/api/media/accounts/user-a/steam',createdAt:1,awardCount:0,championshipCount:0,awardPreview:[],championshipPreview:[],previewHasMore:false};

test('linked-account editor reads the original Steam URL and preserves it when another field is saved',async()=>{
 const original='https://steamcommunity.com/id/original';const writes:Record<string,unknown>[]=[];
 await login(async(url,init)=>{
  if(apiPath(url)==='/api/accounts/user-a/links/steamUrl')return Response.json(page([original]));
  if(apiPath(url)==='/api/accounts/user-a'){writes.push(JSON.parse(String(init?.body)));return Response.json({ok:true,id:'user-a'});}
  assert.equal(apiPath(url),'/api/users/me');return Response.json(card);
 });
 const client=new ApolloClient({cache:new InMemoryCache(),link:new ApolloLink(operation=>new Observable(observer=>{
  observer.next({data:operation.operationName==='HomeSummary'?{homeSummary:{playerCount:1,activeTeamCount:0,topPlayers:[]}}:{homeNews:{...page([]),__typename:'JsonPage',pageInfo:{__typename:'PayloadPageInfo',endCursor:null,hasNextPage:false}}}});observer.complete();
 }))});
 let view:ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(ApolloProvider,{client},React.createElement(HomeView,{account:mapCurrentCard(card as never),allTeams:[],currentSeason:'S1',onJump(){},onUpdate(){}})));await tick();});
 const button=(label:string)=>view!.root.findAllByType('button').find(node=>node.children.join('')===label)!;
 await act(async()=>{button('CHANGE').props.onClick();await tick();});
 assert.equal(view!.root.findByProps({type:'url'}).props.value,original);
 await act(async()=>{await button('SAVE').props.onClick();});
 assert.equal(writes[0]!.steamUrl,original);assert.equal(writes[0]!.strikersId,'123');
 await act(async()=>{button('CHANGE').props.onClick();await tick();});
 await act(async()=>{view!.root.findByProps({type:'url'}).props.onChange({target:{value:'https://steamcommunity.com/id/replacement'}});});
 await act(async()=>{await button('SAVE').props.onClick();});
 assert.equal(writes[1]!.steamUrl,'https://steamcommunity.com/id/replacement');assert.ok(writes.every(write=>!String(write.steamUrl).startsWith('/api/')));
 act(()=>view!.unmount());client.stop();
});
