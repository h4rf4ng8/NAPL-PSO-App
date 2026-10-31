import { PlayersManager } from '../src/features/admin/PlayersManager';
import { SeasonChampionsManager } from '../src/features/admin/SeasonChampionsManager';
import { AdminPanel } from '../src/features/admin/AdminPanel';
import { GenerateScheduleModal } from '../src/features/matches/schedule-setup';
import { client as appClient, resetClient } from '../src/api/client';
import { test, after, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { TeamSelect } from '../src/features/teams/TeamSelect';
import { page } from './page-fixture';
Object.defineProperty(globalThis,'React',{configurable:true,value:React});
after(()=>{Reflect.deleteProperty(globalThis,'React');});
afterEach(async()=>{mock.restoreAll();await resetClient();});
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
const info={id:'team-a',name:'First Team',tag:'ONE',color:'#123456',ownerUsername:'Captain',status:'approved',logoUrl:null,totw:false,totwSetAt:null,createdAt:1,reviewedAt:null,reviewedBy:null,memberCount:2,invitationCount:0,seasonCount:0,viewerInvitation:null};


const Host=()=>{const[value,setValue]=React.useState('');return React.createElement(TeamSelect,{value,onChange:setValue,label:'Selected team'});};
test('team selectors keep an off-page selected value and expose later choices',async()=>{
 mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(String(url),'http://api.example.test/api/graphql');const body=JSON.parse(String(init?.body));assert.equal(body.operationName,'TeamSummaries');const second=body.variables.after==='next';return Response.json({data:{teamSummaries:{...page([{...info,__typename:'TeamSummary',id:second?'team-b':'team-a',name:second?'Second Team':'First Team'}]),__typename:'TeamSummaryPage',pageInfo:{__typename:'PayloadPageInfo',endCursor:second?null:'next',hasNextPage:!second}}}});});
 let view:ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(ApolloProvider,{client:appClient},React.createElement(Host)));await tick();});
 await act(async()=>{view!.root.findByType('select').props.onChange({target:{value:'team-a'}});});
 await act(async()=>{view!.root.findAllByType('button').find(node=>node.children.join('')==='Next page')!.props.onClick();await tick();});
 assert.equal(view!.root.findByType('select').props.value,'team-a');assert.equal(view!.root.findAllByType('option').find(node=>node.props.value==='team-a')!.children.join(''),'First Team');assert.ok(view!.root.findAllByType('option').some(node=>node.props.value==='team-b'));
 act(()=>view!.unmount());
});

test('schedule generation retains selected teams across Apollo pages and resets the search cursor', async () => {
 const variables: Record<string, unknown>[] = [];
 mock.method(globalThis, 'fetch', async (url, init) => {
  assert.equal(String(url), 'http://api.example.test/api/graphql');
  const body = JSON.parse(String(init?.body));
  assert.equal(body.operationName, 'TeamSummaries'); variables.push(body.variables);
  const second = body.variables.after === 'next';
  return Response.json({data:{teamSummaries:{...page([{...info,__typename:'TeamSummary',id:second?'team-b':'team-a',name:second?'Second Team':'First Team'}]),__typename:'TeamSummaryPage',pageInfo:{__typename:'PayloadPageInfo',endCursor:second?null:'next',hasNextPage:!second}}}});
 });
 let view: ReactTestRenderer;
 await act(async () => { view = create(React.createElement(ApolloProvider, {client:appClient}, React.createElement(GenerateScheduleModal, {onClose(){},onGenerated(){}}))); await tick(); });
 const text = (node: import('react-test-renderer').ReactTestInstance): string => node.children.map(child => typeof child === 'string' ? child : text(child)).join('');
 const button = (label: string) => view!.root.findAllByType('button').find(node => text(node).includes(label))!;
 await act(async () => { button('First Team').props.onClick(); button('Next page').props.onClick(); await tick(); });
 await act(async () => { button('Second Team').props.onClick(); });
 assert.ok(button('Remove First Team')); assert.ok(button('Remove Second Team'));
 await act(async () => { view!.root.findByProps({'aria-label':'Search generation teams'}).props.onChange({target:{value:'First'}}); await tick(); });
 assert.equal(variables.at(-1)!.after, null); assert.equal(variables.at(-1)!.search, 'First');
 await act(async () => { view!.root.findByProps({'aria-label':'Search generation teams'}).props.onChange({target:{value:''}}); await tick(); });
 assert.equal(view!.root.findAllByType('button').find(node=>text(node)==='Previous page')!.props.disabled,true);
 assert.ok(button('Remove First Team')); assert.ok(button('Remove Second Team'));
 await act(async () => { button('PREVIEW SCHEDULE').props.onClick(); });
 assert.match(JSON.stringify(view!.toJSON()), /PREVIEW.*WEEKS/);
 act(() => view!.unmount());
});

