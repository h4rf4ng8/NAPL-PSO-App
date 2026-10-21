import assert from 'node:assert/strict';
import test from 'node:test';
import { graphqlOperationNames } from '@napl/contracts';
import { ASSET_BUCKET, PRIVATE_BUCKET } from '@napl/contracts/storage';
import { detailUrl } from '../../routes/payload/page.js';
import type { Database } from '../../plugins/db/client.js';
import { storageFixture } from '../storage-fixture.js';
import { createApp } from '../helper.js';
import { payloadFixture, fixtureUser } from '../payload-fixture.js';
import { contractClient, applicationOperations, dereference, specification, type OpenApiNode } from '../openapi.js';

test('all read operations and every trusted GraphQL branch satisfy the wire contract', async t => {
  const f = payloadFixture();
  for (const row of f.positionRequests) Object.assign(row, { review_note: null });
  f.accounts[0]!.stats['球'.repeat(1500) as keyof typeof f.accounts[0]['stats']] = 42;
  f.teams[0]!.lineup = { old: '球'.repeat(2000) };
  f.schedules[0]!.stream_url = 'https://example.test/stream' as never;
  const originalSetting = f.db.client.setting.findUnique.bind(f.db.client.setting);

  const app = createApp({ db: f.db, verify: async id => ({ id, sessionId: id, claims: {} }) });
  t.after(() => app.close());
  const c = contractClient(app), headers = { authorization: `Bearer ${fixtureUser}` };
  const get = async (route: string, url = route) => (await c.exchange('GET', route, url, { headers })).json<OpenApiNode>();
  const id = fixtureUser, documents = new Map<string, OpenApiNode>();
  for (const route of ['/api/accounts', '/api/articles', '/api/news', '/api/position-requests', '/api/roles', '/api/rules', '/api/schedule', '/api/submissions', '/api/transfers', '/api/voting/periods', '/api/accounts/me', '/api/integrations/discord']) documents.set(route, await get(route));
  for (const [route, url] of [
    ['/api/accounts/{id}', `/api/accounts/${id}`], ['/api/accounts/username/{username}', `/api/accounts/username/${encodeURIComponent(f.accounts[0]!.username)}`],
    ['/api/accounts/{id}/links/{field}', `/api/accounts/${id}/links/imageUrl`], ['/api/accounts/{id}/opponents/{ordinal}/name', detailUrl(`/api/accounts/${id}/opponents/0/name`, 'Opponent 0')],
    ['/api/articles/{id}/excerpt', '/api/articles/a_0/excerpt'], ['/api/articles/{id}/media-source', '/api/articles/a_0/media-source'], ['/api/articles/slug/{slug}', '/api/articles/slug/article-0'],
    ['/api/news/{id}/{field}', '/api/news/n_0/body'], ['/api/position-requests/{id}/reason', '/api/position-requests/p_0/reason'], ['/api/rules/{id}', '/api/rules/r_0'],
    ['/api/schedule/{id}/links/stream-url', '/api/schedule/s_0/links/stream-url'], ['/api/schedule/{id}/notes', '/api/schedule/s_0/notes'],
    ['/api/teams/{id}', '/api/teams/t_0'], ['/api/teams/{id}/media-source', '/api/teams/t_0/media-source'], ['/api/teams/{id}/text/{field}', '/api/teams/t_0/text/rejectionReason'],
    ['/api/teams/{id}/{collection}', '/api/teams/t_0/members'], ['/api/voting/periods/{id}/{collection}', `/api/voting/periods/${f.period.id}/candidates`],
    ['/api/voting/periods/{id}/votes', `/api/voting/periods/${f.period.id}/votes`], ['/api/voting/periods/{id}/votes/me', `/api/voting/periods/${f.period.id}/votes/me`], ['/api/voting/periods/{id}/tally', `/api/voting/periods/${f.period.id}/tally`],
  ]) documents.set(route!, await get(route!, url!));
  const history = await get('/api/accounts/{id}/history/{collection}', `/api/accounts/${id}/history/matches`);
  const match = await get('/api/accounts/{id}/history/{collection}/{ordinal}', history.nodes[0].detailUrl + '&first=50');
  await get('/api/accounts/{id}/history/{collection}/{ordinal}/fields/{field}', match.nodes.find((field: OpenApiNode) => field.valueUrl).valueUrl);
  for (const [route, url, fieldRoute] of [
    ['/api/accounts/{id}/stats', `/api/accounts/${id}/stats`, '/api/accounts/{id}/stats/fields/{field}'],
    ['/api/submissions/{id}/detail', documents.get('/api/submissions').nodes[0].detailUrl, '/api/submissions/{id}/detail/fields/{field}'],
    ['/api/teams/{id}/editor', documents.get('/api/teams/{id}').editorUrl, '/api/teams/{id}/editor/fields/{field}'],
    ['/api/teams/{id}/lineup', documents.get('/api/teams/{id}').lineupUrl, '/api/teams/{id}/lineup/fields/{field}'],
    ['/api/settings/{key}', '/api/settings/position_weights', '/api/settings/{key}/fields/{field}'],
  ]) {
    if (route === '/api/settings/{key}') f.db.client.setting.findUnique = (async (args: { where: { key: string } }) => args.where.key === 'position_weights' ? { key: 'position_weights', value: JSON.stringify({ historical: '球'.repeat(5000) }) } : originalSetting(args)) as typeof f.db.client.setting.findUnique;
    const fields = await get(route!, url! + (url!.includes('?') ? '&' : '?') + 'first=50');
    const field = fields.nodes.find((value: OpenApiNode) => value.valueUrl);
    assert.ok(field, `${route} requires a real large-field descriptor`);
    await get(fieldRoute!, field.valueUrl);
  }
  f.db.client.setting.findUnique = originalSetting;
  for (const [route, url] of [['/api/media/accounts/{id}/image', `/api/media/accounts/${id}/image`], ['/api/media/accounts/{id}/pending-image', `/api/media/accounts/${id}/pending-image`], ['/api/media/teams/{id}/logo', '/api/media/teams/t_0/logo'], ['/api/media/articles/{id}/cover', '/api/media/articles/a_0/cover']]) await c.exchange('GET', route!, url!, { headers });
  await c.exchange('GET', '/api/media/accounts/{id}/steam', `/api/media/accounts/${id}/steam`, { headers }, 302);
  await c.exchange('GET', '/api/schedule/{id}/stream', '/api/schedule/s_0/stream', { headers }, 302);
  for (const name of graphqlOperationNames) {
    const schema = dereference(specification.components.schemas[`GraphQL${name}Request`]);
    const variables: Record<string, unknown> = {};
    const supplied: Record<string, unknown> = { id, periodId: f.period.id, teamId: 't_0', kind: 'announcement', strikersIds: ['10000'] };
    for (const [key, raw] of Object.entries(schema.properties.variables.properties)) {
      const value = raw as OpenApiNode;
      if (value.default !== undefined) variables[key] = value.default;
      else if (Object.hasOwn(supplied, key)) variables[key] = supplied[key];
    }
    await c.exchange('POST', '/api/graphql', '/api/graphql', { headers, payload: { operationName: name, variables } });
  }
  const expected = applicationOperations().filter(key => key.startsWith('GET ') || key === 'POST /api/graphql');
  assert.deepEqual([...c.covered].toSorted((a, b) => a.localeCompare(b)), expected);
  assert.deepEqual([...c.branches].toSorted((a, b) => a.localeCompare(b)), [...graphqlOperationNames].toSorted((a, b) => a.localeCompare(b)));
  assert.equal(c.heads.size, 51);
});

