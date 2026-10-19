const browserPath=(value:string)=>new URL(value,'http://localhost').pathname;
import assert from 'node:assert/strict';
import test from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { graphqlEndpoints } from '@napl/contracts';
import { accountStatsSchema } from '@napl/contracts/accounts';
import { createApp } from '../helper.js';
import { payloadFixture, fixtureUser } from '../payload-fixture.js';

const headers = { authorization: `Bearer ${fixtureUser}` };
type ResponsePage = { nodes: Array<Record<string, unknown> | string>; pageInfo: { hasNextPage: boolean; endCursor: string | null }; totalCount?: number };
function bounded(response: LightMyRequestResponse, label: string) {
  assert.equal(response.statusCode, 200, `${label}: ${response.body.slice(0,500)}`);
  assert.ok(response.rawPayload.byteLength <= 10_000, `${label}: ${response.rawPayload.byteLength} decoded UTF-8 bytes`);
  assert.ok(!response.body.includes('data:image/'), `${label} must use media resources`);
  return response.json();
}
async function traverse(load: (after?: string) => Promise<ResponsePage>, expected: number) {
  const rows: ResponsePage['nodes'] = [];
  const cursors = new Set<string>();
  let after: string | undefined;
  do {
    const response = await load(after);
    assert.ok(response.nodes.length > 0 || expected === 0, 'a nonempty collection must make progress');
    rows.push(...response.nodes);
    if (response.totalCount !== undefined) assert.equal(response.totalCount,expected);
    after = response.pageInfo.hasNextPage ? response.pageInfo.endCursor! : undefined;
    if (after) { assert.ok(!cursors.has(after),'cursor must progress'); cursors.add(after); }
    assert.ok(cursors.size < 1000,'pagination must terminate');
  } while (after);
  assert.equal(rows.length,expected,'traversal must retain every record');
  return rows;
}
function harness() {
  const fixture = payloadFixture();
  const app = createApp({db:fixture.db,verify:async id => ({id,sessionId:'fixture-session',claims:{}})});
  return {app,fixture};
}
async function gql(app: FastifyInstance, name: keyof typeof graphqlEndpoints, variables: Record<string,unknown> = {}) {
  const result = bounded(await app.inject({method:'POST',url:graphqlEndpoints[name],headers,payload:{variables}}),name);
  assert.equal(result.errors,undefined,JSON.stringify(result.errors));
  return result.data;
}

test('all REST collections remain below 10000 decoded bytes and traverse complete fixtures', async t => {
  const {app,fixture} = harness(); t.after(() => app.close());
  const routes: Array<[string,number]> = [
    ['/api/accounts',105],['/api/teams',7],['/api/news',105],['/api/rules',30],['/api/articles',30],['/api/schedule',105],['/api/transfers',105],['/api/position-requests',105],['/api/submissions',105],['/api/roles',105],['/api/voting/periods',1],
    [`/api/voting/periods/${fixture.period.id}/candidates`,105],
    [`/api/accounts/${fixtureUser}/history/matches`,60],
    ['/api/teams/t_0/members',15],
  ];
  for (const [route,count] of routes) {
    const rows = await traverse(async after => bounded(await app.inject({url:`${route}?first=50${after ? '&after='+encodeURIComponent(after) : ''}`,headers}),route),count);
    if (rows.length > 0 && typeof rows[0] === 'object' && rows[0] && 'id' in rows[0]) assert.equal(new Set(rows.map(row => (row as Record<string,unknown>).id)).size,count,route);
  }
});

test('all fixed GraphQL pages include their real envelopes and preserve complete traversal', async t => {
  const {app,fixture} = harness(); t.after(() => app.close());
  const operations: Array<[keyof typeof graphqlEndpoints,string,number,Record<string,unknown>?]> = [
    ['Leaderboard','leaderboard',105],['TeamSummaries','teamSummaries',7],['Seasons','seasons',3],
    ['AccountAwards','accountAwards',20,{id:fixtureUser}],['AccountChampionships','accountChampionships',0,{id:fixtureUser}],
    ['HomeNews','homeNews',105,{kind:'announcement'}],['HallOfFame','hallOfFame',20],['DecoratedPlayers','decoratedPlayers',105],
    ['VotingCandidates','votingCandidates',105,{periodId:fixture.period.id}],['SeasonChampions','seasonChampions',105],
    ['TeamStandings','standings',7,{season:'S2'}],['AccountMatches','accountMatches',60,{id:fixtureUser}],
  ];
  for (const [name,field,count,variables] of operations) await traverse(async after => (await gql(app,name,{...variables,first:50,...(after && {after})}))[field],count);
});

test('single player cards and overview stay bounded under maximum Unicode fields', async t => {
  const {app,fixture} = harness(); t.after(() => app.close());
  Object.assign(fixture.accounts[0]!, {username:'球'.repeat(64),country:'球'.repeat(80),strikers_id:'9'.repeat(100)});
  for (const route of ['/api/users/me',`/api/accounts/id/${fixtureUser}`,'/api/teams/t_0']) bounded(await app.inject({url:route,headers}),route);
  const card = (await gql(app,'PlayerCard',{id:fixtureUser,season:'S2'})).accountCard;
  assert.equal(card.season,'S2');
  assert.equal(card.awardCount,20);
  assert.equal(card.previewHasMore,true);
  const overview = (await gql(app,'LeagueOverview',{season:'S2'})).leagueOverview;
  assert.equal(overview.playerCount,105);
  assert.equal(overview.tickerHasMore,true);
  assert.equal(overview.me.id,fixtureUser);
  await gql(app,'HomeSummary');
  await gql(app,'AccountCardPreviews');
  await gql(app,'DefaultPositionWeights');
});