test('reviewing a team on page two refreshes the pending first page', async () => {
 const reads: (string | null)[] = []; let approved = false;
 mock.method(globalThis, 'fetch', async (url, init) => {
  const path = String(url).replace('http://api.example.test', '');
  if (path === '/api/settings/current_season') return Response.json('S1');
  if (path.endsWith('/review')) { approved = true; return Response.json({saved:true}); }
  assert.equal(path, '/api/graphql');
  const body = JSON.parse(String(init?.body)); assert.equal(body.operationName, 'TeamSummaries');
  reads.push(body.variables.after);
  const second = body.variables.after === 'next';
  return Response.json({data:{teamSummaries:{...page(approved ? [] : [{...info,__typename:'TeamSummary',id:second?'team-b':'team-a',status:'pending'}]),__typename:'TeamSummaryPage',pageInfo:{__typename:'PayloadPageInfo',endCursor:second?null:'next',hasNextPage:!second}}}});
 });
 let view: ReactTestRenderer;
 await act(async () => { view = create(React.createElement(ApolloProvider, {client:appClient}, React.createElement(AdminPanel, {account:{id:'admin',roles:['admin']} as Account}))); await tick(); });
 const button = (label: string) => view!.root.findAllByType('button').find(node => node.children.filter(child=>typeof child==='string').join('').trim() === label)!;
 await act(async () => { button('Next page').props.onClick(); await tick(); });
 await act(async () => { await button('APPROVE').props.onClick(); await tick(); });
 assert.equal(approved, true); assert.equal(reads.at(-1), null);
 assert.equal(button('Previous page').props.disabled, true);
 act(() => view!.unmount());
});

for (const owner of [false, true]) test(`team review reason control follows the private descriptor: owner=${owner}`, async () => {
 const client = new ApolloClient({cache:new InMemoryCache(),link:new ApolloLink(operation=>new Observable(observer=>{
  if(operation.operationName==='Seasons'){observer.next({data:{seasons:{...graphPage([]),__typename:'StringPage',summaries:[]}}});observer.complete();return;}
  const data = operation.operationName === 'TeamSummaries' ? {teamSummaries:{...graphPage([{...info,__typename:'TeamSummary',status:'rejected'}]),__typename:'TeamSummaryPage'}} : (operation.operationName === 'TeamStandings' ? {standings:{...graphPage([]),__typename:'JsonPage'}} : {teamPlayers:graphPage([])});
  observer.next({data}); observer.complete();
 }))});
 mock.method(globalThis,'fetch',async url=>Response.json(String(url).includes('/lineup')?page([]):{...info,status:'rejected',formation:'2-1-2',lineupUrl:'/api/teams/team-a/lineup',descriptionUrl:'/api/teams/team-a/text/description',...(owner&&{rejectionReasonUrl:'/api/teams/team-a/text/rejectionReason'})}));
 let view: ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(ApolloProvider,{client},React.createElement(TeamsView,{account:{id:'viewer',username:owner?'Captain':'Invitee'} as Account})));await tick();});
 await act(async()=>{view!.root.findAllByType('button').find(node=>node.children.join('')==='View roster and team')!.props.onClick();await tick();});
 assert.equal(view!.root.findAllByType('button').filter(node=>node.children.join('')==='Read review reason').length,Number(owner));
 act(()=>view!.unmount());client.stop();
});

const buttonText = (node: import('react-test-renderer').ReactTestInstance): string => node.children.filter(child => typeof child === 'string').join('').trim();
const teamListResponse = (after: unknown) => Response.json({data:{teamSummaries:{...page([{...info,__typename:'TeamSummary',memberCount:0,id:after?'team-b':'team-a',name:after?'Second Team':'First Team'}]),__typename:'TeamSummaryPage',pageInfo:{__typename:'PayloadPageInfo',endCursor:after?null:'next',hasNextPage:!after}}}});