test('public team projections omit moderation descriptors and GraphQL envelopes retain optional identity', async t => {
  const f = payloadFixture(), app = createApp({ db: f.db, verify: async id => ({ id, sessionId: id, claims: {} }) });
  t.after(() => app.close());
  const c = contractClient(app);
  const response = await c.exchange('GET', '/api/teams/{id}', '/api/teams/t_0');
  assert.equal(response.json().rejectionReasonUrl, undefined);
  assert.equal(response.json().editorUrl, undefined);
  await c.exchange('POST', '/api/graphql', '/api/graphql', { payload: { operationName: 'TeamSummaries', variables: {} } });
  await c.exchange('GET', '/api/teams/{id}/text/{field}', '/api/teams/t_0/text/rejectionReason', {}, 404);
  await c.exchange('POST', '/api/graphql', '/api/graphql', { payload: { operationName: 'HomeSummary', variables: {}, query: '{ admins { userId } }' } }, 400);
});


test('managed pending-image contracts issue private descriptors only to the owner', async t => {
  const f = payloadFixture(), native = storageFixture(t), query = f.db.query;
  f.db.query = (async sql => sql.sql.includes('FROM auth_gateway.user_roles') ? [] : query(sql)) as Database['query'];
  const staged = await native.staged(fixtureUser, fixtureUser);
  f.accounts[0]!.pending_image_url = staged.sourceUrl;
  const app = createApp({ db: f.db, storage: native.storage, verify: async id => ({ id, sessionId: id, claims: {} }) });
  t.after(() => app.close());
  const c = contractClient(app), route = '/api/media/accounts/{id}/pending-image';
  const response = await c.exchange('GET', route, `/api/media/accounts/${fixtureUser}/pending-image`, { headers: { authorization: `Bearer ${fixtureUser}` } });
  assert.match(response.json().externalUrl, /token=/);
  f.accounts[0]!.image_url = staged.sourceUrl.replace(`/authenticated/${PRIVATE_BUCKET}/`, () => `/public/${ASSET_BUCKET}/`);
  const headers = { authorization: `Bearer ${fixtureUser}` };
  await c.exchange('GET', '/api/media/accounts/{id}/image', `/api/media/accounts/${fixtureUser}/image`, { headers }, 302);
  const descriptor = await c.exchange('GET', '/api/media/accounts/{id}/image', `/api/media/accounts/${fixtureUser}/image?descriptor=1`, { headers });
  assert.equal(descriptor.json().externalUrl, f.accounts[0]!.image_url);
  const source = await c.exchange('GET', '/api/accounts/{id}/links/{field}', `/api/accounts/${fixtureUser}/links/imageUrl`, { headers });
  assert.equal(source.json().storedImage, true);
  assert.equal(source.json().nodes.join(''), '');
  const teamImage = await native.staged(fixtureUser, 't_0', 'team-logo');
  f.teams[0]!.logo_url = teamImage.sourceUrl;
  const teamSource = await c.exchange('GET', '/api/teams/{id}/media-source', '/api/teams/t_0/media-source', { headers });
  assert.equal(teamSource.json().storedImage, true);
  assert.equal(teamSource.json().nodes.join(''), '');
  assert.doesNotMatch(f.accounts[0]!.pending_image_url, /[?]token=/, 'signed read capability is never persisted');
  await c.exchange('GET', route, `/api/media/accounts/${f.accounts[1]!.id}/pending-image`, { headers: { authorization: `Bearer ${fixtureUser}` } }, 404);
  await c.exchange('GET', route, `/api/media/accounts/${fixtureUser}/pending-image`, {}, 401);
});