test('long text and image resources preserve full selected content outside routine JSON', async t => {
  const {app,fixture} = harness(); t.after(() => app.close());
  for (const [route,expected] of [
    ['/api/news/n_0/body',fixture.news[0]!.body],
    ['/api/schedule/s_0/notes',fixture.schedules[0]!.notes],['/api/position-requests/p_0/reason',fixture.positionRequests[0]!.reason],
    ['/api/teams/t_0/text/description',fixture.teams[0]!.description],
  ]) {
    let actual = '', after: string | undefined;
    do {
      const response = bounded(await app.inject({url:route+(after ? '?after='+encodeURIComponent(after) : ''),headers}),route) as ResponsePage;
      actual += response.nodes.join('');
      after = response.pageInfo.hasNextPage ? response.pageInfo.endCursor! : undefined;
    } while (after);
    assert.equal(actual,expected,route);
  }
  for (const [route,expected] of [['/api/rules/r_0',fixture.rules[0]!.body],['/api/articles/slug/article-0',fixture.articles[0]!.body]]) {
    const response = await app.inject({url:route,headers});
    assert.equal(response.statusCode,200);
    assert.equal(response.json().body,expected,'explicit full-longtext detail must retain all content');
  }
  const media = await app.inject(`/api/media/accounts/${fixtureUser}/image`);
  assert.equal(media.statusCode,200);
  assert.match(media.headers['content-type']!,/^image\/png/);
  assert.deepEqual(media.rawPayload,Buffer.from(fixture.accounts[0]!.image_url.split(',',2)[1]!,'base64'));
});

test('write acknowledgements remain bounded and preserve persisted field changes', async t => {
  const {app,fixture} = harness(); t.after(() => app.close());
  bounded(await app.inject({method:'PATCH',url:'/api/news/n_0',headers,payload:{body:'updated 球'.repeat(1000)}}),'news patch');
  assert.equal(fixture.news[0]!.body,'updated 球'.repeat(1000));
  bounded(await app.inject({method:'PATCH',url:`/api/accounts/${fixtureUser}`,headers,payload:{country:'CA'}}),'account patch');
  assert.equal(fixture.accounts[0]!.country,'CA');
});

test('reserved and Unicode resource IDs survive generated media and detail URLs', async t => {
  const {app,fixture} = harness(); t.after(() => app.close());
  const teamId = 'team /?#%+球', articleId = 'article /?#%+球', newsId = 'news /?#%+球';
  fixture.teams[0]!.id=teamId;
  for (const account of fixture.accounts) if(account.team_id==='t_0') account.team_id=teamId;
  fixture.articles[0]!.id=articleId;
  fixture.news[0]!.id=newsId;
  const teams = bounded(await app.inject({url:'/api/teams',headers}),'teams reserved IDs');
  const team = teams.nodes.find((row:{id:string})=>row.id===teamId);
  assert.ok(team);
  const logo=await app.inject({url:browserPath(team.logoUrl),headers});
  assert.equal(logo.statusCode,200);
  assert.match(logo.headers['content-type']!,/^image\//);
  const articles = bounded(await app.inject({url:'/api/articles',headers}),'articles reserved IDs');
  const article=articles.nodes.find((row:{id:string})=>row.id===articleId);
  assert.ok(article);
  assert.equal((await app.inject({url:browserPath(article.coverImageUrl),headers})).statusCode,200);
  const news = bounded(await app.inject({url:'/api/news',headers}),'news reserved IDs');
  const item=news.nodes.find((row:{id:string})=>row.id===newsId);
  assert.ok(item);
  const body=bounded(await app.inject({url:browserPath(item.bodyUrl),headers}),'news reserved detail');
  assert.ok(fixture.news[0]!.body.startsWith(body.nodes.join('')));
});

test('legacy numeric stat extensions never expand routine player responses', async t => {
  const {app,fixture} = harness(); t.after(() => app.close());
  const stats = fixture.accounts[0]!.stats as Record<string,number>;
  for(let index=0;index<500;index++) stats[`legacy_${index}_${'球'.repeat(80)}`]=42;
  const page=bounded(await app.inject({url:'/api/accounts',headers}),'extended stats');
  assert.equal(Object.keys(page.nodes[0].stats).length,Object.keys(accountStatsSchema.shape).length);
  assert.ok(!JSON.stringify(page).includes('legacy_'));
  const leaderboard=(await gql(app,'Leaderboard',{first:50})).leaderboard;
  assert.equal(Object.keys(leaderboard.nodes[0].stats).length,Object.keys(accountStatsSchema.shape).length);
});

test('maximum Unicode content identifiers and titles fit a single routine summary',async t=>{
 const {app,fixture}=harness();t.after(()=>app.close());
 fixture.news.splice(1);fixture.rules.splice(1);fixture.articles.splice(1);
 const id='球'.repeat(160),title='球'.repeat(500);
 Object.assign(fixture.news[0]!,{id,title});Object.assign(fixture.rules[0]!,{id,title});Object.assign(fixture.articles[0]!,{id,slug:id,title});
 for(const route of ['/api/news','/api/rules','/api/articles']){
  const result=bounded(await app.inject({url:route,headers}),route+' maximum Unicode');
  assert.equal(result.nodes.length,1);assert.equal(result.nodes[0].title,title);
 }
});