test('player team assignment pages and searches with Apollo while retaining the off-page current team', async () => {
 const reads: Record<string,unknown>[] = []; const writes: {path:string;body:unknown}[] = [];
 mock.method(globalThis,'fetch',async(url,init)=>{
  const path=String(url).replace('http://api.example.test','');
  if(path==='/api/graphql'){const body=JSON.parse(String(init?.body));assert.equal(body.operationName,'TeamSummaries');reads.push(body.variables);return teamListResponse(body.variables.after);}
  if(path.endsWith('/membership')){writes.push({path,body:JSON.parse(String(init?.body))});return Response.json({ok:true});}
  if(path.startsWith('/api/accounts?'))return Response.json(page([{id:'player',username:'Player',position:'CM',strikersId:'123',teamId:'saved-team'}]));
  assert.ok(path.startsWith('/api/position-requests?'));return Response.json(page([]));
 });
 let view: ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(ApolloProvider,{client:appClient},React.createElement(PlayersManager,{onRefresh(){}})));await tick();});
 const button=(label:string)=>view!.root.findAllByType('button').find(node=>buttonText(node)===label)!;
 await act(async()=>{button('TEAM').props.onClick();});
 assert.ok(view!.root.findByType('select').findAllByType('option').some(node=>node.props.value==='saved-team'));
 const teamButtons=()=>view!.root.findByProps({'aria-label':'Find team'}).parent.findAllByType('button');
 await act(async()=>{teamButtons().find(node=>buttonText(node)==='Next page')!.props.onClick();await tick();});
 assert.ok(view!.root.findByType('select').findAllByType('option').some(node=>node.props.value==='team-b'));
 await act(async()=>{view!.root.findByProps({'aria-label':'Find team'}).props.onChange({target:{value:'Second'}});await tick();});
 assert.equal(reads.at(-1)!.after,null);assert.equal(reads.at(-1)!.search,'Second');
 assert.ok(view!.root.findByType('select').findAllByType('option').some(node=>node.props.value==='saved-team'));
 await act(async()=>{await view!.root.findByType('select').props.onChange({target:{value:'team-a'}});await tick();});
 assert.deepEqual(writes,[{path:'/api/teams/team-a/membership',body:{action:'join',accountId:'player'}}]);
 act(()=>view!.unmount());
});

test('championship selection retains saved off-page teams and saves chosen IDs after paging and search', async () => {
 const reads: Record<string,unknown>[] = []; let saved: Record<string,unknown> | undefined;
 mock.method(globalThis,'fetch',async(url,init)=>{
  const path=String(url).replace('http://api.example.test','');
  if(path==='/api/graphql'){const body=JSON.parse(String(init?.body));assert.equal(body.operationName,'TeamSummaries');reads.push(body.variables);return teamListResponse(body.variables.after);}
  if(path==='/api/settings/season_champions'){
   if(init?.method==='PUT'){saved=JSON.parse(String(init.body)).value;return Response.json({ok:true});}
   return Response.json(page([{index:0,key:'S1',value:{winnerTeamId:'saved-team',runnerUpTeamId:null,setAt:1}}]));
  }
  assert.ok(path.startsWith('/api/teams/'));return Response.json({...info,id:path.slice('/api/teams/'.length),name:'Saved Team',memberCount:0});
 });
 let view: ReactTestRenderer;
 await act(async()=>{view=create(React.createElement(ApolloProvider,{client:appClient},React.createElement(SeasonChampionsManager,{account:{id:'admin'} as Account,currentSeason:'S1',onRefresh(){}})));await tick();await tick();});
 const selects=()=>view!.root.findAllByType('select');
 const button=(label:string)=>view!.root.findAllByType('button').find(node=>buttonText(node)===label)!;
 assert.equal(selects()[1]!.props.value,'saved-team');assert.ok(selects()[1]!.findAllByType('option').some(node=>node.props.value==='saved-team'));
 await act(async()=>{button('Next page').props.onClick();await tick();});
 await act(async()=>{selects()[2]!.props.onChange({target:{value:'team-b'}});await tick();});
 await act(async()=>{view!.root.findByProps({'aria-label':'Find championship team'}).props.onChange({target:{value:'First'}});await tick();});
 assert.equal(reads.at(-1)!.after,null);assert.equal(reads.at(-1)!.search,'First');
 assert.equal(selects()[1]!.props.value,'saved-team');assert.equal(selects()[2]!.props.value,'team-b');
 await act(async()=>{button('SAVE S1 CHAMPIONS').props.onClick();});
 await act(async()=>{await button('YES, AWARD').props.onClick();await tick();});
 assert.equal((saved!.S1 as Record<string,unknown>).winnerTeamId,'saved-team');assert.equal((saved!.S1 as Record<string,unknown>).runnerUpTeamId,'team-b');
 act(()=>view!.unmount());
});
