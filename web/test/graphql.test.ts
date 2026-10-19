import { afterEach, mock, test } from 'node:test';
import { gql } from '@apollo/client';
import assert from 'node:assert/strict';
import { client, resetClient } from '../src/api/client';
import { PlayerCardDocument, AccountOpponentsDocument, AccountCardPreviewsDocument } from '../src/api/generated/graphql';
import { mapAccountCardPreviews, mapAccountOpponents, mapAccount, mapCardAccount } from '../src/features/accounts/api';
import { matchSchema } from '@napl/contracts/accounts';
const json = (body: unknown) => Response.json(body);
const loadAccountCardPreviews = async () => { const result = await client.query({ query: AccountCardPreviewsDocument }); return mapAccountCardPreviews(result.data!); };
const loadAccountOpponents = async () => { const result = await client.query({ query: AccountOpponentsDocument, variables: { id: 'p1', after: null } }); return mapAccountOpponents(result.data!); };
afterEach(async () => { await resetClient(); mock.restoreAll(); });
const account = {
  id: 'p1', username: 'Alice', position: 'ST', teamId: null, imageUrl: null, country: null,
  stats: { games: 0, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheets: 0, motm: 0 },
  ranking: { score: 0, percentile: 0, ranked: false, gamesPlayed: 0, tier: 'BRONZE' },
  cardStats: [{ season: 'all', cells: [
    { label: 'GOALS', value: '0' }, { label: 'TKL', value: '0.0' },
    { label: 'ASSIST', value: '0' }, { label: 'W-L', value: '0-0' },
    { label: 'PASS', value: '0.0' }, { label: 'GP', value: '0' },
  ] }],
  matches: [], awards: [], championships: [], totwUntil: null, cheater: false, strikersId: null,
  steamUrl: null, createdAt: 1,
};
const wireAccount = () => ({
  ...account, __typename: 'Account', seasonStats: null,
  ranking: { __typename: 'AccountRanking', ...account.ranking },
  cardStats: account.cardStats.map(season => ({ ...season, __typename: 'AccountCardStatSeason',
    cells: season.cells.map(cell => ({ ...cell, __typename: 'AccountCardStatCell' })),
  })),
});
test('unknown operations fail before any network request', async () => {
  const fetch = mock.method(globalThis, 'fetch');
  await assert.rejects(client.query({query:gql`query UnknownRead { season }`}), /Unknown GraphQL operation: UnknownRead/);
  await assert.rejects(client.query({query:gql`query { season }`}), /Unknown GraphQL operation/);
  assert.equal(fetch.mock.callCount(), 0);
});
test('tier previews load all server computed cards in one GraphQL request', async () => {
  const calls: unknown[] = [];
  mock.method(globalThis, 'fetch', async (_url, init) => {
    calls.push(init);
    return json({ data: { accountCardPreviews: [{
      label: 'BRONZE', description: 'server preview', account: { ...wireAccount() },
    }] } });
  });
  const previews = await loadAccountCardPreviews();
  assert.equal(calls.length, 1);
  assert.equal(previews[0]?.account.ranking.ranked, false);
  assert.equal(previews[0]?.account.cardStats[0]?.cells[0]?.value, '0');
});
test('tier preview GraphQL failures surface without retrying or per card requests', async () => {
  let calls = 0;
  mock.method(globalThis, 'fetch', async () => {
    calls++;
    return json({ data: null, errors: [{ message: 'preview unavailable' }] });
  });
  await assert.rejects(loadAccountCardPreviews(), /preview unavailable/);
  assert.equal(calls, 1);
});
test('history loader errors are surfaced for retry UI', async () => {
  mock.method(globalThis, 'fetch', async () => json({ data: { accountOpponents: [{ opponent: 'Blue', games: -1 }] } }));
  await assert.rejects(loadAccountOpponents(), /Invalid GraphQL opponent summary data/);
});
test('legacy numeric Strikers IDs normalize only when finite', () => {
  const match = { id: 'm1', date: 1, season: 'S1', opponent: 'Blue', result: 'W', goals: 1, assists: 0,
    passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheet: true, motm: false };
  assert.equal(matchSchema.parse({ ...match, strikersMatchId: 123 }).strikersMatchId, '123');
  assert.equal(matchSchema.safeParse({ ...match, strikersMatchId: Infinity }).success, false);
});
test('account decoder preserves historical account fields and accepts legacy award ids', async () => {
  const match = { id: 'm1', date: 1, season: 'S1', opponent: 'Blue', result: 'W', goals: 1, assists: 0,
    passes: 0, tackles: 0, deflects: 0, catches: 0, cleanSheet: true, motm: false, strikersMatchId: 123, historicalFlag: true };
  const award = { awardId: 'golden-keeper-legacy', season: 'S1', source: 'import', legacyRank: 1 };
  const championship = { season: 'S1', placement: '1st', teamId: 'team-1', awardedAt: 1, source: 'archive' };
  const result = { players: [mapAccount({ ...account, matches: [match], awards: [award], championships: [championship] } as never)] };
  assert.equal(result.players[0]?.matches[0]?.strikersMatchId, '123');
  assert.equal(result.players[0]?.matches[0]?.historicalFlag, true);
  assert.equal(result.players[0]?.awards[0]?.awardId, 'golden-keeper-legacy');
  assert.equal(result.players[0]?.awards[0]?.legacyRank, 1);
  assert.equal(result.players[0]?.championships[0]?.source, 'archive');
});

test('selected season card loads one detail and keeps complete histories absent',async()=>{
 const wire=wireAccount();
 const card={...wire,__typename:'AccountCard',team:null,season:'S2',cardStats:wire.cardStats[0]!.cells,awardPreview:[{awardId:'legacy-mvp',season:'S1'}],championshipPreview:[],awardCount:14,championshipCount:0,previewHasMore:true};
 const calls:RequestInit[]=[];mock.method(globalThis,'fetch',async(url,init)=>{assert.equal(String(url),'http://api.example.test/api/player-card');calls.push(init!);return json({data:{accountCard:card}});});
 const variables={id:'p1',season:'S2'};
 const result=await client.query({query:PlayerCardDocument,variables});await client.query({query:PlayerCardDocument,variables});
 assert.equal(calls.length,1);assert.deepEqual(JSON.parse(String(calls[0]!.body)),{variables});
 const selected=mapCardAccount(result.data!.accountCard!);assert.equal(selected.awards,undefined);assert.equal(selected.awardCount,14);assert.equal(selected.awardPreview?.[0]?.awardId,'legacy-mvp');assert.equal(selected.cardStats.length,1);
});

test('malformed selected card JSON fails before cache writes',async()=>{
 const wire=wireAccount();mock.method(globalThis,'fetch',async()=>json({data:{accountCard:{...wire,__typename:'AccountCard',team:null,season:'all',cardStats:wire.cardStats[0]!.cells,awardPreview:[{}],championshipPreview:[],awardCount:1,championshipCount:0,previewHasMore:false}}}));
 await assert.rejects(client.query({query:PlayerCardDocument,variables:{id:'p1',season:'all'}}));assert.deepEqual(client.cache.extract(),{});
});

test('raw account boundary retains arbitrary finite stats and rejects invalid history records',()=>{
 const result=mapAccount({...account,stats:{...account.stats,extraMetric:4}} as never);assert.equal(result.stats.extraMetric,4);
 for(const field of ['awards','championships'])assert.throws(()=>mapAccount({...account,[field]:[{}]} as never),/Invalid GraphQL account JSON/);
});
