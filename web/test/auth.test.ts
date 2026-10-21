import assert from 'node:assert/strict';
import {after,afterEach,mock,test} from 'node:test';
import React,{createElement} from 'react';
import {act,create,type ReactTestRenderer} from 'react-test-renderer';
import {ApolloProvider} from '@apollo/client/react';
import {createClient} from '@supabase/supabase-js';
import {session} from './session-fixture';

const events=new EventTarget();
const page=new URL('https://frontend.example.test/');
const location={get href(){return page.href;},get origin(){return page.origin;},get pathname(){return page.pathname;},get hash(){return page.hash;},set hash(value:string){page.hash=value;},assign:mock.fn(),reload:mock.fn()};
const globals={React,location,history:{replaceState:mock.fn((_state:unknown,_unused:string,url:string)=>{page.href=new URL(url,page).href;})},window:{location,addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)},document:{visibilityState:'hidden',documentElement:{dataset:{}}},addEventListener:events.addEventListener.bind(events),removeEventListener:events.removeEventListener.bind(events)};
const originals=Object.fromEntries(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
for(const [key,value]of Object.entries(globals))Object.defineProperty(globalThis,key,{configurable:true,value});
const [{default:App},{supabase,storageKey},{auth},{client,resetClient},{Dashboard,PublicLeague},{login,clearSession,apiPath,apiTarget,tick}]=await Promise.all([import('../src/App'),import('../src/auth/client'),import('../src/auth/session'),import('../src/api/client'),import('../src/features/dashboard'),import('./auth-fixture')]);
const json=(body:unknown,status=200)=>Response.json(body,{status});
/* eslint-disable unicorn/no-top-level-assignment-in-function -- The mounted tree is shared with test cleanup. */
let renderer:ReactTestRenderer|undefined;
afterEach(async()=>{
 await act(async()=>{renderer?.unmount();});renderer=undefined;
 await supabase.auth.stopAutoRefresh();await clearSession();await resetClient();page.href='https://frontend.example.test/';
});
after(async()=>{
 await supabase.auth.dispose();
 for(const [key,value]of Object.entries(originals)){if(value)Object.defineProperty(globalThis,key,value);else Reflect.deleteProperty(globalThis,key);}
});
function account(id='user-a') {
 return {id,username:id,position:'ST',team:null,teamId:null,imageUrl:null,country:null,stats:{games:0,wins:0,draws:0,losses:0,goals:0,assists:0,passes:0,tackles:0,deflects:0,catches:0,cleanSheets:0,motm:0},ranking:{score:0,percentile:0,ranked:false,gamesPlayed:0,tier:'BRONZE'},cardStats:Array.from({length:6},()=>({label:'Goals',value:'0'})),season:'all',awardPreview:[],championshipPreview:[],awardCount:0,championshipCount:0,email:null,pendingImageUrl:null,roles:[],totwUntil:null,cheater:false,strikersId:'123',steamUrl:null,createdAt:1};
}
const mount=async()=>{await act(async()=>{renderer=create(createElement(ApolloProvider,{client},createElement(App)));await tick();});};
const secondary=()=>createClient('https://auth.example.test','sb_publishable_test',{auth:{storage:localStorage,storageKey,persistSession:true,autoRefreshToken:false,detectSessionInUrl:false,flowType:'pkce'}});

test('real SDK Discord login uses PKCE and callback exchanges once before verified profile provisioning',async()=>{
 const calls:{url:string;init?:RequestInit}[]=[];
 const value={...session(),provider_token:'discord-provider-token'};
 mock.method(globalThis,'fetch',async(url,init)=>{calls.push({url:String(url),init});return json(String(url).includes('grant_type=pkce')?value:account());});
 assert.deepEqual(await auth.signInWithDiscord(),{ok:true});
 const authorize=new URL(location.assign.mock.calls.at(-1)!.arguments[0] as string);
 assert.equal(authorize.searchParams.get('provider'),'discord');assert.equal(authorize.searchParams.get('code_challenge_method'),'s256');assert.ok(authorize.searchParams.get('code_challenge'));assert.match(authorize.searchParams.get('redirect_to')! ,/^https:\/\/frontend.example.test\/auth\/callback/);
 page.href=authorize.searchParams.get('redirect_to')!;page.searchParams.set('code','oauth-code');
 await Promise.all([auth.completeSignIn(),auth.completeSignIn()]);
 assert.equal(page.href,'https://frontend.example.test/');assert.equal(calls.filter(call=>call.url.includes('grant_type=pkce')).length,1);
 const provision=calls.find(call=>apiPath(call.url)==='/api/accounts/me')!;assert.equal(provision.init?.method,'POST');assert.deepEqual(JSON.parse(String(provision.init?.body)),{providerToken:'discord-provider-token'});assert.equal(new Headers(provision.init?.headers).get('Authorization'),`Bearer ${value.access_token}`);
 const restored=secondary();try{assert.equal((await restored.auth.getSession()).data.session?.refresh_token,value.refresh_token);}finally{await restored.auth.dispose();}
});

test('cancelled and invalid OAuth callbacks clear URL and leave a recoverable error',async()=>{
 for(const [name,query,message]of [['cancel','?error=access_denied&error_description=Cancelled','Cancelled'],['missing','','Sign-in code is missing'],['invalid','?code=bad','invalid grant']]as const){
  const instance=await import(`../src/auth/session.ts?case=${name}`);page.href=`https://frontend.example.test/auth/callback${query}`;
  localStorage.setItem(`${storageKey}-code-verifier`,JSON.stringify('verifier'));mock.method(globalThis,'fetch',async()=>json({code:'bad_code',message:'invalid grant'},400));
  await assert.rejects(instance.auth.completeSignIn(),new RegExp(message));assert.equal(page.href,'https://frontend.example.test/');mock.restoreAll();
 }
});

test('SDK proactively refreshes near expiry without an API failure',async context=>{
 context.mock.timers.enable({apis:['Date','setTimeout','setInterval'],now:Date.now()});let refreshes=0;
 await login(async url=>{assert.ok(url.includes('grant_type=refresh_token'));refreshes++;return json(session('user-a',2));},session('user-a',1,Math.floor(Date.now()/1000)+80));
 await supabase.auth.startAutoRefresh();context.mock.timers.tick(0);await tick();await tick();
 assert.equal(refreshes,1);assert.equal((await supabase.auth.getSession()).data.session?.refresh_token,'user-a-refresh-2');await supabase.auth.stopAutoRefresh();
});

test('invalid renewal clears an expired SDK session while a transient outage preserves it',async context=>{
 context.mock.timers.enable({apis:['Date'],now:Date.now()});
 await login(async()=>json({code:'refresh_token_not_found',message:'Refresh token missing'},400),session('user-a',1,Math.floor(Date.now()/1000)-1));
 const invalid=await supabase.auth.refreshSession();assert.ok(invalid.error);assert.equal(localStorage.getItem(storageKey),null);
 await login(async()=>{context.mock.timers.tick(31_000);return json({message:'Unavailable'},503);},session('user-a',3));
 const outage=await supabase.auth.refreshSession();assert.equal(outage.error?.name,'AuthRetryableFetchError');assert.equal((await supabase.auth.getSession()).data.session?.user.id,'user-a');
});

test('local sign-out clears SDK persistence after revocation errors and expired-session outages',async context=>{
 context.mock.timers.enable({apis:['Date'],now:Date.now()});
 for(const expired of [false,true]){
  await login(async url=>{if(url.includes('grant_type=refresh_token'))context.mock.timers.tick(31_000);return json({message:'Unavailable'},503);},session('user-a',1,Math.floor(Date.now()/1000)+(expired?-1:3600)));
  await assert.rejects(auth.signOut());assert.equal(localStorage.getItem(storageKey),null);assert.equal((await supabase.auth.getSession()).data.session,null);
 }
});

test('home reads start while league overview is pending and overview failures remain visible',async()=>{
 const overview=Promise.withResolvers<Response>();const reads:string[]=[];
 await login(async(url,init)=>{const path=apiTarget(url,init);reads.push(path);return path==='/api/accounts/me'?json(account()):(path==='LeagueOverview'?overview.promise:new Promise<Response>(()=>{}));});
 await mount();await act(tick);
 assert.equal(reads.filter(path=>path==='HomeSummary').length,1);
 assert.equal(reads.filter(path=>path==='HomeNews').length,3);
 const {HomeView}=await import('../src/features/content/Home');
 assert.equal(renderer!.root.findByType(HomeView).props.account.id,'user-a');
 assert.equal(renderer!.root.findByType(HomeView).props.currentSeason,undefined);
 assert.match(JSON.stringify(renderer!.toJSON()),/Loading league/);
 assert.doesNotMatch(JSON.stringify(renderer!.toJSON()),/SEASON S1/);
 await act(async()=>{overview.resolve(json({message:'Overview unavailable'},503));await tick();});
 assert.match(JSON.stringify(renderer!.toJSON()),/Overview unavailable/);
 assert.equal(renderer!.root.findAllByType(HomeView).length,1);
});

test('real SDK cross-tab sign-out clears the mounted private screen and ignores late old updates',async()=>{
 await login(async url=>apiPath(url)==='/api/accounts/me'?json(account()):new Promise<Response>(()=>{}));await mount();
 const old=renderer!.root.findByType(Dashboard).props;assert.equal(old.account.id,'user-a');
 const other=secondary();try{
  mock.method(globalThis,'fetch',async()=>new Response(null,{status:204}));
  await act(async()=>{await other.auth.signOut({scope:'local'});await tick();await tick();});
  assert.equal(renderer!.root.findAllByType(Dashboard).length,0);assert.equal(renderer!.root.findAllByType(PublicLeague).length,1);assert.deepEqual(client.cache.extract(),{});
  await act(async()=>{old.onUpdate({...account(),username:'late old callback'});});assert.equal(renderer!.root.findAllByType(Dashboard).length,0);
 }finally{await other.auth.dispose();}
});

test('account switches guard old modal callbacks, token refreshes retain account and Apollo cache',async()=>{
 await login(async url=>apiPath(url)==='/api/accounts/me'?json(account()):new Promise<Response>(()=>{}));await mount();const old=renderer!.root.findByType(Dashboard).props;
 client.cache.writeQuery({query:(await import('../src/api/generated/graphql')).TeamRecordsDocument,data:{teamRecords:[]}});
 let profileReads=0;
 await act(async()=>{await login(async url=>{if(url.includes('grant_type=refresh_token'))return json(session('user-a',2));profileReads++;return json(account());});await supabase.auth.refreshSession();await tick();});
 assert.equal(profileReads,0);assert.ok(Object.keys(client.cache.extract()).length);assert.equal(renderer!.root.findByType(Dashboard).props.account,old.account);
 await act(async()=>{await login(async url=>apiPath(url)==='/api/accounts/me'?json(account('user-b')):new Promise<Response>(()=>{}),session('user-b'));await tick();});
 assert.equal(renderer!.root.findByType(Dashboard).props.account.id,'user-b');
 await act(async()=>{old.onUpdate({...account(),username:'late old callback'});});assert.equal(renderer!.root.findByType(Dashboard).props.account.id,'user-b');
});

test('logout immediately hides private state while SDK refresh and revocation are pending',async()=>{
 const refresh=Promise.withResolvers<Response>(),started=Promise.withResolvers<void>(),revoke=Promise.withResolvers<Response>();const publicReads:(string|null)[]=[];
 await login(async(url,init)=>{if(apiTarget(url,init)==='TeamSummaries')publicReads.push(new Headers(init?.headers).get('Authorization'));if(url.includes('grant_type=refresh_token')){started.resolve();return refresh.promise;}if(url.includes('/logout'))return revoke.promise;return apiPath(url)==='/api/accounts/me'?json(account()):new Promise<Response>(()=>{});});await mount();const old=renderer!.root.findByType(Dashboard).props;
 const refreshing=supabase.auth.refreshSession();await started.promise;let logout:Promise<void>;
 await act(async()=>{logout=old.onLogout();await tick();});assert.equal(renderer!.root.findAllByType(Dashboard).length,0);
 assert.equal(renderer!.root.findAllByType(PublicLeague).length,0);assert.match(JSON.stringify(renderer!.toJSON()),/Loading league/);assert.deepEqual(client.cache.extract(),{});assert.equal(publicReads.length,0);
 await act(async()=>{refresh.resolve(json(session('user-a',2)));await refreshing;await tick();});assert.equal(renderer!.root.findAllByType(Dashboard).length,0);
 assert.equal(renderer!.root.findAllByType(PublicLeague).length,0);assert.equal(publicReads.length,0);
 await act(async()=>{revoke.resolve(json({message:'Unavailable'},503));await logout!;await tick();});
 assert.equal(renderer!.root.findAllByType(Dashboard).length,0);assert.equal(renderer!.root.findAllByType(PublicLeague).length,1);assert.equal(localStorage.getItem(storageKey),null);assert.equal(renderer!.root.findAllByProps({role:'alert'}).length,1);assert.deepEqual(publicReads,[null]);
});
test('late account loads after a switch and unmount never expose the old account',async()=>{
 const delayed=Promise.withResolvers<Response>();await login(async url=>apiPath(url)==='/api/accounts/me'?delayed.promise:new Promise<Response>(()=>{}));await mount();assert.equal(renderer!.root.findAllByType(Dashboard).length,0);
 await act(async()=>{await login(async url=>apiPath(url)==='/api/accounts/me'?json(account('user-b')):new Promise<Response>(()=>{}),session('user-b'));await tick();});
 assert.equal(renderer!.root.findByType(Dashboard).props.account.id,'user-b');
 await act(async()=>{delayed.resolve(json(account()));await tick();});assert.equal(renderer!.root.findByType(Dashboard).props.account.id,'user-b');
 await act(async()=>{renderer!.unmount();});renderer=undefined;assert.equal(localStorage.getItem(storageKey)!==null,true);
});
test('a cross-tab login cannot lend its bearer token to a write from the old visible account before its event arrives',async()=>{
 const {request,ApiError}=await import('../src/api/http');
 await login(async url=>apiPath(url)==='/api/accounts/me'?json(account()):new Promise<Response>(()=>{}));await mount();
 const other=secondary();let writes=0;
 try {
  await other.auth.getSession();await tick();await tick();
  mock.method(globalThis,'fetch',async(url)=>{
   if(String(url).includes('grant_type=password'))return json(session('user-b'));
   if(apiPath(url)==='/api/teams'){writes++;return json({saved:true});}
   return apiPath(url)==='/api/accounts/me'?json(account('user-b')):new Promise<Response>(()=>{});
  });
  await act(async()=>{
   await other.auth.signInWithPassword({email:'new@example.test',password:'test'});
   assert.equal(renderer!.root.findByType(Dashboard).props.account.id,'user-a');
   await assert.rejects(request('/api/teams','POST',{name:'from user-a'}),error=>error instanceof ApiError&&error.code==='login_required');
   await tick();await tick();
  });
  assert.equal(writes,0);assert.equal(renderer!.root.findByType(Dashboard).props.account.id,'user-b');
 }finally{await other.auth.dispose();}
});
